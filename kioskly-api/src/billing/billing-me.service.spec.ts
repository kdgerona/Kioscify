import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { BillingMeService } from './billing-me.service';
import { BillingConfigService } from './billing-config.service';
import { BillingStatusService } from './billing-status.service';
import { BillingRemindersService } from './billing-reminders.service';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_BILLING_CONFIG, computeBillingStatus } from '../common/utils/billing-status.util';

const m = (y: number, mo: number, d: number) => new Date(Date.UTC(y, mo - 1, d) - 8 * 60 * 60 * 1000);

const sub = {
  id: 'sub-1',
  tenantId: 't-1',
  billingEnabled: true,
  priceCentavos: 150000,
  activatedAt: m(2026, 10, 1),
  trialStartAt: null,
  trialDays: null,
  nextBillingAt: m(2026, 11, 16),
  paidThroughAt: m(2026, 11, 15),
  graceDaysOverride: null,
};
const openInvoice = {
  id: 'inv-1',
  number: 'KSF-202610-ABCDE',
  amountCentavos: 150000,
  dueAt: m(2026, 10, 16),
  periodStart: m(2026, 10, 16),
  periodEnd: m(2026, 11, 16),
  graceExtendedUntil: null,
};

const mockPrisma = {
  storeSubscription: { findUnique: jest.fn() },
  billingInvoice: { findFirst: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
  billingPayment: { findMany: jest.fn() },
  tenant: { findUnique: jest.fn() },
};
let rawConfig: any;
const mockConfig = {
  get: jest.fn(async () => rawConfig),
  toStatusConfig: jest.fn((c: any) => ({
    billingEnabled: c.billingEnabled,
    enforcementEnabled: c.enforcementEnabled,
    defaultTrialDays: 15,
    defaultGraceDays: 7,
    claimLockHoldDays: 3,
  })),
};
const mockStatus = { forTenant: jest.fn(), prime: jest.fn() };
const mockReminders = { pendingFor: jest.fn(async () => null as any) };

describe('BillingMeService', () => {
  let service: BillingMeService;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(m(2026, 10, 18));
    rawConfig = { ...DEFAULT_BILLING_CONFIG, billingEnabled: true, enforcementEnabled: true, overduePollSeconds: 30 };
    mockPrisma.storeSubscription.findUnique.mockResolvedValue({ ...sub, paidThroughAt: null, nextBillingAt: m(2026, 11, 16) });
    mockPrisma.billingInvoice.findFirst.mockResolvedValue(openInvoice);
    mockStatus.forTenant.mockImplementation(async () =>
      computeBillingStatus(mockConfig.toStatusConfig(rawConfig), { ...sub, paidThroughAt: null }, { ...openInvoice, pendingClaimSubmittedAt: null }),
    );
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingMeService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: BillingConfigService, useValue: mockConfig },
        { provide: BillingStatusService, useValue: mockStatus },
        { provide: BillingRemindersService, useValue: mockReminders },
      ],
    }).compile();
    service = module.get(BillingMeService);
  });

  afterEach(() => jest.useRealTimers());

  it('me is EXEMPT and viewless while billing is off, without subscription reads', async () => {
    rawConfig = { ...DEFAULT_BILLING_CONFIG, overduePollSeconds: 30 };
    mockStatus.forTenant.mockResolvedValue(computeBillingStatus(DEFAULT_BILLING_CONFIG, null, null));
    const me = await service.getMe({ id: 'u-1', role: 'STORE_ADMIN', tenantId: 't-1' });
    expect(me.status.status).toBe('EXEMPT');
    expect(me.storeView.variant).toBe('none');
    expect(me.plan).toBeNull();
    expect(me.openInvoice).toBeNull();
    expect(mockPrisma.storeSubscription.findUnique).not.toHaveBeenCalled();
  });

  it('a store admin sees the due banner, can pay, and gets the open invoice', async () => {
    const me = await service.getMe({ id: 'u-1', role: 'STORE_ADMIN', tenantId: 't-1' });
    expect(me.status.status).toBe('DUE');
    expect(me.canPay).toBe(true);
    expect(me.storeView).toMatchObject({ variant: 'banner', showPayAction: true });
    expect(me.openInvoice).toEqual({
      id: 'inv-1',
      number: 'KSF-202610-ABCDE',
      amountCentavos: 150000,
      dueAt: m(2026, 10, 16),
      periodStart: m(2026, 10, 16),
      periodEnd: m(2026, 11, 16),
    });
    expect(me.plan).toMatchObject({ billingEnabled: true, priceCentavos: 150000, nextBillingAt: m(2026, 11, 16) });
    expect(me.pollSeconds).toBe(30);
  });

  it('me for a cashier has canPay false and cashier copy', async () => {
    const me = await service.getMe({ id: 'u-2', role: 'CASHIER', tenantId: 't-1' });
    expect(me.canPay).toBe(false);
    expect(me.storeView.body).toBe("Your store's subscription is due. Please ask your store admin to pay before Oct 23, 2026.");
  });

  it('cache.validUntil is graceEndsAt while DUE', async () => {
    const me = await service.getMe({ id: 'u-1', role: 'STORE_ADMIN', tenantId: 't-1' });
    expect(me.cache).toEqual({ status: 'DUE', dueAt: m(2026, 10, 16), graceEndsAt: m(2026, 10, 23), enforcement: true, validUntil: m(2026, 10, 23) });
  });

  it('cache.validUntil is next billing + grace while ACTIVE', async () => {
    mockStatus.forTenant.mockResolvedValue(
      computeBillingStatus(mockConfig.toStatusConfig(rawConfig), sub, null, m(2026, 11, 1)),
    );
    const me = await service.getMe({ id: 'u-1', role: 'STORE_ADMIN', tenantId: 't-1' });
    expect(me.cache.validUntil).toEqual(m(2026, 11, 23));
  });

  it('cache.validUntil is null without enforcement', async () => {
    rawConfig = { ...rawConfig, enforcementEnabled: false };
    const me = await service.getMe({ id: 'u-1', role: 'STORE_ADMIN', tenantId: 't-1' });
    expect(me.cache.validUntil).toBeNull();
  });

  it('getInvoice 404s for another tenant', async () => {
    mockPrisma.billingInvoice.findUnique.mockResolvedValue({ ...openInvoice, tenantId: 't-2' });
    await expect(service.getInvoice('t-1', 'inv-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('listInvoices joins the applied payment method and reference', async () => {
    mockPrisma.billingInvoice.findMany.mockResolvedValue([{ ...openInvoice, status: 'PAID', paidAt: m(2026, 10, 17), paymentMethod: 'QRPH' }]);
    mockPrisma.billingPayment.findMany.mockResolvedValue([{ invoiceId: 'inv-1', reference: 'pay_1', manualMethod: null, flagged: false }]);
    const rows = await service.listInvoices('t-1');
    expect(mockPrisma.billingInvoice.findMany).toHaveBeenCalledWith({
      where: { tenantId: 't-1' },
      orderBy: [{ periodStart: 'desc' }, { revision: 'desc' }],
      take: 100,
    });
    expect(rows[0]).toMatchObject({ id: 'inv-1', status: 'PAID', paymentMethod: 'QRPH', reference: 'pay_1' });
  });

  describe('pendingReminder', () => {
    it('is shown to store admins with copy for the offset', async () => {
      mockReminders.pendingFor.mockResolvedValueOnce({ id: 'rem-3', offsetDays: 3 });
      const me = await service.getMe({ id: 'u-1', role: 'STORE_ADMIN', tenantId: 't-1' });
      expect(mockReminders.pendingFor).toHaveBeenCalledWith('inv-1', 'u-1');
      expect(me.pendingReminder).toEqual({
        id: 'rem-3',
        offsetDays: 3,
        title: 'Reminder: subscription due — 5 days left',
        body: expect.stringContaining('₱1,500.00'),
      });
    });

    it('is null for cashiers', async () => {
      mockReminders.pendingFor.mockResolvedValue({ id: 'rem-3', offsetDays: 3 });
      const me = await service.getMe({ id: 'u-2', role: 'CASHIER', tenantId: 't-1' });
      expect(me.pendingReminder).toBeNull();
      expect(mockReminders.pendingFor).not.toHaveBeenCalled();
    });
  });

  it('cache.validUntil follows the claim hold while a claim is pending (offline kiosks stay open)', async () => {
    mockStatus.forTenant.mockImplementation(async () =>
      computeBillingStatus(
        mockConfig.toStatusConfig(rawConfig),
        { ...sub, paidThroughAt: null },
        { ...openInvoice, pendingClaimSubmittedAt: m(2026, 10, 23) },
        m(2026, 10, 24),
      ),
    );
    const me = await service.getMe({ id: 'u-1', role: 'STORE_ADMIN', tenantId: 't-1' });
    expect(me.status.status).toBe('DUE');
    expect(me.cache.validUntil).toEqual(m(2026, 10, 26));
  });

  it('primes the per-request status cache with the fresh status', async () => {
    const me = await service.getMe({ id: 'u-1', role: 'STORE_ADMIN', tenantId: 't-1' });
    expect(mockStatus.prime).toHaveBeenCalledWith('t-1', me.status);
  });
});
