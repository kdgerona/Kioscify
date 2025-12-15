import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';
import {
  CreateInventoryRecordDto,
  BulkCreateInventoryRecordDto,
} from './dto/create-inventory-record.dto';
import { Prisma } from '@prisma/client';

type InventoryRecordWithRelations = Prisma.InventoryRecordGetPayload<{
  include: {
    inventoryItem: true;
    user: {
      select: {
        id: true;
        username: true;
        email: true;
        role: true;
      };
    };
  };
}>;

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  // Inventory Items Management
  async createItem(createDto: CreateInventoryItemDto, tenantId: string) {
    return this.prisma.inventoryItem.create({
      data: {
        ...createDto,
        tenantId,
      },
    });
  }

  async findAllItems(tenantId: string, category?: string) {
    const where: Prisma.InventoryItemWhereInput = { tenantId };

    if (category) {
      where.category = category as any;
    }

    return this.prisma.inventoryItem.findMany({
      where,
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  async findOneItem(id: string, tenantId: string) {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { id, tenantId },
    });

    if (!item) {
      throw new NotFoundException(`Inventory item with ID ${id} not found`);
    }

    return item;
  }

  async updateItem(
    id: string,
    tenantId: string,
    updateDto: UpdateInventoryItemDto,
  ) {
    const item = await this.findOneItem(id, tenantId);

    return this.prisma.inventoryItem.update({
      where: { id: item.id },
      data: updateDto,
    });
  }

  async removeItem(id: string, tenantId: string) {
    const item = await this.findOneItem(id, tenantId);

    await this.prisma.inventoryItem.delete({
      where: { id: item.id },
    });

    return { message: 'Inventory item deleted successfully' };
  }

  // Inventory Records Management
  async createRecord(
    createDto: CreateInventoryRecordDto,
    userId: string,
    tenantId: string,
  ) {
    // Verify inventory item exists and belongs to tenant
    await this.findOneItem(createDto.inventoryItemId, tenantId);

    const record = await this.prisma.inventoryRecord.create({
      data: {
        inventoryItemId: createDto.inventoryItemId,
        quantity: createDto.quantity,
        date: createDto.date ? new Date(createDto.date) : new Date(),
        notes: createDto.notes,
        userId,
        tenantId,
      },
      include: {
        inventoryItem: true,
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            role: true,
          },
        },
      },
    });

    return this.formatRecord(record);
  }

  async bulkCreateRecords(
    bulkDto: BulkCreateInventoryRecordDto,
    userId: string,
    tenantId: string,
  ) {
    // Verify all inventory items exist and belong to tenant
    const itemIds = bulkDto.records.map((r) => r.inventoryItemId);
    const items = await this.prisma.inventoryItem.findMany({
      where: {
        id: { in: itemIds },
        tenantId,
      },
    });

    if (items.length !== itemIds.length) {
      throw new NotFoundException('One or more inventory items not found');
    }

    // Create all records in a transaction
    const records = await this.prisma.$transaction(
      bulkDto.records.map((recordDto) =>
        this.prisma.inventoryRecord.create({
          data: {
            inventoryItemId: recordDto.inventoryItemId,
            quantity: recordDto.quantity,
            date: recordDto.date ? new Date(recordDto.date) : new Date(),
            notes: recordDto.notes,
            userId,
            tenantId,
          },
          include: {
            inventoryItem: true,
            user: {
              select: {
                id: true,
                username: true,
                email: true,
                role: true,
              },
            },
          },
        }),
      ),
    );

    return records.map((r) => this.formatRecord(r));
  }

  async findAllRecords(
    tenantId: string,
    filters?: {
      startDate?: Date;
      endDate?: Date;
      inventoryItemId?: string;
    },
  ) {
    const where: Prisma.InventoryRecordWhereInput = { tenantId };

    if (filters?.startDate || filters?.endDate) {
      where.date = {};
      if (filters.startDate) where.date.gte = filters.startDate;
      if (filters.endDate) where.date.lte = filters.endDate;
    }

    if (filters?.inventoryItemId) {
      where.inventoryItemId = filters.inventoryItemId;
    }

    const records = await this.prisma.inventoryRecord.findMany({
      where,
      include: {
        inventoryItem: true,
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            role: true,
          },
        },
      },
      orderBy: { date: 'desc' },
    });

    return records.map((r) => this.formatRecord(r));
  }

  async getLatestInventory(tenantId: string, date?: Date) {
    // Get all inventory items for this tenant
    const items = await this.prisma.inventoryItem.findMany({
      where: { tenantId },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });

    // Get the two most recent submitted inventory reports
    const recentReports = await this.prisma.submittedInventoryReport.findMany({
      where: { tenantId },
      orderBy: { submittedAt: 'desc' },
      take: 2,
      select: {
        inventorySnapshot: true,
        submittedAt: true,
      },
    });

    const latestReport = recentReports[0];
    const previousReport = recentReports[1];

    // Create maps for latest and previous quantities
    const latestQuantityMap = new Map<string, { quantity: number; date: Date }>();
    const previousQuantityMap = new Map<string, number>();

    if (latestReport && latestReport.inventorySnapshot) {
      const snapshot = latestReport.inventorySnapshot as any;
      if (snapshot.items && Array.isArray(snapshot.items)) {
        snapshot.items.forEach((snapshotItem: any) => {
          latestQuantityMap.set(snapshotItem.inventoryItemId, {
            quantity: snapshotItem.quantity,
            date: latestReport.submittedAt,
          });
        });
      }
    }

    if (previousReport && previousReport.inventorySnapshot) {
      const snapshot = previousReport.inventorySnapshot as any;
      if (snapshot.items && Array.isArray(snapshot.items)) {
        snapshot.items.forEach((snapshotItem: any) => {
          previousQuantityMap.set(snapshotItem.inventoryItemId, snapshotItem.quantity);
        });
      }
    }

    // Map items with their latest and previous quantities
    return items.map((item) => {
      const latestData = latestQuantityMap.get(item.id);
      const previousQuantity = previousQuantityMap.get(item.id);

      return {
        id: item.id,
        name: item.name,
        category: item.category,
        unit: item.unit,
        description: item.description,
        minStockLevel: item.minStockLevel,
        latestQuantity: latestData?.quantity ?? null,
        latestRecordDate: latestData?.date ?? null,
        previousQuantity: previousQuantity ?? null,
      };
    });
  }

  async getInventoryStats(tenantId: string) {
    const items = await this.prisma.inventoryItem.findMany({
      where: { tenantId },
      include: {
        inventoryRecords: {
          orderBy: { date: 'desc' },
          take: 1,
        },
      },
    });

    const totalItems = items.length;
    const itemsWithRecords = items.filter(
      (item) => item.inventoryRecords.length > 0,
    ).length;
    const lowStockItems = items.filter(
      (item) =>
        item.minStockLevel &&
        item.inventoryRecords[0]?.quantity < item.minStockLevel,
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
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}
