import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BillingClaimsService } from './billing-claims.service';
import { BillingPaymentsService } from './billing-payments.service';
import { BillingAuditService } from './billing-audit.service';
import { PrismaService } from '../prisma/prisma.service';

const openInvoice = { id: 'inv-1', tenantId: 't-1', status: 'OPEN', number: 'KSF-202611-ABCDE', amountCentavos: 150000 };
const pendingClaim = {
  id: 'cl-1',
  invoiceId: 'inv-1',
  tenantId: 't-1',
  status: 'PENDING',
  amountCentavos: 150000,
  reference: 'BPI-778',
  paidAt: new Date('2026-11-17T02:00:00.000Z'),
};

const mockPrisma = {
  billingInvoice: { findUnique: jest.fn() },
  billingPaymentClaim: { updateMany: jest.fn(), create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  tenant: { findMany: jest.fn() },
};
const mockPayments = { recordPayment: jest.fn(async () => ({ applied: true, paymentId: 'bp-1' })) };
const mockAudit = { log: jest.fn() };

describe('BillingClaimsService', () => {
  let service: BillingClaimsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.billingInvoice.findUnique.mockResolvedValue({ ...openInvoice });
    mockPrisma.billingPaymentClaim.create.mockImplementation(async ({ data }: any) => ({ id: 'cl-new', ...data }));
    mockPrisma.billingPaymentClaim.findUnique.mockResolvedValue({ ...pendingClaim });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingClaimsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: BillingPaymentsService, useValue: mockPayments },
        { provide: BillingAuditService, useValue: mockAudit },
      ],
    }).compile();
    service = module.get(BillingClaimsService);
  });

  const dto = { amountCentavos: 150000, reference: 'BPI-778', paidAt: '2026-11-17T02:00:00.000Z', note: 'Sent from BPI app' };

  it('submit replaces an earlier pending claim', async () => {
    const claim = await service.submitClaim('t-1', 'inv-1', 'user-1', dto, null);
    expect(mockPrisma.billingPaymentClaim.updateMany).toHaveBeenCalledWith({
      where: { invoiceId: 'inv-1', status: 'PENDING' },
      data: { status: 'REJECTED', rejectReason: 'Replaced by a newer claim', reviewedAt: expect.any(Date) },
    });
    expect(claim).toMatchObject({ invoiceId: 'inv-1', tenantId: 't-1', submittedById: 'user-1', reference: 'BPI-778', status: 'PENDING' });
    expect(mockAudit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'claim.submit', tenantId: 't-1' }));
  });

  it("submit 404s for another tenant's invoice", async () => {
    await expect(service.submitClaim('t-2', 'inv-1', 'user-1', dto, null)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('submit rejects a non-OPEN invoice', async () => {
    mockPrisma.billingInvoice.findUnique.mockResolvedValue({ ...openInvoice, status: 'PAID' });
    await expect(service.submitClaim('t-1', 'inv-1', 'user-1', dto, null)).rejects.toThrow(
      new BadRequestException('This invoice is no longer open'),
    );
  });

  it('approve on an invoice that is no longer open is refused', async () => {
    mockPrisma.billingInvoice.findUnique.mockResolvedValue({ ...openInvoice, status: 'VOID' });
    await expect(service.approveClaim('cl-1', 'admin-1')).rejects.toThrow(new BadRequestException('This invoice is no longer open'));
    expect(mockPayments.recordPayment).not.toHaveBeenCalled();
  });

  it('approve records a bank_qr MANUAL payment and approves the claim in the same transaction', async () => {
    await service.approveClaim('cl-1', 'admin-1');
    expect(mockPrisma.billingPaymentClaim.update).not.toHaveBeenCalled();
    expect(mockPayments.recordPayment).toHaveBeenCalledWith({
      claimId: 'cl-1',
      invoiceId: 'inv-1',
      source: 'MANUAL',
      method: 'MANUAL',
      manualMethod: 'bank_qr',
      amountCentavos: 150000,
      paidAt: pendingClaim.paidAt,
      reference: 'BPI-778',
      note: 'Payment claim cl-1',
      actorUserId: 'admin-1',
    });
  });

  it('reject stores the reason atomically (only while PENDING)', async () => {
    mockPrisma.billingPaymentClaim.updateMany.mockResolvedValue({ count: 1 });
    await service.rejectClaim('cl-1', 'Reference not found in bank statement', 'admin-1');
    expect(mockPrisma.billingPaymentClaim.updateMany).toHaveBeenCalledWith({
      where: { id: 'cl-1', status: 'PENDING' },
      data: { status: 'REJECTED', rejectReason: 'Reference not found in bank statement', reviewedById: 'admin-1', reviewedAt: expect.any(Date) },
    });
  });

  it('a submitted claim stores rejectReason null explicitly', async () => {
    const claim = await service.submitClaim('t-1', 'inv-1', 'user-1', dto, null);
    expect(claim).toMatchObject({ rejectReason: null });
  });

  it.each(['approveClaim', 'rejectClaim'] as const)('%s refuses an already reviewed claim', async (method) => {
    mockPrisma.billingPaymentClaim.findUnique.mockResolvedValue({ ...pendingClaim, status: 'APPROVED' });
    await expect((service as any)[method]('cl-1', 'x', 'admin-1')).rejects.toThrow(new BadRequestException('This claim was already reviewed'));
  });

  it('listClaims returns newest first with store and invoice number', async () => {
    mockPrisma.billingPaymentClaim.findMany.mockResolvedValue([{ ...pendingClaim, createdAt: new Date() }]);
    mockPrisma.tenant.findMany.mockResolvedValue([{ id: 't-1', name: 'Downtown' }]);
    mockPrisma.billingInvoice.findUnique.mockResolvedValue(openInvoice);
    (mockPrisma as any).billingInvoice.findMany = jest.fn(async () => [openInvoice]);
    const rows = await service.listClaims('PENDING');
    expect(mockPrisma.billingPaymentClaim.findMany).toHaveBeenCalledWith({ where: { status: 'PENDING' }, orderBy: { createdAt: 'desc' }, take: 200 });
    expect(rows[0]).toMatchObject({ id: 'cl-1', storeName: 'Downtown', invoiceNumber: 'KSF-202611-ABCDE' });
  });
});
