import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { StoreSubscription } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BillingConfigService } from './billing-config.service';
import { BillingAuditService } from './billing-audit.service';
import { BillingStatusService } from './billing-status.service';
import { UpdateStoreBillingDto } from './dto/update-store-billing.dto';
import { BillingStatus, BillingStatusResult, getTrialEndsAt } from '../common/utils/billing-status.util';
import { deriveEnableDates, EnableDatesResult } from '../common/utils/billing-dates.util';
import { describeStoreView } from '../common/utils/billing-copy.util';
import { addZonedDays, startOfZonedDay, zonedDayOfMonth } from '../common/utils/timezone';
import { toSubscriptionInput } from './billing-status.service';
import { BillingPaymentsService } from './billing-payments.service';
import { getZonedMonthBounds } from '../common/utils/timezone';

export type BillingListStatus = BillingStatus | 'NOT_SET_UP';

export interface BillingStoreFilters {
  companyId?: string;
  brandId?: string;
  status?: BillingListStatus;
  dueFrom?: string;
  dueTo?: string;
  q?: string;
  /** true lists only inactive stores (store toggle off); otherwise only active ones */
  inactive?: boolean;
  page?: number;
  limit?: number;
}

export const BILLING_MESSAGES = {
  priceRequired: 'Set a monthly price before enabling billing',
  activationRequired: 'Set an activation date before enabling billing',
  reasonRequired: 'An exemption reason is required',
} as const;

const SETTINGS_FIELDS = [
  'billingEnabled',
  'exemptReason',
  'priceCentavos',
  'activatedAt',
  'trialStartAt',
  'trialDays',
  'anchorDay',
  'nextBillingAt',
  'nextBillingOverridden',
  'paidThroughAt',
  'graceDaysOverride',
  'billedInArrears',
] as const;
type SettingsField = (typeof SETTINGS_FIELDS)[number];
type SettingsData = Partial<Pick<StoreSubscription, SettingsField>>;

const DATE_FIELDS = ['activatedAt', 'trialStartAt', 'nextBillingAt'] as const;

function toDay(iso: string | null | undefined): Date | null | undefined {
  if (iso === undefined) return undefined;
  return iso === null ? null : startOfZonedDay(new Date(iso));
}

function auditValue(v: unknown): unknown {
  return v instanceof Date ? v.toISOString() : (v ?? null);
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(auditValue(a)) === JSON.stringify(auditValue(b));
}

@Injectable()
export class BillingSettingsService {
  constructor(
    private prisma: PrismaService,
    private billingConfig: BillingConfigService,
    private audit: BillingAuditService,
    private billingStatus: BillingStatusService,
    private payments: BillingPaymentsService,
  ) {}

  async getStoreBilling(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        company: { select: { id: true, name: true } },
        brand: { select: { id: true, name: true } },
        subscription: true,
      },
    });
    if (!tenant) throw new NotFoundException(`Store ${tenantId} not found`);

    const config = await this.billingConfig.get();
    const statusConfig = this.billingConfig.toStatusConfig(config);
    const [status, previewStatus, audit, invoices, payments, claims] = await Promise.all([
      this.billingStatus.forTenant(tenantId),
      this.billingStatus.forTenant(tenantId, { previewEnabled: true }),
      this.audit.list(tenantId),
      this.prisma.billingInvoice.findMany({
        where: { tenantId },
        orderBy: [{ periodStart: 'desc' }, { revision: 'desc' }],
        take: 50,
      }),
      this.prisma.billingPayment.findMany({ where: { tenantId }, orderBy: { paidAt: 'desc' }, take: 50 }),
      this.prisma.billingPaymentClaim.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 50 }),
    ]);
    // PayMongo references for the admin; the QR image itself is not needed here.
    const attempts = invoices.length
      ? await this.prisma.billingPaymentAttempt.findMany({
          where: { invoiceId: { in: invoices.map(i => i.id) } },
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: { id: true, invoiceId: true, providerIntentId: true, status: true, expiresAt: true, livemode: true, createdAt: true },
        })
      : [];
    const sub = tenant.subscription;

    return {
      tenantId: tenant.id,
      storeName: tenant.name,
      company: tenant.company,
      brand: tenant.brand,
      globalBillingEnabled: config.billingEnabled,
      settings: {
        billingEnabled: sub?.billingEnabled ?? null,
        exemptReason: sub?.exemptReason ?? null,
        priceCentavos: sub?.priceCentavos ?? null,
        activatedAt: sub?.activatedAt ?? null,
        trialStartAt: sub?.trialStartAt ?? null,
        trialDays: sub?.trialDays ?? null,
        trialEndsAt: sub ? getTrialEndsAt(toSubscriptionInput(sub), statusConfig) : null,
        anchorDay: sub?.anchorDay ?? null,
        nextBillingAt: sub?.nextBillingAt ?? null,
        nextBillingOverridden: sub?.nextBillingOverridden ?? false,
        paidThroughAt: sub?.paidThroughAt ?? null,
        graceDaysOverride: sub?.graceDaysOverride ?? null,
        billedInArrears: !!sub?.billedInArrears,
      },
      status,
      previewStatus,
      storeView: {
        admin: describeStoreView(previewStatus, 'admin'),
        cashier: describeStoreView(previewStatus, 'cashier'),
      },
      audit,
      invoices,
      payments,
      attempts,
      claims,
    };
  }

  private async requireTenant(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
    if (!tenant) throw new NotFoundException(`Store ${tenantId} not found`);
  }

  private async derive(
    subscriptionId: string | null,
    merged: SettingsData,
    anchorDay: number | null,
  ): Promise<EnableDatesResult> {
    const config = await this.billingConfig.get();
    const paid = subscriptionId
      ? await this.prisma.subscriptionPayment.findMany({
          where: { subscriptionId, paid: true },
          select: { month: true },
        })
      : [];
    return deriveEnableDates({
      activatedAt: merged.activatedAt!,
      arrears: !!merged.billedInArrears,
      trialStartAt: merged.trialStartAt ?? null,
      trialDays: merged.trialDays ?? config.defaultTrialDays,
      anchorDay,
      paidMonthStarts: paid.map(p => p.month),
      now: new Date(),
    });
  }

  /**
   * The one place schedule dates are planned — used by both the enable
   * preview and the PATCH, so what the admin confirms is what gets saved.
   * An override (nextBillingOverridden) always wins for nextBillingAt and
   * sets the billing day; honored paid-through from the ledger is kept
   * either way.
   */
  private async planSchedule(
    subscriptionId: string | null,
    merged: SettingsData,
    anchorInput: number | null,
    explicitAnchor: boolean,
  ): Promise<EnableDatesResult & { nextBillingOverridden: boolean }> {
    const dates = await this.derive(subscriptionId, merged, anchorInput);
    const overridden = !!merged.nextBillingOverridden && !!merged.nextBillingAt;
    return {
      ...dates,
      nextBillingAt: overridden ? merged.nextBillingAt! : dates.nextBillingAt,
      anchorDay: overridden && !explicitAnchor ? zonedDayOfMonth(merged.nextBillingAt!) : dates.anchorDay,
      paidThroughAt: merged.paidThroughAt ?? dates.paidThroughAt,
      nextBillingOverridden: overridden,
    };
  }

  async enablePreview(
    tenantId: string,
  ): Promise<EnableDatesResult & { nextBillingOverridden: boolean; billedInArrears: boolean }> {
    await this.requireTenant(tenantId);
    const sub = await this.prisma.storeSubscription.findUnique({ where: { tenantId } });
    if (!sub?.activatedAt) throw new BadRequestException(BILLING_MESSAGES.activationRequired);
    const billedInArrears = sub.billedInArrears || (await this.isFirstSetUp(sub));
    const plan = await this.planSchedule(sub.id, { ...sub, billedInArrears }, sub.anchorDay ?? null, false);
    return { ...plan, billedInArrears };
  }

  /**
   * Stores set up from 2026-10-29 on pay for each month at its end. Only a
   * store that is still "Not set up" and has never paid anything (no invoice,
   * no prepayment, no month ticked paid in the manual ledger) switches to it,
   * so every store already billed or paid keeps its in-advance dates.
   */
  private async isFirstSetUp(existing: StoreSubscription | null): Promise<boolean> {
    if (!existing) return true;
    if (existing.billingEnabled != null || existing.paidThroughAt) return false;
    const [invoices, paidMonths] = await Promise.all([
      this.prisma.billingInvoice.count({ where: { subscriptionId: existing.id } }),
      this.prisma.subscriptionPayment.findMany({ where: { subscriptionId: existing.id, paid: true }, select: { month: true }, take: 1 }),
    ]);
    return invoices === 0 && paidMonths.length === 0;
  }

  async updateStoreBilling(tenantId: string, dto: UpdateStoreBillingDto, actorUserId: string) {
    await this.requireTenant(tenantId);
    const existing = await this.prisma.storeSubscription.findUnique({ where: { tenantId } });

    const data: SettingsData = {};
    if (dto.billingEnabled !== undefined) data.billingEnabled = dto.billingEnabled;
    if (dto.exemptReason !== undefined) data.exemptReason = dto.exemptReason?.trim() || null;
    if (dto.priceCentavos !== undefined) data.priceCentavos = dto.priceCentavos;
    if (dto.trialDays !== undefined) data.trialDays = dto.trialDays;
    if (dto.anchorDay !== undefined) data.anchorDay = dto.anchorDay;
    if (dto.graceDaysOverride !== undefined) data.graceDaysOverride = dto.graceDaysOverride;
    for (const field of DATE_FIELDS) {
      const value = toDay(dto[field]);
      if (value !== undefined) data[field] = value;
    }
    if (dto.nextBillingAt !== undefined) data.nextBillingOverridden = dto.nextBillingAt !== null;

    // An exemption reason belongs to that exemption: re-enabling clears it,
    // so exempting the store again asks for a fresh reason.
    if (data.billingEnabled === true && existing?.billingEnabled === false && dto.exemptReason === undefined) {
      data.exemptReason = null;
    }

    if (data.billingEnabled != null && !existing?.billedInArrears && (await this.isFirstSetUp(existing))) {
      data.billedInArrears = true;
    }

    const merged: SettingsData = { ...(existing ?? {}), ...data };

    if (merged.billingEnabled === true) {
      if (!merged.priceCentavos || merged.priceCentavos <= 0) throw new BadRequestException(BILLING_MESSAGES.priceRequired);
      if (!merged.activatedAt) throw new BadRequestException(BILLING_MESSAGES.activationRequired);
    }
    if (merged.billingEnabled === false && !merged.exemptReason) {
      throw new BadRequestException(BILLING_MESSAGES.reasonRequired);
    }

    const enabling = merged.billingEnabled === true && existing?.billingEnabled !== true;
    const trialChanged = dto.trialDays !== undefined || dto.trialStartAt !== undefined || dto.activatedAt !== undefined;
    const scheduleChanged = trialChanged || dto.anchorDay !== undefined || dto.nextBillingAt !== undefined;
    if (merged.billingEnabled === true && (enabling || scheduleChanged)) {
      const invoiceCount = existing
        ? await this.prisma.billingInvoice.count({ where: { subscriptionId: existing.id } })
        : 0;
      if (invoiceCount === 0) {
        // A trial change re-derives the anchor from the new trial end (so
        // "extend trial" moves the first bill instead of pushing it a month).
        const explicitAnchor = dto.anchorDay !== undefined;
        const anchor = explicitAnchor ? dto.anchorDay! : trialChanged ? null : (merged.anchorDay ?? null);
        const plan = await this.planSchedule(existing?.id ?? null, merged, anchor, explicitAnchor);
        data.nextBillingAt = plan.nextBillingAt;
        data.anchorDay = plan.anchorDay;
        if (!merged.paidThroughAt && plan.paidThroughAt) data.paidThroughAt = plan.paidThroughAt;
      }
    }

    await this.prisma.storeSubscription.upsert({
      where: { tenantId },
      update: data,
      create: { tenantId, ...data },
    });

    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    for (const key of Object.keys(data) as SettingsField[]) {
      const prev = existing ? existing[key] : null;
      if (!sameValue(prev, data[key])) {
        before[key] = auditValue(prev);
        after[key] = auditValue(data[key]);
      }
    }
    if (Object.keys(after).length > 0) {
      await this.audit.log({ tenantId, actorUserId, action: 'settings.update', before, after });
    }

    return this.getStoreBilling(tenantId);
  }

  async bulkUpdate(tenantIds: string[], patch: UpdateStoreBillingDto, actorUserId: string) {
    const results: { tenantId: string; ok: boolean; error?: string }[] = [];
    for (const tenantId of tenantIds) {
      try {
        await this.updateStoreBilling(tenantId, patch, actorUserId);
        results.push({ tenantId, ok: true });
      } catch (e) {
        results.push({ tenantId, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return results;
  }

  private async loadRows(filters: Pick<BillingStoreFilters, 'companyId' | 'brandId'>) {
    const config = await this.billingConfig.get();
    const tenants = await this.prisma.tenant.findMany({
      where: {
        tombstone: { not: 1 },
        ...(filters.companyId ? { companyId: filters.companyId } : {}),
        ...(filters.brandId ? { brandId: filters.brandId } : {}),
      },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        isActive: true,
        deactivatedAt: true,
        company: { select: { id: true, name: true } },
        brand: { select: { id: true, name: true } },
        subscription: {
          include: { payments: { where: { paid: true }, orderBy: { paidAt: 'desc' }, take: 1, select: { paidAt: true } } },
        },
      },
    });
    // While billing is globally OFF, show what *would* apply so admins can
    // prepare the rollout.
    const statuses = await this.billingStatus.forTenants(
      tenants.map(t => t.id),
      { previewEnabled: !config.billingEnabled },
    );
    const rows = tenants.map(t => {
      const sub = t.subscription;
      const result = statuses.get(t.id) as BillingStatusResult;
      const status: BillingListStatus = !sub || sub.billingEnabled == null ? 'NOT_SET_UP' : result.status;
      return {
        tenantId: t.id,
        storeName: t.name,
        isActive: t.isActive,
        deactivatedAt: t.deactivatedAt ?? null,
        company: t.company,
        brand: t.brand,
        priceCentavos: sub?.priceCentavos ?? null,
        billingEnabled: sub?.billingEnabled ?? null,
        exemptReason: sub?.exemptReason ?? null,
        status,
        dueAt: result.dueAt ?? null,
        paidThroughAt: result.paidThroughAt ?? sub?.paidThroughAt ?? null,
        nextBillingAt: result.nextBillingAt ?? sub?.nextBillingAt ?? null,
        daysOverdue: result.daysOverdue ?? null,
        lastPaymentAt: sub?.payments?.[0]?.paidAt ?? null,
      };
    });
    return { rows, globalBillingEnabled: config.billingEnabled };
  }

  async listStores(filters: BillingStoreFilters) {
    const page = Number(filters.page ?? 1);
    const limit = Number(filters.limit ?? 20);
    const { rows } = await this.loadRows(filters);
    const q = filters.q?.trim().toLowerCase();
    const dueFrom = filters.dueFrom ? startOfZonedDay(new Date(filters.dueFrom)) : null;
    const dueTo = filters.dueTo ? addZonedDays(new Date(filters.dueTo), 1) : null;

    const filtered = rows.filter(r => {
      // Inactive stores (toggled off under Company → Stores) are listed apart
      if (filters.inactive ? r.isActive : !r.isActive) return false;
      if (filters.status && r.status !== filters.status) return false;
      if (q && ![r.storeName, r.company?.name, r.brand?.name].some(n => n?.toLowerCase().includes(q))) return false;
      const due = r.dueAt ?? r.nextBillingAt;
      if (dueFrom && (!due || due < dueFrom)) return false;
      if (dueTo && (!due || due >= dueTo)) return false;
      return true;
    });

    const total = filtered.length;
    const data = filtered.slice((page - 1) * limit, page * limit);
    return { data, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
  }

  async overview() {
    const { rows, globalBillingEnabled } = await this.loadRows({});
    const counts: Record<BillingListStatus, number> = {
      EXEMPT: 0,
      NOT_ACTIVATED: 0,
      TRIAL: 0,
      ACTIVE: 0,
      DUE: 0,
      LOCKED: 0,
      NOT_SET_UP: 0,
    };
    const now = new Date();
    const weekAhead = addZonedDays(now, 8);
    let upcomingNext7Days = 0;
    let inactive = 0;
    for (const r of rows) {
      // Status counts describe active stores only, matching the main Stores list
      if (r.isActive) counts[r.status] += 1;
      else inactive += 1;
      // Inactive stores are still invoiced, so they stay in the upcoming count
      if (r.billingEnabled === true && r.nextBillingAt && r.nextBillingAt >= startOfZonedDay(now) && r.nextBillingAt < weekAhead) {
        upcomingNext7Days += 1;
      }
    }
    return { globalBillingEnabled, counts, inactive, upcomingNext7Days, money: await this.money(now) };
  }

  private async money(now: Date) {
    const config = await this.billingConfig.get();
    const month = getZonedMonthBounds(now);
    const inMonth = { gte: month.start, lte: month.end };
    const [expected, outstanding, collected, qrph, pendingClaims] = await Promise.all([
      this.prisma.billingInvoice.aggregate({ _sum: { amountCentavos: true }, where: { status: { not: 'VOID' }, dueAt: inMonth } }),
      this.prisma.billingInvoice.aggregate({ _sum: { amountCentavos: true }, where: { status: 'OPEN' } }),
      this.prisma.billingPayment.aggregate({ _sum: { amountCentavos: true }, where: { flagged: false, paidAt: inMonth } }),
      this.payments.qrphCollectedThisMonth(now),
      this.prisma.billingPaymentClaim.count({ where: { status: 'PENDING' } }),
    ]);
    const limitCentavos = config.paymongoMonthlyLimitCentavos;
    const limitPercent = limitCentavos > 0 ? Math.round((qrph / limitCentavos) * 100) : 0;
    return {
      expectedThisMonthCentavos: expected._sum.amountCentavos ?? 0,
      collectedThisMonthCentavos: collected._sum.amountCentavos ?? 0,
      outstandingCentavos: outstanding._sum.amountCentavos ?? 0,
      qrphCollectedThisMonthCentavos: qrph,
      limitCentavos,
      limitPercent,
      limitWarn: limitPercent >= config.limitWarnPercent,
      fallbackQrConfigured: !!config.fallbackQrImageUrl,
      pendingClaims,
    };
  }
}
