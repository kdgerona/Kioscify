import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';
import { UpdateStoreConfigDto } from './dto/update-store-config.dto';
import {
  CreateInventoryRecordDto,
  BulkCreateInventoryRecordDto,
} from './dto/create-inventory-record.dto';
import { Prisma } from '@prisma/client';

type InventoryRecordWithRelations = Prisma.InventoryRecordGetPayload<{
  include: {
    inventoryItem: true;
    user: { select: { id: true; username: true; email: true; role: true } };
  };
}>;

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  // ─── Brand templates (COMPANY_ADMIN manages these) ────────────────────────

  async createBrandTemplate(dto: CreateInventoryItemDto, brandId: string) {
    const template = await this.prisma.inventoryItem.create({
      data: { ...dto, brandId, isTemplate: true },
    });

    // Fan out to all stores under this brand, linking via templateId
    const stores = await this.prisma.tenant.findMany({ where: { brandId }, select: { id: true } });
    for (const store of stores) {
      await this.prisma.inventoryItem.create({
        data: {
          tenantId: store.id,
          brandId,
          templateId: template.id,
          isTemplate: false,
          name: dto.name,
          category: dto.category,
          unit: dto.unit,
          description: dto.description,
          minStockLevel: dto.minStockLevel,
          requiresExpirationDate: dto.requiresExpirationDate ?? false,
          expirationWarningDays: dto.expirationWarningDays ?? 7,
        },
      });
    }

    return template;
  }

  async updateBrandTemplate(id: string, dto: UpdateInventoryItemDto) {
    const template = await this.prisma.inventoryItem.findFirst({ where: { id, isTemplate: true, tombstone: { not: 1 } } });
    if (!template) throw new NotFoundException(`Inventory template ${id} not found`);

    const updated = await this.prisma.inventoryItem.update({ where: { id }, data: dto });

    // Propagate to all store copies linked via templateId
    const storeCopies = await this.prisma.inventoryItem.findMany({
      where: { templateId: id, isTemplate: false, tombstone: { not: 1 } },
    });

    for (const copy of storeCopies) {
      const propagated: Record<string, any> = {};
      if (dto.name !== undefined) propagated.name = dto.name;
      if (dto.category !== undefined) propagated.category = dto.category;
      if (dto.unit !== undefined) propagated.unit = dto.unit;
      if (dto.description !== undefined) propagated.description = dto.description;
      if (dto.requiresExpirationDate !== undefined) propagated.requiresExpirationDate = dto.requiresExpirationDate;
      // Only propagate threshold fields if the store hasn't customized them
      if (dto.minStockLevel !== undefined && !copy.minStockLevelCustomized) {
        propagated.minStockLevel = dto.minStockLevel;
      }
      if (dto.expirationWarningDays !== undefined && !copy.expirationWarningDaysCustomized) {
        propagated.expirationWarningDays = dto.expirationWarningDays;
      }
      if (Object.keys(propagated).length > 0) {
        await this.prisma.inventoryItem.update({ where: { id: copy.id }, data: propagated });
      }
    }

    return updated;
  }

  async removeBrandTemplate(id: string) {
    const template = await this.prisma.inventoryItem.findFirst({ where: { id, isTemplate: true, tombstone: { not: 1 } } });
    if (!template) throw new NotFoundException(`Inventory template ${id} not found`);
    // Soft-delete all store copies linked via templateId
    await this.prisma.inventoryItem.updateMany({ where: { templateId: id, isTemplate: false }, data: { tombstone: 1 } });
    await this.prisma.inventoryItem.update({ where: { id }, data: { tombstone: 1 } });
    return { message: 'Inventory template deleted' };
  }

  async findBrandTemplates(brandId: string, category?: string) {
    const where: Prisma.InventoryItemWhereInput = { brandId, isTemplate: true, tombstone: { not: 1 } };
    if (category) where.category = category as any;
    return this.prisma.inventoryItem.findMany({
      where,
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  // ─── Store copies (STORE_ADMIN views/configures their own) ───────────────

  async createItem(dto: CreateInventoryItemDto, tenantId: string) {
    return this.prisma.inventoryItem.create({
      data: { ...dto, tenantId, isTemplate: false },
    });
  }

  async findAllItems(tenantId: string, category?: string) {
    const where: Prisma.InventoryItemWhereInput = { tenantId, isTemplate: false, tombstone: { not: 1 } };
    if (category) where.category = category as any;
    return this.prisma.inventoryItem.findMany({
      where,
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  async findOneItem(id: string, tenantId: string) {
    const item = await this.prisma.inventoryItem.findFirst({ where: { id, tenantId, tombstone: { not: 1 } } });
    if (!item) throw new NotFoundException(`Inventory item ${id} not found`);
    return item;
  }

  async updateItem(id: string, tenantId: string, dto: UpdateInventoryItemDto) {
    const item = await this.findOneItem(id, tenantId);
    return this.prisma.inventoryItem.update({ where: { id: item.id }, data: dto });
  }

  async removeItem(id: string, tenantId: string) {
    await this.findOneItem(id, tenantId);
    await this.prisma.inventoryItem.update({ where: { id }, data: { tombstone: 1 } });
    return { message: 'Inventory item deleted successfully' };
  }

  async updateStoreConfig(id: string, tenantId: string, dto: UpdateStoreConfigDto) {
    const item = await this.findOneItem(id, tenantId);
    return this.prisma.inventoryItem.update({
      where: { id: item.id },
      data: {
        ...(dto.minStockLevel !== undefined && {
          minStockLevel: dto.minStockLevel,
          minStockLevelCustomized: true,
        }),
        ...(dto.expirationWarningDays !== undefined && {
          expirationWarningDays: dto.expirationWarningDays,
          expirationWarningDaysCustomized: true,
        }),
      },
    });
  }

  // ─── Inventory Records (store-level, offline-safe) ────────────────────────

  async createRecord(dto: CreateInventoryRecordDto, userId: string, tenantId: string) {
    await this.findOneItem(dto.inventoryItemId, tenantId);

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
        user: { select: { id: true, username: true, email: true, role: true } },
      },
    });

    return this.formatRecord(record);
  }

  async bulkCreateRecords(dto: BulkCreateInventoryRecordDto, userId: string, tenantId: string) {
    const itemIds = dto.records.map((r) => r.inventoryItemId);
    const items = await this.prisma.inventoryItem.findMany({
      where: { id: { in: itemIds }, tenantId, tombstone: { not: 1 } },
    });
    if (items.length !== itemIds.length) {
      throw new NotFoundException('One or more inventory items not found');
    }

    const records = await this.prisma.$transaction(
      dto.records.map((r) =>
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
            user: { select: { id: true, username: true, email: true, role: true } },
          },
        }),
      ),
    );

    return records.map((r) => this.formatRecord(r));
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
        user: { select: { id: true, username: true, email: true, role: true } },
      },
      orderBy: { date: 'desc' },
    });
    return records.map((r) => this.formatRecord(r));
  }

  async getLatestInventory(tenantId: string) {
    const items = await this.prisma.inventoryItem.findMany({
      where: { tenantId, isTemplate: false, tombstone: { not: 1 } },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });

    const recentReports = await this.prisma.submittedInventoryReport.findMany({
      where: { tenantId },
      orderBy: { submittedAt: 'desc' },
      take: 2,
      select: { inventorySnapshot: true, submittedAt: true },
    });

    const latestReport = recentReports[0];
    const previousReport = recentReports[1];
    const latestMap = new Map<string, { quantity: number; date: Date }>();
    const previousMap = new Map<string, number>();

    if (latestReport?.inventorySnapshot) {
      const snapshot = latestReport.inventorySnapshot as any;
      snapshot.items?.forEach((item: any) => {
        latestMap.set(item.inventoryItemId, { quantity: item.quantity, date: latestReport.submittedAt });
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
        category: item.category,
        unit: item.unit,
        description: item.description,
        minStockLevel: item.minStockLevel,
        requiresExpirationDate: item.requiresExpirationDate,
        expirationWarningDays: item.expirationWarningDays,
        latestQuantity: latest?.quantity ?? null,
        latestRecordDate: latest?.date ?? null,
        previousQuantity: previousMap.get(item.id) ?? null,
      };
    });
  }

  async getInventoryStats(tenantId: string) {
    const items = await this.prisma.inventoryItem.findMany({
      where: { tenantId, isTemplate: false, tombstone: { not: 1 } },
      include: {
        inventoryRecords: { orderBy: { date: 'desc' }, take: 1 },
      },
    });

    const totalItems = items.length;
    const itemsWithRecords = items.filter((item) => item.inventoryRecords.length > 0).length;
    const lowStockItems = items.filter(
      (item) => item.minStockLevel && (item.inventoryRecords[0]?.quantity ?? Infinity) < item.minStockLevel,
    );

    return {
      totalItems,
      itemsWithRecords,
      itemsWithoutRecords: totalItems - itemsWithRecords,
      lowStockCount: lowStockItems.length,
      lowStockItems: lowStockItems.map((item) => ({
        id: item.id,
        name: item.name,
        category: item.category,
        currentQuantity: item.inventoryRecords[0]?.quantity || 0,
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
        category: record.inventoryItem.category,
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
