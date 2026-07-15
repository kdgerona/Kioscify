import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { MenusService } from './menus.service';
import { PrismaService } from '../prisma/prisma.service';

function makeTx() {
  return {
    menu: { create: jest.fn() },
    category: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
    size: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
    addon: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
    preference: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
    priceTier: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
    sizePriceTier: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
    addonPriceTier: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
    product: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
    productSize: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
    productAddon: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
    productPreference: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
    productPriceTier: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
  };
}

const mockPrisma = {
  menu: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  tenant: { findMany: jest.fn(), findUnique: jest.fn() },
  $transaction: jest.fn(),
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
      mockPrisma.menu.findFirst.mockResolvedValue({ id: 'menu-1', brandId: 'brand-1', name: 'Original', tombstone: 0 });
      mockPrisma.tenant.findMany.mockResolvedValue([]);
      mockPrisma.menu.update.mockResolvedValue({ id: 'menu-1', tombstone: 1 });

      await service.remove('brand-1', 'menu-1');

      expect(mockPrisma.menu.update).toHaveBeenCalledWith({
        where: { id: 'menu-1' },
        data: { tombstone: 1, name: expect.stringMatching(/^Original \[deleted \d+\]$/) },
      });
    });

    it('mangles the name on delete so the original name is free for a future menu to reuse', async () => {
      // @@unique([brandId, name]) is a plain Mongo index — it has no concept
      // of tombstone, so without this the deleted menu would permanently
      // squat on its name (this is exactly what surfaced in manual testing:
      // clone -> delete -> clone again with the same suggested name failed).
      mockPrisma.menu.findFirst.mockResolvedValue({ id: 'menu-1', brandId: 'brand-1', name: 'Default Menu (Copy)', tombstone: 0 });
      mockPrisma.tenant.findMany.mockResolvedValue([]);
      mockPrisma.menu.update.mockResolvedValue({});

      await service.remove('brand-1', 'menu-1');

      const call = mockPrisma.menu.update.mock.calls[0][0];
      expect(call.data.name).not.toBe('Default Menu (Copy)');
      expect(call.data.name).toContain('Default Menu (Copy)');
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

  describe('clone()', () => {
    const sourceMenu = { id: 'menu-1', brandId: 'brand-1', name: 'Original', description: 'desc', isActive: true, tombstone: 0 };
    const clonedMenu = { id: 'new-menu-id', brandId: 'brand-1', name: 'Original (Copy)', description: 'desc', isActive: true, tombstone: 0 };

    beforeEach(() => {
      mockPrisma.$transaction.mockImplementation(async (callback: any) => callback(makeTx()));
    });

    it('auto-generates a "(Copy)" name and retries on collision when dto.name is omitted', async () => {
      mockPrisma.menu.findFirst
        .mockResolvedValueOnce(sourceMenu) // findOne(source)
        .mockResolvedValueOnce({ id: 'other' }) // "Original (Copy)" taken
        .mockResolvedValueOnce(null) // "Original (Copy 2)" free
        .mockResolvedValueOnce({ ...clonedMenu, name: 'Original (Copy 2)' }); // final findOne(clone)

      let capturedName = '';
      mockPrisma.$transaction.mockImplementationOnce(async (callback: any) => {
        const tx = makeTx();
        tx.menu.create.mockImplementation(async ({ data }: any) => {
          capturedName = data.name;
          return { id: 'new-menu-id', ...data };
        });
        return callback(tx);
      });

      const result = await service.clone('brand-1', 'menu-1', {});

      expect(capturedName).toBe('Original (Copy 2)');
      expect(result.name).toBe('Original (Copy 2)');
    });

    it('throws ConflictException when an explicit dto.name is already taken', async () => {
      mockPrisma.menu.findFirst
        .mockResolvedValueOnce(sourceMenu) // findOne(source)
        .mockResolvedValueOnce({ id: 'taken' }); // explicit name check

      await expect(service.clone('brand-1', 'menu-1', { name: 'Existing Menu' })).rejects.toThrow(ConflictException);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('deep-copies categories/sizes/addons/preferences/products with remapped ids, reuses the source image URL, and never touches TenantInventoryOverride/InventoryRecord', async () => {
      mockPrisma.menu.findFirst
        .mockResolvedValueOnce(sourceMenu) // findOne(source)
        .mockResolvedValueOnce(null) // "Original (Copy)" free
        .mockResolvedValueOnce(clonedMenu); // final findOne(clone)

      const tx = makeTx();
      tx.menu.create.mockResolvedValue({ id: 'new-menu-id', brandId: 'brand-1', name: 'Original (Copy)', description: 'desc', isActive: true });

      const sourceCategory = { id: 'cat-1', brandId: 'brand-1', name: 'Cat A', description: null, sequenceNo: 0 };
      tx.category.findMany.mockResolvedValue([sourceCategory]);
      tx.category.create.mockImplementation(async ({ data }: any) => ({ id: data.id, ...data }));

      const sourceSize = { id: 'size-1', brandId: 'brand-1', name: 'Small', priceModifier: 0, foodpandaPrice: null, grabPrice: null, volume: null, sequenceNo: 0 };
      tx.size.findMany.mockResolvedValue([sourceSize]);
      tx.size.create.mockImplementation(async ({ data }: any) => ({ id: data.id, ...data }));

      const sourceAddon = { id: 'addon-1', brandId: 'brand-1', name: 'Extra Shot', price: 20, foodpandaPrice: null, grabPrice: null, sequenceNo: 0 };
      tx.addon.findMany.mockResolvedValue([sourceAddon]);
      tx.addon.create.mockImplementation(async ({ data }: any) => ({ id: data.id, ...data }));

      const sourcePreference = { id: 'pref-1', brandId: 'brand-1', name: 'No Sugar', isDefault: false, sequenceNo: 0 };
      tx.preference.findMany.mockResolvedValue([sourcePreference]);
      tx.preference.create.mockImplementation(async ({ data }: any) => ({ id: data.id, ...data }));

      const sourceTier = { id: 'tier-1', name: 'Standard', isDefault: true };
      tx.priceTier.findMany.mockResolvedValue([sourceTier]);
      tx.priceTier.create.mockImplementation(async ({ data }: any) => ({ id: 'tier-1-clone', ...data }));

      const sourceProduct = {
        id: 'prod-1',
        name: 'Latte',
        price: 100,
        foodpandaPrice: null,
        grabPrice: null,
        categoryId: 'cat-1',
        image: 'http://kioscify.localhost/storage/products/latte.jpg',
        brandId: 'brand-1',
        tombstone: 0,
      };
      tx.product.findMany.mockResolvedValue([sourceProduct]);
      tx.product.findUnique.mockResolvedValue(null); // slug "latte" is free
      tx.product.create.mockImplementation(async ({ data }: any) => ({ id: data.id, ...data }));

      tx.productSize.findMany.mockResolvedValue([{ productId: 'prod-1', sizeId: 'size-1' }]);
      tx.productAddon.findMany.mockResolvedValue([{ productId: 'prod-1', addonId: 'addon-1' }]);
      tx.productPreference.findMany.mockResolvedValue([{ productId: 'prod-1', preferenceId: 'pref-1' }]);
      tx.productPriceTier.findMany.mockResolvedValue([
        { productId: 'prod-1', tierId: 'tier-1', price: 100, foodpandaPrice: null, grabPrice: null },
      ]);

      mockPrisma.$transaction.mockImplementationOnce(async (callback: any) => callback(tx));

      await service.clone('brand-1', 'menu-1', {});

      // Category cloned with a fresh id, not reusing 'cat-1'
      const newCategoryId = tx.category.create.mock.calls[0][0].data.id;
      expect(newCategoryId).not.toBe('cat-1');

      // Product cloned with the remapped categoryId and the *same* image URL (no file duplication)
      const productCreateArgs = tx.product.create.mock.calls[0][0].data;
      expect(productCreateArgs.categoryId).toBe(newCategoryId);
      expect(productCreateArgs.image).toBe(sourceProduct.image);
      expect(productCreateArgs.id).toBe('latte');

      const newProduct = await tx.product.create.mock.results[0].value;
      const newProductId = newProduct.id;
      const newSizeId = tx.size.create.mock.calls[0][0].data.id;
      const newAddonId = tx.addon.create.mock.calls[0][0].data.id;
      const newPreferenceId = tx.preference.create.mock.calls[0][0].data.id;

      expect(tx.productSize.create).toHaveBeenCalledWith({
        data: { productId: newProductId, sizeId: newSizeId },
      });
      expect(tx.productAddon.create).toHaveBeenCalledWith({
        data: { productId: newProductId, addonId: newAddonId },
      });
      expect(tx.productPreference.create).toHaveBeenCalledWith({
        data: { productId: newProductId, preferenceId: newPreferenceId },
      });
      expect(tx.productPriceTier.create).toHaveBeenCalledWith({
        data: { productId: newProductId, tierId: 'tier-1-clone', price: 100, foodpandaPrice: null, grabPrice: null },
      });

      // No inventory-override/inventory-record concept exists on the Menu side at all —
      // the mocked tx has no such models, so any accidental reference would throw.
    });
  });
});
