import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { InventorySetupsService } from '../inventory-setups/inventory-setups.service';

const mockPrisma = {
  inventoryItem: { findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
  tenantInventoryOverride: { findMany: jest.fn() },
  inventoryRecord: { findMany: jest.fn(), create: jest.fn(), count: jest.fn() },
  submittedInventoryReport: { findMany: jest.fn(), findFirst: jest.fn() },
  tenant: { findUnique: jest.fn() },
};
const mockInventorySetupsService = {
  resolveStoreInventorySetupId: jest.fn(),
  upsertOverride: jest.fn(),
};

const itemA = {
  id: 'item-a',
  name: 'Nata De Coco',
  unit: 'Tub',
  description: null,
  brandId: 'brand-1',
  inventorySetupId: 'setup-1',
  categoryId: 'cat-1',
  category: { id: 'cat-1', name: 'Add-ons' },
  minStockLevel: 5,
  requiresExpirationDate: false,
  expirationWarningDays: 7,
  tombstone: 0,
};
const itemLegacy = {
  id: 'item-legacy',
  name: 'Discontinued Syrup',
  unit: 'Bottle',
  description: null,
  brandId: 'brand-1',
  inventorySetupId: 'setup-0', // a different (previous) setup
  categoryId: null,
  category: null,
  minStockLevel: null,
  requiresExpirationDate: false,
  expirationWarningDays: null,
  tombstone: 0,
};

describe('InventoryService', () => {
  let service: InventoryService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: InventorySetupsService, useValue: mockInventorySetupsService },
      ],
    }).compile();
    service = module.get<InventoryService>(InventoryService);
  });

  describe('findAllItems() — active/legacy bucket split (reassignment-preservation guarantee)', () => {
    it('returns both empty when the store has no inventory setup assigned', async () => {
      mockInventorySetupsService.resolveStoreInventorySetupId.mockResolvedValue(null);
      const result = await service.findAllItems('tenant-unassigned');
      expect(result).toEqual({ active: [], legacy: [] });
      expect(mockPrisma.inventoryItem.findMany).not.toHaveBeenCalled();
    });

    it('puts an item with recorded history but a different setupId into the legacy bucket, not active', async () => {
      mockInventorySetupsService.resolveStoreInventorySetupId.mockResolvedValue('setup-1');
      mockPrisma.inventoryItem.findMany
        .mockResolvedValueOnce([itemA]) // active query (inventorySetupId: 'setup-1', tombstone != 1)
        .mockResolvedValueOnce([itemLegacy]); // legacy items lookup by id
      mockPrisma.tenantInventoryOverride.findMany.mockResolvedValue([]);
      mockPrisma.submittedInventoryReport.findMany.mockResolvedValue([
        { inventorySnapshot: { items: [{ inventoryItemId: 'item-a' }, { inventoryItemId: 'item-legacy' }] } },
      ]);

      const result = await service.findAllItems('tenant-1');

      expect(result.active.map((i) => i.id)).toEqual(['item-a']);
      expect(result.legacy.map((i) => i.id)).toEqual(['item-legacy']);
      expect(result.legacy[0].isLegacy).toBe(true);
      expect(result.active[0].isLegacy).toBe(false);
    });

    it('applies a TenantInventoryOverride on top of the shared item value', async () => {
      mockInventorySetupsService.resolveStoreInventorySetupId.mockResolvedValue('setup-1');
      mockPrisma.inventoryItem.findMany.mockResolvedValueOnce([itemA]);
      mockPrisma.tenantInventoryOverride.findMany.mockResolvedValue([
        { id: 'ov-1', tenantId: 'tenant-1', inventoryItemId: 'item-a', minStockLevel: 20, requiresExpirationDate: null, expirationWarningDays: null },
      ]);
      mockPrisma.submittedInventoryReport.findMany.mockResolvedValue([]);

      const result = await service.findAllItems('tenant-1');

      expect(result.active[0].minStockLevel).toBe(20); // overridden, not the shared 5
    });
  });

  describe('removeItem() — tombstones the shared item', () => {
    it('tombstones the InventoryItem', async () => {
      mockInventorySetupsService.resolveStoreInventorySetupId.mockResolvedValue('setup-1');
      mockPrisma.inventoryItem.findFirst.mockResolvedValue({ id: 'item-a', inventorySetupId: 'setup-1', tombstone: 0 });

      await service.removeItem('item-a', 'tenant-1');

      expect(mockPrisma.inventoryItem.update).toHaveBeenCalledWith({
        where: { id: 'item-a' },
        data: { tombstone: 1 },
      });
    });

    it('throws NotFoundException when the item is not in the store\'s active setup', async () => {
      mockInventorySetupsService.resolveStoreInventorySetupId.mockResolvedValue('setup-1');
      mockPrisma.inventoryItem.findFirst.mockResolvedValue(null);

      await expect(service.removeItem('item-unknown', 'tenant-1')).rejects.toThrow(NotFoundException);
    });
  });
});
