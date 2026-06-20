import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { PriceTiersService } from '../price-tiers/price-tiers.service';
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
        size: true;
      };
    };
    productAddons: {
      include: {
        addon: true;
      };
    };
    productPreferences: {
      include: {
        preference: true;
      };
    };
    priceTiers: {
      include: {
        tier: true;
      };
    };
  };
}>;

const PRODUCT_INCLUDE = {
  category: true,
  productSizes: {
    include: {
      size: true,
    },
  },
  productAddons: {
    include: {
      addon: true,
    },
  },
  productPreferences: {
    include: {
      preference: true,
    },
  },
  priceTiers: {
    include: {
      tier: true,
    },
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
  ) {
    this.baseUrl = this.configService.get<string>(appConstants.base_url) || '';
  }

  async create(createProductDto: CreateProductDto, brandId: string) {
    const { id, name, price, foodpandaPrice, grabPrice, categoryId, image, sizeIds, addonIds, preferenceIds, priceTiers } =
      createProductDto;

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

    // Create product with sizes and addons
    const product = await this.prisma.product.create({
      data: {
        id: productId,
        name,
        price,
        foodpandaPrice,
        grabPrice,
        categoryId,
        image,
        brandId,
        productSizes: sizeIds
          ? {
              create: sizeIds.map((sizeId) => ({
                size: { connect: { id: sizeId } },
              })),
            }
          : undefined,
        productAddons: addonIds
          ? {
              create: addonIds.map((addonId) => ({
                addon: { connect: { id: addonId } },
              })),
            }
          : undefined,
        productPreferences: preferenceIds
          ? {
              create: preferenceIds.map((preferenceId) => ({
                preference: { connect: { id: preferenceId } },
              })),
            }
          : undefined,
      },
      include: PRODUCT_INCLUDE,
    });

    // Upsert price tiers if provided
    if (priceTiers && priceTiers.length > 0) {
      await Promise.all(
        priceTiers.map((pt) =>
          this.prisma.productPriceTier.upsert({
            where: { productId_tierId: { productId: product.id, tierId: pt.tierId } },
            create: {
              productId: product.id,
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

      // Re-fetch with updated price tiers
      const updated = await this.prisma.product.findUnique({
        where: { id: product.id },
        include: PRODUCT_INCLUDE,
      });
      return this.formatProduct(updated!);
    }

    return this.formatProduct(product);
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

  async findAll(brandId: string, categoryId?: string, tenantId?: string) {
    const where: Prisma.ProductWhereInput = { brandId, tombstone: { not: 1 } };
    if (categoryId) {
      where.categoryId = categoryId;
    }

    const products = await this.prisma.product.findMany({
      where,
      include: PRODUCT_INCLUDE,
      orderBy: { name: 'asc' },
    });

    // Store context: resolve effective prices per tier
    if (tenantId) {
      const tierId = await this.priceTiersService.resolveStoreTierId(tenantId, brandId);
      return products.map((product) => this.formatProduct(product, { tenantId, tierId }));
    }

    // Brand context: return full priceTiers array
    return products.map((product) => this.formatProduct(product));
  }

  async findOne(id: string, brandId?: string, tenantId?: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, ...(brandId ? { brandId } : {}), tombstone: { not: 1 } },
      include: PRODUCT_INCLUDE,
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    if (tenantId) {
      const effectiveBrandId = brandId ?? product.brandId ?? undefined;
      if (effectiveBrandId) {
        const tierId = await this.priceTiersService.resolveStoreTierId(tenantId, effectiveBrandId);
        return this.formatProduct(product, { tenantId, tierId });
      }
    }

    return this.formatProduct(product);
  }

  async update(
    id: string,
    updateProductDto: UpdateProductDto,
    brandId: string,
  ) {
    await this.findOne(id, brandId); // Check if exists

    const { sizeIds, addonIds, preferenceIds, priceTiers, ...productData } = updateProductDto;

    // Update product and its relations
    const product = await this.prisma.product.update({
      where: { id },
      data: {
        ...productData,
        ...(sizeIds !== undefined && {
          productSizes: {
            deleteMany: {},
            create: sizeIds.map((sizeId) => ({
              size: { connect: { id: sizeId } },
            })),
          },
        }),
        ...(addonIds !== undefined && {
          productAddons: {
            deleteMany: {},
            create: addonIds.map((addonId) => ({
              addon: { connect: { id: addonId } },
            })),
          },
        }),
        ...(preferenceIds !== undefined && {
          productPreferences: {
            deleteMany: {},
            create: preferenceIds.map((preferenceId) => ({
              preference: { connect: { id: preferenceId } },
            })),
          },
        }),
      },
      include: PRODUCT_INCLUDE,
    });

    // Upsert price tiers if provided
    if (priceTiers && priceTiers.length > 0) {
      await Promise.all(
        priceTiers.map((pt) =>
          this.prisma.productPriceTier.upsert({
            where: { productId_tierId: { productId: id, tierId: pt.tierId } },
            create: {
              productId: id,
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

      // Re-fetch with updated price tiers
      const updated = await this.prisma.product.findUnique({
        where: { id },
        include: PRODUCT_INCLUDE,
      });
      return this.formatProduct(updated!);
    }

    return this.formatProduct(product);
  }

  async updateImage(id: string, file: Express.Multer.File, brandId: string) {
    const existing = await this.findOne(id, brandId);

    if (existing.image) await this.storage.delete(existing.image);

    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const filename = `product-${id}-${uniqueSuffix}${extname(file.originalname)}`;
    const imageUrl = await this.storage.upload('products', filename, file.buffer, file.mimetype);

    const product = await this.prisma.product.update({
      where: { id },
      data: { image: imageUrl },
      include: PRODUCT_INCLUDE,
    });

    return this.formatProduct(product);
  }

  async removeImage(id: string, brandId: string) {
    const existing = await this.findOne(id, brandId);

    if (existing.image) await this.storage.delete(existing.image);

    const product = await this.prisma.product.update({
      where: { id },
      data: { image: null },
      include: PRODUCT_INCLUDE,
    });

    return this.formatProduct(product);
  }

  async remove(id: string, brandId: string) {
    await this.findOne(id, brandId); // Check if exists

    return this.prisma.product.update({
      where: { id },
      data: { tombstone: 1 },
    });
  }

  private formatProduct(
    product: ProductWithRelations,
    storeCtx?: { tenantId: string; tierId: string | null },
  ) {
    // Transform image URL to absolute URL if it's a relative path
    const imageUrl =
      product.image && !product.image.startsWith('http')
        ? `${this.baseUrl}${product.image}`
        : product.image;

    // Resolve effective prices
    let resolvedPrice = product.price;
    let resolvedFoodpandaPrice = product.foodpandaPrice ?? null;
    let resolvedGrabPrice = product.grabPrice ?? null;

    if (storeCtx?.tierId) {
      const tierRecord = product.priceTiers.find((pt) => pt.tierId === storeCtx.tierId);
      if (tierRecord) {
        resolvedPrice = tierRecord.price;
        resolvedFoodpandaPrice = tierRecord.foodpandaPrice ?? null;
        resolvedGrabPrice = tierRecord.grabPrice ?? null;
      }
      // else keep flat fields as fallback
    }

    const base = {
      id: product.id,
      name: product.name,
      price: resolvedPrice,
      foodpandaPrice: resolvedFoodpandaPrice,
      grabPrice: resolvedGrabPrice,
      categoryId: product.categoryId,
      image: imageUrl,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
      category: product.category,
      sizes: (product.productSizes?.map((ps) => ps.size) || [])
        .sort((a, b) => (a.sequenceNo ?? 0) - (b.sequenceNo ?? 0)),
      addons: (product.productAddons?.map((pa) => pa.addon) || [])
        .sort((a, b) => (a.sequenceNo ?? 0) - (b.sequenceNo ?? 0)),
      preferences: (product.productPreferences?.map((pp) => pp.preference) || [])
        .sort((a, b) => (a.sequenceNo ?? 0) - (b.sequenceNo ?? 0)),
    };

    // Brand context (no store): include full priceTiers array
    if (!storeCtx) {
      return {
        ...base,
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

    return base;
  }
}
