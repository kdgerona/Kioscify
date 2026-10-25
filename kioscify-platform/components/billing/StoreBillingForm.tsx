'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { getErrorMessage } from '@/lib/utils';
import { formatManilaDate, formatPeso, pesoToCentavos, toManilaDateInput } from '@/lib/money';
import type { StoreBillingDetail, UpdateStoreBillingPayload } from '@/types';
import { EnableBillingDialog } from './EnableBillingDialog';
import { FieldLabel } from './FieldLabel';

interface Draft {
  price: string;
  activatedAt: string;
  trialStartAt: string;
  trialDays: string;
  anchorDay: string;
  nextBillingAt: string;
  graceDaysOverride: string;
}

function toDraft(d: StoreBillingDetail): Draft {
  const s = d.settings;
  return {
    price: s.priceCentavos ? String(s.priceCentavos / 100) : '',
    activatedAt: toManilaDateInput(s.activatedAt),
    trialStartAt: toManilaDateInput(s.trialStartAt),
    trialDays: s.trialDays != null ? String(s.trialDays) : '',
    anchorDay: s.anchorDay != null ? String(s.anchorDay) : '',
    nextBillingAt: s.nextBillingOverridden ? toManilaDateInput(s.nextBillingAt) : '',
    graceDaysOverride: s.graceDaysOverride != null ? String(s.graceDaysOverride) : '',
  };
}

const optionalInt = (v: string): number | null => (v.trim() === '' ? null : Number(v));
const optionalDate = (v: string): string | null => (v === '' ? null : v);

/** Only the fields the admin actually changed, so the audit log stays precise. */
function diff(draft: Draft, original: Draft): UpdateStoreBillingPayload | string {
  const p: UpdateStoreBillingPayload = {};
  if (draft.price !== original.price) {
    const c = pesoToCentavos(draft.price);
    if (!c) return 'Enter a monthly price in pesos';
    p.priceCentavos = c;
  }
  if (draft.activatedAt !== original.activatedAt) p.activatedAt = optionalDate(draft.activatedAt);
  if (draft.trialStartAt !== original.trialStartAt) p.trialStartAt = optionalDate(draft.trialStartAt);
  if (draft.nextBillingAt !== original.nextBillingAt) p.nextBillingAt = optionalDate(draft.nextBillingAt);
  for (const [key, label, min, max] of [
    ['trialDays', 'Trial days', 0, 365],
    ['anchorDay', 'Billing day', 1, 31],
    ['graceDaysOverride', 'Grace days', 0, 60],
  ] as const) {
    if (draft[key] === original[key]) continue;
    const n = optionalInt(draft[key]);
    if (n !== null && (!Number.isInteger(n) || n < min || n > max)) return `${label} must be between ${min} and ${max}`;
    p[key] = n;
  }
  return p;
}

const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

export function StoreBillingForm({
  detail,
  defaultTrialDays,
  defaultGraceDays,
  enforcement,
  reminderLeadDays,
  onChanged,
}: {
  detail: StoreBillingDetail;
  defaultTrialDays: number;
  defaultGraceDays: number;
  enforcement: boolean;
  reminderLeadDays: number;
  onChanged: (next?: StoreBillingDetail) => void;
}) {
  const original = toDraft(detail);
  const [draft, setDraft] = useState<Draft>(original);
  const [saving, setSaving] = useState(false);
  const [enableOpen, setEnableOpen] = useState(false);
  const [exemptOpen, setExemptOpen] = useState(false);
  const [exemptReason, setExemptReason] = useState(detail.settings.exemptReason ?? '');
  const s = detail.settings;
  const dirty = JSON.stringify(draft) !== JSON.stringify(original);

  async function patch(payload: UpdateStoreBillingPayload, success: string) {
    setSaving(true);
    try {
      const next = await api.updateStoreBilling(detail.tenantId, payload);
      toast.success(success);
      setDraft(toDraft(next));
      onChanged(next);
      return true;
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update billing settings'));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    const payload = diff(draft, original);
    if (typeof payload === 'string') { toast.error(payload); return; }
    await patch(payload, 'Billing settings saved');
  }

  async function markExempt() {
    if (!exemptReason.trim()) { toast.error('An exemption reason is required'); return; }
    const message = s.billingEnabled === true ? 'Billing turned off for this store' : 'Store marked exempt';
    if (await patch({ billingEnabled: false, exemptReason: exemptReason.trim() }, message)) setExemptOpen(false);
  }

  const set = (key: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, [key]: e.target.value });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div>
          <p className="text-sm font-medium text-gray-900">
            {s.billingEnabled === true ? 'Billed' : s.billingEnabled === false ? 'Exempt' : 'Billing not set up'}
          </p>
          <p className="text-xs text-gray-500">
            {s.billingEnabled === false
              ? `Reason: ${s.exemptReason}`
              : s.billingEnabled === true
                ? `${formatPeso(s.priceCentavos)} / month`
                : 'This store is not billed until you enable it.'}
          </p>
        </div>
        <div className="flex gap-2">
          {s.billingEnabled !== true && (
            <button
              type="button"
              onClick={() => (dirty ? toast.error('Save your changes first') : setEnableOpen(true))}
              disabled={saving}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              Enable billing
            </button>
          )}
          {s.billingEnabled !== false && (
            <button
              type="button"
              onClick={() => setExemptOpen(true)}
              disabled={saving}
              className={`px-4 py-2 border rounded-lg text-sm disabled:opacity-50 ${
                s.billingEnabled === true
                  ? 'border-red-200 text-red-700 hover:bg-red-50'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {s.billingEnabled === true ? 'Turn off billing' : 'Mark exempt'}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field
          label="Monthly price (₱)"
          required
          help="What this store pays every month. Needed before billing can be enabled. A change applies from the next invoice; an invoice already issued keeps its amount."
          hint="Changes apply from the next invoice."
        >
          <input inputMode="decimal" placeholder="1,500.00" value={draft.price} onChange={set('price')} className={inputClass} />
        </Field>
        <Field
          label="Activation date"
          required
          help="When the store started using Kioscify. The free trial counts from this day unless Trial start is set. Needed before billing can be enabled."
        >
          <input type="date" value={draft.activatedAt} onChange={set('activatedAt')} className={inputClass} />
        </Field>
        <Field
          label="Trial start"
          hint="Blank = activation date"
          help="Starts the free trial on a different day than activation. Leave blank to start it on the activation date."
        >
          <input type="date" value={draft.trialStartAt} onChange={set('trialStartAt')} className={inputClass} />
        </Field>
        <Field
          label="Trial length (days)"
          hint={`Blank = default (${defaultTrialDays}). Trial ends ${formatManilaDate(s.trialEndsAt)}.`}
          help={`Free days before the first bill. Blank uses the platform default (${defaultTrialDays}). Before the first invoice is issued, changing it moves the first billing date to the new trial end, unless a Next billing date override is set. "+7 days" extends it by a week.`}
        >
          <div className="flex gap-2">
            <input type="number" min={0} value={draft.trialDays} onChange={set('trialDays')} placeholder={String(defaultTrialDays)} className={inputClass} />
            <button
              type="button"
              onClick={() => setDraft({ ...draft, trialDays: String((optionalInt(draft.trialDays) ?? defaultTrialDays) + 7) })}
              className="px-3 py-2 border border-gray-300 rounded-md text-xs whitespace-nowrap hover:bg-gray-50"
            >
              +7 days
            </button>
          </div>
        </Field>
        <Field
          label="Billing day of month"
          hint="Days 29–31 fall on the last day of shorter months"
          help="The day of the month every invoice is dated and due. Set automatically from the trial end when billing is enabled. Days 29–31 fall on the last day of shorter months."
        >
          <input type="number" min={1} max={31} value={draft.anchorDay} onChange={set('anchorDay')} className={inputClass} />
        </Field>
        <Field
          label="Next billing date (override)"
          help="Forces the date of the next invoice, e.g. for a store that already paid outside Kioscify. It wins over the trial and billing day. Clear it to go back to the automatic date."
          hint={
            s.nextBillingOverridden
              ? 'Overridden — wins over the trial/billing-day date'
              : `Derived: ${formatManilaDate(s.nextBillingAt)}. Set a date to override (e.g. prepaid stores).`
          }
        >
          <div className="flex gap-2">
            <input type="date" value={draft.nextBillingAt} onChange={set('nextBillingAt')} className={inputClass} />
            {draft.nextBillingAt && (
              <button type="button" onClick={() => setDraft({ ...draft, nextBillingAt: '' })} className="px-3 text-xs text-indigo-600 hover:underline whitespace-nowrap">
                Clear override
              </button>
            )}
          </div>
        </Field>
        <Field
          label="Paid through"
          help="The last day already covered by payments. Updated automatically when an invoice is paid or a prepayment is recorded; read-only here."
        >
          <p className="px-3 py-2 text-sm text-gray-700 bg-gray-50 rounded-md">{formatManilaDate(s.paidThroughAt)}</p>
        </Field>
        <Field
          label="Grace days (override)"
          hint={`Blank = default (${defaultGraceDays})`}
          help={`Days after the due date that this store keeps working with a due banner. When they run out the store is locked, but only if Enforcement is on in Settings → Billing. Blank uses the platform default (${defaultGraceDays}).`}
        >
          <input type="number" min={0} max={60} value={draft.graceDaysOverride} onChange={set('graceDaysOverride')} placeholder={String(defaultGraceDays)} className={inputClass} />
        </Field>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <p className="mr-auto text-xs text-gray-400">
          <span className="text-red-500">*</span> Required to enable billing. Grace, reminder and lock rules for all stores are in{' '}
          <Link href="/settings" className="text-indigo-600 hover:underline">Settings → Billing</Link>.
        </p>
        {dirty && (
          <button type="button" onClick={() => setDraft(original)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">
            Discard
          </button>
        )}
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-40"
        >
          {saving ? 'Saving...' : 'Save settings'}
        </button>
      </div>

      {enableOpen && (
        <EnableBillingDialog
          tenantId={detail.tenantId}
          priceCentavos={s.priceCentavos}
          graceDays={s.graceDaysOverride ?? defaultGraceDays}
          enforcement={enforcement}
          globalBillingEnabled={detail.globalBillingEnabled}
          reminderLeadDays={reminderLeadDays}
          onCancel={() => setEnableOpen(false)}
          onEnabled={() => { setEnableOpen(false); onChanged(); }}
        />
      )}

      {exemptOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="font-semibold text-gray-900">
              {s.billingEnabled === true ? 'Turn off billing for this store' : 'Mark store exempt'}
            </h3>
            <p className="text-sm text-gray-600">
              {s.billingEnabled === true
                ? 'The store stops being billed right away: no new invoices, and any banner or lock is removed. Its settings and history are kept, and you can enable billing again at any time.'
                : 'Exempt stores never see an invoice, banner or lock.'}
            </p>
            <textarea
              autoFocus
              rows={3}
              value={exemptReason}
              onChange={e => setExemptReason(e.target.value)}
              placeholder="Reason, for the audit log (e.g. owner's store, special agreement, paused)"
              className={inputClass}
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setExemptOpen(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">Cancel</button>
              <button onClick={markExempt} disabled={saving} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                {s.billingEnabled === true ? 'Turn off billing' : 'Mark exempt'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  help,
  required,
  children,
}: {
  label: string;
  hint?: string;
  help?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <FieldLabel label={label} required={required} help={help} />
      {children}
      {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
    </div>
  );
}
