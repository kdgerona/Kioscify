import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { PriceTiersService } from '../price-tiers/price-tiers.service';
import { MenusService } from '../menus/menus.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { app as appConstants } from '../constants/env.constants';
import { Prisma } from '@prisma/client';
import { extname } from 'path';

type ProductWithRelations = Prisma.ProductGetPayload<{
  include: {
    category: true;
    productSizes: {
      include: {
        size: {
          include: { priceTiers: true };
        };
      };
    };
    productAddons: {
      include: {
        addon: {
          include: { priceTiers: true };
        };
      };
    };
    productPreferences: {
      include: {
        preference: true;
      };
    };
    priceTiers: {
      include: { tier: true };
    };
  };
}>;

const PRODUCT_INCLUDE = {
  category: true,
  productSizes: {
    include: {
      size: {
        include: { priceTiers: true },
      },
    },
  },
  productAddons: {
    include: {
      addon: {
        include: { priceTiers: true },
      },
    },
  },
  productPreferences: {
    include: {
      preference: true,
    },
  },
  priceTiers: {
    include: { tier: true },
  },
} satisfies Prisma.ProductInclude;

@Injectable()
export class ProductsService {
  private baseUrl: string;

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private configService: ConfigService,
    private priceTiersService: PriceTiersService,
    private menusService: MenusService,
  ) {
    this.baseUrl = this.configService.get<string>(appConstants.base_url) || '';
  }

  async create(createProductDto: CreateProductDto, menuId: string) {
    const { id, name, price, foodpandaPrice, grabPrice, categoryId, image, sizeIds, addonIds, preferenceIds, priceTiers } =
      createProductDto;

    const menu = await this.prisma.menu.findUnique({ where: { id: menuId }, select: { brandId: true } });
    if (!menu) throw new BadRequestException(`Menu ${menuId} not found`);

    await this.assertCategoryBelongsToMenu(categoryId, menuId);
    const validSizeIds = await this.assertScopedToMenu('size', sizeIds, menuId);
    const validAddonIds = await this.assertScopedToMenu('addon', addonIds, menuId);
    const validPreferenceIds = await this.assertScopedToMenu('preference', preferenceIds, menuId);

    // Generate ID from product name if not provided
    let productId = id;
    if (!productId) {
      productId = await this.generateProductId(name);
    } else {
      // Check if manually provided ID already exists
      const existingProduct = await this.prisma.product.findUnique({
        where: { id: productId },
      });

      if (existingProduct) {
        throw new ConflictException('Product with this ID already exists');
      }
    }

    const product = await this.prisma.product.create({
      data: {
        id: productId,
        name,
        price,
        foodpandaPrice,
        grabPrice,
        categoryId,
        image,
        menuId,
        brandId: menu.brandId,
        productSizes: validSizeIds
          ? { create: validSizeIds.map((sizeId) => ({ size: { connect: { id: sizeId } } })) }
          : undefined,
        productAddons: validAddonIds
          ? { create: validAddonIds.map((addonId) => ({ addon: { connect: { id: addonId } } })) }
          : undefined,
        productPreferences: validPreferenceIds
          ? { create: validPreferenceIds.map((preferenceId) => ({ preference: { connect: { id: preferenceId } } })) }
          : undefined,
      },
    });

    if (priceTiers && priceTiers.length > 0) {
      await this.upsertPriceTiers(product.id, menuId, priceTiers);
    }

    return this.findOne(product.id, { menuId });
  }

  private async generateProductId(name: string): Promise<string> {
    // Create slug from product name
    const baseSlug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    // Check if slug already exists globally — _id is unique across all brands in MongoDB
    let slug = baseSlug;
    let counter = 1;

    while (true) {
      const existing = await this.prisma.product.findUnique({
        where: { id: slug },
        select: { id: true },
      });

      if (!existing) {
        return slug;
      }

      counter++;
      slug = `${baseSlug}-${counter}`;
    }
  }

  /**
   * `menuId` (explicit, admin/builder context) takes priority; otherwise
   * resolved from the requesting store's current menu via `tenantId`
   * (mobile/store-portal read context). Returns [] rather than throwing when
   * scope can't be resolved — an unassigned store must see an empty catalog.
   */
  async findAll(params: { menuId?: string; categoryId?: string; tenantId?: string }) {
    const menuId =
      params.menuId ?? (params.tenantId ? await this.menusService.resolveStoreMenuId(params.tenantId) : null);
    if (!menuId) return [];

    const where: Prisma.ProductWhereInput = { menuId, tombstone: { not: 1 } };
    if (params.categoryId) where.categoryId = params.categoryId;

    const products = await this.prisma.product.findMany({ where, include: PRODUCT_INCLUDE });

    const tierId = params.tenantId ? await this.resolveTierIdForTenant(params.tenantId) : null;

    return products
      .map((p) => this.formatProduct(p, tierId))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async findOne(id: string, params: { menuId?: string; tenantId?: string }) {
    const menuId =
      params.menuId ?? (params.tenantId ? await this.menusService.resolveStoreMenuId(params.tenantId) : null);
    if (!menuId) {
      throw new NotFoundException(`Product ${id} not found (no menu context)`);
    }

    const product = await this.prisma.product.findFirst({
      where: { id, menuId, tombstone: { not: 1 } },
      include: PRODUCT_INCLUDE,
    });
    if (!product) throw new NotFoundException(`Product ${id} not found`);

    const tierId = params.tenantId ? await this.resolveTierIdForTenant(params.tenantId) : null;
    return this.formatProduct(product, tierId);
  }

  async update(id: string, updateProductDto: UpdateProductDto, menuId: string) {
    const existing = await this.prisma.product.findFirst({ where: { id, menuId, tombstone: { not: 1 } } });
    if (!existing) throw new NotFoundException(`Product ${id} not found`);

    const { sizeIds, addonIds, preferenceIds, priceTiers, categoryId, ...productData } = updateProductDto;

    if (categoryId) await this.assertCategoryBelongsToMenu(categoryId, menuId);
    const validSizeIds = await this.assertScopedToMenu('size', sizeIds, menuId);
    const validAddonIds = await this.assertScopedToMenu('addon', addonIds, menuId);
    const validPreferenceIds = await this.assertScopedToMenu('preference', preferenceIds, menuId);

    // Safe to wipe-and-replace unscoped here: this Product belongs to exactly
    // one menu (direct ownership, no shared-master-across-menus junction), so
    // there is no other menu's join rows that could be affected.
    await this.prisma.product.update({
      where: { id },
      data: {
        ...productData,
        ...(categoryId !== undefined && { categoryId }),
        ...(validSizeIds !== undefined && {
          productSizes: {
            deleteMany: {},
            create: validSizeIds.map((sizeId) => ({ size: { connect: { id: sizeId } } })),
          },
        }),
        ...(validAddonIds !== undefined && {
          productAddons: {
            deleteMany: {},
            create: validAddonIds.map((addonId) => ({ addon: { connect: { id: addonId } } })),
          },
        }),
        ...(validPreferenceIds !== undefined && {
          productPreferences: {
            deleteMany: {},
            create: validPreferenceIds.map((preferenceId) => ({ preference: { connect: { id: preferenceId } } })),
          },
        }),
      },
    });

    // Replace-all tier prices when priceTiers is provided
    if (priceTiers !== undefined) {
      if (priceTiers.length > 0) {
        await this.assertValidTierIds(menuId, priceTiers);
      }
      const incomingTierIds = priceTiers.map((p) => p.tierId);
      await this.prisma.productPriceTier.deleteMany({
        where: { productId: id, tierId: { notIn: incomingTierIds } },
      });
      await this.upsertPriceTiers(id, menuId, priceTiers);
    }

    return this.findOne(id, { menuId });
  }

  async updateImage(id: string, file: Express.Multer.File, menuId: string) {
    const existing = await this.findOne(id, { menuId });

    if (existing.image) await this.storage.delete(existing.image);

    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const filename = `product-${id}-${uniqueSuffix}${extname(file.originalname)}`;
    const imageUrl = await this.storage.upload('products', filename, file.buffer, file.mimetype);

    await this.prisma.product.update({ where: { id }, data: { image: imageUrl } });

    return this.findOne(id, { menuId });
  }

  async removeImage(id: string, menuId: string) {
    const existing = await this.findOne(id, { menuId });

    if (existing.image) await this.storage.delete(existing.image);

    await this.prisma.product.update({ where: { id }, data: { image: null } });

    return this.findOne(id, { menuId });
  }

  async remove(id: string, menuId: string) {
    const existing = await this.prisma.product.findFirst({ where: { id, menuId, tombstone: { not: 1 } } });
    if (!existing) throw new NotFoundException(`Product ${id} not found`);
    return this.prisma.product.update({ where: { id }, data: { tombstone: 1 } });
  }

  private async resolveTierIdForTenant(tenantId: string): Promise<string | null> {
    return this.priceTiersService.resolveStoreTierId(tenantId);
  }

  private async assertCategoryBelongsToMenu(categoryId: string, menuId: string) {
    const category = await this.prisma.category.findFirst({ where: { id: categoryId, tombstone: { not: 1 } } });
    if (!category) throw new BadRequestException(`Category ${categoryId} not found`);
    if (category.menuId !== menuId) {
      throw new BadRequestException(`Category ${categoryId} does not belong to menu ${menuId}`);
    }
  }

  private async assertScopedToMenu(
    kind: 'size' | 'addon' | 'preference',
    ids: string[] | undefined,
    menuId: string,
  ): Promise<string[] | undefined> {
    if (ids === undefined) return undefined;
    if (ids.length === 0) return [];

    const rows =
      kind === 'size'
        ? await this.prisma.size.findMany({ where: { id: { in: ids }, menuId }, select: { id: true } })
        : kind === 'addon'
          ? await this.prisma.addon.findMany({ where: { id: { in: ids }, menuId }, select: { id: true } })
          : await this.prisma.preference.findMany({ where: { id: { in: ids }, menuId }, select: { id: true } });

    const validIds = new Set(rows.map((r) => r.id));
    const invalid = ids.filter((id) => !validIds.has(id));
    if (invalid.length > 0) {
      throw new BadRequestException(`These ${kind} ids do not belong to menu ${menuId}: ${invalid.join(', ')}`);
    }
    return ids;
  }

  private async assertValidTierIds(menuId: string, priceTiers: { tierId: string }[]) {
    const validTierIds = await this.prisma.priceTier.findMany({
      where: { menuId, id: { in: priceTiers.map((p) => p.tierId) } },
      select: { id: true },
    });
    const validSet = new Set(validTierIds.map((t) => t.id));
    const invalid = priceTiers.filter((p) => !validSet.has(p.tierId));
    if (invalid.length > 0) {
      throw new BadRequestException(`Invalid tier IDs for this menu`);
    }
  }

  private async upsertPriceTiers(
    productId: string,
    menuId: string,
    priceTiers: { tierId: string; price: number; foodpandaPrice?: number; grabPrice?: number }[],
  ) {
    await this.assertValidTierIds(menuId, priceTiers);
    await this.prisma.$transaction(async (tx) => {
      await Promise.all(
        priceTiers.map((pt) =>
          tx.productPriceTier.upsert({
            where: { productId_tierId: { productId, tierId: pt.tierId } },
            create: {
              productId,
              tierId: pt.tierId,
              price: pt.price,
              foodpandaPrice: pt.foodpandaPrice,
              grabPrice: pt.grabPrice,
            },
            update: {
              price: pt.price,
              foodpandaPrice: pt.foodpandaPrice,
              grabPrice: pt.grabPrice,
            },
          }),
        ),
      );
    });
  }

  private formatProduct(product: ProductWithRelations, tierId: string | null) {
    // Transform image URL to absolute URL if it's a relative path
    const imageUrl =
      product.image && !product.image.startsWith('http')
        ? `${this.baseUrl}${product.image}`
        : product.image;

    // Resolve effective prices — base is this Product's own fields, then a
    // ProductPriceTier override on top if the requesting store has a tier assigned.
    let resolvedPrice = product.price;
    let resolvedFoodpandaPrice = product.foodpandaPrice ?? null;
    let resolvedGrabPrice = product.grabPrice ?? null;

    if (tierId) {
      const tierRecord = product.priceTiers.find((pt) => pt.tierId === tierId);
      if (tierRecord) {
        resolvedPrice = tierRecord.price;
        resolvedFoodpandaPrice = tierRecord.foodpandaPrice ?? null;
        resolvedGrabPrice = tierRecord.grabPrice ?? null;
      }
    }

    const resolvedSizes = (product.productSizes ?? [])
      .map((ps) => {
        const size = ps.size;
        if (tierId) {
          const sizeTierRecord = size.priceTiers?.find((pt) => pt.tierId === tierId);
          if (sizeTierRecord) {
            return {
              ...size,
              priceModifier: sizeTierRecord.priceModifier,
              foodpandaPrice: sizeTierRecord.foodpandaPrice ?? null,
              grabPrice: sizeTierRecord.grabPrice ?? null,
            };
          }
        }
        return size;
      })
      .sort((a, b) => (a.sequenceNo ?? 0) - (b.sequenceNo ?? 0));

    const resolvedAddons = (product.productAddons ?? [])
      .map((pa) => {
        const addon = pa.addon;
        if (tierId) {
          const addonTierRecord = addon.priceTiers?.find((pt) => pt.tierId === tierId);
          if (addonTierRecord) {
            return {
              ...addon,
              price: addonTierRecord.price,
              foodpandaPrice: addonTierRecord.foodpandaPrice ?? null,
              grabPrice: addonTierRecord.grabPrice ?? null,
            };
          }
        }
        return addon;
      })
      .sort((a, b) => (a.sequenceNo ?? 0) - (b.sequenceNo ?? 0));

    const resolvedPreferences = (product.productPreferences ?? [])
      .map((pp) => pp.preference)
      .sort((a, b) => (a.sequenceNo ?? 0) - (b.sequenceNo ?? 0));

    return {
      id: product.id,
      name: product.name,
      price: resolvedPrice,
      foodpandaPrice: resolvedFoodpandaPrice,
      grabPrice: resolvedGrabPrice,
      categoryId: product.categoryId,
      menuId: product.menuId,
      image: imageUrl,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
      category: product.category,
      sizes: resolvedSizes,
      addons: resolvedAddons,
      preferences: resolvedPreferences,
      // Full tier-override list (admin/builder editing UI); when a store
      // context resolved a specific tierId, its override is already baked
      // into price/foodpandaPrice/grabPrice above.
      priceTiers: product.priceTiers.map((pt) => ({
        id: pt.id,
        tierId: pt.tierId,
        tierName: pt.tier.name,
        price: pt.price,
        foodpandaPrice: pt.foodpandaPrice ?? null,
        grabPrice: pt.grabPrice ?? null,
      })),
    };
  }
}
