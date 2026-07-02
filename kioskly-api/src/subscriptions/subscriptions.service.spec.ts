import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
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

  describe('getDetail', () => {
    it('throws NotFoundException when the tenant does not exist', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(null);
      await expect(service.getDetail('missing')).rejects.toThrow(NotFoundException);
    });

    it('returns an empty months list when the store has no subscription', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: 't-1',
        name: 'Downtown',
        slug: 'downtown',
        company: { id: 'c-1', name: 'Acme Co' },
        brand: { id: 'b-1', name: 'Mango Cafe' },
        subscription: null,
      });

      const result = await service.getDetail('t-1');

      expect(result.activatedAt).toBeNull();
      expect(result.months).toEqual([]);
    });

    it('builds the rolling checklist when activated', async () => {
      const activatedAt = new Date('2026-06-01T00:00:00.000Z');
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: 't-1',
        name: 'Downtown',
        slug: 'downtown',
        company: { id: 'c-1', name: 'Acme Co' },
        brand: { id: 'b-1', name: 'Mango Cafe' },
        subscription: { activatedAt, payments: [] },
      });

      const result = await service.getDetail('t-1');

      expect(result.activatedAt).toEqual(activatedAt);
      expect(result.months.length).toBeGreaterThan(0);
      expect(result.months[0].month).toBe('2026-06');
    });
  });

  describe('setActivation', () => {
    it('throws NotFoundException when the tenant does not exist', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(null);
      await expect(service.setActivation('missing', '2026-01-15')).rejects.toThrow(NotFoundException);
    });

    it('upserts the StoreSubscription with the parsed activation date', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: 't-1' });
      const upserted = { id: 'sub-1', tenantId: 't-1', activatedAt: new Date('2026-01-15') };
      mockPrisma.storeSubscription.upsert.mockResolvedValue(upserted);

      const result = await service.setActivation('t-1', '2026-01-15');

      expect(mockPrisma.storeSubscription.upsert).toHaveBeenCalledWith({
        where: { tenantId: 't-1' },
        update: { activatedAt: new Date('2026-01-15') },
        create: { tenantId: 't-1', activatedAt: new Date('2026-01-15') },
      });
      expect(result).toEqual(upserted);
    });

    it('clears activation when passed null', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: 't-1' });
      mockPrisma.storeSubscription.upsert.mockResolvedValue({ id: 'sub-1', tenantId: 't-1', activatedAt: null });

      await service.setActivation('t-1', null);

      expect(mockPrisma.storeSubscription.upsert).toHaveBeenCalledWith({
        where: { tenantId: 't-1' },
        update: { activatedAt: null },
        create: { tenantId: 't-1', activatedAt: null },
      });
    });
  });

  describe('upsertPayment', () => {
    it('throws BadRequestException for a malformed month', async () => {
      await expect(service.upsertPayment('t-1', '2026-13', { paid: true })).rejects.toThrow(BadRequestException);
      await expect(service.upsertPayment('t-1', 'not-a-month', { paid: true })).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when the store has no subscription yet', async () => {
      mockPrisma.storeSubscription.findUnique.mockResolvedValue(null);
      await expect(service.upsertPayment('t-1', '2026-02', { paid: true })).rejects.toThrow(NotFoundException);
    });

    it('upserts a paid payment and sets paidAt', async () => {
      mockPrisma.storeSubscription.findUnique.mockResolvedValue({ id: 'sub-1', tenantId: 't-1' });
      const upserted = { id: 'pay-1', subscriptionId: 'sub-1', paid: true };
      mockPrisma.subscriptionPayment.upsert.mockResolvedValue(upserted);

      const result = await service.upsertPayment('t-1', '2026-02', { paid: true, note: 'Bank transfer' });

      expect(mockPrisma.subscriptionPayment.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { subscriptionId_month: expect.objectContaining({ subscriptionId: 'sub-1' }) },
          update: expect.objectContaining({ paid: true, note: 'Bank transfer' }),
          create: expect.objectContaining({ subscriptionId: 'sub-1', paid: true, note: 'Bank transfer' }),
        }),
      );
      expect(result).toEqual(upserted);
    });

    it('clears paidAt when marking a month unpaid', async () => {
      mockPrisma.storeSubscription.findUnique.mockResolvedValue({ id: 'sub-1', tenantId: 't-1' });
      mockPrisma.subscriptionPayment.upsert.mockResolvedValue({ id: 'pay-1', paid: false });

      await service.upsertPayment('t-1', '2026-02', { paid: false });

      expect(mockPrisma.subscriptionPayment.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ paid: false, paidAt: null, note: null }),
        }),
      );
    });
  });
});
