import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInventorySetupDto } from './dto/create-inventory-setup.dto';
import { UpdateInventorySetupDto } from './dto/update-inventory-setup.dto';
import { UpsertTenantInventoryOverrideDto } from './dto/upsert-tenant-inventory-override.dto';
import { CloneInventorySetupDto } from './dto/clone-inventory-setup.dto';

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
    const setup = await this.findOne(brandId, setupId);
    await this.assertNotAssignedToAnyStore(setupId, 'delete');
    // @@unique([brandId, name]) is a plain Mongo index — it has no concept of
    // tombstone, so a deleted setup would otherwise permanently squat on its
    // name forever. Mangle the name on delete so it's free for reuse.
    return this.prisma.inventorySetup.update({
      where: { id: setupId },
      data: { tombstone: 1, name: `${setup.name} [deleted ${Date.now()}]` },
    });
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

  /**
   * Deep-clone an inventory setup: Category(type=INVENTORY)/InventoryItem are
   * each directly owned by exactly one inventorySetupId, so cloning means
   * re-creating every row with fresh ids. TenantInventoryOverride and
   * InventoryRecord are per-store live/historical data tied to the original
   * item id — never copied onto the clone.
   */
  async clone(brandId: string, setupId: string, dto: CloneInventorySetupDto) {
    const source = await this.findOne(brandId, setupId);
    const name = await this.resolveCloneName(brandId, dto, source.name);

    const newSetupId = await this.prisma.$transaction(
      async (tx) => {
        const newSetup = await tx.inventorySetup.create({
          data: {
            brandId,
            name,
            description: dto.description ?? source.description,
            isActive: source.isActive,
          },
        });

        const categories = await tx.category.findMany({
          where: { inventorySetupId: setupId, type: 'INVENTORY', tombstone: { not: 1 } },
        });
        const categoryIdMap = new Map<string, string>();
        for (const category of categories) {
          const created = await tx.category.create({
            data: {
              id: randomUUID(),
              brandId: category.brandId,
              inventorySetupId: newSetup.id,
              type: 'INVENTORY',
              name: category.name,
              description: category.description,
              sequenceNo: category.sequenceNo,
            },
          });
          categoryIdMap.set(category.id, created.id);
        }

        const items = await tx.inventoryItem.findMany({
          where: { inventorySetupId: setupId, tombstone: { not: 1 } },
        });
        for (const item of items) {
          const newCategoryId = item.categoryId ? categoryIdMap.get(item.categoryId) : undefined;
          await tx.inventoryItem.create({
            data: {
              brandId: item.brandId,
              inventorySetupId: newSetup.id,
              name: item.name,
              unit: item.unit,
              description: item.description,
              categoryId: newCategoryId ?? null,
              minStockLevel: item.minStockLevel,
              requiresExpirationDate: item.requiresExpirationDate,
              expirationWarningDays: item.expirationWarningDays,
            },
          });
        }

        return newSetup.id;
      },
      { maxWait: 10000, timeout: 30000 },
    );

    return this.findOne(brandId, newSetupId);
  }

  private async resolveCloneName(brandId: string, dto: CloneInventorySetupDto, sourceName: string): Promise<string> {
    if (dto.name) {
      const taken = await this.prisma.inventorySetup.findFirst({
        where: { brandId, name: dto.name },
        select: { id: true },
      });
      if (taken) throw new ConflictException(`An inventory setup named "${dto.name}" already exists for this brand`);
      return dto.name;
    }

    let candidate = `${sourceName} (Copy)`;
    let counter = 2;
    while (
      await this.prisma.inventorySetup.findFirst({ where: { brandId, name: candidate }, select: { id: true } })
    ) {
      candidate = `${sourceName} (Copy ${counter})`;
      counter++;
    }
    return candidate;
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
