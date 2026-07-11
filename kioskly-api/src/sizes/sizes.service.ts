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
import { CreateSizeDto } from './dto/create-size.dto';
import { UpdateSizeDto } from './dto/update-size.dto';
import { Prisma } from '@prisma/client';

type SizeWithPriceTiers = Prisma.SizeGetPayload<{
  include: { priceTiers: { include: { tier: true } } };
}>;

const SIZE_INCLUDE = {
  priceTiers: {
    include: { tier: true },
  },
} satisfies Prisma.SizeInclude;

@Injectable()
export class SizesService {
  constructor(
    private prisma: PrismaService,
    private priceTiersService: PriceTiersService,
    private menusService: MenusService,
  ) {}

  async create(createSizeDto: CreateSizeDto, menuId: string) {
    const {
      id: providedId,
      name,
      priceModifier,
      foodpandaPrice,
      grabPrice,
      volume,
      priceTiers,
    } = createSizeDto;
    const id = providedId || randomUUID();

    if (providedId) {
      const existing = await this.prisma.size.findUnique({ where: { id } });
      if (existing)
        throw new ConflictException('Size with this ID already exists');
    }

    const menu = await this.prisma.menu.findUnique({ where: { id: menuId }, select: { brandId: true } });
    if (!menu) throw new BadRequestException(`Menu ${menuId} not found`);

    const size = await this.prisma.size.create({
      data: {
        id,
        name,
        priceModifier,
        foodpandaPrice,
        grabPrice,
        volume,
        menuId,
        brandId: menu.brandId, // denormalized, matches PriceTier's brand scope
      },
      include: SIZE_INCLUDE,
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
            tx.sizePriceTier.upsert({
              where: { sizeId_tierId: { sizeId: size.id, tierId: pt.tierId } },
              create: {
                sizeId: size.id,
                tierId: pt.tierId,
                priceModifier: pt.priceModifier,
                foodpandaPrice: pt.foodpandaPrice,
                grabPrice: pt.grabPrice,
              },
              update: {
                priceModifier: pt.priceModifier,
                foodpandaPrice: pt.foodpandaPrice,
                grabPrice: pt.grabPrice,
              },
            }),
          ),
        );
      });

      const updated = await this.prisma.size.findUnique({
        where: { id: size.id },
        include: SIZE_INCLUDE,
      });
      return this.formatSize(updated!);
    }

    return this.formatSize(size);
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

    const sizes = await this.prisma.size.findMany({
      where: { menuId, tombstone: { not: 1 } },
      include: SIZE_INCLUDE,
      orderBy: { sequenceNo: 'asc' },
    });

    if (params.tenantId) {
      const tierId = await this.resolveTierIdForTenant(params.tenantId);
      return sizes.map((s) => this.formatSize(s, { tenantId: params.tenantId!, tierId }));
    }

    return sizes.map((s) => this.formatSize(s));
  }

  async findOne(id: string, tenantId?: string) {
    const size = await this.prisma.size.findFirst({
      where: { id, tombstone: { not: 1 } },
      include: SIZE_INCLUDE,
    });
    if (!size) throw new NotFoundException(`Size with ID ${id} not found`);

    if (tenantId) {
      const tierId = await this.resolveTierIdForTenant(tenantId);
      return this.formatSize(size, { tenantId, tierId });
    }

    return this.formatSize(size);
  }

  async update(id: string, updateSizeDto: UpdateSizeDto) {
    const existing = await this.prisma.size.findFirst({ where: { id, tombstone: { not: 1 } } });
    if (!existing) throw new NotFoundException(`Size with ID ${id} not found`);

    const { priceTiers, ...sizeData } = updateSizeDto;

    const size = await this.prisma.size.update({
      where: { id },
      data: sizeData,
      include: SIZE_INCLUDE,
    });

    // Replace-all tier prices when priceTiers is provided
    if (priceTiers !== undefined) {
      if (priceTiers.length > 0) {
        // Validate all submitted tierIds belong to this size's menu
        const effectiveMenuId = size.menuId!;
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
        await tx.sizePriceTier.deleteMany({
          where: { sizeId: id, tierId: { notIn: incomingTierIds } },
        });
        // Upsert the incoming set
        await Promise.all(
          priceTiers.map((pt) =>
            tx.sizePriceTier.upsert({
              where: { sizeId_tierId: { sizeId: id, tierId: pt.tierId } },
              create: {
                sizeId: id,
                tierId: pt.tierId,
                priceModifier: pt.priceModifier,
                foodpandaPrice: pt.foodpandaPrice,
                grabPrice: pt.grabPrice,
              },
              update: {
                priceModifier: pt.priceModifier,
                foodpandaPrice: pt.foodpandaPrice,
                grabPrice: pt.grabPrice,
              },
            }),
          ),
        );
      });

      const updated = await this.prisma.size.findUnique({
        where: { id },
        include: SIZE_INCLUDE,
      });
      return this.formatSize(updated!);
    }

    return this.formatSize(size);
  }

  async remove(id: string) {
    const existing = await this.prisma.size.findFirst({ where: { id, tombstone: { not: 1 } } });
    if (!existing) throw new NotFoundException(`Size with ID ${id} not found`);
    await this.assertNotInUse(id);
    return this.prisma.size.update({ where: { id }, data: { tombstone: 1 } });
  }

  private async assertNotInUse(id: string) {
    const links = await this.prisma.productSize.findMany({
      where: { sizeId: id },
      include: { product: { select: { name: true, tombstone: true } } },
    });
    const productNames = links.filter((l) => l.product.tombstone !== 1).map((l) => l.product.name);
    if (productNames.length > 0) {
      throw new ConflictException(
        `Cannot delete this size — it is still used by the following product(s): ${productNames.join(', ')}`,
      );
    }
  }

  private async resolveTierIdForTenant(tenantId: string): Promise<string | null> {
    return this.priceTiersService.resolveStoreTierId(tenantId);
  }

  private formatSize(
    size: SizeWithPriceTiers,
    storeCtx?: { tenantId: string; tierId: string | null },
  ) {
    let resolvedPriceModifier = size.priceModifier;
    let resolvedFoodpandaPrice = size.foodpandaPrice ?? null;
    let resolvedGrabPrice = size.grabPrice ?? null;

    if (storeCtx?.tierId) {
      const tierRecord = size.priceTiers.find((pt) => pt.tierId === storeCtx.tierId);
      if (tierRecord) {
        resolvedPriceModifier = tierRecord.priceModifier;
        resolvedFoodpandaPrice = tierRecord.foodpandaPrice ?? null;
        resolvedGrabPrice = tierRecord.grabPrice ?? null;
      }
    }

    const base = {
      id: size.id,
      name: size.name,
      priceModifier: resolvedPriceModifier,
      foodpandaPrice: resolvedFoodpandaPrice,
      grabPrice: resolvedGrabPrice,
      volume: size.volume ?? null,
      sequenceNo: size.sequenceNo,
      menuId: size.menuId,
      brandId: size.brandId,
      tenantId: size.tenantId,
      createdAt: size.createdAt,
      updatedAt: size.updatedAt,
    };

    if (!storeCtx) {
      return {
        ...base,
        priceTiers: size.priceTiers.map((pt) => ({
          id: pt.id,
          tierId: pt.tierId,
          tierName: pt.tier.name,
          priceModifier: pt.priceModifier,
          foodpandaPrice: pt.foodpandaPrice ?? null,
          grabPrice: pt.grabPrice ?? null,
        })),
      };
    }

    return base;
  }
}
