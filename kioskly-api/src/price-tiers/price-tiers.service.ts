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

  findAllByMenu(menuId: string) {
    return this.prisma.priceTier.findMany({
      where: { menuId },
      orderBy: { name: 'asc' },
    });
  }

  async create(menuId: string, dto: CreatePriceTierDto) {
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.priceTier.updateMany({
          where: { menuId, isDefault: true },
          data: { isDefault: false },
        });
      }

      return tx.priceTier.create({
        data: { ...dto, menuId },
      });
    });
  }

  async update(menuId: string, tierId: string, dto: UpdatePriceTierDto) {
    await this.assertExists(menuId, tierId);

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.priceTier.updateMany({
          where: { menuId, isDefault: true, id: { not: tierId } },
          data: { isDefault: false },
        });
      }

      return tx.priceTier.update({
        where: { id: tierId, menuId },
        data: dto,
      });
    });
  }

  async remove(menuId: string, tierId: string) {
    await this.assertExists(menuId, tierId);

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

    return this.prisma.priceTier.delete({ where: { id: tierId, menuId } });
  }

  /**
   * Resolve the effective priceTierId for a store given its current menu's
   * default tier fallback. Returns null if the store has no menu assigned,
   * no assigned tier, and no default tier exists on its menu.
   */
  async resolveStoreTierId(tenantId: string): Promise<string | null> {
    const store = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { priceTierId: true, menuId: true },
    });

    if (!store?.menuId) return null;

    // A stored priceTierId is only valid if it still belongs to the store's
    // current menu — a tier from a previous menu assignment is meaningless
    // (StoresService.update() already clears it on menu reassignment; this
    // is defense in depth against any path that doesn't go through that).
    if (store.priceTierId) {
      const tier = await this.prisma.priceTier.findFirst({
        where: { id: store.priceTierId, menuId: store.menuId },
        select: { id: true },
      });
      if (tier) return tier.id;
    }

    // Fall back to this menu's default PriceTier
    const defaultTier = await this.prisma.priceTier.findFirst({
      where: { menuId: store.menuId, isDefault: true },
      select: { id: true },
    });

    return defaultTier?.id ?? null;
  }

  private async assertExists(menuId: string, tierId: string) {
    const tier = await this.prisma.priceTier.findFirst({
      where: { id: tierId, menuId },
    });
    if (!tier) throw new NotFoundException(`Price tier ${tierId} not found`);
    return tier;
  }
}
