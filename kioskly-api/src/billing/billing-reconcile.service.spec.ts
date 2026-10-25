import { Test, TestingModule } from '@nestjs/testing';
import { BillingReconcileService } from './billing-reconcile.service';
import { BillingPaymentsService } from './billing-payments.service';
import { PAYMENT_PROVIDER } from './providers/payment-provider.interface';
import { PrismaService } from '../prisma/prisma.service';

const now = new Date('2026-11-16T05:00:00.000Z');
const attempt = (over: Record<string, unknown> = {}) => ({
  id: 'att-1',
  invoiceId: 'inv-1',
  providerIntentId: 'pi_1',
  status: 'awaiting_payment',
  expiresAt: new Date(now.getTime() + 10 * 60_000),
  createdAt: new Date(now.getTime() - 20 * 60_000),
  ...over,
});

const mockPrisma = {
  billingInvoice: { findUnique: jest.fn() },
  billingPaymentAttempt: { findMany: jest.fn(), update: jest.fn() },
};
const mockProvider = { getChargeStatus: jest.fn() };
const mockPayments = { recordPayment: jest.fn(async () => ({ applied: true, paymentId: 'bp-1' })) };

describe('BillingReconcileService', () => {
  let service: BillingReconcileService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.billingInvoice.findUnique.mockResolvedValue({ id: 'inv-1', status: 'OPEN', amountCentavos: 150000 });
    mockPrisma.billingPaymentAttempt.findMany.mockResolvedValue([attempt()]);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingReconcileService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PAYMENT_PROVIDER, useValue: mockProvider },
        { provide: BillingPaymentsService, useValue: mockPayments },
      ],
    }).compile();
    service = module.get(BillingReconcileService);
  });

  it('a succeeded attempt records a RECONCILE payment', async () => {
    mockProvider.getChargeStatus.mockResolvedValue({ status: 'succeeded', paymentId: 'pay_1', amountCentavos: 150000, paidAt: now });
    await expect(service.reconcileInvoice('inv-1', now)).resolves.toEqual({ paid: true });
    expect(mockPrisma.billingPaymentAttempt.findMany).toHaveBeenCalledWith({
      where: { invoiceId: 'inv-1', status: 'awaiting_payment', createdAt: { gte: new Date(now.getTime() - 24 * 3600_000) } },
      orderBy: { createdAt: 'desc' },
    });
    expect(mockPrisma.billingPaymentAttempt.update).not.toHaveBeenCalled();
    expect(mockPayments.recordPayment).toHaveBeenCalledWith({
      attemptId: 'att-1',
      invoiceId: 'inv-1',
      source: 'RECONCILE',
      method: 'QRPH',
      amountCentavos: 150000,
      paidAt: now,
      reference: 'pay_1',
      providerIntentId: 'pi_1',
    });
  });

  it('pending past expiresAt marks expired without recording', async () => {
    mockPrisma.billingPaymentAttempt.findMany.mockResolvedValue([attempt({ expiresAt: new Date(now.getTime() - 1000) })]);
    mockProvider.getChargeStatus.mockResolvedValue({ status: 'pending' });
    await expect(service.reconcileInvoice('inv-1', now)).resolves.toEqual({ paid: false });
    expect(mockPrisma.billingPaymentAttempt.update).toHaveBeenCalledWith({ where: { id: 'att-1' }, data: { status: 'expired' } });
    expect(mockPayments.recordPayment).not.toHaveBeenCalled();
  });

  it('pending and still valid leaves the attempt alone', async () => {
    mockProvider.getChargeStatus.mockResolvedValue({ status: 'pending' });
    await expect(service.reconcileInvoice('inv-1', now)).resolves.toEqual({ paid: false });
    expect(mockPrisma.billingPaymentAttempt.update).not.toHaveBeenCalled();
  });

  it('failed marks the attempt failed', async () => {
    mockProvider.getChargeStatus.mockResolvedValue({ status: 'failed' });
    await service.reconcileInvoice('inv-1', now);
    expect(mockPrisma.billingPaymentAttempt.update).toHaveBeenCalledWith({ where: { id: 'att-1' }, data: { status: 'failed' } });
  });

  it('an already PAID invoice returns paid:true without provider calls', async () => {
    mockPrisma.billingInvoice.findUnique.mockResolvedValue({ id: 'inv-1', status: 'PAID' });
    await expect(service.reconcileInvoice('inv-1', now)).resolves.toEqual({ paid: true });
    expect(mockProvider.getChargeStatus).not.toHaveBeenCalled();
  });

  it('a provider error on one attempt does not stop the others', async () => {
    mockPrisma.billingPaymentAttempt.findMany.mockResolvedValue([attempt(), attempt({ id: 'att-2', providerIntentId: 'pi_2' })]);
    mockProvider.getChargeStatus
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({ status: 'succeeded', paymentId: 'pay_2', amountCentavos: 150000, paidAt: now });
    await expect(service.reconcileInvoice('inv-1', now)).resolves.toEqual({ paid: true });
  });

  it('reconcileRecent de-duplicates by invoice', async () => {
    mockPrisma.billingPaymentAttempt.findMany
      .mockResolvedValueOnce([attempt(), attempt({ id: 'att-2' }), attempt({ id: 'att-3', invoiceId: 'inv-2' })])
      .mockResolvedValue([]);
    const spy = jest.spyOn(service, 'reconcileInvoice').mockResolvedValue({ paid: false });
    await expect(service.reconcileRecent(now)).resolves.toBe(2);
    expect(mockPrisma.billingPaymentAttempt.findMany.mock.calls[0][0]).toEqual({
      where: { status: 'awaiting_payment', createdAt: { gte: new Date(now.getTime() - 2 * 3600_000) } },
      select: { invoiceId: true },
    });
    expect(spy.mock.calls.map(c => c[0])).toEqual(['inv-1', 'inv-2']);
  });
});
