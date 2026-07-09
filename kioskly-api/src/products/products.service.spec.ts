import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProductsService } from './products.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { PriceTiersService } from '../price-tiers/price-tiers.service';
import { MenusService } from '../menus/menus.service';

const mockPrisma = {
  menu: { findUnique: jest.fn() },
  product: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
  size: { findMany: jest.fn() },
  addon: { findMany: jest.fn() },
  preference: { findMany: jest.fn() },
  category: { findFirst: jest.fn() },
  priceTier: { findMany: jest.fn() },
  productPriceTier: { deleteMany: jest.fn() },
};

const mockStorage = { upload: jest.fn(), delete: jest.fn() };
const mockConfigService = { get: jest.fn().mockReturnValue('') };
const mockPriceTiersService = { resolveStoreTierId: jest.fn() };
const mockMenusService = { resolveStoreMenuId: jest.fn() };

const menuA = { id: 'menu-a', brandId: 'brand-1' };
const menuB = { id: 'menu-b', brandId: 'brand-1' };

const baseProduct = {
  id: 'prod-1',
  name: 'Menu B Product',
  price: 49,
  foodpandaPrice: null,
  grabPrice: null,
  categoryId: 'cat-b',
  menuId: 'menu-b',
  image: null,
  brandId: 'brand-1',
  tombstone: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  category: { id: 'cat-b', name: 'Cat B' },
  productSizes: [],
  productAddons: [],
  productPreferences: [],
  priceTiers: [],
};

describe('ProductsService', () => {
  let service: ProductsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StorageService, useValue: mockStorage },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PriceTiersService, useValue: mockPriceTiersService },
        { provide: MenusService, useValue: mockMenusService },
      ],
    }).compile();
    service = module.get<ProductsService>(ProductsService);
  });

  describe('create() — menu-scoped category/size/addon/preference validation', () => {
    it('rejects a categoryId that does not belong to the target menu', async () => {
      mockPrisma.menu.findUnique.mockResolvedValue(menuA);
      mockPrisma.category.findFirst.mockResolvedValue({ id: 'cat-b', menuId: 'menu-b', tombstone: 0 });

      await expect(
        service.create({ name: 'X', price: 10, categoryId: 'cat-b' } as any, 'menu-a'),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.product.create).not.toHaveBeenCalled();
    });

    it('rejects sizeIds that do not belong to the target menu', async () => {
      mockPrisma.menu.findUnique.mockResolvedValue(menuA);
      mockPrisma.category.findFirst.mockResolvedValue({ id: 'cat-a', menuId: 'menu-a', tombstone: 0 });
      mockPrisma.size.findMany.mockResolvedValue([]); // no size in menu-a matches the requested id

      await expect(
        service.create({ name: 'X', price: 10, categoryId: 'cat-a', sizeIds: ['size-from-menu-b'] } as any, 'menu-a'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('update() — a product only ever belongs to one menu', () => {
    it('throws NotFoundException when the product does not belong to the given menu', async () => {
      mockPrisma.product.findFirst.mockResolvedValue(null);

      await expect(service.update('prod-1', { name: 'Y' } as any, 'menu-a')).rejects.toThrow(NotFoundException);
      expect(mockPrisma.product.update).not.toHaveBeenCalled();
    });

    it('wipes and replaces productSizes unscoped — safe since this product belongs to exactly one menu', async () => {
      mockPrisma.product.findFirst.mockResolvedValueOnce({ ...baseProduct }).mockResolvedValueOnce({ ...baseProduct });
      mockPrisma.size.findMany.mockResolvedValue([{ id: 'size-b1' }]);
      mockPrisma.product.update.mockResolvedValue({});

      await service.update('prod-1', { sizeIds: ['size-b1'] } as any, 'menu-b');

      expect(mockPrisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'prod-1' },
          data: expect.objectContaining({
            productSizes: expect.objectContaining({ deleteMany: {} }),
          }),
        }),
      );
    });
  });

  describe('findAll()', () => {
    it('returns an empty list when no menuId can be resolved (unassigned store)', async () => {
      mockMenusService.resolveStoreMenuId.mockResolvedValue(null);
      const result = await service.findAll({ tenantId: 'tenant-unassigned' });
      expect(result).toEqual([]);
      expect(mockPrisma.product.findMany).not.toHaveBeenCalled();
    });
  });
});
