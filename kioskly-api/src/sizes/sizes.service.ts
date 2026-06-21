import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PriceTiersService } from '../price-tiers/price-tiers.service';
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
  ) {}

  async create(createSizeDto: CreateSizeDto, brandId: string) {
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

    const size = await this.prisma.size.create({
      data: {
        id,
        name,
        priceModifier,
        foodpandaPrice,
        grabPrice,
        volume,
        brandId,
      },
      include: SIZE_INCLUDE,
    });

    if (priceTiers && priceTiers.length > 0) {
      // Validate all submitted tierIds belong to this brand
      const validTierIds = await this.prisma.priceTier.findMany({
        where: { brandId, id: { in: priceTiers.map((p) => p.tierId) } },
        select: { id: true },
      });
      const validSet = new Set(validTierIds.map((t) => t.id));
      const invalid = priceTiers.filter((p) => !validSet.has(p.tierId));
      if (invalid.length > 0) {
        throw new BadRequestException(`Invalid tier IDs for this brand`);
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

  async findAll(brandId: string, tenantId?: string) {
    const sizes = await this.prisma.size.findMany({
      where: { brandId, tombstone: { not: 1 } },
      include: SIZE_INCLUDE,
      orderBy: { sequenceNo: 'asc' },
    });

    if (tenantId) {
      const tierId = await this.priceTiersService.resolveStoreTierId(tenantId, brandId);
      return sizes.map((s) => this.formatSize(s, { tenantId, tierId }));
    }

    return sizes.map((s) => this.formatSize(s));
  }

  async findOne(id: string, brandId?: string, tenantId?: string) {
    const size = await this.prisma.size.findFirst({
      where: { id, ...(brandId ? { brandId } : {}), tombstone: { not: 1 } },
      include: SIZE_INCLUDE,
    });
    if (!size) throw new NotFoundException(`Size with ID ${id} not found`);

    if (tenantId) {
      const effectiveBrandId = brandId ?? size.brandId ?? undefined;
      if (effectiveBrandId) {
        const tierId = await this.priceTiersService.resolveStoreTierId(tenantId, effectiveBrandId);
        return this.formatSize(size, { tenantId, tierId });
      }
    }

    return this.formatSize(size);
  }

  async update(id: string, updateSizeDto: UpdateSizeDto, brandId?: string) {
    await this.findOne(id, brandId);

    const { priceTiers, ...sizeData } = updateSizeDto;

    const size = await this.prisma.size.update({
      where: { id },
      data: sizeData,
      include: SIZE_INCLUDE,
    });

    // Replace-all tier prices when priceTiers is provided
    if (priceTiers !== undefined) {
      if (priceTiers.length > 0) {
        // Validate all submitted tierIds belong to this brand
        const effectiveBrandId = size.brandId!;
        const validTierIds = await this.prisma.priceTier.findMany({
          where: { brandId: effectiveBrandId, id: { in: priceTiers.map((p) => p.tierId) } },
          select: { id: true },
        });
        const validSet = new Set(validTierIds.map((t) => t.id));
        const invalid = priceTiers.filter((p) => !validSet.has(p.tierId));
        if (invalid.length > 0) {
          throw new BadRequestException(`Invalid tier IDs for this brand`);
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

  async remove(id: string, brandId?: string) {
    await this.findOne(id, brandId);
    return this.prisma.size.update({ where: { id }, data: { tombstone: 1 } });
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
