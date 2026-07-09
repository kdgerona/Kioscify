import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInventorySetupDto } from './dto/create-inventory-setup.dto';
import { UpdateInventorySetupDto } from './dto/update-inventory-setup.dto';
import { UpsertTenantInventoryOverrideDto } from './dto/upsert-tenant-inventory-override.dto';

@Injectable()
export class InventorySetupsService {
  constructor(private prisma: PrismaService) {}

  findAllByBrand(brandId: string) {
    return this.prisma.inventorySetup.findMany({
      where: { brandId, tombstone: { not: 1 } },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Resolve the store's currently-assigned inventorySetupId, fresh from the
   * DB on every call (mirrors MenusService.resolveStoreMenuId /
   * PriceTiersService.resolveStoreTierId). Returns null if unassigned.
   */
  async resolveStoreInventorySetupId(tenantId: string): Promise<string | null> {
    const store = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { inventorySetupId: true },
    });
    return store?.inventorySetupId ?? null;
  }

  async findOne(brandId: string, setupId: string) {
    const setup = await this.prisma.inventorySetup.findFirst({
      where: { id: setupId, brandId, tombstone: { not: 1 } },
    });
    if (!setup) throw new NotFoundException(`Inventory setup ${setupId} not found`);
    return setup;
  }

  create(brandId: string, dto: CreateInventorySetupDto) {
    return this.prisma.inventorySetup.create({
      data: { brandId, name: dto.name, description: dto.description, isActive: dto.isActive ?? true },
    });
  }

  async update(brandId: string, setupId: string, dto: UpdateInventorySetupDto) {
    const setup = await this.findOne(brandId, setupId);
    // Deactivating an in-use setup would silently do nothing today (no read
    // path checks isActive), which is confusing — block it the same way
    // delete is blocked, so a setup can only go inactive once no store is
    // relying on it. Reactivating is always allowed.
    if (dto.isActive === false && setup.isActive) {
      await this.assertNotAssignedToAnyStore(setupId, 'deactivate');
    }
    return this.prisma.inventorySetup.update({ where: { id: setupId }, data: dto });
  }

  async remove(brandId: string, setupId: string) {
    await this.findOne(brandId, setupId);
    await this.assertNotAssignedToAnyStore(setupId, 'delete');
    return this.prisma.inventorySetup.update({ where: { id: setupId }, data: { tombstone: 1 } });
  }

  private async assertNotAssignedToAnyStore(setupId: string, action: 'delete' | 'deactivate') {
    const affectedStores = await this.prisma.tenant.findMany({
      where: { inventorySetupId: setupId },
      select: { name: true },
    });
    if (affectedStores.length > 0) {
      const storeNames = affectedStores.map((s) => s.name).join(', ');
      throw new ConflictException(
        `Cannot ${action} this inventory setup — it is assigned to the following store(s): ${storeNames}`,
      );
    }
  }

  // ── TenantInventoryOverride (per-store threshold tweaks on a shared item) ──

  getOverride(tenantId: string, inventoryItemId: string) {
    return this.prisma.tenantInventoryOverride.findUnique({
      where: { tenantId_inventoryItemId: { tenantId, inventoryItemId } },
    });
  }

  async upsertOverride(tenantId: string, inventoryItemId: string, dto: UpsertTenantInventoryOverrideDto) {
    const item = await this.prisma.inventoryItem.findUnique({ where: { id: inventoryItemId } });
    if (!item) throw new NotFoundException(`Inventory item ${inventoryItemId} not found`);

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { inventorySetupId: true } });
    if (tenant?.inventorySetupId !== item.inventorySetupId) {
      throw new BadRequestException("This item is not part of your store's current inventory setup");
    }

    return this.prisma.tenantInventoryOverride.upsert({
      where: { tenantId_inventoryItemId: { tenantId, inventoryItemId } },
      create: { tenantId, inventoryItemId, ...dto },
      update: dto,
    });
  }

  async clearOverride(tenantId: string, inventoryItemId: string) {
    const existing = await this.getOverride(tenantId, inventoryItemId);
    if (!existing) return null;
    return this.prisma.tenantInventoryOverride.delete({ where: { id: existing.id } });
  }
}
