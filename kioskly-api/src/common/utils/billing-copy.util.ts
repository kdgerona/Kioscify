import { BillingStatusResult } from './billing-status.util';

export interface StoreView {
  /** 'trial' is an informational notice the store can close; 'banner' and 'lock' cannot be. */
  variant: 'none' | 'trial' | 'banner' | 'lock';
  title: string;
  body: string;
  showPayAction: boolean;
}

const NONE: StoreView = { variant: 'none', title: '', body: '', showPayAction: false };

export function formatPesoCentavos(centavos: number | null): string {
  if (centavos == null) return '—';
  return `₱${(centavos / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatManilaDate(date: Date | null): string {
  if (!date) return '';
  return date.toLocaleDateString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * What a store sees for a given billing status. Shared so the Platform
 * Admin "what the store sees" preview uses the same copy as the clients.
 */
export function describeStoreView(result: BillingStatusResult, audience: 'admin' | 'cashier'): StoreView {
  const upcoming = (result.status === 'TRIAL' || result.status === 'ACTIVE') && !!result.upcomingDueAt;
  // During the trial, until the due reminder takes over
  if (result.status === 'TRIAL' && !upcoming && result.trialEndsAt) {
    const n = result.trialDaysLeft ?? 0;
    const ends = formatManilaDate(result.trialEndsAt);
    return {
      variant: 'trial',
      title: `Free trial — ${n} ${n === 1 ? 'day' : 'days'} left`,
      body:
        audience === 'cashier'
          ? `Your store's free trial ends on ${ends}.`
          : `Your free trial ends on ${ends}. See your plan and first billing date in Billing.`,
      showPayAction: false,
    };
  }
  if (result.status !== 'DUE' && result.status !== 'LOCKED' && !upcoming) return NONE;

  const variant = result.status === 'LOCKED' ? 'lock' : 'banner';
  if (result.verificationPending) {
    return {
      variant,
      title: 'Payment submitted, awaiting verification',
      body: "We're confirming your payment. Your store stays open while we review it.",
      showPayAction: false,
    };
  }

  if (upcoming) {
    // Reminder before the due date: nothing is late yet, so no lock wording.
    const on = formatManilaDate(result.upcomingDueAt);
    const n = result.daysUntilDue ?? 0;
    const title = `Subscription due on ${on} — ${n} ${n === 1 ? 'day' : 'days'} left`;
    return audience === 'cashier'
      ? { variant, title, body: `Please ask your store admin to pay on or before ${on}.`, showPayAction: false }
      : {
          variant,
          title,
          body: `${formatPesoCentavos(result.amountCentavos)} is due on ${on}. Pay now to stay ahead.`,
          showPayAction: true,
        };
  }

  const amount = formatPesoCentavos(result.amountCentavos);
  const due = formatManilaDate(result.dueAt);
  const daysLeft = result.daysLeft ?? 0;
  // "before access is paused" only when enforcement is on: otherwise nothing is locked.
  const dueTitle =
    daysLeft > 0
      ? `Subscription due — ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left${result.enforcement ? ' before access is paused' : ''}`
      : 'Subscription overdue';

  if (audience === 'cashier') {
    if (result.status === 'LOCKED' || daysLeft <= 0) {
      return {
        variant,
        title: 'Subscription overdue',
        body: "Your store's subscription is overdue. Please contact your store admin.",
        showPayAction: false,
      };
    }
    return {
      variant,
      title: dueTitle,
      body: `Your store's subscription is due. Please ask your store admin to pay before ${formatManilaDate(result.graceEndsAt)}.`,
      showPayAction: false,
    };
  }

  const rejected = result.lastClaimRejectedReason
    ? ` Your payment claim was not accepted: ${result.lastClaimRejectedReason}.`
    : '';

  if (result.status === 'LOCKED') {
    return {
      variant,
      title: 'Subscription overdue',
      body: `${amount} was due on ${due}. Pay now to restore access to your store.${rejected}`,
      showPayAction: true,
    };
  }

  return {
    variant,
    title: dueTitle,
    body: `${amount} was due on ${due}. Pay now to avoid interruption.${rejected}`,
    showPayAction: true,
  };
}
