import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
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
  constructor(private prisma: PrismaService) {}

  async create(createAddonDto: CreateAddonDto, brandId: string) {
    const { id: providedId, name, price, foodpandaPrice, grabPrice, priceTiers } = createAddonDto;
    const id = providedId || randomUUID();

    if (providedId) {
      const existing = await this.prisma.addon.findUnique({ where: { id } });
      if (existing) throw new ConflictException('Addon with this ID already exists');
    }

    const addon = await this.prisma.addon.create({
      data: { id, name, price, foodpandaPrice, grabPrice, brandId },
      include: ADDON_INCLUDE,
    });

    if (priceTiers && priceTiers.length > 0) {
      await Promise.all(
        priceTiers.map((pt) =>
          this.prisma.addonPriceTier.upsert({
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

      const updated = await this.prisma.addon.findUnique({
        where: { id: addon.id },
        include: ADDON_INCLUDE,
      });
      return this.formatAddon(updated!);
    }

    return this.formatAddon(addon);
  }

  /**
   * Resolve the effective priceTierId for a store, falling back to the brand default.
   */
  private async resolveStoreTierId(tenantId: string, brandId: string): Promise<string | null> {
    const store = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { priceTierId: true },
    });

    if (store?.priceTierId) {
      return store.priceTierId;
    }

    const defaultTier = await this.prisma.priceTier.findFirst({
      where: { brandId, isDefault: true },
      select: { id: true },
    });

    return defaultTier?.id ?? null;
  }

  async findAll(brandId: string, tenantId?: string) {
    const addons = await this.prisma.addon.findMany({
      where: { brandId, tombstone: { not: 1 } },
      include: ADDON_INCLUDE,
      orderBy: { sequenceNo: 'asc' },
    });

    if (tenantId) {
      const tierId = await this.resolveStoreTierId(tenantId, brandId);
      return addons.map((a) => this.formatAddon(a, { tenantId, tierId }));
    }

    return addons.map((a) => this.formatAddon(a));
  }

  async findOne(id: string, brandId?: string, tenantId?: string) {
    const addon = await this.prisma.addon.findFirst({
      where: { id, ...(brandId ? { brandId } : {}), tombstone: { not: 1 } },
      include: ADDON_INCLUDE,
    });
    if (!addon) throw new NotFoundException(`Addon with ID ${id} not found`);

    if (tenantId && brandId) {
      const tierId = await this.resolveStoreTierId(tenantId, brandId);
      return this.formatAddon(addon, { tenantId, tierId });
    }

    return this.formatAddon(addon);
  }

  async update(id: string, updateAddonDto: UpdateAddonDto, brandId?: string) {
    await this.findOne(id, brandId);

    const { priceTiers, ...addonData } = updateAddonDto;

    const addon = await this.prisma.addon.update({
      where: { id },
      data: addonData,
      include: ADDON_INCLUDE,
    });

    if (priceTiers && priceTiers.length > 0) {
      await Promise.all(
        priceTiers.map((pt) =>
          this.prisma.addonPriceTier.upsert({
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

      const updated = await this.prisma.addon.findUnique({
        where: { id },
        include: ADDON_INCLUDE,
      });
      return this.formatAddon(updated!);
    }

    return this.formatAddon(addon);
  }

  async remove(id: string, brandId?: string) {
    await this.findOne(id, brandId);
    return this.prisma.addon.update({ where: { id }, data: { tombstone: 1 } });
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
