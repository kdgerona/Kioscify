import { addZonedDays, zonedDaysBetween } from './timezone';
import { effectiveNextBillingAt } from './billing-dates.util';

export type BillingStatus = 'EXEMPT' | 'NOT_ACTIVATED' | 'TRIAL' | 'ACTIVE' | 'DUE' | 'LOCKED';

export interface BillingConfigInput {
  billingEnabled: boolean;
  enforcementEnabled: boolean;
  defaultTrialDays: number;
  defaultGraceDays: number;
  claimLockHoldDays: number;
  /** Days before the due date that the store starts seeing a reminder banner (0 = none). */
  reminderLeadDays: number;
}

export interface SubscriptionInput {
  billingEnabled: boolean | null;
  priceCentavos: number | null;
  activatedAt: Date | null;
  trialStartAt: Date | null;
  trialDays: number | null;
  nextBillingAt: Date | null;
  paidThroughAt: Date | null;
  graceDaysOverride: number | null;
  /** Paid at the end of each month instead of the start (see BillingTiming). */
  billedInArrears?: boolean | null;
  anchorDay?: number | null;
}

export interface OpenInvoiceInput {
  id: string;
  dueAt: Date;
  amountCentavos: number;
  graceExtendedUntil: Date | null;
  pendingClaimSubmittedAt: Date | null;
  /** Reason on the newest claim when it was rejected (and nothing is pending). */
  lastRejectedClaimReason?: string | null;
}

export interface BillingStatusResult {
  status: BillingStatus;
  enforcement: boolean;
  amountCentavos: number | null;
  dueAt: Date | null;
  graceEndsAt: Date | null;
  daysLeft: number | null;
  daysOverdue: number | null;
  trialEndsAt: Date | null;
  /** TRIAL only: Manila days until `trialEndsAt` (null otherwise). */
  trialDaysLeft: number | null;
  paidThroughAt: Date | null;
  nextBillingAt: Date | null;
  openInvoiceId: string | null;
  verificationPending: boolean;
  lastClaimRejectedReason: string | null;
  /** When a pending "I've paid" claim stops holding off the lock (null without one). */
  claimHoldEndsAt: Date | null;
  /** TRIAL/ACTIVE inside the reminder window: the coming due date (null otherwise). */
  upcomingDueAt: Date | null;
  /** Manila days until `upcomingDueAt`. */
  daysUntilDue: number | null;
}

// Mirrors the BillingConfig schema defaults. Billing is OFF until a platform
// admin turns it on, so this config yields EXEMPT for every store.
export const DEFAULT_BILLING_CONFIG: BillingConfigInput = {
  billingEnabled: false,
  enforcementEnabled: false,
  defaultTrialDays: 15,
  defaultGraceDays: 7,
  claimLockHoldDays: 3,
  reminderLeadDays: 7,
};

/** First non-trial Manila day, or null when the store has no activation date. */
export function getTrialEndsAt(sub: SubscriptionInput, config: BillingConfigInput): Date | null {
  const start = sub.trialStartAt ?? sub.activatedAt;
  if (!start) return null;
  return addZonedDays(start, sub.trialDays ?? config.defaultTrialDays);
}

/**
 * Billing status is never persisted — it is derived on read, like
 * computeAccountStatus. Locking must not depend on the scheduler having run:
 * a passed `nextBillingAt` with no invoice yet counts as a due ("virtual")
 * invoice for the store's current price.
 */
export function computeBillingStatus(
  config: BillingConfigInput | null,
  sub: SubscriptionInput | null,
  openInvoice: OpenInvoiceInput | null,
  now: Date = new Date(),
): BillingStatusResult {
  const cfg = config ?? DEFAULT_BILLING_CONFIG;
  const result: BillingStatusResult = {
    status: 'EXEMPT',
    enforcement: cfg.enforcementEnabled,
    amountCentavos: null,
    dueAt: null,
    graceEndsAt: null,
    daysLeft: null,
    daysOverdue: null,
    trialEndsAt: null,
    trialDaysLeft: null,
    paidThroughAt: sub?.paidThroughAt ?? null,
    nextBillingAt: sub?.nextBillingAt ?? null,
    openInvoiceId: openInvoice?.id ?? null,
    verificationPending: !!openInvoice?.pendingClaimSubmittedAt,
    lastClaimRejectedReason: openInvoice?.pendingClaimSubmittedAt ? null : (openInvoice?.lastRejectedClaimReason ?? null),
    claimHoldEndsAt: openInvoice?.pendingClaimSubmittedAt
      ? addZonedDays(openInvoice.pendingClaimSubmittedAt, cfg.claimLockHoldDays)
      : null,
    upcomingDueAt: null,
    daysUntilDue: null,
  };

  if (!cfg.billingEnabled || !sub || sub.billingEnabled !== true) return result;
  // A next billing date inside an already-paid period is not due (or upcoming) yet
  const nextBillingAt = effectiveNextBillingAt(sub.nextBillingAt, sub.paidThroughAt, {
    arrears: sub.billedInArrears,
    anchorDay: sub.anchorDay,
  });
  result.nextBillingAt = nextBillingAt;
  if (!sub.activatedAt) return { ...result, status: 'NOT_ACTIVATED' };

  const trialEndsAt = getTrialEndsAt(sub, cfg);
  result.trialEndsAt = trialEndsAt;

  let dueAt: Date | null = null;
  let amountCentavos: number | null = null;
  if (openInvoice) {
    dueAt = openInvoice.dueAt;
    amountCentavos = openInvoice.amountCentavos;
  } else if (nextBillingAt && now >= nextBillingAt) {
    dueAt = nextBillingAt;
    amountCentavos = sub.priceCentavos;
  }
  result.dueAt = dueAt;
  result.amountCentavos = amountCentavos;

  if (!dueAt || now < dueAt) {
    const inTrial = !!trialEndsAt && now < trialEndsAt && sub.paidThroughAt == null;
    // Reminder window: an invoice issued early, or the next billing date,
    // within `reminderLeadDays`. Nothing counts towards grace or the lock yet.
    const upcoming = dueAt ?? nextBillingAt;
    if (upcoming && cfg.reminderLeadDays > 0 && now >= addZonedDays(upcoming, -cfg.reminderLeadDays)) {
      result.upcomingDueAt = upcoming;
      result.daysUntilDue = zonedDaysBetween(now, upcoming);
      result.amountCentavos = openInvoice?.amountCentavos ?? sub.priceCentavos;
    }
    if (inTrial) result.trialDaysLeft = zonedDaysBetween(now, trialEndsAt);
    return { ...result, status: inTrial ? 'TRIAL' : 'ACTIVE' };
  }

  const graceDays = sub.graceDaysOverride ?? cfg.defaultGraceDays;
  let graceEndsAt = addZonedDays(dueAt, graceDays);
  const extended = openInvoice?.graceExtendedUntil;
  if (extended && extended > graceEndsAt) graceEndsAt = extended;

  result.graceEndsAt = graceEndsAt;
  result.daysLeft = zonedDaysBetween(now, graceEndsAt);
  result.daysOverdue = Math.max(0, zonedDaysBetween(dueAt, now));

  if (now < graceEndsAt || !cfg.enforcementEnabled) return { ...result, status: 'DUE' };

  if (result.claimHoldEndsAt && now < result.claimHoldEndsAt) {
    return { ...result, status: 'DUE' };
  }
  return { ...result, status: 'LOCKED' };
}
