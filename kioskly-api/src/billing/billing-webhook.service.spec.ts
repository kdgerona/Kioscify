import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BillingWebhookService } from './billing-webhook.service';
import { BillingPaymentsService } from './billing-payments.service';
import { PAYMENT_PROVIDER, ParsedProviderEvent } from './providers/payment-provider.interface';
import { PrismaService } from '../prisma/prisma.service';

const p2002 = () => new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' });
const body = Buffer.from('{"any":"payload"}');

const paidEvent: ParsedProviderEvent = {
  eventId: 'evt_1',
  type: 'payment.paid',
  livemode: false,
  providerIntentId: 'pi_1',
  paymentId: 'pay_1',
  amountCentavos: 150000,
  paidAt: new Date('2026-11-16T03:00:00.000Z'),
  invoiceId: 'inv-1',
};

const mockPrisma = {
  paymentWebhookEvent: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  billingPaymentAttempt: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  billingInvoice: { findUnique: jest.fn() },
};
const mockProvider = { name: 'paymongo', mode: jest.fn(() => 'test'), verifyWebhook: jest.fn(() => true), parseEvent: jest.fn(() => paidEvent) };
const mockPayments = { recordPayment: jest.fn(async () => ({ applied: true, paymentId: 'bp-1' })) };

describe('BillingWebhookService', () => {
  let service: BillingWebhookService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockProvider.verifyWebhook.mockReturnValue(true);
    mockProvider.parseEvent.mockReturnValue(paidEvent);
    mockProvider.mode.mockReturnValue('test');
    mockPrisma.paymentWebhookEvent.create.mockResolvedValue({ id: 'we-1', processedAt: null });
    mockPrisma.billingPaymentAttempt.findUnique.mockResolvedValue({ id: 'att-1', invoiceId: 'inv-1', providerIntentId: 'pi_1' });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingWebhookService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PAYMENT_PROVIDER, useValue: mockProvider },
        { provide: BillingPaymentsService, useValue: mockPayments },
      ],
    }).compile();
    service = module.get(BillingWebhookService);
  });

  it('invalid signature → 401, no event stored', async () => {
    mockProvider.verifyWebhook.mockReturnValue(false);
    await expect(service.handlePaymongo(body, 't=1,te=x,li=')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(mockPrisma.paymentWebhookEvent.create).not.toHaveBeenCalled();
  });

  it('missing raw body → 401', async () => {
    await expect(service.handlePaymongo(undefined, 't=1,te=x,li=')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('payment.paid marks the attempt succeeded and records the payment once', async () => {
    await expect(service.handlePaymongo(body, 'sig')).resolves.toEqual({ ok: true });
    expect(mockPrisma.paymentWebhookEvent.create).toHaveBeenCalledWith({
      data: { provider: 'paymongo', providerEventId: 'evt_1', type: 'payment.paid', payload: { any: 'payload' } },
    });
    expect(mockPrisma.billingPaymentAttempt.update).not.toHaveBeenCalled();
    expect(mockPayments.recordPayment).toHaveBeenCalledTimes(1);
    expect(mockPayments.recordPayment).toHaveBeenCalledWith({
      attemptId: 'att-1',
      invoiceId: 'inv-1',
      source: 'WEBHOOK',
      method: 'QRPH',
      amountCentavos: 150000,
      paidAt: paidEvent.paidAt,
      reference: 'pay_1',
      providerIntentId: 'pi_1',
    });
    expect(mockPrisma.paymentWebhookEvent.update).toHaveBeenCalledWith({
      where: { id: 'we-1' },
      data: { processedAt: expect.any(Date), error: null },
    });
  });

  it('falls back to metadata.invoiceId when no attempt matches', async () => {
    mockPrisma.billingPaymentAttempt.findUnique.mockResolvedValue(null);
    mockPrisma.billingInvoice.findUnique.mockResolvedValue({ id: 'inv-1' });
    await service.handlePaymongo(body, 'sig');
    expect(mockPayments.recordPayment).toHaveBeenCalledWith(expect.objectContaining({ invoiceId: 'inv-1' }));
  });

  it('a duplicate processed event → duplicate:true, recordPayment not called', async () => {
    mockPrisma.paymentWebhookEvent.create.mockRejectedValue(p2002());
    mockPrisma.paymentWebhookEvent.findUnique.mockResolvedValue({ id: 'we-1', processedAt: new Date() });
    await expect(service.handlePaymongo(body, 'sig')).resolves.toEqual({ ok: true, duplicate: true });
    expect(mockPayments.recordPayment).not.toHaveBeenCalled();
  });

  it('a duplicate unprocessed event is reprocessed', async () => {
    mockPrisma.paymentWebhookEvent.create.mockRejectedValue(p2002());
    mockPrisma.paymentWebhookEvent.findUnique.mockResolvedValue({ id: 'we-1', processedAt: null });
    await expect(service.handlePaymongo(body, 'sig')).resolves.toEqual({ ok: true });
    expect(mockPayments.recordPayment).toHaveBeenCalledTimes(1);
  });

  it('unknown intent is recorded and acknowledged', async () => {
    mockProvider.parseEvent.mockReturnValue({ ...paidEvent, invoiceId: undefined });
    mockPrisma.billingPaymentAttempt.findUnique.mockResolvedValue(null);
    await expect(service.handlePaymongo(body, 'sig')).resolves.toEqual({ ok: true });
    expect(mockPayments.recordPayment).not.toHaveBeenCalled();
    expect(mockPrisma.paymentWebhookEvent.update).toHaveBeenCalledWith({
      where: { id: 'we-1' },
      data: { processedAt: expect.any(Date), error: 'No matching invoice' },
    });
  });

  it('livemode mismatch is ignored', async () => {
    mockProvider.parseEvent.mockReturnValue({ ...paidEvent, livemode: true });
    await expect(service.handlePaymongo(body, 'sig')).resolves.toEqual({ ok: true, ignored: true });
    expect(mockPrisma.paymentWebhookEvent.create).not.toHaveBeenCalled();
  });

  it('qrph.expired marks the attempt expired', async () => {
    mockProvider.parseEvent.mockReturnValue({ eventId: 'evt_2', type: 'qrph.expired', livemode: false, providerIntentId: 'pi_1' });
    await service.handlePaymongo(body, 'sig');
    expect(mockPrisma.billingPaymentAttempt.updateMany).toHaveBeenCalledWith({
      where: { providerIntentId: 'pi_1', status: 'awaiting_payment' },
      data: { status: 'expired' },
    });
    expect(mockPayments.recordPayment).not.toHaveBeenCalled();
  });

  it('payment.failed marks the attempt failed', async () => {
    mockProvider.parseEvent.mockReturnValue({ eventId: 'evt_3', type: 'payment.failed', livemode: false, providerIntentId: 'pi_1' });
    await service.handlePaymongo(body, 'sig');
    expect(mockPrisma.billingPaymentAttempt.updateMany).toHaveBeenCalledWith({
      where: { providerIntentId: 'pi_1', status: 'awaiting_payment' },
      data: { status: 'failed' },
    });
  });

  it('a processing error stores the error and rethrows', async () => {
    mockPayments.recordPayment.mockRejectedValueOnce(new Error('db down'));
    await expect(service.handlePaymongo(body, 'sig')).rejects.toThrow('db down');
    expect(mockPrisma.paymentWebhookEvent.update).toHaveBeenCalledWith({ where: { id: 'we-1' }, data: { error: 'db down' } });
  });

  it('a failure while storing the error still rethrows the original processing error', async () => {
    mockPayments.recordPayment.mockRejectedValueOnce(new Error('db down'));
    mockPrisma.paymentWebhookEvent.update.mockRejectedValueOnce(new Error('update failed'));
    await expect(service.handlePaymongo(body, 'sig')).rejects.toThrow('db down');
  });
});
