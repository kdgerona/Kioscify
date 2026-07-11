import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMenuDto } from './dto/create-menu.dto';
import { UpdateMenuDto } from './dto/update-menu.dto';
import { CloneMenuDto } from './dto/clone-menu.dto';
import { generateUniqueSlugId } from '../common/utils/generate-unique-id.util';

@Injectable()
export class MenusService {
  constructor(private prisma: PrismaService) {}

  findAllByBrand(brandId: string) {
    return this.prisma.menu.findMany({
      where: { brandId, tombstone: { not: 1 } },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Resolve the store's currently-assigned menuId, fresh from the DB on every
   * call — never cached in the JWT — so a reassignment takes effect
   * immediately (mirrors PriceTiersService.resolveStoreTierId). Returns null
   * if the store has no menu assigned yet (decision: stores can be created
   * without one and configured later; callers must handle null gracefully).
   */
  async resolveStoreMenuId(tenantId: string): Promise<string | null> {
    const store = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { menuId: true },
    });
    return store?.menuId ?? null;
  }

  async findOne(brandId: string, menuId: string) {
    const menu = await this.prisma.menu.findFirst({
      where: { id: menuId, brandId, tombstone: { not: 1 } },
    });
    if (!menu) throw new NotFoundException(`Menu ${menuId} not found`);
    return menu;
  }

  create(brandId: string, dto: CreateMenuDto) {
    return this.prisma.menu.create({
      data: { brandId, name: dto.name, description: dto.description, isActive: dto.isActive ?? true },
    });
  }

  async update(brandId: string, menuId: string, dto: UpdateMenuDto) {
    const menu = await this.findOne(brandId, menuId);
    // Deactivating an in-use menu would silently do nothing today (no read
    // path checks isActive), which is confusing — block it the same way
    // delete is blocked, so a menu can only go inactive once no store is
    // relying on it. Reactivating is always allowed.
    if (dto.isActive === false && menu.isActive) {
      await this.assertNotAssignedToAnyStore(menuId, 'deactivate');
    }
    return this.prisma.menu.update({ where: { id: menuId }, data: dto });
  }

  async remove(brandId: string, menuId: string) {
    const menu = await this.findOne(brandId, menuId);
    await this.assertNotAssignedToAnyStore(menuId, 'delete');
    // @@unique([brandId, name]) is a plain Mongo index — it has no concept of
    // tombstone, so a deleted menu would otherwise permanently squat on its
    // name forever. Mangle the name on delete so it's free for reuse (e.g. a
    // "clone then delete then clone again" cycle wouldn't collide).
    return this.prisma.menu.update({
      where: { id: menuId },
      data: { tombstone: 1, name: `${menu.name} [deleted ${Date.now()}]` },
    });
  }

  private async assertNotAssignedToAnyStore(menuId: string, action: 'delete' | 'deactivate') {
    const affectedStores = await this.prisma.tenant.findMany({
      where: { menuId },
      select: { name: true },
    });
    if (affectedStores.length > 0) {
      const storeNames = affectedStores.map((s) => s.name).join(', ');
      throw new ConflictException(
        `Cannot ${action} this menu — it is assigned to the following store(s): ${storeNames}`,
      );
    }
  }

  /**
   * Deep-clone a menu: every Category/Size/Addon/Preference/Product/PriceTier
   * is directly owned by exactly one menuId (no shared-master-across-menus
   * junction), so cloning means re-creating every row with fresh ids, not
   * re-linking to the originals. Cloned Products reuse the source's `image`
   * URL as-is (no file duplication in storage) — ProductsService's
   * updateImage/removeImage guard against deleting a still-shared image.
   */
  async clone(brandId: string, menuId: string, dto: CloneMenuDto) {
    const source = await this.findOne(brandId, menuId);
    const name = await this.resolveCloneName(brandId, dto, source.name);

    const newMenuId = await this.prisma.$transaction(
      async (tx) => {
        const newMenu = await tx.menu.create({
          data: {
            brandId,
            name,
            description: dto.description ?? source.description,
            isActive: source.isActive,
          },
        });

        const categories = await tx.category.findMany({
          where: { menuId, type: 'PRODUCT', tombstone: { not: 1 } },
        });
        const categoryIdMap = new Map<string, string>();
        for (const category of categories) {
          const created = await tx.category.create({
            data: {
              id: randomUUID(),
              brandId: category.brandId,
              menuId: newMenu.id,
              type: 'PRODUCT',
              name: category.name,
              description: category.description,
              sequenceNo: category.sequenceNo,
            },
          });
          categoryIdMap.set(category.id, created.id);
        }

        const sizes = await tx.size.findMany({ where: { menuId, tombstone: { not: 1 } } });
        const sizeIdMap = new Map<string, string>();
        for (const size of sizes) {
          const created = await tx.size.create({
            data: {
              id: randomUUID(),
              brandId: size.brandId,
              menuId: newMenu.id,
              name: size.name,
              priceModifier: size.priceModifier,
              foodpandaPrice: size.foodpandaPrice,
              grabPrice: size.grabPrice,
              volume: size.volume,
              sequenceNo: size.sequenceNo,
            },
          });
          sizeIdMap.set(size.id, created.id);
        }

        const addons = await tx.addon.findMany({ where: { menuId, tombstone: { not: 1 } } });
        const addonIdMap = new Map<string, string>();
        for (const addon of addons) {
          const created = await tx.addon.create({
            data: {
              id: randomUUID(),
              brandId: addon.brandId,
              menuId: newMenu.id,
              name: addon.name,
              price: addon.price,
              foodpandaPrice: addon.foodpandaPrice,
              grabPrice: addon.grabPrice,
              sequenceNo: addon.sequenceNo,
            },
          });
          addonIdMap.set(addon.id, created.id);
        }

        const preferences = await tx.preference.findMany({ where: { menuId, tombstone: { not: 1 } } });
        const preferenceIdMap = new Map<string, string>();
        for (const preference of preferences) {
          const created = await tx.preference.create({
            data: {
              id: randomUUID(),
              brandId: preference.brandId,
              menuId: newMenu.id,
              name: preference.name,
              isDefault: preference.isDefault,
              sequenceNo: preference.sequenceNo,
            },
          });
          preferenceIdMap.set(preference.id, created.id);
        }

        const priceTiers = await tx.priceTier.findMany({ where: { menuId } });
        const tierIdMap = new Map<string, string>();
        for (const tier of priceTiers) {
          const created = await tx.priceTier.create({
            data: { menuId: newMenu.id, name: tier.name, isDefault: tier.isDefault },
          });
          tierIdMap.set(tier.id, created.id);
        }

        if (sizeIdMap.size > 0 && tierIdMap.size > 0) {
          const sizeTiers = await tx.sizePriceTier.findMany({
            where: { sizeId: { in: [...sizeIdMap.keys()] } },
          });
          for (const st of sizeTiers) {
            const newSizeId = sizeIdMap.get(st.sizeId);
            const newTierId = tierIdMap.get(st.tierId);
            if (!newSizeId || !newTierId) continue;
            await tx.sizePriceTier.create({
              data: {
                sizeId: newSizeId,
                tierId: newTierId,
                priceModifier: st.priceModifier,
                foodpandaPrice: st.foodpandaPrice,
                grabPrice: st.grabPrice,
              },
            });
          }
        }

        if (addonIdMap.size > 0 && tierIdMap.size > 0) {
          const addonTiers = await tx.addonPriceTier.findMany({
            where: { addonId: { in: [...addonIdMap.keys()] } },
          });
          for (const at of addonTiers) {
            const newAddonId = addonIdMap.get(at.addonId);
            const newTierId = tierIdMap.get(at.tierId);
            if (!newAddonId || !newTierId) continue;
            await tx.addonPriceTier.create({
              data: {
                addonId: newAddonId,
                tierId: newTierId,
                price: at.price,
                foodpandaPrice: at.foodpandaPrice,
                grabPrice: at.grabPrice,
              },
            });
          }
        }

        const products = await tx.product.findMany({ where: { menuId, tombstone: { not: 1 } } });
        const productIdMap = new Map<string, string>();
        for (const product of products) {
          const newCategoryId = categoryIdMap.get(product.categoryId);
          // A tombstoned/missing category should never have an active product
          // pointing at it (CategoriesService.remove() blocks that) — skip
          // defensively rather than fail the whole clone if it ever happens.
          if (!newCategoryId) continue;

          const newProductId = await generateUniqueSlugId(product.name, async (candidate) => {
            const existing = await tx.product.findUnique({ where: { id: candidate }, select: { id: true } });
            return !!existing;
          });

          await tx.product.create({
            data: {
              id: newProductId,
              brandId: product.brandId,
              menuId: newMenu.id,
              name: product.name,
              price: product.price,
              foodpandaPrice: product.foodpandaPrice,
              grabPrice: product.grabPrice,
              categoryId: newCategoryId,
              image: product.image,
            },
          });
          productIdMap.set(product.id, newProductId);
        }

        for (const [oldProductId, newProductId] of productIdMap) {
          const [productSizes, productAddons, productPreferences, productPriceTiers] = await Promise.all([
            tx.productSize.findMany({ where: { productId: oldProductId } }),
            tx.productAddon.findMany({ where: { productId: oldProductId } }),
            tx.productPreference.findMany({ where: { productId: oldProductId } }),
            tx.productPriceTier.findMany({ where: { productId: oldProductId } }),
          ]);

          for (const ps of productSizes) {
            const newSizeId = sizeIdMap.get(ps.sizeId);
            if (!newSizeId) continue;
            await tx.productSize.create({ data: { productId: newProductId, sizeId: newSizeId } });
          }
          for (const pa of productAddons) {
            const newAddonId = addonIdMap.get(pa.addonId);
            if (!newAddonId) continue;
            await tx.productAddon.create({ data: { productId: newProductId, addonId: newAddonId } });
          }
          for (const pp of productPreferences) {
            const newPreferenceId = preferenceIdMap.get(pp.preferenceId);
            if (!newPreferenceId) continue;
            await tx.productPreference.create({ data: { productId: newProductId, preferenceId: newPreferenceId } });
          }
          for (const pt of productPriceTiers) {
            const newTierId = tierIdMap.get(pt.tierId);
            if (!newTierId) continue;
            await tx.productPriceTier.create({
              data: {
                productId: newProductId,
                tierId: newTierId,
                price: pt.price,
                foodpandaPrice: pt.foodpandaPrice,
                grabPrice: pt.grabPrice,
              },
            });
          }
        }

        return newMenu.id;
      },
      { maxWait: 10000, timeout: 30000 },
    );

    return this.findOne(brandId, newMenuId);
  }

  private async resolveCloneName(brandId: string, dto: CloneMenuDto, sourceName: string): Promise<string> {
    if (dto.name) {
      const taken = await this.prisma.menu.findFirst({ where: { brandId, name: dto.name }, select: { id: true } });
      if (taken) throw new ConflictException(`A menu named "${dto.name}" already exists for this brand`);
      return dto.name;
    }

    let candidate = `${sourceName} (Copy)`;
    let counter = 2;
    while (await this.prisma.menu.findFirst({ where: { brandId, name: candidate }, select: { id: true } })) {
      candidate = `${sourceName} (Copy ${counter})`;
      counter++;
    }
    return candidate;
  }
}
