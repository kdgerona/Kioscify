import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BillingConfigService } from './billing-config.service';
import { BillingStatusService } from './billing-status.service';
import { BillingStatusResult, getTrialEndsAt } from '../common/utils/billing-status.util';
import { describeStoreView } from '../common/utils/billing-copy.util';
import { addZonedDays } from '../common/utils/timezone';
import { toSubscriptionInput } from './billing-status.service';
import { BillingRemindersService, reminderCopy } from './billing-reminders.service';

export const STORE_ADMIN_ROLES = ['STORE_ADMIN', 'ADMIN'];

export interface BillingMeUser {
  id: string;
  role: string;
  tenantId: string;
}

@Injectable()
export class BillingMeService {
  constructor(
    private prisma: PrismaService,
    private billingConfig: BillingConfigService,
    private billingStatus: BillingStatusService,
    private reminders: BillingRemindersService,
  ) {}

  /** Everything a store client needs to render the banner / lock and to cache for offline use. */
  async getMe(user: BillingMeUser) {
    const config = await this.billingConfig.get();
    const statusConfig = this.billingConfig.toStatusConfig(config);
    const status = await this.billingStatus.forTenant(user.tenantId);
    // Clients poll this after paying; refreshing the per-request cache means
    // the very next API call sees the unlock too.
    this.billingStatus.prime(user.tenantId, status);
    const canPay = STORE_ADMIN_ROLES.includes(user.role);
    const storeView = describeStoreView(status, canPay ? 'admin' : 'cashier');
    const base = {
      status,
      storeView,
      canPay,
      pendingReminder: null as null | { id: string; offsetDays: number; title: string; body: string },
      serverTime: new Date(),
      pollSeconds: config.overduePollSeconds,
    };

    // Billing OFF: identical to today — nothing to show, no further reads.
    if (!config.billingEnabled) {
      return { ...base, plan: null, openInvoice: null, cache: this.cache(status, null) };
    }

    const sub = await this.prisma.storeSubscription.findUnique({ where: { tenantId: user.tenantId } });
    const invoice = status.openInvoiceId
      ? await this.prisma.billingInvoice.findFirst({ where: { id: status.openInvoiceId } })
      : null;
    const graceDays = sub?.graceDaysOverride ?? config.defaultGraceDays;

    // One-time reminder notice — store admins only (decision: recipients are store admins).
    if (canPay && invoice) {
      const reminder = await this.reminders.pendingFor(invoice.id, user.id);
      if (reminder) {
        base.pendingReminder = {
          id: reminder.id,
          offsetDays: reminder.offsetDays,
          title: reminderCopy(reminder.offsetDays, status.daysLeft ?? 0, status.enforcement).title,
          body: storeView.body,
        };
      }
    }

    return {
      ...base,
      plan: sub
        ? {
            billingEnabled: sub.billingEnabled ?? null,
            priceCentavos: sub.priceCentavos ?? null,
            trialEndsAt: getTrialEndsAt(toSubscriptionInput(sub), statusConfig),
            paidThroughAt: sub.paidThroughAt ?? null,
            nextBillingAt: sub.nextBillingAt ?? null,
          }
        : null,
      openInvoice: invoice
        ? {
            id: invoice.id,
            number: invoice.number,
            amountCentavos: invoice.amountCentavos,
            dueAt: invoice.dueAt,
            periodStart: invoice.periodStart,
            periodEnd: invoice.periodEnd,
          }
        : null,
      cache: this.cache(status, graceDays),
    };
  }

  /**
   * What a kiosk keeps for offline enforcement: `validUntil` is the moment
   * this (not yet locked) status would turn LOCKED if the device never
   * reaches the API again.
   */
  private cache(status: BillingStatusResult, graceDays: number | null) {
    let validUntil: Date | null = null;
    if (status.enforcement && graceDays !== null) {
      if (status.status === 'DUE') {
        // A pending "I've paid" claim keeps the store open past grace —
        // offline kiosks must honour that hold too.
        validUntil = status.graceEndsAt;
        if (status.claimHoldEndsAt && (!validUntil || status.claimHoldEndsAt > validUntil)) {
          validUntil = status.claimHoldEndsAt;
        }
      }
      else if (status.status === 'ACTIVE' || status.status === 'TRIAL') {
        const nextDue = status.dueAt ?? status.nextBillingAt;
        validUntil = nextDue ? addZonedDays(nextDue, graceDays) : null;
      }
    }
    return {
      status: status.status,
      dueAt: status.dueAt,
      graceEndsAt: status.graceEndsAt,
      enforcement: status.enforcement,
      validUntil,
    };
  }

  async listInvoices(tenantId: string) {
    const invoices = await this.prisma.billingInvoice.findMany({
      where: { tenantId },
      orderBy: [{ periodStart: 'desc' }, { revision: 'desc' }],
      take: 100,
    });
    const payments = await this.prisma.billingPayment.findMany({
      where: { invoiceId: { in: invoices.map(i => i.id) }, flagged: false },
      select: { invoiceId: true, reference: true, manualMethod: true, flagged: true },
    });
    const byInvoice = new Map(payments.map(p => [p.invoiceId, p]));
    return invoices.map(i => ({
      id: i.id,
      number: i.number,
      periodStart: i.periodStart,
      periodEnd: i.periodEnd,
      amountCentavos: i.amountCentavos,
      dueAt: i.dueAt,
      status: i.status,
      paidAt: i.paidAt,
      paymentMethod: i.paymentMethod,
      reference: byInvoice.get(i.id)?.reference ?? null,
      manualMethod: byInvoice.get(i.id)?.manualMethod ?? null,
    }));
  }

  /** Receipt data for one of the caller's own invoices. */
  async getInvoice(tenantId: string, id: string) {
    const invoice = await this.prisma.billingInvoice.findUnique({ where: { id } });
    if (!invoice || invoice.tenantId !== tenantId) throw new NotFoundException(`Invoice ${id} not found`);
    const [payments, tenant] = await Promise.all([
      this.prisma.billingPayment.findMany({ where: { invoiceId: id, flagged: false }, orderBy: { paidAt: 'asc' } }),
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true, address: true, company: { select: { name: true } }, brand: { select: { name: true } } },
      }),
    ]);
    return {
      invoice: {
        id: invoice.id,
        number: invoice.number,
        periodStart: invoice.periodStart,
        periodEnd: invoice.periodEnd,
        amountCentavos: invoice.amountCentavos,
        dueAt: invoice.dueAt,
        issuedAt: invoice.issuedAt,
        status: invoice.status,
        paidAt: invoice.paidAt,
        paymentMethod: invoice.paymentMethod,
      },
      payments: payments.map(p => ({
        id: p.id,
        paidAt: p.paidAt,
        amountCentavos: p.amountCentavos,
        method: p.method,
        manualMethod: p.manualMethod,
        reference: p.reference,
      })),
      store: {
        name: tenant?.name ?? '',
        address: tenant?.address ?? null,
        companyName: tenant?.company?.name ?? null,
        brandName: tenant?.brand?.name ?? null,
      },
    };
  }
}
