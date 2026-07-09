import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMenuDto } from './dto/create-menu.dto';
import { UpdateMenuDto } from './dto/update-menu.dto';

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
    await this.findOne(brandId, menuId);
    await this.assertNotAssignedToAnyStore(menuId, 'delete');
    return this.prisma.menu.update({ where: { id: menuId }, data: { tombstone: 1 } });
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
}
