import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BillingInvoicesService } from './billing-invoices.service';
import { BillingConfigService } from './billing-config.service';
import { BillingAuditService } from './billing-audit.service';
import { PrismaService } from '../prisma/prisma.service';

const m = (y: number, mo: number, d: number) => new Date(Date.UTC(y, mo - 1, d) - 8 * 60 * 60 * 1000);
const p2002 = (target: string) =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test', meta: { target } });

const sub = (over: Record<string, unknown> = {}) => ({
  id: 'sub-1',
  tenantId: 't-1',
  billingEnabled: true,
  priceCentavos: 150000,
  activatedAt: m(2026, 10, 1),
  nextBillingAt: m(2026, 11, 16),
  anchorDay: 16,
  paidThroughAt: null,
  ...over,
});

const mockPrisma: any = {
  storeSubscription: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  billingInvoice: { findFirst: jest.fn(), findUnique: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
  subscriptionPayment: { findUnique: jest.fn(), upsert: jest.fn() },
};
mockPrisma.$transaction = jest.fn(async (fn: (tx: any) => unknown) => fn(mockPrisma));
let leadDays = 0;
const mockConfig = { get: jest.fn(async () => ({ invoiceLeadDays: leadDays })) };
const mockAudit = { log: jest.fn() };

describe('BillingInvoicesService', () => {
  let service: BillingInvoicesService;

  beforeEach(async () => {
    jest.clearAllMocks();
    leadDays = 0;
    mockPrisma.storeSubscription.findUnique.mockResolvedValue(sub());
    mockPrisma.billingInvoice.findFirst.mockResolvedValue(null);
    mockPrisma.billingInvoice.count.mockResolvedValue(0);
    mockPrisma.billingInvoice.create.mockImplementation(async ({ data }: any) => ({ id: 'inv-new', status: 'OPEN', ...data }));
    mockPrisma.subscriptionPayment.findUnique.mockResolvedValue(null);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingInvoicesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: BillingConfigService, useValue: mockConfig },
        { provide: BillingAuditService, useValue: mockAudit },
      ],
    }).compile();
    service = module.get(BillingInvoicesService);
  });

  describe('ensureInvoice', () => {
    it.each([
      ['not billed', { billingEnabled: false }],
      ['no price', { priceCentavos: null }],
      ['no activation', { activatedAt: null }],
      ['no next billing date', { nextBillingAt: null }],
    ])('returns null when %s', async (_l, over) => {
      mockPrisma.storeSubscription.findUnique.mockResolvedValue(sub(over));
      await expect(service.ensureInvoice('sub-1', m(2026, 11, 20))).resolves.toBeNull();
      expect(mockPrisma.billingInvoice.create).not.toHaveBeenCalled();
    });

    it('returns null before nextBillingAt', async () => {
      await expect(service.ensureInvoice('sub-1', m(2026, 11, 15))).resolves.toBeNull();
    });

    it('invoiceLeadDays issues early, still due on the billing date', async () => {
      leadDays = 3;
      const inv = await service.ensureInvoice('sub-1', m(2026, 11, 13));
      expect(inv).toMatchObject({ dueAt: m(2026, 11, 16), periodStart: m(2026, 11, 16) });
    });

    it('creates period [Nov 16, Dec 16) with a price snapshot and advances nextBillingAt', async () => {
      const now = m(2026, 11, 16);
      const inv = await service.ensureInvoice('sub-1', now);
      expect(mockPrisma.billingInvoice.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          subscriptionId: 'sub-1',
          tenantId: 't-1',
          periodStart: m(2026, 11, 16),
          periodEnd: m(2026, 12, 16),
          revision: 0,
          dueAt: m(2026, 11, 16),
          issuedAt: now,
          amountCentavos: 150000,
          number: expect.stringMatching(/^KSF-202611-/),
          payToken: expect.any(String),
        }),
      });
      expect(mockPrisma.storeSubscription.update).toHaveBeenCalledWith({ where: { id: 'sub-1' }, data: { nextBillingAt: m(2026, 12, 16) } });
      expect(inv?.id).toBe('inv-new');
    });

    it('never invoices a period that is already paid: starts the day after paid-through', async () => {
      // Stored next billing (Nov 16) fell behind a period already paid through Dec 15
      mockPrisma.storeSubscription.findUnique.mockResolvedValue(sub({ paidThroughAt: m(2026, 12, 15) }));
      await expect(service.ensureInvoice('sub-1', m(2026, 11, 20))).resolves.toBeNull();
      const inv = await service.ensureInvoice('sub-1', m(2026, 12, 16));
      expect(inv).toMatchObject({ periodStart: m(2026, 12, 16), periodEnd: m(2027, 1, 16), dueAt: m(2026, 12, 16) });
    });

    describe('paid at the end of the month (billedInArrears)', () => {
      const arrearsSub = (over: Record<string, unknown> = {}) =>
        sub({ billedInArrears: true, nextBillingAt: m(2026, 12, 10), anchorDay: 10, ...over });

      it('invoices the month that just ended, due on the billing date, and moves on a month', async () => {
        mockPrisma.storeSubscription.findUnique.mockResolvedValue(arrearsSub());
        await expect(service.ensureInvoice('sub-1', m(2026, 12, 9))).resolves.toBeNull();
        const inv = await service.ensureInvoice('sub-1', m(2026, 12, 10));
        expect(inv).toMatchObject({ periodStart: m(2026, 11, 10), periodEnd: m(2026, 12, 10), dueAt: m(2026, 12, 10) });
        expect(inv?.number).toMatch(/^KSF-202611-/);
        expect(mockPrisma.storeSubscription.update).toHaveBeenCalledWith({ where: { id: 'sub-1' }, data: { nextBillingAt: m(2027, 1, 10) } });
      });

      it('never invoices a month that is already paid', async () => {
        // Stored Dec 10 bill covers Nov 10 – Dec 9, already paid through Dec 9
        mockPrisma.storeSubscription.findUnique.mockResolvedValue(arrearsSub({ paidThroughAt: m(2026, 12, 9) }));
        await expect(service.ensureInvoice('sub-1', m(2026, 12, 10))).resolves.toBeNull();
        const inv = await service.ensureInvoice('sub-1', m(2027, 1, 10));
        expect(inv).toMatchObject({ periodStart: m(2026, 12, 10), periodEnd: m(2027, 1, 10), dueAt: m(2027, 1, 10) });
      });

      it('void resets nextBillingAt to that bill\'s due date so it can be reissued', async () => {
        mockPrisma.storeSubscription.findUnique.mockResolvedValue(arrearsSub({ nextBillingAt: m(2027, 1, 10) }));
        mockPrisma.billingInvoice.findUnique.mockResolvedValue({
          id: 'inv-a', subscriptionId: 'sub-1', tenantId: 't-1', status: 'OPEN', number: 'KSF-202611-AAAAA',
          periodStart: m(2026, 11, 10), periodEnd: m(2026, 12, 10), dueAt: m(2026, 12, 10),
        });
        mockConfig.get.mockResolvedValueOnce({ invoiceLeadDays: 0 }).mockResolvedValueOnce({ billingEnabled: false } as any);
        await service.voidInvoice('inv-a', 'Wrong price', 'admin-1');
        expect(mockPrisma.storeSubscription.update).toHaveBeenCalledWith({ where: { id: 'sub-1' }, data: { nextBillingAt: m(2026, 12, 10) } });
      });
    });

    it('anchor 31 period ends Feb 28', async () => {
      mockPrisma.storeSubscription.findUnique.mockResolvedValue(sub({ nextBillingAt: m(2027, 1, 31), anchorDay: 31 }));
      await service.ensureInvoice('sub-1', m(2027, 1, 31));
      expect(mockPrisma.billingInvoice.create.mock.calls[0][0].data.periodEnd).toEqual(m(2027, 2, 28));
    });

    it('returns the existing OPEN invoice instead of a second one', async () => {
      mockPrisma.billingInvoice.findFirst.mockResolvedValue({ id: 'inv-open', status: 'OPEN' });
      await expect(service.ensureInvoice('sub-1', m(2026, 12, 20))).resolves.toEqual({ id: 'inv-open', status: 'OPEN' });
      expect(mockPrisma.billingInvoice.create).not.toHaveBeenCalled();
    });

    it('late generation keeps dueAt = periodStart', async () => {
      await service.ensureInvoice('sub-1', m(2026, 11, 20));
      expect(mockPrisma.billingInvoice.create.mock.calls[0][0].data.dueAt).toEqual(m(2026, 11, 16));
    });

    it('void then ensureInvoice reissues revision 1, due today, at the current price', async () => {
      mockPrisma.billingInvoice.count.mockResolvedValue(1);
      mockPrisma.storeSubscription.findUnique.mockResolvedValue(sub({ priceCentavos: 120000 }));
      await service.ensureInvoice('sub-1', new Date(m(2026, 11, 25).getTime() + 5 * 3600_000));
      expect(mockPrisma.billingInvoice.count).toHaveBeenCalledWith({ where: { subscriptionId: 'sub-1', periodStart: m(2026, 11, 16), status: 'VOID' } });
      expect(mockPrisma.billingInvoice.create.mock.calls[0][0].data).toMatchObject({ revision: 1, dueAt: m(2026, 11, 25), amountCentavos: 120000 });
    });

    it('P2002 on the compound key returns the concurrent OPEN invoice', async () => {
      mockPrisma.billingInvoice.create.mockRejectedValueOnce(p2002('billing_invoices_subscriptionId_periodStart_revision_key'));
      mockPrisma.billingInvoice.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'inv-other', status: 'OPEN' });
      await expect(service.ensureInvoice('sub-1', m(2026, 11, 16))).resolves.toEqual({ id: 'inv-other', status: 'OPEN' });
    });

    it('a Mongo write conflict (P2034) with a concurrent creator returns that OPEN invoice', async () => {
      mockPrisma.billingInvoice.create.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('Write conflict', { code: 'P2034', clientVersion: 'test' }),
      );
      mockPrisma.billingInvoice.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'inv-other', status: 'OPEN' });
      await expect(service.ensureInvoice('sub-1', m(2026, 11, 16))).resolves.toEqual({ id: 'inv-other', status: 'OPEN' });
    });

    it('P2002 on number retries with a new number', async () => {
      mockPrisma.billingInvoice.create.mockRejectedValueOnce(p2002('billing_invoices_number_key'));
      const inv = await service.ensureInvoice('sub-1', m(2026, 11, 16));
      expect(mockPrisma.billingInvoice.create).toHaveBeenCalledTimes(2);
      expect(inv?.id).toBe('inv-new');
    });
  });

  describe('admin actions', () => {
    const open = { id: 'inv-1', number: 'KSF-202611-ABCDE', status: 'OPEN', subscriptionId: 'sub-1', tenantId: 't-1', periodStart: m(2026, 11, 16), periodEnd: m(2026, 12, 16) };

    it.each(['voidInvoice', 'waiveInvoice'] as const)('%s rejects non-OPEN invoices', async (method) => {
      mockPrisma.billingInvoice.findUnique.mockResolvedValue({ ...open, status: 'PAID' });
      await expect(service[method]('inv-1', 'reason', 'admin-1')).rejects.toThrow(new BadRequestException('Only open invoices can be changed'));
    });

    it('extendGrace rejects non-OPEN invoices', async () => {
      mockPrisma.billingInvoice.findUnique.mockResolvedValue({ ...open, status: 'VOID' });
      await expect(service.extendGrace('inv-1', '2026-12-01', 'admin-1')).rejects.toThrow('Only open invoices can be changed');
    });

    it('void resets nextBillingAt to the period start so it can be reissued', async () => {
      mockPrisma.billingInvoice.findUnique.mockResolvedValue(open);
      await service.voidInvoice('inv-1', 'Wrong price', 'admin-1');
      expect(mockPrisma.billingInvoice.update).toHaveBeenCalledWith({ where: { id: 'inv-1' }, data: { status: 'VOID', voidReason: 'Wrong price' } });
      expect(mockPrisma.storeSubscription.update).toHaveBeenCalledWith({ where: { id: 'sub-1' }, data: { nextBillingAt: m(2026, 11, 16) } });
      expect(mockAudit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'invoice.void', tenantId: 't-1' }));
    });

    it('void reissues the period straight away when billing is on (no LOCKED gap until the next cron)', async () => {
      mockPrisma.billingInvoice.findUnique.mockResolvedValue(open);
      mockConfig.get.mockResolvedValue({ invoiceLeadDays: 0, billingEnabled: true } as any);
      const spy = jest.spyOn(service, 'ensureInvoice').mockResolvedValue({ id: 'inv-2' } as any);
      await service.voidInvoice('inv-1', 'Wrong price', 'admin-1');
      expect(spy).toHaveBeenCalledWith('sub-1', expect.any(Date), { ignoreDate: true });
    });

    it('void does not reissue while billing is globally off', async () => {
      mockPrisma.billingInvoice.findUnique.mockResolvedValue(open);
      mockConfig.get.mockResolvedValue({ invoiceLeadDays: 0, billingEnabled: false } as any);
      const spy = jest.spyOn(service, 'ensureInvoice');
      await service.voidInvoice('inv-1', 'Wrong price', 'admin-1');
      expect(spy).not.toHaveBeenCalled();
    });

    it('waive extends paidThroughAt and marks the ledger month', async () => {
      mockPrisma.billingInvoice.findUnique.mockResolvedValue(open);
      await service.waiveInvoice('inv-1', 'Goodwill', 'admin-1');
      expect(mockPrisma.billingInvoice.update).toHaveBeenCalledWith({ where: { id: 'inv-1' }, data: { status: 'WAIVED', voidReason: 'Goodwill' } });
      expect(mockPrisma.storeSubscription.update).toHaveBeenCalledWith({ where: { id: 'sub-1' }, data: { paidThroughAt: m(2026, 12, 15) } });
      expect(mockPrisma.subscriptionPayment.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { subscriptionId_month: { subscriptionId: 'sub-1', month: m(2026, 11, 1) } },
          create: expect.objectContaining({ paid: true, note: 'Waived: Goodwill' }),
        }),
      );
    });

    it('waive never pulls paid-through back behind a later paid period', async () => {
      mockPrisma.billingInvoice.findUnique.mockResolvedValue(open);
      mockPrisma.storeSubscription.findUnique.mockResolvedValue(sub({ paidThroughAt: m(2027, 1, 15) }));
      await service.waiveInvoice('inv-1', 'Goodwill', 'admin-1');
      expect(mockPrisma.storeSubscription.update).toHaveBeenCalledWith({ where: { id: 'sub-1' }, data: { paidThroughAt: m(2027, 1, 15) } });
    });

    it('extendGrace keeps the store unlocked through the chosen day (ends at the next Manila midnight)', async () => {
      mockPrisma.billingInvoice.findUnique.mockResolvedValue(open);
      await service.extendGrace('inv-1', '2026-12-01', 'admin-1');
      expect(mockPrisma.billingInvoice.update).toHaveBeenCalledWith({ where: { id: 'inv-1' }, data: { graceExtendedUntil: m(2026, 12, 2) } });
    });
  });

  describe('generateNow', () => {
    it('400s while billing is globally OFF', async () => {
      mockConfig.get.mockResolvedValueOnce({ invoiceLeadDays: 0, billingEnabled: false } as any);
      await expect(service.generateNow('t-1', 'admin-1')).rejects.toThrow(new BadRequestException('Billing is OFF globally'));
    });

    it('400s when the store is not ready to invoice', async () => {
      mockConfig.get.mockResolvedValue({ invoiceLeadDays: 0, billingEnabled: true } as any);
      mockPrisma.storeSubscription.findUnique.mockResolvedValue(sub({ priceCentavos: null }));
      await expect(service.generateNow('t-1', 'admin-1')).rejects.toThrow(
        'Store is not ready to invoice (check price, activation and billing toggle)',
      );
    });

    it('creates the invoice ahead of the billing date and audits it', async () => {
      mockConfig.get.mockResolvedValue({ invoiceLeadDays: 0, billingEnabled: true } as any);
      const inv = await service.generateNow('t-1', 'admin-1');
      expect(inv.id).toBe('inv-new');
      expect(mockAudit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'invoice.generate', tenantId: 't-1' }));
    });
  });
});
