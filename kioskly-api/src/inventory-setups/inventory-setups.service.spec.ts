import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { InventorySetupsService } from './inventory-setups.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  inventorySetup: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  tenant: { findMany: jest.fn(), findUnique: jest.fn() },
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
      mockPrisma.inventorySetup.findFirst.mockResolvedValue({ id: 'setup-1', brandId: 'brand-1', tombstone: 0 });
      mockPrisma.tenant.findMany.mockResolvedValue([]);
      mockPrisma.inventorySetup.update.mockResolvedValue({ id: 'setup-1', tombstone: 1 });

      await service.remove('brand-1', 'setup-1');

      expect(mockPrisma.inventorySetup.update).toHaveBeenCalledWith({ where: { id: 'setup-1' }, data: { tombstone: 1 } });
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
});
