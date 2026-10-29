import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BillingInvoice, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BillingConfigService } from './billing-config.service';
import { BillingAuditService } from './billing-audit.service';
import { addZonedDays, addZonedMonthsClamped, startOfZonedDay, zonedDayOfMonth } from '../common/utils/timezone';
import { isUniqueViolation } from '../common/utils/job-lock.util';
import { generateInvoiceNumber, generatePayToken } from './invoice-number.util';
import { markLedgerMonthPaid } from './billing-ledger.util';
import { effectiveNextBillingAt, laterOf } from '../common/utils/billing-dates.util';

const NUMBER_RETRIES = 3;

function isNumberCollision(e: unknown): boolean {
  const target = (e as Prisma.PrismaClientKnownRequestError).meta?.target;
  return JSON.stringify(target ?? '').includes('number');
}

@Injectable()
export class BillingInvoicesService {
  constructor(
    private prisma: PrismaService,
    private billingConfig: BillingConfigService,
    private audit: BillingAuditService,
  ) {}

  private findOpen(subscriptionId: string) {
    return this.prisma.billingInvoice.findFirst({
      where: { subscriptionId, status: 'OPEN' },
      orderBy: { dueAt: 'asc' },
    });
  }

  /**
   * Idempotent: at most one OPEN invoice per store, and the
   * (subscriptionId, periodStart, revision) unique index makes concurrent
   * callers (scheduler, "Generate now", "Pay now") converge on one row.
   */
  async ensureInvoice(
    subscriptionId: string,
    now: Date = new Date(),
    opts: { ignoreDate?: boolean } = {},
  ): Promise<BillingInvoice | null> {
    const sub = await this.prisma.storeSubscription.findUnique({ where: { id: subscriptionId } });
    if (!sub || sub.billingEnabled !== true || !sub.activatedAt || !sub.priceCentavos || !sub.nextBillingAt) {
      return null;
    }

    const open = await this.findOpen(subscriptionId);
    if (open) return open;

    const config = await this.billingConfig.get();
    // Never invoice a period that is already paid
    const nextBillingAt = effectiveNextBillingAt(sub.nextBillingAt, sub.paidThroughAt)!;
    if (!opts.ignoreDate && now < addZonedDays(nextBillingAt, -config.invoiceLeadDays)) return null;

    const periodStart = nextBillingAt;
    const anchor = sub.anchorDay ?? zonedDayOfMonth(periodStart);
    const periodEnd = addZonedMonthsClamped(periodStart, 1, anchor);
    const revision = await this.prisma.billingInvoice.count({
      where: { subscriptionId, periodStart, status: 'VOID' },
    });
    // A reissue after a void gets a fresh grace window; a normal (even late)
    // invoice stays due on its period start, matching the "virtual" due date
    // stores already saw before the scheduler created the row.
    const today = startOfZonedDay(now);
    const dueAt = revision === 0 || today <= periodStart ? periodStart : today;

    for (let attempt = 0; attempt < NUMBER_RETRIES; attempt++) {
      try {
        return await this.prisma.$transaction(async tx => {
          const invoice = await tx.billingInvoice.create({
            data: {
              number: generateInvoiceNumber(periodStart),
              subscriptionId,
              tenantId: sub.tenantId,
              periodStart,
              revision,
              periodEnd,
              issuedAt: now,
              dueAt,
              amountCentavos: sub.priceCentavos!,
              payToken: generatePayToken(),
            },
          });
          await tx.storeSubscription.update({ where: { id: subscriptionId }, data: { nextBillingAt: periodEnd } });
          return invoice;
        });
      } catch (e) {
        // P2034: a concurrent caller's insert won (MongoDB write conflict).
        const conflict = e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2034';
        if (!isUniqueViolation(e) && !conflict) throw e;
        if (!conflict && isNumberCollision(e)) continue;
        return this.findOpen(subscriptionId);
      }
    }
    throw new Error('Could not allocate a unique invoice number');
  }

  /** Platform "Generate invoice now": ignores the billing date, still one OPEN invoice at a time. */
  async generateNow(tenantId: string, actorUserId: string): Promise<BillingInvoice> {
    const config = await this.billingConfig.get();
    if (!config.billingEnabled) throw new BadRequestException('Billing is OFF globally');
    const sub = await this.prisma.storeSubscription.findUnique({ where: { tenantId } });
    const invoice = sub ? await this.ensureInvoice(sub.id, new Date(), { ignoreDate: true }) : null;
    if (!invoice) {
      throw new BadRequestException('Store is not ready to invoice (check price, activation and billing toggle)');
    }
    await this.audit.log({ tenantId, actorUserId, action: 'invoice.generate', after: { invoice: invoice.number } });
    return invoice;
  }

  /** Scheduler entry point: invoices every billed store whose billing date has arrived. */
  async generateDue(now: Date = new Date()): Promise<number> {
    const config = await this.billingConfig.get();
    const subs = await this.prisma.storeSubscription.findMany({
      where: {
        billingEnabled: true,
        nextBillingAt: { lte: addZonedDays(now, config.invoiceLeadDays) },
        tenant: { is: { isActive: true, tombstone: { not: 1 } } },
      },
      select: { id: true },
    });
    let created = 0;
    for (const s of subs) {
      const invoice = await this.ensureInvoice(s.id, now);
      if (invoice && invoice.issuedAt.getTime() === now.getTime()) created += 1;
    }
    return created;
  }

  private async requireOpen(id: string): Promise<BillingInvoice> {
    const invoice = await this.prisma.billingInvoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException(`Invoice ${id} not found`);
    if (invoice.status !== 'OPEN') throw new BadRequestException('Only open invoices can be changed');
    return invoice;
  }

  /** "Issued in error": the period is re-invoiced (revision + 1) at the current price. */
  async voidInvoice(id: string, reason: string, actorUserId: string) {
    const invoice = await this.requireOpen(id);
    await this.prisma.$transaction(async tx => {
      await tx.billingInvoice.update({ where: { id }, data: { status: 'VOID', voidReason: reason } });
      await tx.storeSubscription.update({
        where: { id: invoice.subscriptionId },
        data: { nextBillingAt: invoice.periodStart },
      });
    });
    await this.audit.log({
      tenantId: invoice.tenantId,
      actorUserId,
      action: 'invoice.void',
      after: { invoice: invoice.number, reason },
    });
    // Reissue now: until a new invoice exists the old period start reads as a
    // past-due virtual invoice, which could lock the store until the next run.
    if ((await this.billingConfig.get()).billingEnabled) {
      await this.ensureInvoice(invoice.subscriptionId, new Date(), { ignoreDate: true });
    }
  }

  /** Forgive the period: it counts as covered, with no payment recorded. */
  async waiveInvoice(id: string, reason: string, actorUserId: string) {
    const invoice = await this.requireOpen(id);
    await this.prisma.$transaction(async tx => {
      await tx.billingInvoice.update({ where: { id }, data: { status: 'WAIVED', voidReason: reason } });
      const sub = await tx.storeSubscription.findUnique({ where: { id: invoice.subscriptionId } });
      await tx.storeSubscription.update({
        where: { id: invoice.subscriptionId },
        data: { paidThroughAt: laterOf(sub?.paidThroughAt, addZonedDays(invoice.periodEnd, -1)) },
      });
      await markLedgerMonthPaid(tx, invoice.subscriptionId, invoice.periodStart, new Date(), `Waived: ${reason}`);
    });
    await this.audit.log({
      tenantId: invoice.tenantId,
      actorUserId,
      action: 'invoice.waive',
      after: { invoice: invoice.number, reason },
    });
  }

  async extendGrace(id: string, until: string, actorUserId: string) {
    const invoice = await this.requireOpen(id);
    // "Extend until Dec 1" keeps the store unlocked through Dec 1.
    const graceExtendedUntil = addZonedDays(startOfZonedDay(new Date(until)), 1);
    await this.prisma.billingInvoice.update({ where: { id }, data: { graceExtendedUntil } });
    await this.audit.log({
      tenantId: invoice.tenantId,
      actorUserId,
      action: 'invoice.extend_grace',
      before: { graceExtendedUntil: invoice.graceExtendedUntil?.toISOString() ?? null },
      after: { invoice: invoice.number, graceExtendedUntil: graceExtendedUntil.toISOString() },
    });
  }

  listForTenant(tenantId: string, limit = 50) {
    return this.prisma.billingInvoice.findMany({
      where: { tenantId },
      orderBy: [{ periodStart: 'desc' }, { revision: 'desc' }],
      take: limit,
    });
  }
}
