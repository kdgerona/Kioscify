import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BillingPaymentsService } from './billing-payments.service';
import { BillingAuditService } from './billing-audit.service';
import { REPLACED_CLAIM_REASON } from './billing-status.service';
import { SubmitClaimDto } from './dto/claim.dto';

export type ClaimStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/**
 * "I've paid" claims for payments made to the owner's static bank QR, which
 * never pass through PayMongo and so can't be confirmed automatically.
 */
@Injectable()
export class BillingClaimsService {
  constructor(
    private prisma: PrismaService,
    private payments: BillingPaymentsService,
    private audit: BillingAuditService,
  ) {}

  async submitClaim(
    tenantId: string,
    invoiceId: string,
    userId: string,
    dto: SubmitClaimDto,
    receiptImageUrl: string | null,
  ) {
    const invoice = await this.prisma.billingInvoice.findUnique({ where: { id: invoiceId } });
    if (!invoice || invoice.tenantId !== tenantId) throw new NotFoundException(`Invoice ${invoiceId} not found`);
    if (invoice.status !== 'OPEN') throw new BadRequestException('This invoice is no longer open');

    await this.prisma.billingPaymentClaim.updateMany({
      where: { invoiceId, status: 'PENDING' },
      data: { status: 'REJECTED', rejectReason: REPLACED_CLAIM_REASON, reviewedAt: new Date() },
    });
    const claim = await this.prisma.billingPaymentClaim.create({
      data: {
        invoiceId,
        tenantId,
        submittedById: userId,
        amountCentavos: dto.amountCentavos,
        reference: dto.reference.trim(),
        paidAt: new Date(dto.paidAt),
        receiptImageUrl,
        note: dto.note?.trim() || null,
        status: 'PENDING',
        // Stored explicitly: status filters must never depend on a missing field.
        rejectReason: null,
      },
    });
    await this.audit.log({
      tenantId,
      actorUserId: userId,
      action: 'claim.submit',
      after: { invoice: invoice.number, amountCentavos: dto.amountCentavos, reference: claim.reference },
    });
    return claim;
  }

  async listClaims(status?: ClaimStatus) {
    const claims = await this.prisma.billingPaymentClaim.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const [tenants, invoices] = await Promise.all([
      this.prisma.tenant.findMany({
        where: { id: { in: [...new Set(claims.map(c => c.tenantId))] } },
        select: { id: true, name: true },
      }),
      this.prisma.billingInvoice.findMany({
        where: { id: { in: [...new Set(claims.map(c => c.invoiceId))] } },
        select: { id: true, number: true, amountCentavos: true, status: true },
      }),
    ]);
    const tenantName = new Map(tenants.map(t => [t.id, t.name]));
    const invoiceById = new Map(invoices.map(i => [i.id, i]));
    return claims.map(c => ({
      ...c,
      storeName: tenantName.get(c.tenantId) ?? null,
      invoiceNumber: invoiceById.get(c.invoiceId)?.number ?? null,
      invoiceAmountCentavos: invoiceById.get(c.invoiceId)?.amountCentavos ?? null,
      invoiceStatus: invoiceById.get(c.invoiceId)?.status ?? null,
    }));
  }

  private async requirePending(id: string) {
    const claim = await this.prisma.billingPaymentClaim.findUnique({ where: { id } });
    if (!claim) throw new NotFoundException(`Claim ${id} not found`);
    if (claim.status !== 'PENDING') throw new BadRequestException('This claim was already reviewed');
    return claim;
  }

  async approveClaim(id: string, actorUserId: string) {
    const claim = await this.requirePending(id);
    const invoice = await this.prisma.billingInvoice.findUnique({ where: { id: claim.invoiceId } });
    // Paid, voided or waived meanwhile: approving would record money without
    // clearing what the store owes now. Reject it, or record it by hand.
    if (!invoice || invoice.status !== 'OPEN') throw new BadRequestException('This invoice is no longer open');
    await this.payments.recordPayment({
      claimId: id,
      invoiceId: claim.invoiceId,
      source: 'MANUAL',
      method: 'MANUAL',
      manualMethod: 'bank_qr',
      amountCentavos: claim.amountCentavos,
      paidAt: claim.paidAt,
      reference: claim.reference,
      note: `Payment claim ${claim.id}`,
      actorUserId,
    });
    await this.audit.log({ tenantId: claim.tenantId, actorUserId, action: 'claim.approve', after: { claim: id } });
  }

  async rejectClaim(id: string, reason: string, actorUserId: string) {
    const claim = await this.requirePending(id);
    const rejected = await this.prisma.billingPaymentClaim.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'REJECTED', rejectReason: reason, reviewedById: actorUserId, reviewedAt: new Date() },
    });
    if (rejected.count === 0) throw new BadRequestException('This claim was already reviewed');
    await this.audit.log({ tenantId: claim.tenantId, actorUserId, action: 'claim.reject', after: { claim: id, reason } });
  }
}
