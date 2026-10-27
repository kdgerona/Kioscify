import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BillingSettingsService } from './billing-settings.service';
import { BillingStatusService } from './billing-status.service';
import { BillingConfigService } from './billing-config.service';
import { BillingAuditService } from './billing-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { BillingPaymentsService } from './billing-payments.service';
import { DEFAULT_BILLING_CONFIG } from '../common/utils/billing-status.util';

const m = (y: number, mo: number, d: number) => new Date(Date.UTC(y, mo - 1, d) - 8 * 60 * 60 * 1000);

const baseSub = {
  id: 'sub-1',
  tenantId: 't-1',
  activatedAt: m(2025, 1, 10),
  billingEnabled: null,
  exemptReason: null,
  priceCentavos: null,
  trialStartAt: null,
  trialDays: null,
  anchorDay: null,
  nextBillingAt: null,
  nextBillingOverridden: null,
  paidThroughAt: null,
  graceDaysOverride: null,
};

const tenantRow = (id: string, name: string, subscription: any, isActive = true) => ({
  id,
  name,
  isActive,
  deactivatedAt: isActive ? null : m(2026, 10, 5),
  slug: name.toLowerCase(),
  company: { id: 'c-1', name: 'Acme Co' },
  brand: { id: 'b-1', name: 'Mango Cafe' },
  subscription,
});

const subs = new Map<string, any>();

const mockPrisma = {
  tenant: { findUnique: jest.fn(), findMany: jest.fn() },
  storeSubscription: {
    findUnique: jest.fn(async ({ where }) => subs.get(where.tenantId) ?? null),
    upsert: jest.fn(async ({ where, update, create }) => {
      const next = subs.has(where.tenantId) ? { ...subs.get(where.tenantId), ...update } : { ...baseSub, ...create };
      subs.set(where.tenantId, next);
      return next;
    }),
  },
  subscriptionPayment: { findMany: jest.fn() },
  billingInvoice: { count: jest.fn(), findMany: jest.fn(), aggregate: jest.fn() },
  billingPayment: { findMany: jest.fn(), aggregate: jest.fn() },
  billingPaymentAttempt: { findMany: jest.fn() },
  billingPaymentClaim: { findMany: jest.fn(), count: jest.fn() },
};
const mockPayments = { qrphCollectedThisMonth: jest.fn(async () => 0) };
const mockConfig = {
  get: jest.fn(async () => ({ ...DEFAULT_BILLING_CONFIG })),
  toStatusConfig: jest.fn(() => ({ ...DEFAULT_BILLING_CONFIG })),
};
const mockAudit = { log: jest.fn(), list: jest.fn(async () => []) };
const mockStatus = {
  forTenant: jest.fn(async () => ({ status: 'EXEMPT' })),
  forTenants: jest.fn(),
};

describe('BillingSettingsService', () => {
  let service: BillingSettingsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(m(2026, 10, 24));
    subs.clear();
    mockPrisma.tenant.findUnique.mockImplementation(async ({ where }) =>
      ['t-1', 't-2'].includes(where.id) ? tenantRow(where.id, 'Downtown', subs.get(where.id) ?? null) : null,
    );
    mockPrisma.subscriptionPayment.findMany.mockResolvedValue([]);
    mockPrisma.billingInvoice.count.mockResolvedValue(0);
    for (const fn of [
      mockPrisma.billingInvoice.findMany,
      mockPrisma.billingPayment.findMany,
      mockPrisma.billingPaymentAttempt.findMany,
      mockPrisma.billingPaymentClaim.findMany,
    ]) fn.mockResolvedValue([]);
    mockPrisma.billingInvoice.aggregate.mockResolvedValue({ _sum: { amountCentavos: null } });
    mockPrisma.billingPayment.aggregate.mockResolvedValue({ _sum: { amountCentavos: null } });
    mockPrisma.billingPaymentClaim.count.mockResolvedValue(0);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingSettingsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: BillingConfigService, useValue: mockConfig },
        { provide: BillingAuditService, useValue: mockAudit },
        { provide: BillingStatusService, useValue: mockStatus },
        { provide: BillingPaymentsService, useValue: mockPayments },
      ],
    }).compile();
    service = module.get(BillingSettingsService);
  });

  afterEach(() => jest.useRealTimers());

  describe('updateStoreBilling', () => {
    it('404s for an unknown store', async () => {
      await expect(service.updateStoreBilling('nope', { priceCentavos: 1 }, 'admin-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('enable without price → "Set a monthly price before enabling billing"', async () => {
      subs.set('t-1', { ...baseSub });
      await expect(service.updateStoreBilling('t-1', { billingEnabled: true }, 'admin-1')).rejects.toThrow(
        new BadRequestException('Set a monthly price before enabling billing'),
      );
      expect(mockPrisma.storeSubscription.upsert).not.toHaveBeenCalled();
    });

    it('enable without activation → "Set an activation date before enabling billing"', async () => {
      subs.set('t-1', { ...baseSub, activatedAt: null, priceCentavos: 150000 });
      await expect(service.updateStoreBilling('t-1', { billingEnabled: true }, 'admin-1')).rejects.toThrow(
        new BadRequestException('Set an activation date before enabling billing'),
      );
    });

    it('disable without reason → "An exemption reason is required"', async () => {
      subs.set('t-1', { ...baseSub });
      await expect(service.updateStoreBilling('t-1', { billingEnabled: false }, 'admin-1')).rejects.toThrow(
        new BadRequestException('An exemption reason is required'),
      );
    });

    it('re-enabling clears the old exemption reason, so exempting again needs a new one', async () => {
      subs.set('t-1', { ...baseSub, priceCentavos: 150000, billingEnabled: false, exemptReason: 'Owner store' });
      await service.updateStoreBilling('t-1', { billingEnabled: true }, 'admin-1');
      expect(subs.get('t-1')).toMatchObject({ billingEnabled: true, exemptReason: null });
      await expect(service.updateStoreBilling('t-1', { billingEnabled: false }, 'admin-1')).rejects.toThrow(
        new BadRequestException('An exemption reason is required'),
      );
    });

    it('creates the subscription row when missing', async () => {
      await service.updateStoreBilling('t-1', { priceCentavos: 150000 }, 'admin-1');
      expect(subs.get('t-1')).toMatchObject({ tenantId: 't-1', priceCentavos: 150000 });
    });

    it('enable on a legacy store derives nextBillingAt from the paid ledger run', async () => {
      subs.set('t-1', { ...baseSub, priceCentavos: 150000 });
      mockPrisma.subscriptionPayment.findMany.mockResolvedValue([{ month: m(2026, 10, 1) }, { month: m(2026, 11, 1) }]);
      await service.updateStoreBilling('t-1', { billingEnabled: true }, 'admin-1');
      expect(mockPrisma.subscriptionPayment.findMany).toHaveBeenCalledWith({
        where: { subscriptionId: 'sub-1', paid: true },
        select: { month: true },
      });
      expect(subs.get('t-1')).toMatchObject({
        billingEnabled: true,
        nextBillingAt: m(2026, 12, 1),
        paidThroughAt: m(2026, 11, 30),
        anchorDay: 1,
      });
    });

    it('does not re-derive once invoices exist', async () => {
      subs.set('t-1', { ...baseSub, priceCentavos: 150000, billingEnabled: true, nextBillingAt: m(2026, 11, 5), anchorDay: 5 });
      mockPrisma.billingInvoice.count.mockResolvedValue(1);
      await service.updateStoreBilling('t-1', { trialDays: 30 }, 'admin-1');
      expect(subs.get('t-1').nextBillingAt).toEqual(m(2026, 11, 5));
    });

    it('explicit nextBillingAt sets the override and wins over derivation', async () => {
      subs.set('t-1', { ...baseSub, priceCentavos: 150000 });
      await service.updateStoreBilling('t-1', { billingEnabled: true, nextBillingAt: '2027-03-01' }, 'admin-1');
      expect(subs.get('t-1')).toMatchObject({ nextBillingAt: m(2027, 3, 1), nextBillingOverridden: true });
    });

    it('clearing the override re-derives the date', async () => {
      subs.set('t-1', { ...baseSub, priceCentavos: 150000, billingEnabled: true, nextBillingAt: m(2027, 3, 1), nextBillingOverridden: true });
      await service.updateStoreBilling('t-1', { nextBillingAt: null }, 'admin-1');
      expect(subs.get('t-1')).toMatchObject({ nextBillingOverridden: false, nextBillingAt: m(2026, 10, 25) });
    });

    it('price change does not touch nextBillingAt', async () => {
      subs.set('t-1', { ...baseSub, priceCentavos: 150000, billingEnabled: true, nextBillingAt: m(2026, 11, 5), anchorDay: 5 });
      await service.updateStoreBilling('t-1', { priceCentavos: 200000 }, 'admin-1');
      expect(subs.get('t-1')).toMatchObject({ priceCentavos: 200000, nextBillingAt: m(2026, 11, 5) });
    });

    it('audit row records only changed fields', async () => {
      subs.set('t-1', { ...baseSub, priceCentavos: 150000 });
      await service.updateStoreBilling('t-1', { priceCentavos: 200000, graceDaysOverride: null }, 'admin-1');
      expect(mockAudit.log).toHaveBeenCalledWith({
        tenantId: 't-1',
        actorUserId: 'admin-1',
        action: 'settings.update',
        before: { priceCentavos: 150000 },
        after: { priceCentavos: 200000 },
      });
    });
  });

  describe('preview and enable agree', () => {
    it('an existing override is shown by the preview and kept by enable', async () => {
      subs.set('t-1', { ...baseSub, priceCentavos: 150000, nextBillingAt: m(2027, 2, 1), nextBillingOverridden: true });
      const preview = await service.enablePreview('t-1');
      expect(preview.nextBillingAt).toEqual(m(2027, 2, 1));
      await service.updateStoreBilling('t-1', { billingEnabled: true }, 'admin-1');
      expect(subs.get('t-1').nextBillingAt).toEqual(preview.nextBillingAt);
    });

    it('a stored anchor day gives the same date in preview and enable', async () => {
      subs.set('t-1', { ...baseSub, priceCentavos: 150000, anchorDay: 20 });
      const preview = await service.enablePreview('t-1');
      await service.updateStoreBilling('t-1', { billingEnabled: true }, 'admin-1');
      expect(subs.get('t-1').nextBillingAt).toEqual(preview.nextBillingAt);
      expect(subs.get('t-1').anchorDay).toBe(preview.anchorDay);
    });

    it('editing the first invoice date in the dialog still saves the honored paid-through', async () => {
      subs.set('t-1', { ...baseSub, priceCentavos: 150000 });
      mockPrisma.subscriptionPayment.findMany.mockResolvedValue([{ month: m(2026, 10, 1) }, { month: m(2026, 11, 1) }]);
      const preview = await service.enablePreview('t-1');
      expect(preview.paidThroughAt).toEqual(m(2026, 11, 30));
      await service.updateStoreBilling('t-1', { billingEnabled: true, nextBillingAt: '2026-12-05' }, 'admin-1');
      expect(subs.get('t-1')).toMatchObject({
        nextBillingAt: m(2026, 12, 5),
        nextBillingOverridden: true,
        paidThroughAt: m(2026, 11, 30),
        anchorDay: 5,
      });
    });
  });

  describe('bulkUpdate', () => {
    it('bulk update reports per-store failures and leaves failed stores untouched', async () => {
      subs.set('t-1', { ...baseSub, priceCentavos: 150000 });
      subs.set('t-2', { ...baseSub, id: 'sub-2', tenantId: 't-2' });
      const res = await service.bulkUpdate(['t-1', 't-2'], { billingEnabled: true }, 'admin-1');
      expect(res).toEqual([
        { tenantId: 't-1', ok: true },
        { tenantId: 't-2', ok: false, error: 'Set a monthly price before enabling billing' },
      ]);
      expect(subs.get('t-2').billingEnabled).toBeNull();
      expect(mockPrisma.storeSubscription.upsert).toHaveBeenCalledTimes(1);
    });
  });

  describe('enablePreview', () => {
    it('requires an activation date', async () => {
      subs.set('t-1', { ...baseSub, activatedAt: null });
      await expect(service.enablePreview('t-1')).rejects.toThrow('Set an activation date before enabling billing');
    });

    it('returns derived dates without saving', async () => {
      subs.set('t-1', { ...baseSub });
      const r = await service.enablePreview('t-1');
      expect(r.nextBillingAt).toEqual(m(2026, 10, 25));
      expect(mockPrisma.storeSubscription.upsert).not.toHaveBeenCalled();
    });
  });

  describe('listStores / overview', () => {
    beforeEach(() => {
      mockPrisma.tenant.findMany.mockResolvedValue([
        tenantRow('t-1', 'Downtown', { ...baseSub, billingEnabled: true, priceCentavos: 150000, nextBillingAt: m(2026, 10, 28), payments: [] }),
        tenantRow('t-2', 'Uptown', { ...baseSub, id: 'sub-2', tenantId: 't-2', billingEnabled: false, exemptReason: 'Owner store', payments: [{ paidAt: m(2026, 9, 3) }] }),
        tenantRow('t-3', 'Harbor', null),
      ]);
      mockStatus.forTenants.mockResolvedValue(
        new Map([
          ['t-1', { status: 'ACTIVE', daysOverdue: null, paidThroughAt: null, nextBillingAt: m(2026, 10, 28) }],
          ['t-2', { status: 'EXEMPT', daysOverdue: null, paidThroughAt: null, nextBillingAt: null }],
          ['t-3', { status: 'EXEMPT', daysOverdue: null, paidThroughAt: null, nextBillingAt: null }],
        ]),
      );
    });

    it('listStores filters by status and q', async () => {
      const byStatus = await service.listStores({ status: 'EXEMPT' });
      expect(byStatus.data.map(r => r.tenantId)).toEqual(['t-2']);
      const notSetUp = await service.listStores({ status: 'NOT_SET_UP' });
      expect(notSetUp.data.map(r => r.tenantId)).toEqual(['t-3']);
      const byQ = await service.listStores({ q: 'uptown' });
      expect(byQ.data.map(r => r.tenantId)).toEqual(['t-2']);
      expect(byQ.data[0]).toMatchObject({ exemptReason: 'Owner store', lastPaymentAt: m(2026, 9, 3) });
      expect(mockPrisma.tenant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tombstone: { not: 1 } }) }),
      );
    });

    it('overview counts NOT_SET_UP and uses preview config when global off', async () => {
      const r = await service.overview();
      expect(mockStatus.forTenants).toHaveBeenCalledWith(['t-1', 't-2', 't-3'], { previewEnabled: true });
      expect(r.globalBillingEnabled).toBe(false);
      expect(r.counts).toMatchObject({ ACTIVE: 1, EXEMPT: 1, NOT_SET_UP: 1 });
      expect(r.inactive).toBe(0);
      expect(r.upcomingNext7Days).toBe(1);
    });

    describe('inactive stores (store toggle off)', () => {
      beforeEach(() => {
        mockPrisma.tenant.findMany.mockResolvedValue([
          tenantRow('t-1', 'Downtown', { ...baseSub, billingEnabled: true, priceCentavos: 150000, nextBillingAt: m(2026, 10, 28), payments: [] }),
          tenantRow('t-4', 'Closed', { ...baseSub, id: 'sub-4', tenantId: 't-4', billingEnabled: true, priceCentavos: 150000, nextBillingAt: m(2026, 10, 30), payments: [] }, false),
        ]);
        mockStatus.forTenants.mockResolvedValue(
          new Map([
            ['t-1', { status: 'ACTIVE', daysOverdue: null, paidThroughAt: null, nextBillingAt: m(2026, 10, 28) }],
            ['t-4', { status: 'LOCKED', daysOverdue: 9, paidThroughAt: null, nextBillingAt: m(2026, 10, 30) }],
          ]),
        );
      });

      it('are left out of the default list and listed on their own with inactive', async () => {
        const active = await service.listStores({});
        expect(active.data.map(r => r.tenantId)).toEqual(['t-1']);
        expect(active.pagination.total).toBe(1);

        const inactive = await service.listStores({ inactive: true });
        expect(inactive.data.map(r => r.tenantId)).toEqual(['t-4']);
        expect(inactive.data[0]).toMatchObject({ isActive: false, deactivatedAt: m(2026, 10, 5), status: 'LOCKED' });
      });

      it('still honour the other filters inside the inactive list', async () => {
        expect((await service.listStores({ inactive: true, status: 'ACTIVE' })).data).toEqual([]);
        expect((await service.listStores({ inactive: true, q: 'closed' })).data.map(r => r.tenantId)).toEqual(['t-4']);
      });

      it('are counted apart from the status cards but still in upcoming invoices', async () => {
        const r = await service.overview();
        expect(r.counts).toMatchObject({ ACTIVE: 1, LOCKED: 0 });
        expect(r.inactive).toBe(1);
        // They are still invoiced, so their next bill stays in the upcoming count
        expect(r.upcomingNext7Days).toBe(2);
      });
    });
  });

  describe('money and history', () => {
    it('overview money sums expected/collected/outstanding in the Manila month and sets limitWarn', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([]);
      mockStatus.forTenants.mockResolvedValue(new Map());
      mockConfig.get.mockResolvedValue({ ...DEFAULT_BILLING_CONFIG, paymongoMonthlyLimitCentavos: 1000000, limitWarnPercent: 80 } as any);
      mockPrisma.billingInvoice.aggregate
        .mockResolvedValueOnce({ _sum: { amountCentavos: 600000 } }) // expected
        .mockResolvedValueOnce({ _sum: { amountCentavos: 150000 } }); // outstanding
      mockPrisma.billingPayment.aggregate.mockResolvedValueOnce({ _sum: { amountCentavos: 450000 } });
      mockPayments.qrphCollectedThisMonth.mockResolvedValueOnce(850000);
      mockPrisma.billingPaymentClaim.count.mockResolvedValueOnce(2);

      const r = await service.overview();
      expect(r.money).toEqual({
        expectedThisMonthCentavos: 600000,
        collectedThisMonthCentavos: 450000,
        outstandingCentavos: 150000,
        qrphCollectedThisMonthCentavos: 850000,
        limitCentavos: 1000000,
        limitPercent: 85,
        limitWarn: true,
        fallbackQrConfigured: false,
        pendingClaims: 2,
      });
      const [expectedCall, outstandingCall] = mockPrisma.billingInvoice.aggregate.mock.calls.map((c: any) => c[0].where);
      expect(expectedCall).toEqual({ status: { not: 'VOID' }, dueAt: { gte: m(2026, 10, 1), lte: new Date(m(2026, 11, 1).getTime() - 1) } });
      expect(outstandingCall).toEqual({ status: 'OPEN' });
      expect(mockPrisma.billingPayment.aggregate.mock.calls[0][0].where).toEqual({
        flagged: false,
        paidAt: { gte: m(2026, 10, 1), lte: new Date(m(2026, 11, 1).getTime() - 1) },
      });
    });

    it('getStoreBilling includes invoices, payments, attempts (without qrImage) and claims', async () => {
      subs.set('t-1', { ...baseSub });
      mockPrisma.billingInvoice.findMany.mockResolvedValue([{ id: 'inv-1' }]);
      mockPrisma.billingPayment.findMany.mockResolvedValue([{ id: 'bp-1' }]);
      mockPrisma.billingPaymentAttempt.findMany.mockResolvedValue([{ id: 'att-1' }]);
      mockPrisma.billingPaymentClaim.findMany.mockResolvedValue([{ id: 'cl-1' }]);
      const r = await service.getStoreBilling('t-1');
      expect(r).toMatchObject({ invoices: [{ id: 'inv-1' }], payments: [{ id: 'bp-1' }], attempts: [{ id: 'att-1' }], claims: [{ id: 'cl-1' }] });
      const attemptArgs = mockPrisma.billingPaymentAttempt.findMany.mock.calls[0][0];
      expect(attemptArgs.where).toEqual({ invoiceId: { in: ['inv-1'] } });
      expect(attemptArgs.select.qrImage).toBeUndefined();
      expect(attemptArgs.select.providerIntentId).toBe(true);
    });
  });
});
