import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PriceTiersService } from '../price-tiers/price-tiers.service';
import { MenusService } from '../menus/menus.service';
import { CreateAddonDto } from './dto/create-addon.dto';
import { UpdateAddonDto } from './dto/update-addon.dto';
import { Prisma } from '@prisma/client';

type AddonWithPriceTiers = Prisma.AddonGetPayload<{
  include: { priceTiers: { include: { tier: true } } };
}>;

const ADDON_INCLUDE = {
  priceTiers: {
    include: { tier: true },
  },
} satisfies Prisma.AddonInclude;

@Injectable()
export class AddonsService {
  constructor(
    private prisma: PrismaService,
    private priceTiersService: PriceTiersService,
    private menusService: MenusService,
  ) {}

  async create(createAddonDto: CreateAddonDto, menuId: string) {
    const { id: providedId, name, price, foodpandaPrice, grabPrice, priceTiers } = createAddonDto;
    const id = providedId || randomUUID();

    if (providedId) {
      const existing = await this.prisma.addon.findUnique({ where: { id } });
      if (existing) throw new ConflictException('Addon with this ID already exists');
    }

    const menu = await this.prisma.menu.findUnique({ where: { id: menuId }, select: { brandId: true } });
    if (!menu) throw new BadRequestException(`Menu ${menuId} not found`);

    const addon = await this.prisma.addon.create({
      data: { id, name, price, foodpandaPrice, grabPrice, menuId, brandId: menu.brandId },
      include: ADDON_INCLUDE,
    });

    if (priceTiers && priceTiers.length > 0) {
      // Validate all submitted tierIds belong to this menu
      const validTierIds = await this.prisma.priceTier.findMany({
        where: { menuId, id: { in: priceTiers.map((p) => p.tierId) } },
        select: { id: true },
      });
      const validSet = new Set(validTierIds.map((t) => t.id));
      const invalid = priceTiers.filter((p) => !validSet.has(p.tierId));
      if (invalid.length > 0) {
        throw new BadRequestException(`Invalid tier IDs for this menu`);
      }

      await this.prisma.$transaction(async (tx) => {
        await Promise.all(
          priceTiers.map((pt) =>
            tx.addonPriceTier.upsert({
              where: { addonId_tierId: { addonId: addon.id, tierId: pt.tierId } },
              create: {
                addonId: addon.id,
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

      const updated = await this.prisma.addon.findUnique({
        where: { id: addon.id },
        include: ADDON_INCLUDE,
      });
      return this.formatAddon(updated!);
    }

    return this.formatAddon(addon);
  }

  /**
   * `menuId` (explicit, admin/builder context) takes priority; otherwise
   * resolved from the requesting store's current menu via `tenantId`
   * (mobile/store-portal read context). Returns [] rather than throwing when
   * scope can't be resolved — an unassigned store must see an empty list.
   */
  async findAll(params: { menuId?: string; tenantId?: string }) {
    const menuId =
      params.menuId ?? (params.tenantId ? await this.menusService.resolveStoreMenuId(params.tenantId) : null);
    if (!menuId) return [];

    const addons = await this.prisma.addon.findMany({
      where: { menuId, tombstone: { not: 1 } },
      include: ADDON_INCLUDE,
      orderBy: { sequenceNo: 'asc' },
    });

    if (params.tenantId) {
      const tierId = await this.resolveTierIdForTenant(params.tenantId);
      return addons.map((a) => this.formatAddon(a, { tenantId: params.tenantId!, tierId }));
    }

    return addons.map((a) => this.formatAddon(a));
  }

  async findOne(id: string, tenantId?: string) {
    const addon = await this.prisma.addon.findFirst({
      where: { id, tombstone: { not: 1 } },
      include: ADDON_INCLUDE,
    });
    if (!addon) throw new NotFoundException(`Addon with ID ${id} not found`);

    if (tenantId) {
      const tierId = await this.resolveTierIdForTenant(tenantId);
      return this.formatAddon(addon, { tenantId, tierId });
    }

    return this.formatAddon(addon);
  }

  async update(id: string, updateAddonDto: UpdateAddonDto) {
    const existing = await this.prisma.addon.findFirst({ where: { id, tombstone: { not: 1 } } });
    if (!existing) throw new NotFoundException(`Addon with ID ${id} not found`);

    const { priceTiers, ...addonData } = updateAddonDto;

    const addon = await this.prisma.addon.update({
      where: { id },
      data: addonData,
      include: ADDON_INCLUDE,
    });

    // Replace-all tier prices when priceTiers is provided
    if (priceTiers !== undefined) {
      if (priceTiers.length > 0) {
        // Validate all submitted tierIds belong to this addon's menu
        const effectiveMenuId = addon.menuId!;
        const validTierIds = await this.prisma.priceTier.findMany({
          where: { menuId: effectiveMenuId, id: { in: priceTiers.map((p) => p.tierId) } },
          select: { id: true },
        });
        const validSet = new Set(validTierIds.map((t) => t.id));
        const invalid = priceTiers.filter((p) => !validSet.has(p.tierId));
        if (invalid.length > 0) {
          throw new BadRequestException(`Invalid tier IDs for this menu`);
        }
      }

      const incomingTierIds = priceTiers.map((p) => p.tierId);
      await this.prisma.$transaction(async (tx) => {
        // Delete stale tier records not in the incoming set
        await tx.addonPriceTier.deleteMany({
          where: { addonId: id, tierId: { notIn: incomingTierIds } },
        });
        // Upsert the incoming set
        await Promise.all(
          priceTiers.map((pt) =>
            tx.addonPriceTier.upsert({
              where: { addonId_tierId: { addonId: id, tierId: pt.tierId } },
              create: {
                addonId: id,
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

      const updated = await this.prisma.addon.findUnique({
        where: { id },
        include: ADDON_INCLUDE,
      });
      return this.formatAddon(updated!);
    }

    return this.formatAddon(addon);
  }

  async remove(id: string) {
    const existing = await this.prisma.addon.findFirst({ where: { id, tombstone: { not: 1 } } });
    if (!existing) throw new NotFoundException(`Addon with ID ${id} not found`);
    await this.assertNotInUse(id);
    return this.prisma.addon.update({ where: { id }, data: { tombstone: 1 } });
  }

  private async assertNotInUse(id: string) {
    const links = await this.prisma.productAddon.findMany({
      where: { addonId: id },
      include: { product: { select: { name: true, tombstone: true } } },
    });
    const productNames = links.filter((l) => l.product.tombstone !== 1).map((l) => l.product.name);
    if (productNames.length > 0) {
      throw new ConflictException(
        `Cannot delete this addon — it is still used by the following product(s): ${productNames.join(', ')}`,
      );
    }
  }

  private async resolveTierIdForTenant(tenantId: string): Promise<string | null> {
    return this.priceTiersService.resolveStoreTierId(tenantId);
  }

  private formatAddon(
    addon: AddonWithPriceTiers,
    storeCtx?: { tenantId: string; tierId: string | null },
  ) {
    let resolvedPrice = addon.price;
    let resolvedFoodpandaPrice = addon.foodpandaPrice ?? null;
    let resolvedGrabPrice = addon.grabPrice ?? null;

    if (storeCtx?.tierId) {
      const tierRecord = addon.priceTiers.find((pt) => pt.tierId === storeCtx.tierId);
      if (tierRecord) {
        resolvedPrice = tierRecord.price;
        resolvedFoodpandaPrice = tierRecord.foodpandaPrice ?? null;
        resolvedGrabPrice = tierRecord.grabPrice ?? null;
      }
    }

    const base = {
      id: addon.id,
      name: addon.name,
      price: resolvedPrice,
      foodpandaPrice: resolvedFoodpandaPrice,
      grabPrice: resolvedGrabPrice,
      sequenceNo: addon.sequenceNo,
      menuId: addon.menuId,
      brandId: addon.brandId,
      tenantId: addon.tenantId,
      createdAt: addon.createdAt,
      updatedAt: addon.updatedAt,
    };

    if (!storeCtx) {
      return {
        ...base,
        priceTiers: addon.priceTiers.map((pt) => ({
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
