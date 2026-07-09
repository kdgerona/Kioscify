import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventorySetupsService } from '../inventory-setups/inventory-setups.service';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';
import { CreateStoreInventoryItemDto } from './dto/create-store-inventory-item.dto';
import { UpdateStoreConfigDto } from './dto/update-store-config.dto';
import {
  CreateInventoryRecordDto,
  BulkCreateInventoryRecordDto,
} from './dto/create-inventory-record.dto';
import { Prisma, Category, InventoryItem, TenantInventoryOverride } from '@prisma/client';

type InventoryRecordWithRelations = Prisma.InventoryRecordGetPayload<{
  include: {
    inventoryItem: true;
    user: { select: { id: true; username: true; firstName: true; lastName: true; email: true; role: true } };
  };
}>;

type InventoryItemWithCategory = InventoryItem & { category: Category | null };

export interface FormattedItem {
  id: string;
  name: string;
  unit: string;
  description: string | null;
  category: { id: string; name: string } | null;
  minStockLevel: number | null;
  minStockLevelOverridden: boolean;
  requiresExpirationDate: boolean;
  expirationWarningDays: number | null;
  expirationWarningDaysOverridden: boolean;
  isLegacy: boolean;
}

@Injectable()
export class InventoryService {
  constructor(
    private prisma: PrismaService,
    private inventorySetupsService: InventorySetupsService,
  ) {}

  // ─── Admin/builder CRUD — items directly owned by an InventorySetup ───────

  async createSetupItem(dto: CreateInventoryItemDto, inventorySetupId: string) {
    const setup = await this.prisma.inventorySetup.findUnique({ where: { id: inventorySetupId }, select: { brandId: true } });
    if (!setup) throw new BadRequestException(`Inventory setup ${inventorySetupId} not found`);
    await this.assertCategoryBelongsToSetup(dto.categoryId, inventorySetupId);

    return this.prisma.inventoryItem.create({
      data: {
        name: dto.name,
        unit: dto.unit,
        description: dto.description,
        categoryId: dto.categoryId,
        minStockLevel: dto.minStockLevel,
        requiresExpirationDate: dto.requiresExpirationDate ?? false,
        expirationWarningDays: dto.expirationWarningDays ?? 7,
        inventorySetupId,
        brandId: setup.brandId,
      },
    });
  }

  async updateSetupItem(id: string, dto: UpdateInventoryItemDto, inventorySetupId: string) {
    const item = await this.prisma.inventoryItem.findFirst({ where: { id, inventorySetupId, tombstone: { not: 1 } } });
    if (!item) throw new NotFoundException(`Inventory item ${id} not found`);
    if (dto.categoryId) await this.assertCategoryBelongsToSetup(dto.categoryId, inventorySetupId);
    return this.prisma.inventoryItem.update({ where: { id }, data: dto });
  }

  async removeSetupItem(id: string, inventorySetupId: string) {
    const item = await this.prisma.inventoryItem.findFirst({ where: { id, inventorySetupId, tombstone: { not: 1 } } });
    if (!item) throw new NotFoundException(`Inventory item ${id} not found`);
    // Never hard-deleted — InventoryRecord history depends on this row staying
    // valid indefinitely (reassignment-preservation guarantee).
    return this.prisma.inventoryItem.update({ where: { id }, data: { tombstone: 1 } });
  }

  findAllForSetup(inventorySetupId: string, includeLegacy = false) {
    return this.prisma.inventoryItem.findMany({
      where: { inventorySetupId, ...(includeLegacy ? {} : { tombstone: { not: 1 } }) },
      include: { category: true },
      orderBy: { name: 'asc' },
    });
  }

  private async assertCategoryBelongsToSetup(categoryId: string, inventorySetupId: string) {
    const category = await this.prisma.category.findFirst({ where: { id: categoryId, tombstone: { not: 1 } } });
    if (!category) throw new BadRequestException(`Category ${categoryId} not found`);
    if (category.inventorySetupId !== inventorySetupId) {
      throw new BadRequestException(`Category ${categoryId} does not belong to inventory setup ${inventorySetupId}`);
    }
  }

  // ─── Store-facing items (resolved via the store's current InventorySetup) ────

  /**
   * Returns two buckets: `active` (items in the store's current setup, not
   * tombstoned) and `legacy` (items the store has InventoryRecord history for
   * that aren't currently active — either tombstoned out of use, or the
   * store has since been reassigned to a different setup entirely —
   * preserved for record-keeping per the reassignment-preservation
   * guarantee, never deleted). A store with no setup assigned yet gets both
   * as empty arrays, not an error.
   */
  async findAllItems(tenantId: string, categoryId?: string): Promise<{ active: FormattedItem[]; legacy: FormattedItem[] }> {
    const setupId = await this.inventorySetupsService.resolveStoreInventorySetupId(tenantId);
    if (!setupId) return { active: [], legacy: [] };

    const activeWhere: Prisma.InventoryItemWhereInput = { inventorySetupId: setupId, tombstone: { not: 1 } };
    if (categoryId) activeWhere.categoryId = categoryId;

    const [activeItems, overrides] = await Promise.all([
      this.prisma.inventoryItem.findMany({ where: activeWhere, include: { category: true } }),
      this.prisma.tenantInventoryOverride.findMany({ where: { tenantId } }),
    ]);
    const overrideByItemId = new Map(overrides.map((o) => [o.inventoryItemId, o]));

    const active = activeItems
      .map((item) => this.formatItem(item, overrideByItemId.get(item.id), false))
      .sort((a, b) => (a.category?.name ?? '').localeCompare(b.category?.name ?? '') || a.name.localeCompare(b.name));

    const activeItemIds = new Set(active.map((a) => a.id));

    // Legacy: items this store has recorded stock for that aren't part of the
    // active bucket above (tombstoned from the current setup, or from a setup
    // the store was previously assigned to before a reassignment).
    const recordedItemIds = await this.prisma.inventoryRecord.findMany({
      where: { tenantId },
      distinct: ['inventoryItemId'],
      select: { inventoryItemId: true },
    });
    const legacyIds = recordedItemIds.map((r) => r.inventoryItemId).filter((id) => !activeItemIds.has(id));

    let legacy: FormattedItem[] = [];
    if (legacyIds.length > 0) {
      const legacyItems = await this.prisma.inventoryItem.findMany({
        where: { id: { in: legacyIds } },
        include: { category: true },
      });
      legacy = legacyItems.map((item) => this.formatItem(item, overrideByItemId.get(item.id), true));
    }

    return { active, legacy };
  }

  async findOneItem(inventoryItemId: string, tenantId: string) {
    const { active, legacy } = await this.findAllItems(tenantId);
    const found = active.find((i) => i.id === inventoryItemId) ?? legacy.find((i) => i.id === inventoryItemId);
    if (!found) throw new NotFoundException(`Inventory item ${inventoryItemId} not found`);
    return found;
  }

  /** Ad-hoc item creation from the store side — creates an item directly on the store's current setup. */
  async createItem(dto: CreateStoreInventoryItemDto, tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { brandId: true, inventorySetupId: true } });
    if (!tenant?.brandId) throw new BadRequestException('Store has no brand assigned');
    if (!tenant.inventorySetupId) throw new BadRequestException('Store has no inventory setup assigned yet');

    await this.assertCategoryBelongsToSetup(dto.categoryId, tenant.inventorySetupId);

    const item = await this.prisma.inventoryItem.create({
      data: {
        brandId: tenant.brandId,
        inventorySetupId: tenant.inventorySetupId,
        name: dto.name,
        unit: dto.unit,
        description: dto.description,
        categoryId: dto.categoryId,
        minStockLevel: dto.minStockLevel,
        requiresExpirationDate: dto.requiresExpirationDate ?? false,
        expirationWarningDays: dto.expirationWarningDays ?? 7,
      },
      include: { category: true },
    });

    return this.formatItem(item, undefined, false);
  }

  /** Store-editable fields: categoryId (must belong to the store's setup, applies setup-wide) and thresholds (delegated to TenantInventoryOverride, same as updateStoreConfig). */
  async updateItem(inventoryItemId: string, tenantId: string, dto: { categoryId?: string; minStockLevel?: number; requiresExpirationDate?: boolean; expirationWarningDays?: number }) {
    const item = await this.resolveActiveItem(inventoryItemId, tenantId);

    if (dto.categoryId) {
      await this.assertCategoryBelongsToSetup(dto.categoryId, item.inventorySetupId!);
      await this.prisma.inventoryItem.update({ where: { id: item.id }, data: { categoryId: dto.categoryId } });
    }

    if (dto.minStockLevel !== undefined || dto.requiresExpirationDate !== undefined || dto.expirationWarningDays !== undefined) {
      await this.inventorySetupsService.upsertOverride(tenantId, item.id, dto);
    }

    return this.findOneItem(inventoryItemId, tenantId);
  }

  async removeItem(inventoryItemId: string, tenantId: string) {
    const item = await this.resolveActiveItem(inventoryItemId, tenantId);
    await this.prisma.inventoryItem.update({ where: { id: item.id }, data: { tombstone: 1 } });
    return { message: "Inventory item removed from this store's active inventory setup — history is preserved." };
  }

  async updateStoreConfig(inventoryItemId: string, tenantId: string, dto: UpdateStoreConfigDto) {
    const item = await this.resolveActiveItem(inventoryItemId, tenantId);
    await this.inventorySetupsService.upsertOverride(tenantId, item.id, dto);
    return this.findOneItem(inventoryItemId, tenantId);
  }

  private async resolveActiveItem(inventoryItemId: string, tenantId: string) {
    const setupId = await this.inventorySetupsService.resolveStoreInventorySetupId(tenantId);
    if (!setupId) throw new NotFoundException('Store has no inventory setup assigned');
    const item = await this.prisma.inventoryItem.findFirst({
      where: { id: inventoryItemId, inventorySetupId: setupId, tombstone: { not: 1 } },
    });
    if (!item) throw new NotFoundException(`Inventory item ${inventoryItemId} is not in your store's active setup`);
    return item;
  }

  private formatItem(
    item: InventoryItemWithCategory,
    override: TenantInventoryOverride | undefined,
    isLegacy: boolean,
  ): FormattedItem {
    return {
      id: item.id,
      name: item.name,
      unit: item.unit,
      description: item.description,
      category: item.category ? { id: item.category.id, name: item.category.name } : null,
      minStockLevel: override?.minStockLevel ?? item.minStockLevel ?? null,
      minStockLevelOverridden: override?.minStockLevel != null,
      requiresExpirationDate: override?.requiresExpirationDate ?? item.requiresExpirationDate ?? false,
      expirationWarningDays: override?.expirationWarningDays ?? item.expirationWarningDays ?? null,
      expirationWarningDaysOverridden: override?.expirationWarningDays != null,
      isLegacy,
    };
  }

  // ─── Inventory Records (store-level, offline-safe) — unchanged; ───────────
  // ─── inventoryItemId always refers to the same InventoryItem row. ─────────

  async createRecord(dto: CreateInventoryRecordDto, userId: string, tenantId: string) {
    await this.assertItemRecordable(dto.inventoryItemId, tenantId);

    // Idempotent: if clientId already exists, return existing record
    if (dto.clientId) {
      const existing = await this.prisma.inventoryRecord.findFirst({
        where: { tenantId, clientId: dto.clientId },
      });
      if (existing) {
        throw new ConflictException({ message: 'Record already synced', id: existing.id });
      }
    }

    const record = await this.prisma.inventoryRecord.create({
      data: {
        inventoryItemId: dto.inventoryItemId,
        quantity: dto.quantity,
        date: dto.date ? new Date(dto.date) : new Date(),
        notes: dto.notes,
        userId,
        tenantId,
        clientId: dto.clientId,
      },
      include: {
        inventoryItem: true,
        user: { select: { id: true, username: true, firstName: true, lastName: true, email: true, role: true } },
      },
    });

    return this.formatRecord(record);
  }

  async bulkCreateRecords(dto: BulkCreateInventoryRecordDto, userId: string, tenantId: string) {
    const itemIds = [...new Set(dto.records.map((r) => r.inventoryItemId))];
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { brandId: true } });
    const items = await this.prisma.inventoryItem.findMany({
      where: { id: { in: itemIds }, brandId: tenant?.brandId ?? undefined, tombstone: { not: 1 } },
    });
    if (items.length !== itemIds.length) {
      throw new NotFoundException('One or more inventory items not found');
    }

    // Pre-flight deduplication: skip records with clientIds already in DB
    const clientIds = dto.records.map((r) => r.clientId).filter((id): id is string => !!id);
    const existingRecords = clientIds.length
      ? await this.prisma.inventoryRecord.findMany({ where: { tenantId, clientId: { in: clientIds } } })
      : [];
    const syncedClientIds = new Set(existingRecords.map((r) => r.clientId));
    const toCreate = dto.records.filter((r) => !r.clientId || !syncedClientIds.has(r.clientId));

    const newRecords = toCreate.length
      ? await this.prisma.$transaction(
          toCreate.map((r) =>
            this.prisma.inventoryRecord.create({
              data: {
                inventoryItemId: r.inventoryItemId,
                quantity: r.quantity,
                date: r.date ? new Date(r.date) : new Date(),
                notes: r.notes,
                userId,
                tenantId,
                clientId: r.clientId,
              },
              include: {
                inventoryItem: true,
                user: { select: { id: true, username: true, firstName: true, lastName: true, email: true, role: true } },
              },
            }),
          ),
        )
      : [];

    return newRecords.map((r) => this.formatRecord(r));
  }

  /** A record can be created for any item on this store's brand — active or legacy — not just ones currently in the active setup. */
  private async assertItemRecordable(inventoryItemId: string, tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { brandId: true } });
    const item = await this.prisma.inventoryItem.findFirst({
      where: { id: inventoryItemId, brandId: tenant?.brandId ?? undefined, tombstone: { not: 1 } },
    });
    if (!item) throw new NotFoundException(`Inventory item ${inventoryItemId} not found`);
    return item;
  }

  async findAllRecords(tenantId: string, filters?: { startDate?: Date; endDate?: Date; inventoryItemId?: string }) {
    const where: Prisma.InventoryRecordWhereInput = { tenantId };
    if (filters?.startDate || filters?.endDate) {
      where.date = {};
      if (filters.startDate) (where.date as any).gte = filters.startDate;
      if (filters.endDate) (where.date as any).lte = filters.endDate;
    }
    if (filters?.inventoryItemId) where.inventoryItemId = filters.inventoryItemId;

    const records = await this.prisma.inventoryRecord.findMany({
      where,
      include: {
        inventoryItem: true,
        user: { select: { id: true, username: true, firstName: true, lastName: true, email: true, role: true } },
      },
      orderBy: { date: 'desc' },
    });
    return records.map((r) => this.formatRecord(r));
  }

  async getLatestInventory(tenantId: string) {
    const { active, legacy } = await this.findAllItems(tenantId);
    const items = [...active, ...legacy];

    const recentReports = await this.prisma.submittedInventoryReport.findMany({
      where: { tenantId },
      orderBy: { submittedAt: 'desc' },
      take: 2,
      select: { inventorySnapshot: true, submittedAt: true },
    });

    const latestReport = recentReports[0];
    const previousReport = recentReports[1];
    const latestMap = new Map<string, { quantity: number; date: Date; expirationBatches: any[] }>();
    const previousMap = new Map<string, number>();

    if (latestReport?.inventorySnapshot) {
      const snapshot = latestReport.inventorySnapshot as any;
      snapshot.items?.forEach((item: any) => {
        latestMap.set(item.inventoryItemId, {
          quantity: item.quantity,
          date: latestReport.submittedAt,
          expirationBatches: item.expirationBatches ?? [],
        });
      });
    }
    if (previousReport?.inventorySnapshot) {
      const snapshot = previousReport.inventorySnapshot as any;
      snapshot.items?.forEach((item: any) => {
        previousMap.set(item.inventoryItemId, item.quantity);
      });
    }

    return items.map((item) => {
      const latest = latestMap.get(item.id);
      return {
        id: item.id,
        name: item.name,
        category: item.category?.name ?? null,
        unit: item.unit,
        description: item.description,
        minStockLevel: item.minStockLevel,
        requiresExpirationDate: item.requiresExpirationDate,
        expirationWarningDays: item.expirationWarningDays,
        isLegacy: item.isLegacy,
        latestQuantity: latest?.quantity ?? null,
        latestRecordDate: latest?.date ?? null,
        previousQuantity: previousMap.get(item.id) ?? null,
        expirationBatches: latest?.expirationBatches ?? [],
      };
    });
  }

  async getInventoryStats(tenantId: string) {
    const { active } = await this.findAllItems(tenantId);
    const itemIds = active.map((i) => i.id);

    const latestRecordByItem = itemIds.length
      ? await this.prisma.inventoryRecord.findMany({
          where: { tenantId, inventoryItemId: { in: itemIds } },
          orderBy: { date: 'desc' },
          distinct: ['inventoryItemId'],
        })
      : [];
    const latestByItemId = new Map(latestRecordByItem.map((r) => [r.inventoryItemId, r]));

    const totalItems = active.length;
    const itemsWithRecords = active.filter((item) => latestByItemId.has(item.id)).length;
    const lowStockItems = active.filter((item) => {
      const latest = latestByItemId.get(item.id);
      return item.minStockLevel != null && (latest?.quantity ?? Infinity) < item.minStockLevel;
    });

    return {
      totalItems,
      itemsWithRecords,
      itemsWithoutRecords: totalItems - itemsWithRecords,
      lowStockCount: lowStockItems.length,
      lowStockItems: lowStockItems.map((item) => ({
        id: item.id,
        name: item.name,
        category: item.category?.name ?? null,
        currentQuantity: latestByItemId.get(item.id)?.quantity || 0,
        minStockLevel: item.minStockLevel,
      })),
    };
  }

  private formatRecord(record: InventoryRecordWithRelations) {
    return {
      id: record.id,
      inventoryItemId: record.inventoryItemId,
      inventoryItem: {
        id: record.inventoryItem.id,
        name: record.inventoryItem.name,
        unit: record.inventoryItem.unit,
      },
      quantity: record.quantity,
      date: record.date,
      notes: record.notes,
      userId: record.userId,
      user: record.user,
      clientId: record.clientId,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}
