import { Injectable } from '@nestjs/common';
import { StoreSubscription } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BillingConfigService } from './billing-config.service';
import {
  BillingConfigInput,
  BillingStatusResult,
  OpenInvoiceInput,
  SubscriptionInput,
  computeBillingStatus,
} from '../common/utils/billing-status.util';

export interface BillingStatusOptions {
  /** Compute as if global billing were on — for Platform Admin rollout previews. */
  previewEnabled?: boolean;
}

type SubscriptionRow = Pick<
  StoreSubscription,
  | 'id'
  | 'tenantId'
  | 'billingEnabled'
  | 'priceCentavos'
  | 'activatedAt'
  | 'trialStartAt'
  | 'trialDays'
  | 'nextBillingAt'
  | 'paidThroughAt'
  | 'graceDaysOverride'
  | 'billedInArrears'
  | 'anchorDay'
>;

interface InvoiceRow {
  id: string;
  dueAt: Date;
  amountCentavos: number;
  graceExtendedUntil: Date | null;
}

export function toSubscriptionInput(sub: SubscriptionRow): SubscriptionInput {
  return {
    billingEnabled: sub.billingEnabled ?? null,
    priceCentavos: sub.priceCentavos ?? null,
    activatedAt: sub.activatedAt ?? null,
    trialStartAt: sub.trialStartAt ?? null,
    trialDays: sub.trialDays ?? null,
    nextBillingAt: sub.nextBillingAt ?? null,
    paidThroughAt: sub.paidThroughAt ?? null,
    graceDaysOverride: sub.graceDaysOverride ?? null,
    billedInArrears: sub.billedInArrears ?? null,
    anchorDay: sub.anchorDay ?? null,
  };
}

interface ClaimRow {
  status: string;
  createdAt: Date;
  rejectReason: string | null;
}

// Claims superseded by a resubmission are bookkeeping, not a verdict.
export const REPLACED_CLAIM_REASON = 'Replaced by a newer claim';

const PER_REQUEST_TTL_MS = 10_000;

// Never negate an optional field on MongoDB (see CLAUDE.md, tombstone
// incident): REJECTED claims always carry a reason, PENDING ones match on
// status alone.
const CLAIM_FILTER = {
  OR: [{ status: 'PENDING' }, { status: 'REJECTED', rejectReason: { not: REPLACED_CLAIM_REASON } }],
};

function toOpenInvoiceInput(invoice: InvoiceRow | null, claim: ClaimRow | null): OpenInvoiceInput | null {
  if (!invoice) return null;
  return {
    id: invoice.id,
    dueAt: invoice.dueAt,
    amountCentavos: invoice.amountCentavos,
    graceExtendedUntil: invoice.graceExtendedUntil ?? null,
    pendingClaimSubmittedAt: claim?.status === 'PENDING' ? claim.createdAt : null,
    lastRejectedClaimReason: claim?.status === 'REJECTED' ? claim.rejectReason : null,
  };
}

@Injectable()
export class BillingStatusService {
  constructor(
    private prisma: PrismaService,
    private billingConfig: BillingConfigService,
  ) {}

  async statusConfig(opts?: BillingStatusOptions): Promise<BillingConfigInput> {
    const cfg = this.billingConfig.toStatusConfig(await this.billingConfig.get());
    return opts?.previewEnabled ? { ...cfg, billingEnabled: true } : cfg;
  }

  /**
   * With billing globally OFF this reads only the cached config — no
   * subscription or invoice queries — so request paths stay as they are today.
   */
  async forTenant(tenantId: string, opts?: BillingStatusOptions): Promise<BillingStatusResult> {
    const cfg = await this.statusConfig(opts);
    if (!cfg.billingEnabled) return computeBillingStatus(cfg, null, null);

    const sub = await this.prisma.storeSubscription.findUnique({ where: { tenantId } });
    if (!sub || sub.billingEnabled !== true) {
      return computeBillingStatus(cfg, sub ? toSubscriptionInput(sub) : null, null);
    }

    const invoice = await this.prisma.billingInvoice.findFirst({
      where: { subscriptionId: sub.id, status: 'OPEN' },
      orderBy: { dueAt: 'asc' },
    });
    const claim = invoice
      ? await this.prisma.billingPaymentClaim.findFirst({
          where: { invoiceId: invoice.id, ...CLAIM_FILTER },
          orderBy: { createdAt: 'desc' },
        })
      : null;
    return computeBillingStatus(cfg, toSubscriptionInput(sub), toOpenInvoiceInput(invoice, claim));
  }

  private readonly perRequestCache = new Map<string, { value: BillingStatusResult; expiresAt: number }>();

  /**
   * forTenant for the per-request auth path (JwtStrategy): a store's status
   * is reused for 10s so sync bursts and polls don't re-query every time.
   * With billing OFF forTenant does no reads anyway.
   */
  async forTenantCached(tenantId: string): Promise<BillingStatusResult> {
    const now = Date.now();
    const hit = this.perRequestCache.get(tenantId);
    if (hit && hit.expiresAt > now) return hit.value;
    const value = await this.forTenant(tenantId);
    if (this.perRequestCache.size > 5000) this.perRequestCache.clear();
    this.perRequestCache.set(tenantId, { value, expiresAt: now + PER_REQUEST_TTL_MS });
    return value;
  }

  /** Store a freshly computed status (e.g. from billing/me) so the next request sees it. */
  prime(tenantId: string, value: BillingStatusResult): void {
    this.perRequestCache.set(tenantId, { value, expiresAt: Date.now() + PER_REQUEST_TTL_MS });
  }

  async forTenants(tenantIds: string[], opts?: BillingStatusOptions): Promise<Map<string, BillingStatusResult>> {
    const cfg = await this.statusConfig(opts);
    const result = new Map<string, BillingStatusResult>();
    if (!cfg.billingEnabled) {
      for (const id of tenantIds) result.set(id, computeBillingStatus(cfg, null, null));
      return result;
    }

    const subs = await this.prisma.storeSubscription.findMany({ where: { tenantId: { in: tenantIds } } });
    const billedIds = subs.filter(s => s.billingEnabled === true).map(s => s.id);
    const invoices = await this.prisma.billingInvoice.findMany({
      where: { subscriptionId: { in: billedIds }, status: 'OPEN' },
      orderBy: { dueAt: 'asc' },
    });
    const claims = await this.prisma.billingPaymentClaim.findMany({
      where: { invoiceId: { in: invoices.map(i => i.id) }, ...CLAIM_FILTER },
      orderBy: { createdAt: 'desc' },
    });

    const oldestInvoiceBySub = new Map<string, InvoiceRow>();
    for (const inv of invoices) if (!oldestInvoiceBySub.has(inv.subscriptionId)) oldestInvoiceBySub.set(inv.subscriptionId, inv);
    const latestClaimByInvoice = new Map<string, ClaimRow>();
    for (const c of claims) if (!latestClaimByInvoice.has(c.invoiceId)) latestClaimByInvoice.set(c.invoiceId, c);
    const subByTenant = new Map(subs.map(s => [s.tenantId, s]));

    for (const tenantId of tenantIds) {
      const sub = subByTenant.get(tenantId);
      if (!sub) {
        result.set(tenantId, computeBillingStatus(cfg, null, null));
        continue;
      }
      const invoice = oldestInvoiceBySub.get(sub.id) ?? null;
      result.set(
        tenantId,
        computeBillingStatus(
          cfg,
          toSubscriptionInput(sub),
          toOpenInvoiceInput(invoice, invoice ? latestClaimByInvoice.get(invoice.id) ?? null : null),
        ),
      );
    }
    return result;
  }
}
