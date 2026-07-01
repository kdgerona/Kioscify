import { Test, TestingModule } from '@nestjs/testing';
import { SubscriptionsService } from './subscriptions.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  tenant: { findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn() },
  storeSubscription: { findMany: jest.fn(), findUnique: jest.fn(), upsert: jest.fn() },
  subscriptionPayment: { upsert: jest.fn() },
};

describe('SubscriptionsService', () => {
  let service: SubscriptionsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [SubscriptionsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<SubscriptionsService>(SubscriptionsService);
  });

  describe('getStats', () => {
    it('computes activated/pending/paid/overdue from tenant count and subscriptions', async () => {
      mockPrisma.tenant.count.mockResolvedValue(5);
      mockPrisma.storeSubscription.findMany.mockResolvedValue([
        { id: 'sub-1', payments: [{ paid: true }] }, // paid this month
        { id: 'sub-2', payments: [] }, // overdue
        { id: 'sub-3', payments: [] }, // overdue
      ]);

      const result = await service.getStats();

      expect(mockPrisma.tenant.count).toHaveBeenCalledWith();
      expect(mockPrisma.storeSubscription.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { activatedAt: { not: null } } }),
      );
      expect(result).toEqual({
        totalStores: 5,
        activated: 3,
        pendingActivation: 2,
        paidThisMonth: 1,
        overdue: 2,
      });
    });
  });

  describe('getList', () => {
    const baseTenant = {
      id: 't-1',
      name: 'Downtown',
      slug: 'downtown',
      company: { id: 'c-1', name: 'Acme Co' },
      brand: { id: 'b-1', name: 'Mango Cafe' },
      subscription: null as any,
    };

    it('marks a store with no subscription row as pending, paidThisMonth null', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([baseTenant]);

      const result = await service.getList({});

      expect(result.data).toEqual([
        {
          tenantId: 't-1',
          storeName: 'Downtown',
          storeSlug: 'downtown',
          company: { id: 'c-1', name: 'Acme Co' },
          brand: { id: 'b-1', name: 'Mango Cafe' },
          activatedAt: null,
          paidThisMonth: null,
        },
      ]);
      expect(result.pagination).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
    });

    it('filters to only overdue stores when paid=overdue', async () => {
      const activatedAt = new Date('2026-01-01T00:00:00.000Z');
      mockPrisma.tenant.findMany.mockResolvedValue([
        { ...baseTenant, id: 't-1', subscription: { activatedAt, payments: [{ paid: true }] } },
        { ...baseTenant, id: 't-2', subscription: { activatedAt, payments: [] } },
      ]);

      const result = await service.getList({ paid: 'overdue' });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].tenantId).toBe('t-2');
    });

    it('paginates the filtered result set', async () => {
      const activatedAt = new Date('2026-01-01T00:00:00.000Z');
      const tenants = Array.from({ length: 25 }, (_, i) => ({
        ...baseTenant,
        id: `t-${i}`,
        subscription: { activatedAt, payments: [] },
      }));
      mockPrisma.tenant.findMany.mockResolvedValue(tenants);

      const result = await service.getList({ page: 2, limit: 20 });

      expect(result.data).toHaveLength(5);
      expect(result.pagination).toEqual({ page: 2, limit: 20, total: 25, totalPages: 2 });
    });
  });
});
