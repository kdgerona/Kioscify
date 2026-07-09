import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { MenusService } from './menus.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  menu: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  tenant: { findMany: jest.fn(), findUnique: jest.fn() },
};

describe('MenusService', () => {
  let service: MenusService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [MenusService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<MenusService>(MenusService);
  });

  describe('resolveStoreMenuId()', () => {
    it('returns null when the store has no menu assigned', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ menuId: null });
      expect(await service.resolveStoreMenuId('tenant-1')).toBeNull();
    });

    it('returns the store\'s current menuId', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ menuId: 'menu-1' });
      expect(await service.resolveStoreMenuId('tenant-1')).toBe('menu-1');
    });
  });

  describe('findOne()', () => {
    it('throws NotFoundException when the menu does not belong to this brand', async () => {
      mockPrisma.menu.findFirst.mockResolvedValue(null);
      await expect(service.findOne('brand-1', 'menu-x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove() — deletion guard', () => {
    it('blocks deleting a menu assigned to stores', async () => {
      mockPrisma.menu.findFirst.mockResolvedValue({ id: 'menu-1', brandId: 'brand-1', tombstone: 0 });
      mockPrisma.tenant.findMany.mockResolvedValue([{ name: 'Store A' }]);

      await expect(service.remove('brand-1', 'menu-1')).rejects.toThrow(ConflictException);
      expect(mockPrisma.menu.update).not.toHaveBeenCalled();
    });

    it('tombstones the menu when no store is assigned', async () => {
      mockPrisma.menu.findFirst.mockResolvedValue({ id: 'menu-1', brandId: 'brand-1', tombstone: 0 });
      mockPrisma.tenant.findMany.mockResolvedValue([]);
      mockPrisma.menu.update.mockResolvedValue({ id: 'menu-1', tombstone: 1 });

      await service.remove('brand-1', 'menu-1');

      expect(mockPrisma.menu.update).toHaveBeenCalledWith({ where: { id: 'menu-1' }, data: { tombstone: 1 } });
    });
  });

  describe('update() — deactivation guard', () => {
    it('blocks deactivating a menu assigned to stores', async () => {
      mockPrisma.menu.findFirst.mockResolvedValue({ id: 'menu-1', brandId: 'brand-1', tombstone: 0, isActive: true });
      mockPrisma.tenant.findMany.mockResolvedValue([{ name: 'Store A' }]);

      await expect(service.update('brand-1', 'menu-1', { isActive: false })).rejects.toThrow(ConflictException);
      expect(mockPrisma.menu.update).not.toHaveBeenCalled();
    });

    it('allows deactivating a menu with no store assigned', async () => {
      mockPrisma.menu.findFirst.mockResolvedValue({ id: 'menu-1', brandId: 'brand-1', tombstone: 0, isActive: true });
      mockPrisma.tenant.findMany.mockResolvedValue([]);
      mockPrisma.menu.update.mockResolvedValue({ id: 'menu-1', isActive: false });

      await service.update('brand-1', 'menu-1', { isActive: false });

      expect(mockPrisma.menu.update).toHaveBeenCalledWith({ where: { id: 'menu-1' }, data: { isActive: false } });
    });

    it('does not run the guard when reactivating', async () => {
      mockPrisma.menu.findFirst.mockResolvedValue({ id: 'menu-1', brandId: 'brand-1', tombstone: 0, isActive: false });
      mockPrisma.menu.update.mockResolvedValue({ id: 'menu-1', isActive: true });

      await service.update('brand-1', 'menu-1', { isActive: true });

      expect(mockPrisma.tenant.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.menu.update).toHaveBeenCalledWith({ where: { id: 'menu-1' }, data: { isActive: true } });
    });

    it('does not re-run the guard when the menu is already inactive', async () => {
      mockPrisma.menu.findFirst.mockResolvedValue({ id: 'menu-1', brandId: 'brand-1', tombstone: 0, isActive: false });
      mockPrisma.menu.update.mockResolvedValue({ id: 'menu-1', name: 'Renamed' });

      await service.update('brand-1', 'menu-1', { isActive: false, name: 'Renamed' });

      expect(mockPrisma.tenant.findMany).not.toHaveBeenCalled();
    });
  });
});
