import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PassThrough } from 'stream';
import { ExportService } from './export.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  company: { findFirst: jest.fn() },
  brand: { findMany: jest.fn() },
  menu: { findMany: jest.fn() },
  category: { findMany: jest.fn() },
  product: { findMany: jest.fn() },
  size: { findMany: jest.fn() },
  addon: { findMany: jest.fn() },
  preference: { findMany: jest.fn() },
  tenant: { findFirst: jest.fn() },
  transaction: { findMany: jest.fn() },
  expense: { findMany: jest.fn() },
  inventoryRecord: { findMany: jest.fn() },
  inventoryItem: { findMany: jest.fn() },
  submittedReport: { findMany: jest.fn() },
  submittedInventoryReport: { findMany: jest.fn() },
  inventorySetup: { findMany: jest.fn().mockResolvedValue([]) },
  user: { findMany: jest.fn().mockResolvedValue([]) },
  // Default so pre-existing getStoreExportData()/streamStoreExport() tests
  // that don't care about attendance don't have to mock this explicitly —
  // jest.clearAllMocks() (used in beforeEach) clears calls, not
  // implementations, so this default survives across tests unless a
  // specific test overrides it.
  staffTimeLog: { findMany: jest.fn().mockResolvedValue([]) },
};

describe('ExportService', () => {
  let service: ExportService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExportService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<ExportService>(ExportService);
  });

  describe('getCompanyExportData()', () => {
    it('throws NotFoundException when the company does not exist', async () => {
      mockPrisma.company.findFirst.mockResolvedValue(null);
      await expect(
        service.getCompanyExportData('missing-company'),
      ).rejects.toThrow(NotFoundException);
    });

    it("returns company info plus per-brand catalog, scoped by that brand's menus", async () => {
      mockPrisma.company.findFirst.mockResolvedValue({
        id: 'company-1',
        name: 'Acme Co',
        slug: 'acme',
        description: null,
        logoUrl: null,
        contactEmail: null,
        contactPhone: null,
        address: null,
        isActive: true,
        canCreateBrands: true,
        canOnboardStores: true,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-02'),
      });
      mockPrisma.brand.findMany.mockResolvedValue([
        {
          id: 'brand-1',
          name: 'Brand One',
          slug: 'brand-one',
          description: null,
          logoUrl: null,
          isActive: true,
          enabledDeliveryPlatforms: [],
          preferenceLabel: null,
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-02'),
        },
      ]);
      mockPrisma.menu.findMany.mockResolvedValue([
        { id: 'menu-1' },
        { id: 'menu-2' },
      ]);
      mockPrisma.category.findMany.mockResolvedValue([
        { id: 'cat-1', name: 'Drinks' },
      ]);
      mockPrisma.product.findMany.mockResolvedValue([
        { id: 'prod-1', name: 'Latte' },
      ]);
      mockPrisma.size.findMany.mockResolvedValue([
        { id: 'size-1', name: 'Large' },
      ]);
      mockPrisma.addon.findMany.mockResolvedValue([
        { id: 'addon-1', name: 'Extra shot' },
      ]);
      mockPrisma.preference.findMany.mockResolvedValue([
        { id: 'pref-1', name: 'Oat milk' },
      ]);

      const result = await service.getCompanyExportData('company-1');

      expect(result.companyInfo.id).toBe('company-1');
      expect(result.brands).toHaveLength(1);
      expect(result.brands[0].brand.id).toBe('brand-1');
      expect(result.brands[0].categories).toEqual([
        { id: 'cat-1', name: 'Drinks' },
      ]);
      expect(result.brands[0].products).toEqual([
        { id: 'prod-1', name: 'Latte' },
      ]);
      expect(result.brands[0].sizes).toEqual([{ id: 'size-1', name: 'Large' }]);
      expect(result.brands[0].addons).toEqual([
        { id: 'addon-1', name: 'Extra shot' },
      ]);
      expect(result.brands[0].preferences).toEqual([
        { id: 'pref-1', name: 'Oat milk' },
      ]);

      // Catalog is fetched by this brand's resolved menuIds, never brandId
      // directly (Category/Product/Size/Addon/Preference are Menu-scoped),
      // and every query excludes tombstoned (soft-deleted) records.
      expect(mockPrisma.menu.findMany).toHaveBeenCalledWith({
        where: { brandId: 'brand-1', tombstone: { not: 1 } },
      });
      expect(mockPrisma.category.findMany).toHaveBeenCalledWith({
        where: { menuId: { in: ['menu-1', 'menu-2'] }, type: 'PRODUCT', tombstone: { not: 1 } },
      });
      expect(mockPrisma.product.findMany).toHaveBeenCalledWith({
        where: { menuId: { in: ['menu-1', 'menu-2'] }, tombstone: { not: 1 } },
      });
      expect(mockPrisma.size.findMany).toHaveBeenCalledWith({
        where: { menuId: { in: ['menu-1', 'menu-2'] }, tombstone: { not: 1 } },
      });
      expect(mockPrisma.addon.findMany).toHaveBeenCalledWith({
        where: { menuId: { in: ['menu-1', 'menu-2'] }, tombstone: { not: 1 } },
      });
      expect(mockPrisma.preference.findMany).toHaveBeenCalledWith({
        where: { menuId: { in: ['menu-1', 'menu-2'] }, tombstone: { not: 1 } },
      });
    });

    it('never queries or returns Transaction/Expense/InventoryItem/InventoryRecord/SubmittedReport/SubmittedInventoryReport data', async () => {
      mockPrisma.company.findFirst.mockResolvedValue({
        id: 'company-1',
        name: 'Acme Co',
        slug: 'acme',
        description: null,
        logoUrl: null,
        contactEmail: null,
        contactPhone: null,
        address: null,
        isActive: true,
        canCreateBrands: true,
        canOnboardStores: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockPrisma.brand.findMany.mockResolvedValue([
        {
          id: 'brand-1',
          name: 'Brand One',
          slug: 'brand-one',
          description: null,
          logoUrl: null,
          isActive: true,
          enabledDeliveryPlatforms: [],
          preferenceLabel: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      mockPrisma.menu.findMany.mockResolvedValue([{ id: 'menu-1' }]);
      mockPrisma.category.findMany.mockResolvedValue([]);
      mockPrisma.product.findMany.mockResolvedValue([]);
      mockPrisma.size.findMany.mockResolvedValue([]);
      mockPrisma.addon.findMany.mockResolvedValue([]);
      mockPrisma.preference.findMany.mockResolvedValue([]);

      const result = await service.getCompanyExportData('company-1');

      // The store-scoped Prisma models must never be touched by the company
      // export code path — this is the binding Global Constraint from the
      // task-4 brief.
      expect(mockPrisma.transaction.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.expense.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.inventoryItem.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.inventoryRecord.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.submittedReport.findMany).not.toHaveBeenCalled();
      expect(
        mockPrisma.submittedInventoryReport.findMany,
      ).not.toHaveBeenCalled();

      // And the serialized output itself must carry none of those keys,
      // at the company level or nested under any brand.
      const serialized = JSON.stringify(result);
      expect(serialized).not.toMatch(/transaction/i);
      expect(serialized).not.toMatch(/expense/i);
      expect(serialized).not.toMatch(/inventoryItem/i);
      expect(serialized).not.toMatch(/inventoryRecord/i);
      expect(serialized).not.toMatch(/submittedReport/i);
      expect(serialized).not.toMatch(/submittedInventoryReport/i);

      const topLevelKeys = Object.keys(result);
      const brandKeys = Object.keys(result.brands[0]);
      const forbidden = [
        'transactions',
        'expenses',
        'inventoryItems',
        'inventoryRecords',
        'submittedReports',
        'submittedInventoryReports',
      ];
      forbidden.forEach((key) => {
        expect(topLevelKeys).not.toContain(key);
        expect(brandKeys).not.toContain(key);
      });
    });
  });

  describe('getStoreExportData()', () => {
    it('throws NotFoundException when the store does not exist', async () => {
      mockPrisma.tenant.findFirst.mockResolvedValue(null);
      await expect(service.getStoreExportData('missing-store')).rejects.toThrow(
        NotFoundException,
      );
    });

    it("scopes every query to the requested tenantId only — not a sibling store's data", async () => {
      mockPrisma.tenant.findFirst.mockResolvedValue({
        id: 'store-a',
        inventorySetupId: 'setup-1',
        tombstone: 0,
      });
      mockPrisma.transaction.findMany.mockResolvedValue([
        { id: 'txn-a1', tenantId: 'store-a' },
      ]);
      mockPrisma.expense.findMany.mockResolvedValue([
        { id: 'exp-a1', tenantId: 'store-a' },
      ]);
      mockPrisma.inventoryRecord.findMany.mockResolvedValue([
        { id: 'rec-a1', tenantId: 'store-a', inventoryItemId: 'item-1' },
      ]);
      mockPrisma.submittedReport.findMany.mockResolvedValue([
        { id: 'sr-a1', tenantId: 'store-a' },
      ]);
      mockPrisma.submittedInventoryReport.findMany.mockResolvedValue([
        { id: 'sir-a1', tenantId: 'store-a' },
      ]);
      mockPrisma.inventoryItem.findMany.mockResolvedValue([{ id: 'item-1' }]);

      const result = await service.getStoreExportData('store-a');

      expect(mockPrisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: 'store-a' } }),
      );
      expect(mockPrisma.expense.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'store-a' },
      });
      expect(mockPrisma.inventoryRecord.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'store-a' },
      });
      expect(mockPrisma.submittedReport.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'store-a' },
      });
      expect(mockPrisma.submittedInventoryReport.findMany).toHaveBeenCalledWith(
        {
          where: { tenantId: 'store-a' },
        },
      );

      // Every returned record belongs to store-a — none of store-b's data
      // ever entered the result.
      expect(
        result.transactions.every((t: any) => t.tenantId === 'store-a'),
      ).toBe(true);
      expect(result.expenses.every((e: any) => e.tenantId === 'store-a')).toBe(
        true,
      );
      expect(
        result.submittedReports.every((r: any) => r.tenantId === 'store-a'),
      ).toBe(true);
      expect(
        result.submittedInventoryReports.every(
          (r: any) => r.tenantId === 'store-a',
        ),
      ).toBe(true);
    });

    it('fetches attendance (StaffTimeLog) scoped to the store and never selects photoUrl — this export is data only, no images', async () => {
      mockPrisma.tenant.findFirst.mockResolvedValue({
        id: 'store-a',
        inventorySetupId: null,
        tombstone: 0,
      });
      mockPrisma.transaction.findMany.mockResolvedValue([]);
      mockPrisma.expense.findMany.mockResolvedValue([]);
      mockPrisma.inventoryRecord.findMany.mockResolvedValue([]);
      mockPrisma.submittedReport.findMany.mockResolvedValue([]);
      mockPrisma.submittedInventoryReport.findMany.mockResolvedValue([]);
      mockPrisma.staffTimeLog.findMany.mockResolvedValue([
        { id: 'log-1', userId: 'user-1', eventType: 'TIME_IN', latitude: 14.6, longitude: 121.0, createdAt: new Date('2026-01-01') },
      ]);

      const result = await service.getStoreExportData('store-a');

      expect(mockPrisma.staffTimeLog.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'store-a' },
        select: {
          id: true,
          userId: true,
          eventType: true,
          latitude: true,
          longitude: true,
          createdAt: true,
        },
      });
      // The select above already excludes photoUrl at the query level, but
      // assert the result too — belt and suspenders for the "no pictures"
      // requirement.
      expect(
        (result.staffTimeLogs as any[]).every((l) => !('photoUrl' in l)),
      ).toBe(true);
      expect(result.staffTimeLogs).toHaveLength(1);
    });

    it("does not leak a sibling store's transactions when called for a different tenantId", async () => {
      mockPrisma.tenant.findFirst.mockResolvedValue({
        id: 'store-b',
        inventorySetupId: null,
        tombstone: 0,
      });
      // Prisma mock only ever returns rows matching the where clause it was
      // called with — simulates real DB scoping behavior for this assertion.
      mockPrisma.transaction.findMany.mockImplementation(({ where }: any) =>
        Promise.resolve(
          [
            { id: 'txn-a1', tenantId: 'store-a' },
            { id: 'txn-b1', tenantId: 'store-b' },
          ].filter((t) => t.tenantId === where.tenantId),
        ),
      );
      mockPrisma.expense.findMany.mockResolvedValue([]);
      mockPrisma.inventoryRecord.findMany.mockResolvedValue([]);
      mockPrisma.submittedReport.findMany.mockResolvedValue([]);
      mockPrisma.submittedInventoryReport.findMany.mockResolvedValue([]);

      const result = await service.getStoreExportData('store-b');

      expect(result.transactions).toEqual([
        { id: 'txn-b1', tenantId: 'store-b' },
      ]);
    });

    it("resolves inventory-items.json from the store's current inventory setup plus any item it has recorded history for", async () => {
      mockPrisma.tenant.findFirst.mockResolvedValue({
        id: 'store-a',
        inventorySetupId: 'setup-1',
        tombstone: 0,
      });
      mockPrisma.transaction.findMany.mockResolvedValue([]);
      mockPrisma.expense.findMany.mockResolvedValue([]);
      mockPrisma.inventoryRecord.findMany.mockResolvedValue([
        { id: 'rec-1', tenantId: 'store-a', inventoryItemId: 'legacy-item' },
      ]);
      mockPrisma.submittedReport.findMany.mockResolvedValue([]);
      mockPrisma.submittedInventoryReport.findMany.mockResolvedValue([]);
      mockPrisma.inventoryItem.findMany
        .mockResolvedValueOnce([{ id: 'active-item' }]) // setup lookup (select: id)
        .mockResolvedValueOnce([{ id: 'active-item' }, { id: 'legacy-item' }]); // final fetch

      const result = await service.getStoreExportData('store-a');

      expect(mockPrisma.inventoryItem.findMany).toHaveBeenNthCalledWith(1, {
        where: { inventorySetupId: 'setup-1' },
        select: { id: true },
      });
      const finalCallArgs = mockPrisma.inventoryItem.findMany.mock.calls[1][0];
      expect(finalCallArgs.where.id.in.sort()).toEqual(
        ['active-item', 'legacy-item'].sort(),
      );
      expect(result.inventoryItems).toEqual([
        { id: 'active-item' },
        { id: 'legacy-item' },
      ]);
    });
  });

  // A real download was reported "stuck" showing stale data across several
  // exports in a row — root cause was the browser caching the response,
  // because no Cache-Control header told it not to. These headers are the
  // regression guard.
  describe('response caching headers', () => {
    // archiver needs a real writable stream to pipe into; a plain
    // PassThrough plus a tracked setHeader is the minimal stand-in for
    // Express's Response here — this deliberately does NOT mock the
    // zip/stream plumbing itself, only observes what headers get set
    // before any piping starts.
    function fakeResponse() {
      const stream = new PassThrough();
      const headers: Record<string, string> = {};
      return Object.assign(stream, {
        headers,
        setHeader(name: string, value: string) {
          headers[name] = value;
        },
      });
    }

    it('streamStoreExport() tells the browser never to cache the export', async () => {
      mockPrisma.tenant.findFirst.mockResolvedValue({ id: 'store-a', inventorySetupId: null, tombstone: 0 });
      mockPrisma.transaction.findMany.mockResolvedValue([]);
      mockPrisma.expense.findMany.mockResolvedValue([]);
      mockPrisma.inventoryRecord.findMany.mockResolvedValue([]);
      mockPrisma.submittedReport.findMany.mockResolvedValue([]);
      mockPrisma.submittedInventoryReport.findMany.mockResolvedValue([]);

      const res = fakeResponse();
      // Drain the piped archive so `res.on('finish', resolve)` actually fires.
      res.resume();
      await service.streamStoreExport('store-a', res as any);

      expect(res.headers['Cache-Control']).toBe('no-store, no-cache, must-revalidate');
      expect(res.headers['Pragma']).toBe('no-cache');
    });

    it('streamCompanyExport() tells the browser never to cache the export', async () => {
      mockPrisma.company.findFirst.mockResolvedValue({
        id: 'company-1',
        name: 'Acme',
        slug: 'acme',
        description: null,
        logoUrl: null,
        contactEmail: null,
        contactPhone: null,
        address: null,
        isActive: true,
        canCreateBrands: true,
        canOnboardStores: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockPrisma.brand.findMany.mockResolvedValue([]);

      const res = fakeResponse();
      res.resume();
      await service.streamCompanyExport('company-1', res as any);

      expect(res.headers['Cache-Control']).toBe('no-store, no-cache, must-revalidate');
      expect(res.headers['Pragma']).toBe('no-cache');
    });
  });
});
