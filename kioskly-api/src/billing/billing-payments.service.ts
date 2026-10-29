import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BillingPaymentMethod, BillingPaymentSource, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BillingConfigService } from './billing-config.service';
import { BillingAuditService } from './billing-audit.service';
import { BillingResubscribeService } from './billing-resubscribe.service';
import { markLedgerMonthPaid } from './billing-ledger.util';
import { effectiveNextBillingAt, laterOf } from '../common/utils/billing-dates.util';
import { toCsv } from '../export/export-csv.util';
import { MarkPaidDto, PrepaymentDto } from './dto/billing-actions.dto';
import {
  addZonedDays,
  addZonedMonthsClamped,
  getZonedMonthBounds,
  startOfZonedDay,
  zonedDayOfMonth,
} from '../common/utils/timezone';

export interface RecordPaymentInput {
  invoiceId: string;
  source: BillingPaymentSource;
  method: BillingPaymentMethod;
  amountCentavos: number;
  paidAt: Date;
  reference?: string | null;
  providerIntentId?: string | null;
  manualMethod?: string | null;
  note?: string | null;
  actorUserId?: string | null;
  /** QR attempt to mark succeeded in the same transaction (webhook / reconcile). */
  attemptId?: string | null;
  /** Payment claim to approve in the same transaction (bank-QR claims). */
  claimId?: string | null;
}

export interface RecordPaymentResult {
  applied: boolean;
  paymentId: string;
  /** The same provider payment was already applied (e.g. reconcile beat the webhook) — nothing written. */
  duplicate?: boolean;
}

const WRITE_CONFLICT_RETRIES = 3;

/** "2026-11-16 11:00" in Manila time — how the platform admin reads dates. */
function formatManilaDateTime(d: Date): string {
  return new Date(d.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 16).replace('T', ' ');
}

/** Typed-in text can't run as a spreadsheet formula when the CSV is opened. */
function csvText(v: string | null): string | null {
  return v && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

function isWriteConflict(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2034';
}

@Injectable()
export class BillingPaymentsService {
  constructor(
    private prisma: PrismaService,
    private billingConfig: BillingConfigService,
    private audit: BillingAuditService,
    private resubscribe: BillingResubscribeService,
  ) {}

  /**
   * The one path every payment takes — webhook, reconcile, manual and claim
   * approval. The conditional OPEN→PAID update is the idempotency gate: a
   * replayed webhook or a second concurrent caller sees count 0 and is
   * recorded as a flagged payment without extending the store again.
   */
  async recordPayment(input: RecordPaymentInput): Promise<RecordPaymentResult> {
    // Two concurrent writers on the same invoice surface on MongoDB as a
    // write conflict (P2034); retrying lets the loser see the invoice as PAID
    // and fall into the duplicate check below.
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.recordPaymentOnce(input);
      } catch (e) {
        if (!isWriteConflict(e) || attempt >= WRITE_CONFLICT_RETRIES) throw e;
      }
    }
  }

  private async recordPaymentOnce(input: RecordPaymentInput): Promise<RecordPaymentResult> {
    const config = await this.billingConfig.get();

    const result = await this.prisma.$transaction(async tx => {
      const invoice = await tx.billingInvoice.findUnique({ where: { id: input.invoiceId } });
      if (!invoice) throw new NotFoundException(`Invoice ${input.invoiceId} not found`);

      if (input.claimId) {
        const approved = await tx.billingPaymentClaim.updateMany({
          where: { id: input.claimId, status: 'PENDING' },
          data: { status: 'APPROVED', reviewedById: input.actorUserId ?? null, reviewedAt: new Date() },
        });
        if (approved.count === 0) throw new BadRequestException('This claim was already reviewed');
      }
      if (input.attemptId) {
        await tx.billingPaymentAttempt.update({ where: { id: input.attemptId }, data: { status: 'succeeded' } });
      }

      const claimed = await tx.billingInvoice.updateMany({
        where: { id: invoice.id, status: 'OPEN' },
        data: { status: 'PAID', paidAt: input.paidAt, paymentMethod: input.method },
      });

      const paymentData = {
        tenantId: invoice.tenantId,
        subscriptionId: invoice.subscriptionId,
        invoiceId: invoice.id,
        source: input.source,
        method: input.method,
        manualMethod: input.manualMethod ?? null,
        amountCentavos: input.amountCentavos,
        paidAt: input.paidAt,
        reference: input.reference ?? null,
        providerIntentId: input.providerIntentId ?? null,
        note: input.note ?? null,
        recordedById: input.actorUserId ?? null,
      };

      if (claimed.count === 0) {
        if (input.providerIntentId) {
          const existing = await tx.billingPayment.findFirst({
            where: { invoiceId: invoice.id, providerIntentId: input.providerIntentId, flagged: false },
          });
          if (existing) return { applied: false, duplicate: true, paymentId: existing.id, invoice };
        }
        const payment = await tx.billingPayment.create({ data: { ...paymentData, flagged: true } });
        return { applied: false, paymentId: payment.id, invoice };
      }

      const sub = await tx.storeSubscription.findUnique({ where: { id: invoice.subscriptionId } });
      const graceDays = sub?.graceDaysOverride ?? config.defaultGraceDays;
      let graceEndsAt = addZonedDays(invoice.dueAt, graceDays);
      if (invoice.graceExtendedUntil && invoice.graceExtendedUntil > graceEndsAt) graceEndsAt = invoice.graceExtendedUntil;

      let periodStart = invoice.periodStart;
      let periodEnd = invoice.periodEnd;
      const subData: { nextBillingAt?: Date; anchorDay?: number; paidThroughAt?: Date } = {};
      if (input.paidAt >= graceEndsAt) {
        // Paid after grace (locked or not): the month starts when they pay,
        // so months spent unpaid past grace are never billed.
        periodStart = startOfZonedDay(input.paidAt);
        const anchorDay = zonedDayOfMonth(input.paidAt);
        periodEnd = addZonedMonthsClamped(periodStart, 1, anchorDay);
        await tx.billingInvoice.update({ where: { id: invoice.id }, data: { periodStart, periodEnd } });
        subData.nextBillingAt = periodEnd;
        subData.anchorDay = anchorDay;
      } else {
        subData.nextBillingAt = !sub?.nextBillingAt || sub.nextBillingAt < periodEnd ? periodEnd : sub.nextBillingAt;
      }
      // Paying an older invoice after a later period was already paid must not
      // pull paid-through back (or leave the next billing date inside it)
      subData.paidThroughAt = laterOf(sub?.paidThroughAt, addZonedDays(periodEnd, -1));
      subData.nextBillingAt = effectiveNextBillingAt(subData.nextBillingAt, subData.paidThroughAt)!;
      await tx.storeSubscription.update({ where: { id: invoice.subscriptionId }, data: subData });

      await markLedgerMonthPaid(
        tx,
        invoice.subscriptionId,
        periodStart,
        input.paidAt,
        `Invoice ${invoice.number} (${input.method})`,
      );

      const payment = await tx.billingPayment.create({
        data: { ...paymentData, flagged: false, amountMismatch: input.amountCentavos !== invoice.amountCentavos },
      });
      return { applied: true, paymentId: payment.id, invoice };
    });

    if (result.duplicate) return { applied: false, duplicate: true, paymentId: result.paymentId };

    await this.audit.log({
      tenantId: result.invoice.tenantId,
      actorUserId: input.actorUserId ?? null,
      action: result.applied ? 'payment.record' : 'payment.flagged',
      after: {
        invoice: result.invoice.number,
        source: input.source,
        method: input.method,
        amountCentavos: input.amountCentavos,
        reference: input.reference ?? null,
      },
    });

    // Resubscribe: paying is what brings an inactive store back. Runs after
    // the payment is committed, so a failure here can never undo a payment.
    if (result.applied) {
      try {
        await this.resubscribe.reactivateAfterPayment(result.invoice.tenantId, input.actorUserId ?? null);
      } catch {
        // A platform admin can still reactivate it from Subscriptions → Inactive stores
      }
    }
    return { applied: result.applied, paymentId: result.paymentId };
  }

  async markPaid(invoiceId: string, dto: MarkPaidDto, actorUserId: string) {
    const invoice = await this.prisma.billingInvoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundException(`Invoice ${invoiceId} not found`);
    if (invoice.status !== 'OPEN') throw new BadRequestException('Only open invoices can be changed');
    return this.recordPayment({
      invoiceId,
      source: 'MANUAL',
      method: 'MANUAL',
      manualMethod: dto.manualMethod,
      amountCentavos: invoice.amountCentavos,
      paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
      reference: dto.reference ?? null,
      note: dto.note ?? null,
      actorUserId,
    });
  }

  /** Money paid outside the platform in advance: nothing is invoiced before `nextBillingAt`. */
  async recordPrepayment(tenantId: string, dto: PrepaymentDto, actorUserId: string) {
    const sub = await this.prisma.storeSubscription.findUnique({ where: { tenantId } });
    if (!sub) throw new NotFoundException(`Store ${tenantId} has no subscription yet — set an activation date first`);

    const paidThroughAt = startOfZonedDay(new Date(dto.paidThroughAt));
    const nextBillingAt = startOfZonedDay(new Date(dto.nextBillingAt));
    if (nextBillingAt <= paidThroughAt) {
      throw new BadRequestException('Next billing date must be after the paid-through date');
    }
    // An open invoice would keep the store due (and lockable) regardless of
    // the prepayment, so it has to be resolved first.
    const open = await this.prisma.billingInvoice.findFirst({ where: { subscriptionId: sub.id, status: 'OPEN' } });
    if (open) throw new BadRequestException('This store has an open invoice — mark it paid, waive or void it first');
    const now = new Date();

    await this.prisma.$transaction(async tx => {
      await tx.billingPayment.create({
        data: {
          tenantId,
          subscriptionId: sub.id,
          invoiceId: null,
          source: 'PREPAYMENT',
          method: 'PREPAID',
          manualMethod: dto.manualMethod,
          amountCentavos: dto.amountCentavos,
          monthsCovered: dto.monthsCovered,
          paidAt: now,
          reference: dto.reference ?? null,
          note: dto.note ?? null,
          recordedById: actorUserId,
        },
      });
      await tx.storeSubscription.update({
        where: { id: sub.id },
        data: { paidThroughAt, nextBillingAt, nextBillingOverridden: true, anchorDay: zonedDayOfMonth(nextBillingAt) },
      });
      const lastMonth = getZonedMonthBounds(paidThroughAt).start;
      const label = `Prepaid (${dto.manualMethod}${dto.reference ? ` · ${dto.reference}` : ''})`;
      for (let i = 0; i < dto.monthsCovered; i++) {
        await markLedgerMonthPaid(tx, sub.id, addZonedMonthsClamped(lastMonth, -i, 1), now, label);
      }
    });

    await this.audit.log({
      tenantId,
      actorUserId,
      action: 'payment.prepayment',
      before: {
        paidThroughAt: sub.paidThroughAt?.toISOString() ?? null,
        nextBillingAt: sub.nextBillingAt?.toISOString() ?? null,
      },
      after: {
        amountCentavos: dto.amountCentavos,
        monthsCovered: dto.monthsCovered,
        paidThroughAt: paidThroughAt.toISOString(),
        nextBillingAt: nextBillingAt.toISOString(),
        reference: dto.reference ?? null,
      },
    });
  }

  /** QRPH (PayMongo) collections this Manila month — what counts toward the account limit. */
  async qrphCollectedThisMonth(now: Date = new Date()): Promise<number> {
    const { start, end } = getZonedMonthBounds(now);
    const agg = await this.prisma.billingPayment.aggregate({
      _sum: { amountCentavos: true },
      where: { method: 'QRPH', flagged: false, paidAt: { gte: start, lte: end } },
    });
    return agg._sum.amountCentavos ?? 0;
  }

  /** Cross-store payments log, newest first (every source: webhook, reconcile, manual, prepayment). */
  async listPayments(params: { page?: number; limit?: number; tenantId?: string } = {}) {
    const page = Number(params.page ?? 1);
    const limit = Number(params.limit ?? 50);
    const where = params.tenantId ? { tenantId: params.tenantId } : {};
    const [rows, total] = await Promise.all([
      this.prisma.billingPayment.findMany({ where, orderBy: { paidAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.billingPayment.count({ where }),
    ]);
    return {
      data: await this.decorate(rows),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  /** All payments as CSV, amounts in pesos — for the Platform Admin "Export CSV" button. */
  async paymentsCsv(): Promise<string> {
    const rows = await this.decorate(await this.prisma.billingPayment.findMany({ orderBy: { paidAt: 'desc' } }));
    const header = 'paidAt,store,company,brand,invoiceNumber,amount,method,source,manualMethod,reference,flagged,amountMismatch,note';
    if (rows.length === 0) return `${header}\r\n`;
    return toCsv(
      rows.map(r => ({
        paidAt: formatManilaDateTime(r.paidAt),
        store: csvText(r.storeName),
        company: csvText(r.companyName),
        brand: csvText(r.brandName),
        invoiceNumber: r.invoiceNumber,
        amount: (r.amountCentavos / 100).toFixed(2),
        method: r.method,
        source: r.source,
        manualMethod: r.manualMethod,
        reference: csvText(r.reference),
        flagged: r.flagged,
        amountMismatch: r.amountMismatch,
        note: csvText(r.note),
      })),
    );
  }

  private async decorate(
    rows: Array<{
      id: string;
      tenantId: string;
      invoiceId: string | null;
      paidAt: Date;
      amountCentavos: number;
      method: BillingPaymentMethod;
      source: BillingPaymentSource;
      manualMethod: string | null;
      reference: string | null;
      flagged: boolean;
      amountMismatch?: boolean | null;
      note: string | null;
    }>,
  ) {
    const [tenants, invoices] = await Promise.all([
      this.prisma.tenant.findMany({
        where: { id: { in: [...new Set(rows.map(r => r.tenantId))] } },
        select: { id: true, name: true, company: { select: { name: true } }, brand: { select: { name: true } } },
      }),
      this.prisma.billingInvoice.findMany({
        where: { id: { in: [...new Set(rows.map(r => r.invoiceId).filter((id): id is string => !!id))] } },
        select: { id: true, number: true },
      }),
    ]);
    const tenantById = new Map(tenants.map(t => [t.id, t]));
    const numberById = new Map(invoices.map(i => [i.id, i.number]));
    return rows.map(r => {
      const t = tenantById.get(r.tenantId);
      return {
        id: r.id,
        paidAt: r.paidAt,
        storeName: t?.name ?? null,
        companyName: t?.company?.name ?? null,
        brandName: t?.brand?.name ?? null,
        invoiceNumber: r.invoiceId ? (numberById.get(r.invoiceId) ?? null) : null,
        amountCentavos: r.amountCentavos,
        method: r.method,
        source: r.source,
        manualMethod: r.manualMethod,
        reference: r.reference,
        flagged: r.flagged,
        amountMismatch: r.amountMismatch ?? false,
        note: r.note,
      };
    });
  }
}
