import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BillingPaymentsService } from './billing-payments.service';
import { BillingConfigService } from './billing-config.service';
import { BillingAuditService } from './billing-audit.service';
import { BillingResubscribeService } from './billing-resubscribe.service';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

const m = (y: number, mo: number, d: number) => new Date(Date.UTC(y, mo - 1, d) - 8 * 60 * 60 * 1000);
const at = (y: number, mo: number, d: number, h = 10) => new Date(m(y, mo, d).getTime() + h * 3600_000);

const invoice = {
  id: 'inv-1',
  number: 'KSF-202610-ABCDE',
  tenantId: 't-1',
  subscriptionId: 'sub-1',
  status: 'OPEN',
  periodStart: m(2026, 10, 16),
  periodEnd: m(2026, 11, 16),
  dueAt: m(2026, 10, 16),
  amountCentavos: 150000,
  graceExtendedUntil: null,
};
const sub = { id: 'sub-1', tenantId: 't-1', nextBillingAt: m(2026, 11, 16), graceDaysOverride: null, anchorDay: 16 };

const mockPrisma: any = {
  billingInvoice: { findUnique: jest.fn(), updateMany: jest.fn(), update: jest.fn(), findFirst: jest.fn() },
  billingPaymentAttempt: { update: jest.fn() },
  billingPaymentClaim: { updateMany: jest.fn() },
  storeSubscription: { findUnique: jest.fn(), update: jest.fn() },
  subscriptionPayment: { findUnique: jest.fn(), upsert: jest.fn() },
  billingPayment: { create: jest.fn(), aggregate: jest.fn(), findFirst: jest.fn() },
};
mockPrisma.$transaction = jest.fn(async (fn: (tx: any) => unknown) => fn(mockPrisma));
const mockConfig = { get: jest.fn(async () => ({ defaultGraceDays: 7 })) };
const mockAudit = { log: jest.fn() };
const mockResubscribe = { reactivateAfterPayment: jest.fn() };

const webhookInput = (over: Record<string, unknown> = {}) => ({
  invoiceId: 'inv-1',
  source: 'WEBHOOK' as const,
  method: 'QRPH' as const,
  amountCentavos: 150000,
  paidAt: at(2026, 10, 18),
  reference: 'pay_123',
  providerIntentId: 'pi_123',
  ...over,
});

describe('BillingPaymentsService', () => {
  let service: BillingPaymentsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.billingInvoice.findUnique.mockResolvedValue({ ...invoice });
    mockPrisma.billingInvoice.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.storeSubscription.findUnique.mockResolvedValue({ ...sub });
    mockPrisma.subscriptionPayment.findUnique.mockResolvedValue(null);
    mockPrisma.billingPayment.create.mockImplementation(async ({ data }: any) => ({ id: 'pay-row', ...data }));
    mockPrisma.billingPayment.findFirst.mockResolvedValue(null);
    mockPrisma.billingInvoice.findFirst.mockResolvedValue(null);
    mockPrisma.billingPaymentClaim.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: any) => unknown) => fn(mockPrisma));
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingPaymentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: BillingConfigService, useValue: mockConfig },
        { provide: BillingAuditService, useValue: mockAudit },
        { provide: BillingResubscribeService, useValue: mockResubscribe },
      ],
    }).compile();
    service = module.get(BillingPaymentsService);
  });

  describe('recordPayment', () => {
    it('marks the OPEN invoice PAID, extends paid-through, advances next billing, upserts the ledger month', async () => {
      const res = await service.recordPayment(webhookInput());
      expect(res).toEqual({ applied: true, paymentId: 'pay-row' });
      expect(mockPrisma.billingInvoice.updateMany).toHaveBeenCalledWith({
        where: { id: 'inv-1', status: 'OPEN' },
        data: { status: 'PAID', paidAt: at(2026, 10, 18), paymentMethod: 'QRPH' },
      });
      expect(mockPrisma.storeSubscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: { nextBillingAt: m(2026, 11, 16), paidThroughAt: m(2026, 11, 15) },
      });
      expect(mockPrisma.subscriptionPayment.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { subscriptionId_month: { subscriptionId: 'sub-1', month: m(2026, 10, 1) } },
          create: expect.objectContaining({ paid: true, note: 'Invoice KSF-202610-ABCDE (QRPH)' }),
        }),
      );
      expect(mockPrisma.billingPayment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ invoiceId: 'inv-1', source: 'WEBHOOK', method: 'QRPH', flagged: false, reference: 'pay_123' }),
      });
      expect(mockAudit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'payment.record', tenantId: 't-1' }));
    });

    it('paying an older invoice after a later period was paid keeps paid-through and next billing ahead', async () => {
      // Nov 16 – Dec 15 was already paid; this is the Oct 16 – Nov 15 invoice paid late (within grace)
      mockPrisma.storeSubscription.findUnique.mockResolvedValue({ ...sub, nextBillingAt: m(2026, 11, 16), paidThroughAt: m(2026, 12, 15) });
      await service.recordPayment(webhookInput());
      expect(mockPrisma.storeSubscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: { nextBillingAt: m(2026, 12, 16), paidThroughAt: m(2026, 12, 15) },
      });
    });

    it('a second recordPayment for the same invoice is flagged and changes nothing else', async () => {
      mockPrisma.billingInvoice.updateMany.mockResolvedValue({ count: 0 });
      const res = await service.recordPayment(webhookInput());
      expect(res.applied).toBe(false);
      expect(mockPrisma.billingPayment.create).toHaveBeenCalledWith({ data: expect.objectContaining({ flagged: true }) });
      expect(mockPrisma.storeSubscription.update).not.toHaveBeenCalled();
      expect(mockPrisma.subscriptionPayment.upsert).not.toHaveBeenCalled();
      expect(mockAudit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'payment.flagged' }));
    });

    it('asks to reactivate the store once a payment is applied (resubscribe)', async () => {
      await service.recordPayment(webhookInput({ actorUserId: 'admin-1' }));
      expect(mockResubscribe.reactivateAfterPayment).toHaveBeenCalledWith('t-1', 'admin-1');
    });

    it('never reactivates on a flagged (not applied) payment', async () => {
      mockPrisma.billingInvoice.updateMany.mockResolvedValue({ count: 0 });
      await service.recordPayment(webhookInput());
      expect(mockResubscribe.reactivateAfterPayment).not.toHaveBeenCalled();
    });

    it('keeps the payment when reactivating fails', async () => {
      mockResubscribe.reactivateAfterPayment.mockRejectedValueOnce(new Error('db down'));
      const res = await service.recordPayment(webhookInput());
      expect(res).toEqual({ applied: true, paymentId: 'pay-row' });
    });

    it('concurrent recordPayment for one invoice applies once', async () => {
      mockPrisma.billingInvoice.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
      const results = await Promise.all([service.recordPayment(webhookInput()), service.recordPayment(webhookInput())]);
      expect(results.filter(r => r.applied)).toHaveLength(1);
      expect(mockPrisma.storeSubscription.update).toHaveBeenCalledTimes(1);
    });

    it('re-anchors when paid after grace even with enforcement off', async () => {
      await service.recordPayment(webhookInput({ paidAt: at(2026, 11, 3) }));
      expect(mockPrisma.billingInvoice.update).toHaveBeenCalledWith({
        where: { id: 'inv-1' },
        data: { periodStart: m(2026, 11, 3), periodEnd: m(2026, 12, 3) },
      });
      expect(mockPrisma.storeSubscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: { nextBillingAt: m(2026, 12, 3), anchorDay: 3, paidThroughAt: m(2026, 12, 2) },
      });
    });

    describe('paid at the end of the month (billedInArrears)', () => {
      // The Dec 10 bill covers Nov 10 – Dec 9; the scheduler already moved next billing to Jan 10
      const arrearsInvoice = { ...invoice, periodStart: m(2026, 11, 10), periodEnd: m(2026, 12, 10), dueAt: m(2026, 12, 10) };
      beforeEach(() => {
        mockPrisma.billingInvoice.findUnique.mockResolvedValue({ ...arrearsInvoice });
        mockPrisma.storeSubscription.findUnique.mockResolvedValue({ ...sub, billedInArrears: true, nextBillingAt: m(2027, 1, 10), anchorDay: 10 });
      });

      it('paying on time covers the month used and keeps the next bill a month later', async () => {
        await service.recordPayment(webhookInput({ paidAt: at(2026, 12, 11) }));
        expect(mockPrisma.billingInvoice.update).not.toHaveBeenCalled();
        expect(mockPrisma.storeSubscription.update).toHaveBeenCalledWith({
          where: { id: 'sub-1' },
          data: { nextBillingAt: m(2027, 1, 10), paidThroughAt: m(2026, 12, 9) },
        });
      });

      it('paying early (reminder window) gives the same dates', async () => {
        await service.recordPayment(webhookInput({ paidAt: at(2026, 12, 5) }));
        expect(mockPrisma.storeSubscription.update).toHaveBeenCalledWith({
          where: { id: 'sub-1' },
          data: { nextBillingAt: m(2027, 1, 10), paidThroughAt: m(2026, 12, 9) },
        });
      });

      it('paying after grace keeps the month used and starts the next month on the payment day', async () => {
        await service.recordPayment(webhookInput({ paidAt: at(2026, 12, 20) }));
        expect(mockPrisma.billingInvoice.update).not.toHaveBeenCalled();
        expect(mockPrisma.storeSubscription.update).toHaveBeenCalledWith({
          where: { id: 'sub-1' },
          data: { nextBillingAt: m(2027, 1, 20), anchorDay: 20, paidThroughAt: m(2026, 12, 9) },
        });
      });
    });

    it('paid during grace keeps the original period', async () => {
      await service.recordPayment(webhookInput({ paidAt: at(2026, 10, 22) }));
      expect(mockPrisma.billingInvoice.update).not.toHaveBeenCalled();
    });

    it('honors a grace extension when deciding whether to re-anchor', async () => {
      mockPrisma.billingInvoice.findUnique.mockResolvedValue({ ...invoice, graceExtendedUntil: m(2026, 11, 10) });
      await service.recordPayment(webhookInput({ paidAt: at(2026, 11, 3) }));
      expect(mockPrisma.billingInvoice.update).not.toHaveBeenCalled();
    });

    it('an amount mismatch is applied and marked as a mismatch, not as unapplied', async () => {
      const res = await service.recordPayment(webhookInput({ amountCentavos: 100000 }));
      expect(res.applied).toBe(true);
      expect(mockPrisma.billingPayment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ flagged: false, amountMismatch: true }),
      });
    });

    it('appends to an existing ledger note', async () => {
      mockPrisma.subscriptionPayment.findUnique.mockResolvedValue({ note: 'Paid cash to Ana' });
      await service.recordPayment(webhookInput());
      expect(mockPrisma.subscriptionPayment.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: expect.objectContaining({ note: 'Paid cash to Ana · Invoice KSF-202610-ABCDE (QRPH)' }) }),
      );
    });

    it('a webhook after reconcile already applied the same intent writes no flagged row', async () => {
      mockPrisma.billingInvoice.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.billingPayment.findFirst.mockResolvedValue({ id: 'bp-reconcile' });
      const res = await service.recordPayment(webhookInput());
      expect(mockPrisma.billingPayment.findFirst).toHaveBeenCalledWith({
        where: { invoiceId: 'inv-1', providerIntentId: 'pi_123', flagged: false },
      });
      expect(res).toEqual({ applied: false, duplicate: true, paymentId: 'bp-reconcile' });
      expect(mockPrisma.billingPayment.create).not.toHaveBeenCalled();
    });

    it('marks the QR attempt succeeded inside the same transaction', async () => {
      await service.recordPayment(webhookInput({ attemptId: 'att-1' }));
      expect(mockPrisma.billingPaymentAttempt.update).toHaveBeenCalledWith({ where: { id: 'att-1' }, data: { status: 'succeeded' } });
    });

    it('retries a Mongo write conflict (P2034) and then dedupes', async () => {
      const conflict = new Prisma.PrismaClientKnownRequestError('Write conflict', { code: 'P2034', clientVersion: 'test' });
      mockPrisma.$transaction.mockRejectedValueOnce(conflict).mockImplementation(async (fn: (tx: any) => unknown) => fn(mockPrisma));
      mockPrisma.billingInvoice.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.billingPayment.findFirst.mockResolvedValue({ id: 'bp-other' });
      await expect(service.recordPayment(webhookInput())).resolves.toEqual({ applied: false, duplicate: true, paymentId: 'bp-other' });
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
    });

    it('approves a claim atomically with the payment (claimId)', async () => {
      await service.recordPayment(webhookInput({ source: 'MANUAL', method: 'MANUAL', providerIntentId: null, claimId: 'cl-1', actorUserId: 'admin-1' }));
      expect(mockPrisma.billingPaymentClaim.updateMany).toHaveBeenCalledWith({
        where: { id: 'cl-1', status: 'PENDING' },
        data: { status: 'APPROVED', reviewedById: 'admin-1', reviewedAt: expect.any(Date) },
      });
    });

    it('a claim approved twice concurrently fails the second time without a payment', async () => {
      mockPrisma.billingPaymentClaim.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.recordPayment(webhookInput({ source: 'MANUAL', method: 'MANUAL', providerIntentId: null, claimId: 'cl-1' })),
      ).rejects.toThrow(new BadRequestException('This claim was already reviewed'));
      expect(mockPrisma.billingPayment.create).not.toHaveBeenCalled();
    });

    it('404s for an unknown invoice', async () => {
      mockPrisma.billingInvoice.findUnique.mockResolvedValue(null);
      await expect(service.recordPayment(webhookInput())).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('markPaid on a non-open invoice', () => {
    it('400s instead of writing a flagged row', async () => {
      mockPrisma.billingInvoice.findUnique.mockResolvedValue({ ...invoice, status: 'PAID' });
      await expect(service.markPaid('inv-1', { manualMethod: 'cash' }, 'admin-1')).rejects.toThrow(
        new BadRequestException('Only open invoices can be changed'),
      );
      expect(mockPrisma.billingPayment.create).not.toHaveBeenCalled();
    });
  });

  describe('markPaid', () => {
    it('records a MANUAL payment for the invoice amount', async () => {
      await service.markPaid('inv-1', { manualMethod: 'cash', reference: 'OR-1', note: 'at office' }, 'admin-1');
      expect(mockPrisma.billingPayment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ source: 'MANUAL', method: 'MANUAL', manualMethod: 'cash', amountCentavos: 150000, recordedById: 'admin-1' }),
      });
    });
  });

  describe('recordPrepayment', () => {
    beforeEach(() => mockPrisma.storeSubscription.findUnique.mockResolvedValue({ ...sub, nextBillingAt: m(2026, 10, 25) }));

    it('sets the override + paid-through and marks monthsCovered ledger months', async () => {
      await service.recordPrepayment(
        't-1',
        { amountCentavos: 450000, monthsCovered: 3, paidThroughAt: '2026-12-31', nextBillingAt: '2027-01-01', manualMethod: 'bank_transfer', reference: 'BT-9' },
        'admin-1',
      );
      expect(mockPrisma.billingPayment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ invoiceId: null, source: 'PREPAYMENT', method: 'PREPAID', monthsCovered: 3, amountCentavos: 450000 }),
      });
      expect(mockPrisma.storeSubscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: { paidThroughAt: m(2026, 12, 31), nextBillingAt: m(2027, 1, 1), nextBillingOverridden: true, anchorDay: 1 },
      });
      const months = mockPrisma.subscriptionPayment.upsert.mock.calls.map((c: any) => c[0].create.month.toISOString());
      expect(months).toEqual([m(2026, 12, 1), m(2026, 11, 1), m(2026, 10, 1)].map(d => d.toISOString()));
    });

    it('400s while the store has an open invoice', async () => {
      mockPrisma.billingInvoice.findFirst.mockResolvedValue({ id: 'inv-1', status: 'OPEN' });
      await expect(
        service.recordPrepayment('t-1', { amountCentavos: 1, monthsCovered: 1, paidThroughAt: '2026-12-31', nextBillingAt: '2027-01-01', manualMethod: 'cash' }, 'admin-1'),
      ).rejects.toThrow(new BadRequestException('This store has an open invoice — mark it paid, waive or void it first'));
    });

    it('rejects a next billing date on or before paid-through', async () => {
      await expect(
        service.recordPrepayment('t-1', { amountCentavos: 1, monthsCovered: 1, paidThroughAt: '2026-12-31', nextBillingAt: '2026-12-31', manualMethod: 'cash' }, 'admin-1'),
      ).rejects.toThrow(new BadRequestException('Next billing date must be after the paid-through date'));
    });

    it('404s when the store has no subscription', async () => {
      mockPrisma.storeSubscription.findUnique.mockResolvedValue(null);
      await expect(
        service.recordPrepayment('t-1', { amountCentavos: 1, monthsCovered: 1, paidThroughAt: '2026-12-31', nextBillingAt: '2027-01-01', manualMethod: 'cash' }, 'admin-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  it('qrphCollectedThisMonth sums only non-flagged QRPH in the Manila month', async () => {
    mockPrisma.billingPayment.aggregate.mockResolvedValue({ _sum: { amountCentavos: 300000 } });
    await expect(service.qrphCollectedThisMonth(at(2026, 11, 15))).resolves.toBe(300000);
    expect(mockPrisma.billingPayment.aggregate).toHaveBeenCalledWith({
      _sum: { amountCentavos: true },
      where: { method: 'QRPH', flagged: false, paidAt: { gte: m(2026, 11, 1), lte: new Date(m(2026, 12, 1).getTime() - 1) } },
    });
  });
});
