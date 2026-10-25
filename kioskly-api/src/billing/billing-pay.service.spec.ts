import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BillingPayService } from './billing-pay.service';
import { BillingConfigService } from './billing-config.service';
import { BillingInvoicesService } from './billing-invoices.service';
import { BillingPaymentsService } from './billing-payments.service';
import { BillingReconcileService } from './billing-reconcile.service';
import { PAYMENT_PROVIDER, PaymentProviderError } from './providers/payment-provider.interface';
import { PrismaService } from '../prisma/prisma.service';

const now = new Date('2026-11-16T05:00:00.000Z');
const invoice = {
  id: 'inv-1',
  number: 'KSF-202611-ABCDE',
  tenantId: 't-1',
  subscriptionId: 'sub-1',
  status: 'OPEN',
  amountCentavos: 150000,
  dueAt: new Date('2026-11-15T16:00:00.000Z'),
  payToken: 'tok_abc',
};
const baseConfig = {
  billingEnabled: true,
  paymongoMonthlyLimitCentavos: 1000000,
  fallbackQrImageUrl: null as string | null,
  fallbackQrAccountName: 'Owner — BPI',
  fallbackQrInstructions: 'Scan with any bank app',
};

const mockPrisma = {
  billingInvoice: { findUnique: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn() },
  billingPaymentAttempt: { findFirst: jest.fn(), create: jest.fn() },
  storeSubscription: { findUnique: jest.fn() },
  tenant: { findUnique: jest.fn() },
};
const mockConfig = { get: jest.fn() };
const mockInvoices = { ensureInvoice: jest.fn() };
const mockPayments = { qrphCollectedThisMonth: jest.fn(async () => 0) };
const mockReconcile = { reconcileInvoice: jest.fn(async () => ({ paid: false })) };
const mockProvider = { name: 'paymongo', mode: jest.fn(() => 'test'), createQrCharge: jest.fn() };
const env = { get: (k: string) => (k === 'BILLING_PAY_PAGE_BASE_URL' ? 'https://kioscify.com' : undefined) };

describe('BillingPayService', () => {
  let service: BillingPayService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockConfig.get.mockResolvedValue({ ...baseConfig });
    mockPrisma.billingInvoice.findUnique.mockResolvedValue({ ...invoice });
    mockPrisma.billingInvoice.findFirst.mockResolvedValue({ ...invoice });
    mockPrisma.storeSubscription.findUnique.mockResolvedValue({ id: 'sub-1', tenantId: 't-1' });
    mockPrisma.billingPaymentAttempt.findFirst.mockResolvedValue(null);
    mockPrisma.billingPaymentAttempt.create.mockImplementation(async ({ data }: any) => ({ id: 'att-new', ...data }));
    mockPrisma.tenant.findUnique.mockResolvedValue({ name: 'Downtown' });
    mockProvider.mode.mockReturnValue('test');
    mockProvider.createQrCharge.mockResolvedValue({
      providerIntentId: 'pi_new',
      qrImage: 'data:image/png;base64,NEW',
      expiresAt: new Date(now.getTime() + 30 * 60_000),
      livemode: false,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingPayService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: BillingConfigService, useValue: mockConfig },
        { provide: BillingInvoicesService, useValue: mockInvoices },
        { provide: BillingPaymentsService, useValue: mockPayments },
        { provide: BillingReconcileService, useValue: mockReconcile },
        { provide: PAYMENT_PROVIDER, useValue: mockProvider },
        { provide: ConfigService, useValue: env },
      ],
    }).compile();
    service = module.get(BillingPayService);
  });

  describe('payInvoice', () => {
    it('400s while billing is globally off', async () => {
      mockConfig.get.mockResolvedValue({ ...baseConfig, billingEnabled: false });
      await expect(service.payInvoice('t-1', null, now)).rejects.toThrow(new BadRequestException('Billing is OFF globally'));
    });

    it('creates a PayMongo QR attempt with invoice metadata', async () => {
      const r = await service.payInvoice('t-1', 'inv-1', now);
      expect(mockProvider.createQrCharge).toHaveBeenCalledWith({
        amountCentavos: 150000,
        description: 'Kioscify subscription KSF-202611-ABCDE',
        metadata: { invoiceId: 'inv-1', tenantId: 't-1' },
      });
      expect(mockPrisma.billingPaymentAttempt.create).toHaveBeenCalledWith({
        data: {
          invoiceId: 'inv-1',
          provider: 'paymongo',
          providerIntentId: 'pi_new',
          qrImage: 'data:image/png;base64,NEW',
          expiresAt: new Date(now.getTime() + 30 * 60_000),
          status: 'awaiting_payment',
          livemode: false,
        },
      });
      expect(r).toEqual({
        kind: 'paymongo',
        invoiceId: 'inv-1',
        invoiceNumber: 'KSF-202611-ABCDE',
        amountCentavos: 150000,
        qrImage: 'data:image/png;base64,NEW',
        expiresAt: new Date(now.getTime() + 30 * 60_000),
        payUrl: 'https://kioscify.com/pay/tok_abc',
      });
    });

    it('two simultaneous first Pay now views share one PayMongo QR', async () => {
      const [a, b] = await Promise.all([service.payInvoice('t-1', 'inv-1', now), service.payInvoice('t-1', 'inv-1', now)]);
      expect(mockProvider.createQrCharge).toHaveBeenCalledTimes(1);
      expect(mockPrisma.billingPaymentAttempt.create).toHaveBeenCalledTimes(1);
      expect(a).toEqual(b);
    });

    it('reuses a valid attempt', async () => {
      mockPrisma.billingPaymentAttempt.findFirst.mockResolvedValue({
        id: 'att-1',
        qrImage: 'data:image/png;base64,OLD',
        expiresAt: new Date(now.getTime() + 10 * 60_000),
      });
      const r = await service.payInvoice('t-1', 'inv-1', now);
      expect(mockProvider.createQrCharge).not.toHaveBeenCalled();
      expect(mockPrisma.billingPaymentAttempt.findFirst).toHaveBeenCalledWith({
        where: { invoiceId: 'inv-1', status: 'awaiting_payment', expiresAt: { gt: new Date(now.getTime() + 2 * 60_000) } },
        orderBy: { createdAt: 'desc' },
      });
      expect(r).toMatchObject({ kind: 'paymongo', qrImage: 'data:image/png;base64,OLD' });
    });

    it('a virtual due becomes an invoice on Pay now', async () => {
      mockPrisma.billingInvoice.findFirst.mockResolvedValue(null);
      mockInvoices.ensureInvoice.mockResolvedValue({ ...invoice });
      await service.payInvoice('t-1', null, now);
      expect(mockInvoices.ensureInvoice).toHaveBeenCalledWith('sub-1', now);
    });

    it('nothing to pay → 400', async () => {
      mockPrisma.billingInvoice.findFirst.mockResolvedValue(null);
      mockInvoices.ensureInvoice.mockResolvedValue(null);
      await expect(service.payInvoice('t-1', null, now)).rejects.toThrow(new BadRequestException('Nothing to pay right now'));
    });

    it("404s for another store's invoice", async () => {
      mockPrisma.billingInvoice.findUnique.mockResolvedValue({ ...invoice, tenantId: 't-2' });
      await expect(service.payInvoice('t-1', 'inv-1', now)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('400s for an invoice that is no longer open', async () => {
      mockPrisma.billingInvoice.findUnique.mockResolvedValue({ ...invoice, status: 'PAID' });
      await expect(service.payInvoice('t-1', 'inv-1', now)).rejects.toThrow(new BadRequestException('This invoice is no longer open'));
    });

    it('limit reached → fallback', async () => {
      mockConfig.get.mockResolvedValue({ ...baseConfig, fallbackQrImageUrl: 'https://cdn/qr.png' });
      mockPayments.qrphCollectedThisMonth.mockResolvedValueOnce(900000);
      const r = await service.payInvoice('t-1', 'inv-1', now);
      expect(mockProvider.createQrCharge).not.toHaveBeenCalled();
      expect(r).toEqual({
        kind: 'fallback',
        invoiceId: 'inv-1',
        invoiceNumber: 'KSF-202611-ABCDE',
        amountCentavos: 150000,
        fallbackQrImageUrl: 'https://cdn/qr.png',
        accountName: 'Owner — BPI',
        instructions: 'Scan with any bank app',
        payUrl: 'https://kioscify.com/pay/tok_abc',
      });
    });

    it('provider failure falls back to the bank QR', async () => {
      mockConfig.get.mockResolvedValue({ ...baseConfig, fallbackQrImageUrl: 'https://cdn/qr.png' });
      mockProvider.createQrCharge.mockRejectedValue(new PaymentProviderError('PayMongo down', 503));
      await expect(service.payInvoice('t-1', 'inv-1', now)).resolves.toMatchObject({ kind: 'fallback' });
    });

    it('provider failure without fallback → unavailable', async () => {
      mockProvider.createQrCharge.mockRejectedValue(new PaymentProviderError('PayMongo down', 503));
      await expect(service.payInvoice('t-1', 'inv-1', now)).resolves.toEqual({
        kind: 'unavailable',
        invoiceId: 'inv-1',
        invoiceNumber: 'KSF-202611-ABCDE',
        amountCentavos: 150000,
        message: 'Online payment is unavailable right now. Please email us at support@kioscify.com.',
      });
    });
  });

  describe('pay page', () => {
    it('unknown token → 404', async () => {
      mockPrisma.billingInvoice.findUnique.mockResolvedValue(null);
      await expect(service.payByToken('nope', now)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('pay page for a paid invoice shows status only', async () => {
      mockPrisma.billingInvoice.findUnique.mockResolvedValue({ ...invoice, status: 'PAID' });
      const r = await service.payByToken('tok_abc', now);
      expect(r).toEqual({
        storeName: 'Downtown',
        invoiceNumber: 'KSF-202611-ABCDE',
        amountCentavos: 150000,
        dueAt: invoice.dueAt,
        status: 'PAID',
        payment: null,
      });
      expect(mockProvider.createQrCharge).not.toHaveBeenCalled();
    });

    it('pay page for an open invoice includes the payment', async () => {
      const r = await service.payByToken('tok_abc', now);
      expect(mockPrisma.billingInvoice.findUnique).toHaveBeenCalledWith({ where: { payToken: 'tok_abc' } });
      expect(r.payment).toMatchObject({ kind: 'paymongo' });
    });
  });

  describe('paymentStatus', () => {
    // Emulates the stored invoice.lastReconciledAt shared by every API instance.
    let lastReconciledAt: Date | undefined;
    beforeEach(() => {
      lastReconciledAt = undefined;
      mockPrisma.billingInvoice.updateMany.mockImplementation(async ({ where, data }: any) => {
        const cutoff: Date = where.OR[2].lastReconciledAt.lt;
        if (lastReconciledAt && lastReconciledAt >= cutoff) return { count: 0 };
        lastReconciledAt = data.lastReconciledAt;
        return { count: 1 };
      });
    });

    it('claims the re-check slot on the invoice itself (missing field counts as never checked)', async () => {
      await service.paymentStatus({ tenantId: 't-1', invoiceId: 'inv-1' }, now);
      expect(mockPrisma.billingInvoice.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'inv-1',
          status: 'OPEN',
          OR: [
            { lastReconciledAt: { isSet: false } },
            { lastReconciledAt: null },
            { lastReconciledAt: { lt: new Date(now.getTime() - 20_000) } },
          ],
        },
        data: { lastReconciledAt: now },
      });
    });

    it('reconciles at most once per 20s per invoice', async () => {
      await service.paymentStatus({ tenantId: 't-1', invoiceId: 'inv-1' }, now);
      await service.paymentStatus({ tenantId: 't-1', invoiceId: 'inv-1' }, new Date(now.getTime() + 5_000));
      await service.paymentStatus({ tenantId: 't-1', invoiceId: 'inv-1' }, new Date(now.getTime() + 21_000));
      expect(mockReconcile.reconcileInvoice).toHaveBeenCalledTimes(2);
    });

    it('reports paid without reconciling a PAID invoice', async () => {
      mockPrisma.billingInvoice.findUnique.mockResolvedValue({ ...invoice, status: 'PAID' });
      await expect(service.paymentStatus({ tenantId: 't-1', invoiceId: 'inv-1' }, now)).resolves.toEqual({ status: 'PAID', paid: true });
      expect(mockReconcile.reconcileInvoice).not.toHaveBeenCalled();
    });

    it("404s for another store's invoice", async () => {
      mockPrisma.billingInvoice.findUnique.mockResolvedValue({ ...invoice, tenantId: 't-2' });
      await expect(service.paymentStatus({ tenantId: 't-1', invoiceId: 'inv-1' }, now)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
