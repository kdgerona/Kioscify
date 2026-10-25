import { Test, TestingModule } from '@nestjs/testing';
import { BillingStatusService } from './billing-status.service';
import { BillingConfigService } from './billing-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_BILLING_CONFIG } from '../common/utils/billing-status.util';

const m = (y: number, mo: number, d: number) => new Date(Date.UTC(y, mo - 1, d) - 8 * 60 * 60 * 1000);

const sub = (over: Record<string, unknown> = {}) => ({
  id: 'sub-1',
  tenantId: 't-1',
  billingEnabled: true,
  priceCentavos: 150000,
  activatedAt: m(2026, 10, 1),
  trialStartAt: null,
  trialDays: null,
  nextBillingAt: m(2026, 10, 16),
  paidThroughAt: null,
  graceDaysOverride: null,
  ...over,
});

const mockPrisma = {
  storeSubscription: { findUnique: jest.fn(), findMany: jest.fn() },
  billingInvoice: { findFirst: jest.fn(), findMany: jest.fn() },
  billingPaymentClaim: { findFirst: jest.fn(), findMany: jest.fn() },
};
let statusConfig = { ...DEFAULT_BILLING_CONFIG, billingEnabled: true };
const mockConfig = {
  get: jest.fn(async () => ({})),
  toStatusConfig: jest.fn(() => statusConfig),
};

describe('BillingStatusService', () => {
  let service: BillingStatusService;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(m(2026, 10, 20));
    statusConfig = { ...DEFAULT_BILLING_CONFIG, billingEnabled: true };
    mockPrisma.billingInvoice.findFirst.mockResolvedValue(null);
    mockPrisma.billingInvoice.findMany.mockResolvedValue([]);
    mockPrisma.billingPaymentClaim.findFirst.mockResolvedValue(null);
    mockPrisma.billingPaymentClaim.findMany.mockResolvedValue([]);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingStatusService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: BillingConfigService, useValue: mockConfig },
      ],
    }).compile();
    service = module.get(BillingStatusService);
  });

  afterEach(() => jest.useRealTimers());

  it('forTenant returns EXEMPT and issues no invoice query when the subscription is not billed', async () => {
    mockPrisma.storeSubscription.findUnique.mockResolvedValue(sub({ billingEnabled: null }));
    const r = await service.forTenant('t-1');
    expect(r.status).toBe('EXEMPT');
    expect(mockPrisma.billingInvoice.findFirst).not.toHaveBeenCalled();
  });

  it('forTenant issues no subscription query at all when billing is globally off', async () => {
    statusConfig = { ...DEFAULT_BILLING_CONFIG };
    const r = await service.forTenant('t-1');
    expect(r.status).toBe('EXEMPT');
    expect(mockPrisma.storeSubscription.findUnique).not.toHaveBeenCalled();
  });

  it('previewEnabled computes as if billing were on globally', async () => {
    statusConfig = { ...DEFAULT_BILLING_CONFIG };
    mockPrisma.storeSubscription.findUnique.mockResolvedValue(sub());
    const r = await service.forTenant('t-1', { previewEnabled: true });
    expect(r.status).toBe('DUE');
  });

  it('forTenant uses the oldest OPEN invoice and its pending claim', async () => {
    mockPrisma.storeSubscription.findUnique.mockResolvedValue(sub());
    mockPrisma.billingInvoice.findFirst.mockResolvedValue({
      id: 'inv-1', dueAt: m(2026, 10, 16), amountCentavos: 120000, graceExtendedUntil: null,
    });
    mockPrisma.billingPaymentClaim.findFirst.mockResolvedValue({ status: 'PENDING', createdAt: m(2026, 10, 19), rejectReason: null });
    const r = await service.forTenant('t-1');
    expect(mockPrisma.billingInvoice.findFirst).toHaveBeenCalledWith({
      where: { subscriptionId: 'sub-1', status: 'OPEN' },
      orderBy: { dueAt: 'asc' },
    });
    expect(r).toMatchObject({ status: 'DUE', amountCentavos: 120000, openInvoiceId: 'inv-1', verificationPending: true });
  });

  it('forTenants batches: one findMany per model regardless of tenant count', async () => {
    mockPrisma.storeSubscription.findMany.mockResolvedValue([
      sub(), sub({ id: 'sub-2', tenantId: 't-2' }), sub({ id: 'sub-3', tenantId: 't-3', billingEnabled: false }),
    ]);
    mockPrisma.billingInvoice.findMany.mockResolvedValue([
      { id: 'inv-2', subscriptionId: 'sub-2', dueAt: m(2026, 10, 16), amountCentavos: 150000, graceExtendedUntil: null },
    ]);
    const map = await service.forTenants(['t-1', 't-2', 't-3', 't-4']);
    expect(mockPrisma.storeSubscription.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.billingInvoice.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.billingPaymentClaim.findMany).toHaveBeenCalledTimes(1);
    expect(map.get('t-1')!.status).toBe('DUE');
    expect(map.get('t-2')!.openInvoiceId).toBe('inv-2');
    expect(map.get('t-3')!.status).toBe('EXEMPT');
    expect(map.get('t-4')!.status).toBe('EXEMPT');
  });

  it('forTenant surfaces the latest rejected claim reason', async () => {
    mockPrisma.storeSubscription.findUnique.mockResolvedValue(sub());
    mockPrisma.billingInvoice.findFirst.mockResolvedValue({ id: 'inv-1', dueAt: m(2026, 10, 16), amountCentavos: 150000, graceExtendedUntil: null });
    mockPrisma.billingPaymentClaim.findFirst.mockResolvedValue({ status: 'REJECTED', createdAt: m(2026, 10, 18), rejectReason: 'Wrong amount' });
    const r = await service.forTenant('t-1');
    expect(mockPrisma.billingPaymentClaim.findFirst).toHaveBeenCalledWith({
      where: {
        invoiceId: 'inv-1',
        OR: [{ status: 'PENDING' }, { status: 'REJECTED', rejectReason: { not: 'Replaced by a newer claim' } }],
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(r).toMatchObject({ verificationPending: false, lastClaimRejectedReason: 'Wrong amount' });
  });

  it('forTenantCached reuses a result for 10 seconds per tenant', async () => {
    mockPrisma.storeSubscription.findUnique.mockResolvedValue(sub());
    await service.forTenantCached('t-1');
    await service.forTenantCached('t-1');
    expect(mockPrisma.storeSubscription.findUnique).toHaveBeenCalledTimes(1);
    jest.setSystemTime(new Date(m(2026, 10, 20).getTime() + 11_000));
    await service.forTenantCached('t-1');
    expect(mockPrisma.storeSubscription.findUnique).toHaveBeenCalledTimes(2);
  });

  it('prime() replaces the cached entry so a fresh billing/me unlocks the next request', async () => {
    mockPrisma.storeSubscription.findUnique.mockResolvedValue(sub());
    await service.forTenantCached('t-1');
    service.prime('t-1', { status: 'ACTIVE' } as any);
    await expect(service.forTenantCached('t-1')).resolves.toEqual({ status: 'ACTIVE' });
    expect(mockPrisma.storeSubscription.findUnique).toHaveBeenCalledTimes(1);
  });
});
