import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { InventorySetupsService } from './inventory-setups.service';
import { PrismaService } from '../prisma/prisma.service';

function makeTx() {
  return {
    inventorySetup: { create: jest.fn() },
    category: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
    inventoryItem: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
  };
}

const mockPrisma = {
  inventorySetup: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  tenant: { findMany: jest.fn(), findUnique: jest.fn() },
  $transaction: jest.fn(),
};

describe('InventorySetupsService', () => {
  let service: InventorySetupsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [InventorySetupsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<InventorySetupsService>(InventorySetupsService);
  });

  describe('resolveStoreInventorySetupId()', () => {
    it('returns null when the store has no setup assigned', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ inventorySetupId: null });
      expect(await service.resolveStoreInventorySetupId('tenant-1')).toBeNull();
    });
  });

  describe('findOne()', () => {
    it('throws NotFoundException when the setup does not belong to this brand', async () => {
      mockPrisma.inventorySetup.findFirst.mockResolvedValue(null);
      await expect(service.findOne('brand-1', 'setup-x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove() — deletion guard', () => {
    it('blocks deleting a setup assigned to stores', async () => {
      mockPrisma.inventorySetup.findFirst.mockResolvedValue({ id: 'setup-1', brandId: 'brand-1', tombstone: 0 });
      mockPrisma.tenant.findMany.mockResolvedValue([{ name: 'Store A' }]);

      await expect(service.remove('brand-1', 'setup-1')).rejects.toThrow(ConflictException);
      expect(mockPrisma.inventorySetup.update).not.toHaveBeenCalled();
    });

    it('tombstones the setup when no store is assigned', async () => {
      mockPrisma.inventorySetup.findFirst.mockResolvedValue({ id: 'setup-1', brandId: 'brand-1', name: 'Original', tombstone: 0 });
      mockPrisma.tenant.findMany.mockResolvedValue([]);
      mockPrisma.inventorySetup.update.mockResolvedValue({ id: 'setup-1', tombstone: 1 });

      await service.remove('brand-1', 'setup-1');

      expect(mockPrisma.inventorySetup.update).toHaveBeenCalledWith({
        where: { id: 'setup-1' },
        data: { tombstone: 1, name: expect.stringMatching(/^Original \[deleted \d+\]$/) },
      });
    });

    it('mangles the name on delete so the original name is free for a future setup to reuse', async () => {
      // @@unique([brandId, name]) is a plain Mongo index — no concept of
      // tombstone — so without this a deleted setup would permanently squat
      // on its name (surfaced in manual testing: clone -> delete -> clone
      // again with the same suggested name failed).
      mockPrisma.inventorySetup.findFirst.mockResolvedValue({ id: 'setup-1', brandId: 'brand-1', name: 'Default Setup (Copy)', tombstone: 0 });
      mockPrisma.tenant.findMany.mockResolvedValue([]);
      mockPrisma.inventorySetup.update.mockResolvedValue({});

      await service.remove('brand-1', 'setup-1');

      const call = mockPrisma.inventorySetup.update.mock.calls[0][0];
      expect(call.data.name).not.toBe('Default Setup (Copy)');
      expect(call.data.name).toContain('Default Setup (Copy)');
    });
  });

  describe('update() — deactivation guard', () => {
    it('blocks deactivating a setup assigned to stores', async () => {
      mockPrisma.inventorySetup.findFirst.mockResolvedValue({ id: 'setup-1', brandId: 'brand-1', tombstone: 0, isActive: true });
      mockPrisma.tenant.findMany.mockResolvedValue([{ name: 'Store A' }]);

      await expect(service.update('brand-1', 'setup-1', { isActive: false })).rejects.toThrow(ConflictException);
      expect(mockPrisma.inventorySetup.update).not.toHaveBeenCalled();
    });

    it('allows deactivating a setup with no store assigned', async () => {
      mockPrisma.inventorySetup.findFirst.mockResolvedValue({ id: 'setup-1', brandId: 'brand-1', tombstone: 0, isActive: true });
      mockPrisma.tenant.findMany.mockResolvedValue([]);
      mockPrisma.inventorySetup.update.mockResolvedValue({ id: 'setup-1', isActive: false });

      await service.update('brand-1', 'setup-1', { isActive: false });

      expect(mockPrisma.inventorySetup.update).toHaveBeenCalledWith({ where: { id: 'setup-1' }, data: { isActive: false } });
    });

    it('does not run the guard when reactivating', async () => {
      mockPrisma.inventorySetup.findFirst.mockResolvedValue({ id: 'setup-1', brandId: 'brand-1', tombstone: 0, isActive: false });
      mockPrisma.inventorySetup.update.mockResolvedValue({ id: 'setup-1', isActive: true });

      await service.update('brand-1', 'setup-1', { isActive: true });

      expect(mockPrisma.tenant.findMany).not.toHaveBeenCalled();
    });
  });

  describe('clone()', () => {
    const sourceSetup = { id: 'setup-1', brandId: 'brand-1', name: 'Main Inventory', description: 'desc', isActive: true, tombstone: 0 };
    const clonedSetup = { id: 'new-setup-id', brandId: 'brand-1', name: 'Main Inventory (Copy)', description: 'desc', isActive: true, tombstone: 0 };

    beforeEach(() => {
      mockPrisma.$transaction.mockImplementation(async (callback: any) => callback(makeTx()));
    });

    it('auto-generates a "(Copy)" name and retries on collision when dto.name is omitted', async () => {
      mockPrisma.inventorySetup.findFirst
        .mockResolvedValueOnce(sourceSetup) // findOne(source)
        .mockResolvedValueOnce({ id: 'other' }) // "Main Inventory (Copy)" taken
        .mockResolvedValueOnce(null) // "Main Inventory (Copy 2)" free
        .mockResolvedValueOnce({ ...clonedSetup, name: 'Main Inventory (Copy 2)' }); // final findOne(clone)

      let capturedName = '';
      mockPrisma.$transaction.mockImplementationOnce(async (callback: any) => {
        const tx = makeTx();
        tx.inventorySetup.create.mockImplementation(async ({ data }: any) => {
          capturedName = data.name;
          return { id: 'new-setup-id', ...data };
        });
        return callback(tx);
      });

      const result = await service.clone('brand-1', 'setup-1', {});

      expect(capturedName).toBe('Main Inventory (Copy 2)');
      expect(result.name).toBe('Main Inventory (Copy 2)');
    });

    it('throws ConflictException when an explicit dto.name is already taken', async () => {
      mockPrisma.inventorySetup.findFirst
        .mockResolvedValueOnce(sourceSetup) // findOne(source)
        .mockResolvedValueOnce({ id: 'taken' }); // explicit name check

      await expect(service.clone('brand-1', 'setup-1', { name: 'Existing Setup' })).rejects.toThrow(ConflictException);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('deep-copies categories and items with remapped categoryId, and never touches TenantInventoryOverride/InventoryRecord', async () => {
      mockPrisma.inventorySetup.findFirst
        .mockResolvedValueOnce(sourceSetup) // findOne(source)
        .mockResolvedValueOnce(null) // "Main Inventory (Copy)" free
        .mockResolvedValueOnce(clonedSetup); // final findOne(clone)

      const tx = makeTx();
      tx.inventorySetup.create.mockResolvedValue({ id: 'new-setup-id', brandId: 'brand-1', name: 'Main Inventory (Copy)', description: 'desc', isActive: true });

      const sourceCategory = { id: 'cat-1', brandId: 'brand-1', name: 'Beverages', description: null, sequenceNo: 0 };
      tx.category.findMany.mockResolvedValue([sourceCategory]);
      tx.category.create.mockImplementation(async ({ data }: any) => ({ id: data.id, ...data }));

      const sourceItem = {
        id: 'item-1',
        brandId: 'brand-1',
        name: 'Milk',
        unit: 'liters',
        description: null,
        categoryId: 'cat-1',
        minStockLevel: 5,
        requiresExpirationDate: true,
        expirationWarningDays: 3,
        tombstone: 0,
      };
      tx.inventoryItem.findMany.mockResolvedValue([sourceItem]);
      tx.inventoryItem.create.mockImplementation(async ({ data }: any) => ({ id: 'item-1-clone', ...data }));

      mockPrisma.$transaction.mockImplementationOnce(async (callback: any) => callback(tx));

      await service.clone('brand-1', 'setup-1', {});

      const newCategoryId = tx.category.create.mock.calls[0][0].data.id;
      expect(newCategoryId).not.toBe('cat-1');

      expect(tx.inventoryItem.create).toHaveBeenCalledWith({
        data: {
          brandId: 'brand-1',
          inventorySetupId: 'new-setup-id',
          name: 'Milk',
          unit: 'liters',
          description: null,
          categoryId: newCategoryId,
          minStockLevel: 5,
          requiresExpirationDate: true,
          expirationWarningDays: 3,
        },
      });

      // The mocked tx exposes no tenantInventoryOverride/inventoryRecord models —
      // any accidental reference from clone() would throw "is not a function".
    });
  });
});
