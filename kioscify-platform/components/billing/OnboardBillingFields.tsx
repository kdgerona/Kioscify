'use client';

import { manilaDateInputFromToday, pesoToCentavos } from '@/lib/money';
import type { CreateStoreBillingPayload } from '@/types';
import { dayOfMonth } from '@/lib/billing-schedule';
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

export function defaultOnboardBilling(defaultTrialDays: number): OnboardBillingValue {
  return {
    price: '',
    trialDays: String(defaultTrialDays),
    firstBillingDate: manilaDateInputFromToday(defaultTrialDays),
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
  if (Number.isInteger(days) && days > 0 && v.firstBillingDate < manilaDateInputFromToday(days)) {
    return 'This date is before the trial ends. The first bill will come during the trial.';
  }
  return null;
}

/** Validated payload, or an error message for the form. */
export function toCreateStoreBilling(v: OnboardBillingValue): CreateStoreBillingPayload | string {
  const priceCentavos = pesoToCentavos(v.price);
  if (!priceCentavos) return 'Enter the monthly subscription price.';
  const trialDays = Number(v.trialDays);
  if (!Number.isInteger(trialDays) || trialDays < 0 || trialDays > 365) return 'Trial days must be between 0 and 365.';
  if (!v.firstBillingDate) return 'Choose the first billing date.';
  return { priceCentavos, trialDays, firstBillingDate: v.firstBillingDate };
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
          <FieldLabel label="Trial (days)" required help="Free days from today before the store is billed. Changing it moves the first billing date to match, unless you picked that date yourself." />
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
                    : manilaDateInputFromToday(days),
              });
            }}
            required
            className={inputClass}
          />
        </div>
        <div>
          <FieldLabel label="First billing date" required help="The day of the first invoice. It also sets the billing day for every month after (days 29–31 fall on the last day of shorter months)." />
          <input
            type="date"
            value={value.firstBillingDate}
            onChange={e => onChange({ ...value, firstBillingDate: e.target.value, firstBillingTouched: true })}
            required
            className={inputClass}
          />
        </div>
      </div>
      {warning && <p className="text-xs text-amber-700">{warning}</p>}
      {/^\d{4}-\d{2}-\d{2}$/.test(value.firstBillingDate) && (
        <BillingScheduleSummary
          priceCentavos={pesoToCentavos(value.price)}
          firstInvoice={value.firstBillingDate}
          anchorDay={dayOfMonth(value.firstBillingDate)}
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
