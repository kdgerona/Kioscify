import { Test, TestingModule } from '@nestjs/testing';
import { BrandsService } from './brands.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

const mockPrisma = {
  company: { findUnique: jest.fn() },
  brand: { findFirst: jest.fn(), findMany: jest.fn() },
  tenant: { findFirst: jest.fn() },
  product: { count: jest.fn() },
  inventoryItem: { count: jest.fn() },
};

const mockStorage = {};

describe('BrandsService', () => {
  let service: BrandsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-01T12:00:00.000Z'));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BrandsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StorageService, useValue: mockStorage },
      ],
    }).compile();
    service = module.get<BrandsService>(BrandsService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('validateSubdomain()', () => {
    it('returns valid:false and accountStatus DEACTIVATED when the company is fully deactivated, regardless of storeSlug', async () => {
      mockPrisma.company.findUnique.mockResolvedValue({
        id: 'company-1',
        name: 'Acme Corp',
        isActive: false,
        gracePeriodEndsAt: new Date('2026-06-01T12:00:00.000Z'), // in the past — expired
      });

      const result = await service.validateSubdomain('acme', 'burgers', 'downtown');

      expect(result).toEqual({
        valid: false,
        companyId: null,
        brandId: null,
        company: null,
        brand: null,
        accountStatus: 'DEACTIVATED',
      });
      expect(mockPrisma.brand.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.tenant.findFirst).not.toHaveBeenCalled();
    });

    it('proceeds past the company gate and returns valid:true, accountStatus GRACE_PERIOD when the company is inactive but within its grace period and the brand matches', async () => {
      mockPrisma.company.findUnique.mockResolvedValue({
        id: 'company-1',
        name: 'Acme Corp',
        isActive: false,
        gracePeriodEndsAt: new Date('2026-07-10T12:00:00.000Z'), // in the future — still grace
      });
      mockPrisma.brand.findFirst.mockResolvedValue({
        id: 'brand-1',
        name: 'Burger Co',
        logoUrl: null,
        themeColors: null,
        isActive: true,
      });

      const result = await service.validateSubdomain('acme', 'burgers');

      expect(result.valid).toBe(true);
      expect(result.accountStatus).toBe('GRACE_PERIOD');
      expect(mockPrisma.brand.findFirst).toHaveBeenCalled();
    });

    it('combines a GRACE_PERIOD company with a DEACTIVATED store into accountStatus DEACTIVATED (worst-of), while still valid:true', async () => {
      mockPrisma.company.findUnique.mockResolvedValue({
        id: 'company-1',
        name: 'Acme Corp',
        isActive: false,
        gracePeriodEndsAt: new Date('2026-07-10T12:00:00.000Z'), // in the future — still grace
      });
      mockPrisma.brand.findFirst.mockResolvedValue({
        id: 'brand-1',
        name: 'Burger Co',
        logoUrl: null,
        themeColors: null,
        isActive: true,
      });
      mockPrisma.tenant.findFirst.mockResolvedValue({
        isActive: false,
        gracePeriodEndsAt: new Date('2026-06-01T12:00:00.000Z'), // in the past — expired
      });

      const result = await service.validateSubdomain('acme', 'burgers', 'downtown');

      expect(result.valid).toBe(true);
      expect(result.accountStatus).toBe('DEACTIVATED');
    });

    it('returns valid:false and accountStatus DEACTIVATED when the company is inactive with a null gracePeriodEndsAt', async () => {
      mockPrisma.company.findUnique.mockResolvedValue({
        id: 'company-1',
        name: 'Acme Corp',
        isActive: false,
        gracePeriodEndsAt: null,
      });

      const result = await service.validateSubdomain('acme', 'burgers', 'downtown');

      expect(result.valid).toBe(false);
      expect(result.accountStatus).toBe('DEACTIVATED');
      expect(mockPrisma.brand.findFirst).not.toHaveBeenCalled();
    });

    it('combines an ACTIVE company with a GRACE_PERIOD store into accountStatus GRACE_PERIOD', async () => {
      mockPrisma.company.findUnique.mockResolvedValue({
        id: 'company-1',
        name: 'Acme Corp',
        isActive: true,
        gracePeriodEndsAt: null,
      });
      mockPrisma.brand.findFirst.mockResolvedValue({
        id: 'brand-1',
        name: 'Burger Co',
        logoUrl: null,
        themeColors: null,
        isActive: true,
      });
      mockPrisma.tenant.findFirst.mockResolvedValue({
        isActive: false,
        gracePeriodEndsAt: new Date('2026-07-10T12:00:00.000Z'), // in the future — still grace
      });

      const result = await service.validateSubdomain('acme', 'burgers', 'downtown');

      expect(result.valid).toBe(true);
      expect(result.accountStatus).toBe('GRACE_PERIOD');
      expect(mockPrisma.tenant.findFirst).toHaveBeenCalledWith({
        where: {
          slug: 'downtown',
          company: { slug: 'acme' },
          brand: { slug: 'burgers' },
          tombstone: { not: 1 },
        },
        select: { isActive: true, gracePeriodEndsAt: true },
      });
    });

    it('returns accountStatus ACTIVE for an active company when no storeSlug is given', async () => {
      mockPrisma.company.findUnique.mockResolvedValue({
        id: 'company-1',
        name: 'Acme Corp',
        isActive: true,
        gracePeriodEndsAt: null,
      });
      mockPrisma.brand.findFirst.mockResolvedValue({
        id: 'brand-1',
        name: 'Burger Co',
        logoUrl: null,
        themeColors: null,
        isActive: true,
      });

      const result = await service.validateSubdomain('acme', 'burgers');

      expect(result.valid).toBe(true);
      expect(result.accountStatus).toBe('ACTIVE');
      expect(mockPrisma.tenant.findFirst).not.toHaveBeenCalled();
    });

    it('falls back to accountStatus ACTIVE (company-only) when storeSlug is given but no Tenant matches', async () => {
      mockPrisma.company.findUnique.mockResolvedValue({
        id: 'company-1',
        name: 'Acme Corp',
        isActive: true,
        gracePeriodEndsAt: null,
      });
      mockPrisma.brand.findFirst.mockResolvedValue({
        id: 'brand-1',
        name: 'Burger Co',
        logoUrl: null,
        themeColors: null,
        isActive: true,
      });
      mockPrisma.tenant.findFirst.mockResolvedValue(null);

      const result = await service.validateSubdomain('acme', 'burgers', 'nonexistent-store');

      expect(result.valid).toBe(true);
      expect(result.accountStatus).toBe('ACTIVE');
    });

    it('returns valid:false when no company matches the slug', async () => {
      mockPrisma.company.findUnique.mockResolvedValue(null);

      const result = await service.validateSubdomain('missing', 'burgers');

      expect(result).toEqual({
        valid: false,
        companyId: null,
        brandId: null,
        company: null,
        brand: null,
        accountStatus: 'DEACTIVATED',
      });
    });

    it('returns valid:false when the company is active but no brand matches the slug', async () => {
      mockPrisma.company.findUnique.mockResolvedValue({
        id: 'company-1',
        name: 'Acme Corp',
        isActive: true,
        gracePeriodEndsAt: null,
      });
      mockPrisma.brand.findFirst.mockResolvedValue(null);

      const result = await service.validateSubdomain('acme', 'missing-brand');

      expect(result).toEqual({
        valid: false,
        companyId: 'company-1',
        brandId: null,
        company: null,
        brand: null,
        accountStatus: 'ACTIVE',
      });
    });
  });

  describe('catalog stats (productCount / inventoryItemCount)', () => {
    // Product and InventoryItem are no longer direct Brand relations (they
    // live under a Brand's Menus/InventorySetups respectively), so these
    // must be computed via the relation chain rather than Prisma's
    // single-level `_count` — this is what previously crashed `nest build`
    // (TS2353: 'products'/'inventoryItems' does not exist on
    // BrandCountOutputTypeSelect) and is the one behavior change (not just
    // a dead-field removal) in this fix, so it gets explicit coverage.

    it('findOne() computes productCount/inventoryItemCount via the Menu/InventorySetup relation, not Brand._count', async () => {
      mockPrisma.brand.findFirst.mockResolvedValue({
        id: 'brand-1',
        name: 'Burger Co',
        _count: { stores: 3 },
      });
      mockPrisma.product.count.mockResolvedValue(12);
      mockPrisma.inventoryItem.count.mockResolvedValue(7);

      const result = await service.findOne('brand-1', 'company-1');

      expect(mockPrisma.product.count).toHaveBeenCalledWith({
        where: { menu: { brandId: 'brand-1' }, tombstone: { not: 1 } },
      });
      expect(mockPrisma.inventoryItem.count).toHaveBeenCalledWith({
        where: { inventorySetup: { brandId: 'brand-1' }, tombstone: { not: 1 } },
      });
      expect(result.storeCount).toBe(3);
      expect(result.productCount).toBe(12);
      expect(result.inventoryItemCount).toBe(7);
      expect((result as any)._count).toBeUndefined();
    });

    it('findAllByCompany() computes per-brand catalog stats for every brand returned', async () => {
      mockPrisma.brand.findMany.mockResolvedValue([
        { id: 'brand-1', name: 'Burger Co', _count: { stores: 2 } },
        { id: 'brand-2', name: 'Taco Co', _count: { stores: 0 } },
      ]);
      mockPrisma.product.count.mockResolvedValueOnce(5).mockResolvedValueOnce(0);
      mockPrisma.inventoryItem.count.mockResolvedValueOnce(9).mockResolvedValueOnce(0);

      const result = await service.findAllByCompany('company-1');

      expect(result).toEqual([
        expect.objectContaining({ id: 'brand-1', storeCount: 2, productCount: 5, inventoryItemCount: 9 }),
        expect.objectContaining({ id: 'brand-2', storeCount: 0, productCount: 0, inventoryItemCount: 0 }),
      ]);
    });
  });
});
