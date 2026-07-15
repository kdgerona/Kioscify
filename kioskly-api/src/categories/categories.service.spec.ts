import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { PrismaService } from '../prisma/prisma.service';
import { MenusService } from '../menus/menus.service';
import { InventorySetupsService } from '../inventory-setups/inventory-setups.service';

const mockPrisma = {
  category: { create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
};
const mockMenusService = { resolveStoreMenuId: jest.fn() };
const mockInventorySetupsService = { resolveStoreInventorySetupId: jest.fn() };

describe('CategoriesService', () => {
  let service: CategoriesService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MenusService, useValue: mockMenusService },
        { provide: InventorySetupsService, useValue: mockInventorySetupsService },
      ],
    }).compile();
    service = module.get<CategoriesService>(CategoriesService);
  });

  describe('create() — mutual exclusivity of menuId/inventorySetupId', () => {
    it('rejects a PRODUCT category with no menuId', async () => {
      await expect(service.create({ name: 'X', type: 'PRODUCT' } as any)).rejects.toThrow(BadRequestException);
      expect(mockPrisma.category.create).not.toHaveBeenCalled();
    });

    it('rejects an INVENTORY category with no inventorySetupId', async () => {
      await expect(service.create({ name: 'X', type: 'INVENTORY' } as any)).rejects.toThrow(BadRequestException);
      expect(mockPrisma.category.create).not.toHaveBeenCalled();
    });

    it('creates a PRODUCT category scoped to menuId, ignoring any inventorySetupId also present', async () => {
      mockPrisma.category.create.mockResolvedValue({ id: 'cat-1' });
      await service.create({ name: 'Lemonade', type: 'PRODUCT', menuId: 'menu-1', inventorySetupId: 'setup-1' } as any);

      expect(mockPrisma.category.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ menuId: 'menu-1', inventorySetupId: undefined }),
        }),
      );
    });

    it('creates an INVENTORY category scoped to inventorySetupId, ignoring any menuId also present', async () => {
      mockPrisma.category.create.mockResolvedValue({ id: 'cat-2' });
      await service.create({ name: 'Syrups', type: 'INVENTORY', menuId: 'menu-1', inventorySetupId: 'setup-1' } as any);

      expect(mockPrisma.category.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ inventorySetupId: 'setup-1', menuId: undefined }),
        }),
      );
    });
  });

  describe('findAll()', () => {
    it('returns [] for PRODUCT categories when no menuId can be resolved', async () => {
      mockMenusService.resolveStoreMenuId.mockResolvedValue(null);
      const result = await service.findAll({ type: 'PRODUCT', tenantId: 'tenant-unassigned' });
      expect(result).toEqual([]);
      expect(mockPrisma.category.findMany).not.toHaveBeenCalled();
    });

    it('returns [] for INVENTORY categories when no inventorySetupId can be resolved', async () => {
      mockInventorySetupsService.resolveStoreInventorySetupId.mockResolvedValue(null);
      const result = await service.findAll({ type: 'INVENTORY', tenantId: 'tenant-unassigned' });
      expect(result).toEqual([]);
      expect(mockPrisma.category.findMany).not.toHaveBeenCalled();
    });

    it('prefers an explicit menuId over the tenant-resolved one', async () => {
      mockPrisma.category.findMany.mockResolvedValue([]);
      await service.findAll({ type: 'PRODUCT', menuId: 'explicit-menu', tenantId: 'tenant-1' });
      expect(mockMenusService.resolveStoreMenuId).not.toHaveBeenCalled();
      expect(mockPrisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ menuId: 'explicit-menu' }) }),
      );
    });
  });
});
