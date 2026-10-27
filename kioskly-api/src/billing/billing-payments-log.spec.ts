import { Test, TestingModule } from '@nestjs/testing';
import { BillingPaymentsService } from './billing-payments.service';
import { BillingConfigService } from './billing-config.service';
import { BillingAuditService } from './billing-audit.service';
import { BillingResubscribeService } from './billing-resubscribe.service';
import { PrismaService } from '../prisma/prisma.service';

const payments = [
  {
    id: 'bp-2',
    tenantId: 't-1',
    invoiceId: 'inv-1',
    paidAt: new Date('2026-11-16T03:00:00.000Z'),
    amountCentavos: 150050,
    method: 'QRPH',
    source: 'WEBHOOK',
    manualMethod: null,
    reference: 'pay_1',
    flagged: false,
    note: null,
  },
  {
    id: 'bp-1',
    tenantId: 't-2',
    invoiceId: null,
    paidAt: new Date('2026-10-01T03:00:00.000Z'),
    amountCentavos: 450000,
    method: 'PREPAID',
    source: 'PREPAYMENT',
    manualMethod: 'bank_transfer',
    reference: 'BT-9',
    flagged: false,
    note: 'Q4, "paid early"',
  },
];

const mockPrisma = {
  billingPayment: { findMany: jest.fn(async () => payments), count: jest.fn(async () => 2) },
  tenant: {
    findMany: jest.fn(async () => [
      { id: 't-1', name: 'Downtown', company: { name: 'Acme Co' }, brand: { name: 'Mango Cafe' } },
      { id: 't-2', name: 'Uptown', company: { name: 'Acme Co' }, brand: { name: 'Mango Cafe' } },
    ]),
  },
  billingInvoice: { findMany: jest.fn(async () => [{ id: 'inv-1', number: 'KSF-202611-ABCDE' }]) },
};

describe('BillingPaymentsService payments log', () => {
  let service: BillingPaymentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingPaymentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: BillingConfigService, useValue: {} },
        { provide: BillingAuditService, useValue: {} },
        { provide: BillingResubscribeService, useValue: {} },
      ],
    }).compile();
    service = module.get(BillingPaymentsService);
  });

  it('lists payments newest first with store, company, brand and invoice number', async () => {
    const r = await service.listPayments({ page: 1, limit: 50 });
    expect(mockPrisma.billingPayment.findMany).toHaveBeenCalledWith({ where: {}, orderBy: { paidAt: 'desc' }, skip: 0, take: 50 });
    expect(r.data[0]).toEqual({
      id: 'bp-2',
      paidAt: payments[0].paidAt,
      storeName: 'Downtown',
      companyName: 'Acme Co',
      brandName: 'Mango Cafe',
      invoiceNumber: 'KSF-202611-ABCDE',
      amountCentavos: 150050,
      method: 'QRPH',
      source: 'WEBHOOK',
      manualMethod: null,
      reference: 'pay_1',
      flagged: false,
      amountMismatch: false,
      note: null,
    });
    expect(r.pagination).toEqual({ page: 1, limit: 50, total: 2, totalPages: 1 });
  });

  it('payments CSV has one row per payment with peso amounts and no internal ids beyond invoice number', async () => {
    const csv = await service.paymentsCsv();
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('paidAt,store,company,brand,invoiceNumber,amount,method,source,manualMethod,reference,flagged,amountMismatch,note');
    // paidAt is Manila local time.
    expect(lines[1]).toBe('2026-11-16 11:00,Downtown,Acme Co,Mango Cafe,KSF-202611-ABCDE,1500.50,QRPH,WEBHOOK,,pay_1,false,false,');
    expect(lines[2]).toBe('2026-10-01 11:00,Uptown,Acme Co,Mango Cafe,,4500.00,PREPAID,PREPAYMENT,bank_transfer,BT-9,false,false,"Q4, ""paid early"""');
    expect(csv).not.toMatch(/bp-|t-1|inv-1/);
  });

  it('payments CSV neutralises spreadsheet formulas in typed-in fields', async () => {
    mockPrisma.billingPayment.findMany.mockResolvedValueOnce([
      { ...payments[1], reference: '=HYPERLINK("http://x")', note: '+cmd' },
    ] as any);
    const lines = (await service.paymentsCsv()).split('\r\n');
    expect(lines[1]).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(lines[1].endsWith(",'+cmd")).toBe(true);
  });
});
