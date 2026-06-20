import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePriceTierDto } from './dto/create-price-tier.dto';
import { UpdatePriceTierDto } from './dto/update-price-tier.dto';

@Injectable()
export class PriceTiersService {
  constructor(private prisma: PrismaService) {}

  findAllByBrand(brandId: string) {
    return this.prisma.priceTier.findMany({
      where: { brandId },
      orderBy: { name: 'asc' },
    });
  }

  async create(brandId: string, dto: CreatePriceTierDto) {
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.priceTier.updateMany({
          where: { brandId, isDefault: true },
          data: { isDefault: false },
        });
      }

      return tx.priceTier.create({
        data: { ...dto, brandId },
      });
    });
  }

  async update(brandId: string, tierId: string, dto: UpdatePriceTierDto) {
    await this.assertExists(brandId, tierId);

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.priceTier.updateMany({
          where: { brandId, isDefault: true, id: { not: tierId } },
          data: { isDefault: false },
        });
      }

      return tx.priceTier.update({
        where: { id: tierId, brandId },
        data: dto,
      });
    });
  }

  async remove(brandId: string, tierId: string) {
    await this.assertExists(brandId, tierId);

    const affectedStores = await this.prisma.tenant.findMany({
      where: { priceTierId: tierId },
      select: { name: true },
    });

    if (affectedStores.length > 0) {
      const storeNames = affectedStores.map((s) => s.name).join(', ');
      throw new ConflictException(
        `Cannot delete this price tier — it is assigned to the following store(s): ${storeNames}`,
      );
    }

    return this.prisma.priceTier.delete({ where: { id: tierId, brandId } });
  }

  private async assertExists(brandId: string, tierId: string) {
    const tier = await this.prisma.priceTier.findFirst({
      where: { id: tierId, brandId },
    });
    if (!tier) throw new NotFoundException(`Price tier ${tierId} not found`);
    return tier;
  }
}
