import { Test, TestingModule } from '@nestjs/testing';
import {
  DEFAULT_BILLING_CONFIG,
  OpenInvoiceInput,
  SubscriptionInput,
  computeBillingStatus,
} from '../common/utils/billing-status.util';
import { describeStoreView } from '../common/utils/billing-copy.util';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { PrismaService } from '../prisma/prisma.service';
import { BillingConfigService } from './billing-config.service';

// Billing ships OFF. With the default config, nothing may change for any
// store — every status is EXEMPT and no client shows anything.
const m = (y: number, mo: number, d: number) => new Date(Date.UTC(y, mo - 1, d) - 8 * 60 * 60 * 1000);

const enabled: SubscriptionInput = {
  billingEnabled: true,
  priceCentavos: 150000,
  activatedAt: m(2025, 1, 1),
  trialStartAt: null,
  trialDays: null,
  nextBillingAt: m(2025, 2, 1),
  paidThroughAt: null,
  graceDaysOverride: null,
};
const pastInvoice: OpenInvoiceInput = {
  id: 'inv-1',
  dueAt: m(2025, 2, 1),
  amountCentavos: 150000,
  graceExtendedUntil: null,
  pendingClaimSubmittedAt: null,
};

describe('billing-OFF parity', () => {
  it.each<[string, SubscriptionInput | null, OpenInvoiceInput | null]>([
    ['no subscription', null, null],
    ['not set up', { ...enabled, billingEnabled: null }, null],
    ['exempt', { ...enabled, billingEnabled: false }, null],
    ['enabled with an overdue billing date', enabled, null],
    ['enabled with a long-overdue invoice', enabled, pastInvoice],
  ])('with default config every status is EXEMPT for any subscription shape (%s)', (_label, sub, invoice) => {
    const result = computeBillingStatus(DEFAULT_BILLING_CONFIG, sub, invoice, m(2026, 10, 24));
    expect(result.status).toBe('EXEMPT');
    expect(describeStoreView(result, 'admin').variant).toBe('none');
    expect(describeStoreView(result, 'cashier').variant).toBe('none');
  });

  describe('SubscriptionsService responses for non-billed stores are unchanged', () => {
    const mockPrisma = {
      tenant: { findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn() },
      storeSubscription: { findMany: jest.fn(), findUnique: jest.fn(), upsert: jest.fn() },
      subscriptionPayment: { upsert: jest.fn() },
    };
    let service: SubscriptionsService;

    beforeEach(async () => {
      jest.useFakeTimers().setSystemTime(m(2026, 2, 10));
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SubscriptionsService,
          { provide: PrismaService, useValue: mockPrisma },
          { provide: BillingConfigService, useValue: { get: async () => ({ billingEnabled: false }) } },
        ],
      }).compile();
      service = module.get(SubscriptionsService);
    });

    afterEach(() => jest.useRealTimers());

    it('getDetail keeps its pre-billing shape', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: 't-1',
        name: 'Downtown',
        slug: 'downtown',
        company: { id: 'c-1', name: 'Acme Co' },
        brand: { id: 'b-1', name: 'Mango Cafe' },
        subscription: { activatedAt: m(2026, 1, 5), payments: [] },
      });
      const detail = await service.getDetail('t-1');
      expect(Object.keys(detail).sort()).toEqual(
        ['activatedAt', 'brand', 'company', 'months', 'storeName', 'storeSlug', 'tenantId'].sort(),
      );
      expect(detail.months.map(x => x.month)).toEqual(['2026-01', '2026-02']);
    });

    it('getList keeps its pre-billing row shape', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([
        { id: 't-1', name: 'Downtown', slug: 'downtown', company: null, brand: null, subscription: null },
      ]);
      const list = await service.getList({});
      expect(list.data[0]).toEqual({
        tenantId: 't-1',
        storeName: 'Downtown',
        storeSlug: 'downtown',
        company: null,
        brand: null,
        activatedAt: null,
        paidThisMonth: null,
      });
    });

    it('legacy month toggles still work for a store onboarded with billing on while global billing is OFF', async () => {
      mockPrisma.storeSubscription.findUnique.mockResolvedValue({ id: 'sub-1', tenantId: 't-1', billingEnabled: true });
      mockPrisma.subscriptionPayment.upsert.mockClear().mockResolvedValue({});
      await service.upsertPayment('t-1', '2026-02', { paid: true });
      expect(mockPrisma.subscriptionPayment.upsert).toHaveBeenCalled();
    });

    it('legacy month toggles still work for stores without billing', async () => {
      mockPrisma.storeSubscription.findUnique.mockResolvedValue({ id: 'sub-1', tenantId: 't-1', billingEnabled: null });
      mockPrisma.subscriptionPayment.upsert.mockResolvedValue({});
      await service.upsertPayment('t-1', '2026-02', { paid: true });
      expect(mockPrisma.subscriptionPayment.upsert).toHaveBeenCalled();
    });
  });
});
