import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MenusService } from '../menus/menus.service';
import { InventorySetupsService } from '../inventory-setups/inventory-setups.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { randomUUID } from 'crypto';

export interface FindCategoriesParams {
  menuId?: string;
  inventorySetupId?: string;
  type?: 'PRODUCT' | 'INVENTORY';
  tenantId?: string;
}

@Injectable()
export class CategoriesService {
  constructor(
    private prisma: PrismaService,
    private menusService: MenusService,
    private inventorySetupsService: InventorySetupsService,
  ) {}

  async create(dto: CreateCategoryDto) {
    const isInventory = dto.type === 'INVENTORY';
    if (isInventory && !dto.inventorySetupId) {
      throw new BadRequestException('inventorySetupId is required for INVENTORY categories');
    }
    if (!isInventory && !dto.menuId) {
      throw new BadRequestException('menuId is required for PRODUCT categories');
    }

    return this.prisma.category.create({
      data: {
        id: randomUUID(),
        name: dto.name,
        description: dto.description,
        sequenceNo: dto.sequenceNo ?? 0,
        type: dto.type ?? 'PRODUCT',
        menuId: isInventory ? undefined : dto.menuId,
        inventorySetupId: isInventory ? dto.inventorySetupId : undefined,
      },
    });
  }

  /**
   * `menuId`/`inventorySetupId` (explicit, admin/builder context) take
   * priority when provided; otherwise resolved from the requesting store's
   * current assignment via `tenantId` (mobile/store-portal read context).
   * Returns [] rather than throwing when scope can't be resolved at all —
   * an unassigned store must see an empty catalog, not an error.
   */
  async findAll(params: FindCategoriesParams) {
    if (params.type === 'INVENTORY') {
      const inventorySetupId =
        params.inventorySetupId ??
        (params.tenantId ? await this.inventorySetupsService.resolveStoreInventorySetupId(params.tenantId) : null);
      if (!inventorySetupId) return [];
      return this.prisma.category.findMany({
        where: { inventorySetupId, tombstone: { not: 1 } },
        orderBy: { sequenceNo: 'asc' },
      });
    }

    const menuId =
      params.menuId ?? (params.tenantId ? await this.menusService.resolveStoreMenuId(params.tenantId) : null);
    if (!menuId) return [];
    return this.prisma.category.findMany({
      where: { menuId, tombstone: { not: 1 } },
      orderBy: { sequenceNo: 'asc' },
    });
  }

  async findOne(id: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, tombstone: { not: 1 } },
    });
    if (!category) throw new NotFoundException(`Category ${id} not found`);
    return category;
  }

  async update(id: string, dto: UpdateCategoryDto) {
    await this.findOne(id);
    return this.prisma.category.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.assertNotInUse(id);
    return this.prisma.category.update({ where: { id }, data: { tombstone: 1 } });
  }

  // Checks both Product and InventoryItem regardless of this category's own
  // `type` — cheap defense-in-depth against the two ever getting out of sync,
  // and keeps this in one place instead of branching on type.
  private async assertNotInUse(id: string) {
    const [products, inventoryItems] = await Promise.all([
      this.prisma.product.findMany({ where: { categoryId: id, tombstone: { not: 1 } }, select: { name: true } }),
      this.prisma.inventoryItem.findMany({ where: { categoryId: id, tombstone: { not: 1 } }, select: { name: true } }),
    ]);

    const names = [...products, ...inventoryItems].map((p) => p.name);
    if (names.length > 0) {
      throw new ConflictException(
        `Cannot delete this category — it is still assigned to the following item(s): ${names.join(', ')}`,
      );
    }
  }
}
