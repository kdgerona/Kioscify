'use client';

import { manilaDateInputFromToday, pesoToCentavos } from '@/lib/money';
import type { CreateStoreBillingPayload } from '@/types';
import { addMonthsClamped, dayOfMonth } from '@/lib/billing-schedule';
import { BillingScheduleSummary } from './BillingScheduleSummary';
import { FieldLabel } from './FieldLabel';

/** Platform billing settings the schedule preview needs. */
export interface OnboardBillingContext {
  graceDays: number;
  enforcement: boolean;
  globalBillingEnabled: boolean;
  reminderLeadDays: number;
}

export interface OnboardBillingValue {
  price: string;
  trialDays: string;
  firstBillingDate: string;
  firstBillingTouched: boolean;
}

/**
 * New stores pay for each month at its end: the first month starts when the
 * trial ends and is paid a month later (trial ends Nov 10 → first payment Dec 10).
 */
export function defaultFirstPayment(trialDays: number): string {
  const trialEnds = manilaDateInputFromToday(trialDays);
  return addMonthsClamped(trialEnds, 1, dayOfMonth(trialEnds));
}

export function defaultOnboardBilling(defaultTrialDays: number): OnboardBillingValue {
  return {
    price: '',
    trialDays: String(defaultTrialDays),
    firstBillingDate: defaultFirstPayment(defaultTrialDays),
    firstBillingTouched: false,
  };
}

/** True while the admin hasn't edited anything, so new defaults can replace the values. */
export function isPristineOnboardBilling(v: OnboardBillingValue, defaultTrialDays: number): boolean {
  const d = defaultOnboardBilling(defaultTrialDays);
  return v.price === '' && !v.firstBillingTouched && v.trialDays === d.trialDays && v.firstBillingDate === d.firstBillingDate;
}

/** A heads-up (not an error) when the first billing date looks unintended. */
export function firstBillingWarning(v: OnboardBillingValue): string | null {
  if (!v.firstBillingDate) return null;
  const today = manilaDateInputFromToday(0);
  if (v.firstBillingDate < today) return 'This date is in the past. The store will be billed as soon as billing is on.';
  const days = Number(v.trialDays);
  if (Number.isInteger(days) && days > 0 && v.firstBillingDate < defaultFirstPayment(days)) {
    return 'This is less than a month after the trial ends, so the first bill also covers part of the trial.';
  }
  return null;
}

/** Validated payload, or an error message for the form. */
export function toCreateStoreBilling(v: OnboardBillingValue): CreateStoreBillingPayload | string {
  const priceCentavos = pesoToCentavos(v.price);
  if (!priceCentavos) return 'Enter the monthly subscription price.';
  const trialDays = Number(v.trialDays);
  if (!Number.isInteger(trialDays) || trialDays < 0 || trialDays > 365) return 'Trial days must be between 0 and 365.';
  // Left empty, the API uses one month after the trial ends
  return { priceCentavos, trialDays, ...(v.firstBillingDate ? { firstBillingDate: v.firstBillingDate } : {}) };
}

const inputClass =
  'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm';

export function OnboardBillingFields({
  value,
  onChange,
  context = { graceDays: 7, enforcement: false, globalBillingEnabled: false, reminderLeadDays: 7 },
}: {
  value: OnboardBillingValue;
  onChange: (next: OnboardBillingValue) => void;
  context?: OnboardBillingContext;
}) {
  const warning = firstBillingWarning(value);
  const trialDays = Number(value.trialDays);
  const firstPayment =
    value.firstBillingDate || (Number.isInteger(trialDays) && trialDays >= 0 ? defaultFirstPayment(trialDays) : '');
  return (
    <>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-2">Subscription</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <FieldLabel label="Monthly price (₱)" required help="What this store will pay every month. You can change it later on the store's Subscriptions page; changes apply from the next invoice." />
          <input
            type="text"
            inputMode="decimal"
            placeholder="1,500.00"
            value={value.price}
            onChange={e => onChange({ ...value, price: e.target.value })}
            required
            className={inputClass}
          />
        </div>
        <div>
          <FieldLabel label="Trial (days)" required help="Free days from today. Billing starts when the trial ends, and that first month is paid at its end. Changing it moves the first payment date to match, unless you picked that date yourself." />
          <input
            type="number"
            min={0}
            max={365}
            value={value.trialDays}
            onChange={e => {
              const trialDays = e.target.value;
              const days = Number(trialDays);
              onChange({
                ...value,
                trialDays,
                firstBillingDate:
                  value.firstBillingTouched || !Number.isFinite(days)
                    ? value.firstBillingDate
                    : defaultFirstPayment(days),
              });
            }}
            required
            className={inputClass}
          />
        </div>
        <div>
          <FieldLabel label="First payment date" help="When the store pays for its first month. Each month is paid at its end, so this defaults to one month after the trial ends; leave it empty to use that. It also sets the billing day for every month after (days 29–31 fall on the last day of shorter months)." />
          <input
            type="date"
            value={value.firstBillingDate}
            onChange={e => onChange({ ...value, firstBillingDate: e.target.value, firstBillingTouched: true })}
            className={inputClass}
          />
        </div>
      </div>
      {warning && <p className="text-xs text-amber-700">{warning}</p>}
      {/^\d{4}-\d{2}-\d{2}$/.test(firstPayment) && (
        <BillingScheduleSummary
          arrears
          priceCentavos={pesoToCentavos(value.price)}
          firstInvoice={firstPayment}
          anchorDay={dayOfMonth(firstPayment)}
          graceDays={context.graceDays}
          enforcement={context.enforcement}
          globalBillingEnabled={context.globalBillingEnabled}
          reminderLeadDays={context.reminderLeadDays}
        />
      )}
      <p className="text-xs text-gray-400">
        Billing starts automatically for new stores. You can mark a store exempt later from Subscriptions.
      </p>
    </>
  );
}
