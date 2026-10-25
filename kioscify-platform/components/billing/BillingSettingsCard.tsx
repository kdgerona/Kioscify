'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { getErrorMessage } from '@/lib/utils';
import { formatPeso, pesoToCentavos } from '@/lib/money';
import type { BillingConfig, PaymongoMode, UpdateBillingConfigPayload } from '@/types';
import { FieldLabel, HelpTip } from './FieldLabel';

type NumberField =
  | 'defaultTrialDays'
  | 'defaultGraceDays'
  | 'invoiceLeadDays'
  | 'overduePollSeconds'
  | 'limitWarnPercent'
  | 'claimLockHoldDays';

const NUMBER_FIELDS: { key: NumberField; label: string; hint: string; help: string }[] = [
  {
    key: 'defaultTrialDays',
    label: 'Default trial (days)',
    hint: 'Prefilled when onboarding a store',
    help: 'Free days given to a new store before its first bill. Prefilled in the Onboard store form, and used by any store whose own trial length is blank.',
  },
  {
    key: 'defaultGraceDays',
    label: 'Grace period (days)',
    hint: 'After the due date, before lock',
    help: 'Days after the due date that an unpaid store keeps working with a due banner. When it ends the store is locked, but only while Enforcement is on. A store can have its own grace days.',
  },
  {
    key: 'invoiceLeadDays',
    label: 'Remind before due (days)',
    hint: 'Reminder banner before the due date. 0 = none.',
    help: 'How many days before the due date the invoice is issued and stores see a reminder banner (store admins can pay early). This does not start the grace period. 0 = no reminder: nothing shows until the due date.',
  },
  {
    key: 'overduePollSeconds',
    label: 'Status poll (seconds)',
    hint: 'How fast the overdue screen unlocks',
    help: 'How often the overdue and Pay now screens re-check for a payment, so a store unlocks soon after paying. Lower is faster but makes more requests. Minimum 10.',
  },
  {
    key: 'limitWarnPercent',
    label: 'Limit warning (%)',
    hint: 'Dashboard warns at this share of the limit',
    help: 'The Subscriptions dashboard shows a warning when this month’s PayMongo QR Ph collections reach this percentage of the monthly limit below.',
  },
  {
    key: 'claimLockHoldDays',
    label: 'Claim hold (days)',
    hint: 'A pending "I’ve paid" claim delays the lock',
    help: 'When a store pays by your bank QR and submits "I’ve paid", it is not locked for this many days while you review the claim. Approving it marks the invoice paid; rejecting it ends the hold.',
  },
];

const ENFORCEMENT_CHECKLIST = [
  'Kiosk APK with the billing screens is released with force update.',
  'Every kiosk has updated to at least the minimum version below.',
  'At least one real store has paid through PayMongo successfully.',
];

const MODE_BADGE: Record<PaymongoMode, { label: string; className: string }> = {
  test: { label: 'TEST', className: 'bg-amber-50 text-amber-700' },
  live: { label: 'LIVE', className: 'bg-green-50 text-green-700' },
  unconfigured: { label: 'NOT CONFIGURED', className: 'bg-gray-100 text-gray-500' },
};

interface Draft {
  numbers: Record<NumberField, string>;
  reminderOffsets: string;
  limitPeso: string;
  fallbackQrAccountName: string;
  fallbackQrInstructions: string;
}

function toDraft(c: BillingConfig): Draft {
  return {
    numbers: Object.fromEntries(NUMBER_FIELDS.map(f => [f.key, String(c[f.key])])) as Record<NumberField, string>,
    reminderOffsets: c.reminderOffsets.join(', '),
    limitPeso: String(c.paymongoMonthlyLimitCentavos / 100),
    fallbackQrAccountName: c.fallbackQrAccountName ?? '',
    fallbackQrInstructions: c.fallbackQrInstructions ?? '',
  };
}

export function BillingSettingsCard() {
  const [config, setConfig] = useState<BillingConfig | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState<'billingEnabled' | 'enforcementEnabled' | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [minVersion, setMinVersion] = useState('');

  useEffect(() => {
    api.getBillingConfig()
      .then(c => { setConfig(c); setDraft(toDraft(c)); setMinVersion(c.minKioskVersionCode ? String(c.minKioskVersionCode) : ''); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function apply(payload: UpdateBillingConfigPayload, success: string) {
    const next = await api.updateBillingConfig(payload);
    setConfig(next);
    setDraft(toDraft(next));
    toast.success(success);
  }

  async function toggle(key: 'billingEnabled' | 'enforcementEnabled') {
    if (!config || toggling) return;
    if (key === 'enforcementEnabled' && !config.enforcementEnabled) {
      setConfirmOpen(true);
      return;
    }
    setToggling(key);
    try {
      await apply({ [key]: !config[key] }, 'Billing settings updated');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update billing settings'));
    } finally {
      setToggling(null);
    }
  }

  async function confirmEnforcement() {
    const code = Number(minVersion);
    if (!Number.isInteger(code) || code < 1) { toast.error('Enter the minimum kiosk version code'); return; }
    setToggling('enforcementEnabled');
    try {
      await apply({ enforcementEnabled: true, minKioskVersionCode: code, confirmEnforcement: true }, 'Enforcement enabled');
      setConfirmOpen(false);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to enable enforcement'));
    } finally {
      setToggling(null);
    }
  }

  async function save() {
    if (!draft) return;
    const payload: UpdateBillingConfigPayload = {};
    for (const f of NUMBER_FIELDS) {
      const n = Number(draft.numbers[f.key]);
      if (!Number.isInteger(n) || n < 0) { toast.error(`${f.label} must be a whole number`); return; }
      payload[f.key] = n;
    }
    const offsets = draft.reminderOffsets.split(',').map(s => s.trim()).filter(Boolean).map(Number);
    if (offsets.some(n => !Number.isInteger(n) || n < 0)) { toast.error('Reminder days must be whole numbers, e.g. 0, 3, 7'); return; }
    payload.reminderOffsets = offsets;
    const limit = pesoToCentavos(draft.limitPeso);
    if (!limit) { toast.error('Enter the PayMongo monthly limit in pesos'); return; }
    payload.paymongoMonthlyLimitCentavos = limit;
    payload.fallbackQrAccountName = draft.fallbackQrAccountName.trim() || null;
    payload.fallbackQrInstructions = draft.fallbackQrInstructions.trim() || null;

    setSaving(true);
    try {
      await apply(payload, 'Billing settings saved');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to save billing settings'));
    } finally {
      setSaving(false);
    }
  }

  const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

  return (
    <div className="bg-white rounded-lg border">
      <div className="px-6 py-4 border-b flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold text-gray-900">Billing</h2>
          <p className="text-xs text-gray-400 mt-0.5">Automated store subscription billing via PayMongo QRPH</p>
        </div>
        {config && (
          <div className="flex flex-col items-end gap-1">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${MODE_BADGE[config.paymongoMode].className}`}>
              PayMongo {MODE_BADGE[config.paymongoMode].label}
            </span>
            <span className="text-xs text-gray-400">Webhook {config.webhookConfigured ? 'configured' : 'not configured'}</span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="px-6 py-4 text-sm text-gray-400">Loading...</div>
      ) : !config || !draft ? (
        <div className="px-6 py-4 text-sm text-red-400">Failed to load billing settings</div>
      ) : (
        <div className="px-6 py-4 space-y-5">
          <div className="divide-y divide-gray-50">
            <ToggleRow
              label="Billing enabled"
              help="The master switch. Off: no store is invoiced or sees anything, whatever its own settings. On: every store with billing turned on is invoiced on its billing date and sees the reminder and due banners."
              description="Issue invoices and show due banners for stores with billing turned on"
              enabled={config.billingEnabled}
              disabled={toggling !== null}
              onToggle={() => toggle('billingEnabled')}
            />
            <ToggleRow
              label="Enforcement (lock) enabled"
              help="Off: overdue stores keep a banner but are never locked. On: a store still unpaid when its grace period ends is locked to the Subscription overdue screen (Store Portal and kiosk) until it pays. Offline sales still sync. Turning it on asks for the minimum kiosk version first."
              description={
                config.minKioskVersionCode
                  ? `Lock overdue stores after the grace period · min kiosk version ${config.minKioskVersionCode}`
                  : 'Lock overdue stores after the grace period'
              }
              enabled={config.enforcementEnabled}
              disabled={toggling !== null}
              onToggle={() => toggle('enforcementEnabled')}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {NUMBER_FIELDS.map(f => (
              <div key={f.key}>
                <FieldLabel label={f.label} required help={f.help} />
                <input
                  type="number"
                  min={0}
                  value={draft.numbers[f.key]}
                  onChange={e => setDraft({ ...draft, numbers: { ...draft.numbers, [f.key]: e.target.value } })}
                  className={inputClass}
                />
                <p className="text-xs text-gray-400 mt-0.5">{f.hint}</p>
              </div>
            ))}
            <div>
              <FieldLabel
                label="Reminder days"
                help="One-time in-app notices shown to store admins this many days after the due date, e.g. 0, 3, 7. A store with a late invoice sees only the latest one. Leave blank for no notices; the due banner still shows."
              />
              <input
                type="text"
                value={draft.reminderOffsets}
                onChange={e => setDraft({ ...draft, reminderOffsets: e.target.value })}
                placeholder="0, 3, 7"
                className={inputClass}
              />
              <p className="text-xs text-gray-400 mt-0.5">Days after the due date (in-app)</p>
            </div>
            <div>
              <FieldLabel
                label="PayMongo monthly limit (₱)"
                required
                help="Your estimate of how much your PayMongo account can collect by QR Ph in a month (unverified accounts are capped). Once this month’s QR Ph payments plus the next one would pass it, stores are shown your fallback bank QR instead, if you’ve uploaded one."
              />
              <input
                type="text"
                inputMode="decimal"
                value={draft.limitPeso}
                onChange={e => setDraft({ ...draft, limitPeso: e.target.value })}
                className={inputClass}
              />
              <p className="text-xs text-gray-400 mt-0.5">Currently {formatPeso(config.paymongoMonthlyLimitCentavos)}; over it, stores see your bank QR</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-1.5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Fallback bank QR</p>
              <HelpTip
                label="Fallback bank QR"
                text="Your own bank QR, shown instead of PayMongo when the monthly limit is reached, PayMongo isn’t set up, or PayMongo fails to create a QR (an error or no response within 15 seconds). These payments can’t be confirmed automatically: stores submit “I’ve paid” and you approve them. Optional."
              />
            </div>
            <div>
              <FieldLabel label="Account name" help="Shown under your bank QR so payers can check they are paying the right account. Optional." />
              <input
                type="text"
                value={draft.fallbackQrAccountName}
                onChange={e => setDraft({ ...draft, fallbackQrAccountName: e.target.value })}
                placeholder="e.g. Juan Dela Cruz — BPI"
                className={inputClass}
              />
            </div>
            <div>
              <FieldLabel label="Instructions" help="Extra steps shown with your bank QR, e.g. what to put in the reference. Optional." />
              <textarea
                rows={2}
                value={draft.fallbackQrInstructions}
                onChange={e => setDraft({ ...draft, fallbackQrInstructions: e.target.value })}
                className={inputClass}
              />
            </div>
            <FallbackQrUpload
              imageUrl={config.fallbackQrImageUrl}
              onChanged={next => { setConfig(next); setDraft(toDraft(next)); }}
            />
          </div>

          <div className="flex items-center justify-end gap-4">
            <p className="mr-auto text-xs text-gray-400"><span className="text-red-500">*</span> Required</p>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save billing settings'}
            </button>
          </div>
        </div>
      )}

      {confirmOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="font-semibold text-gray-900">Turn on enforcement?</h3>
            <p className="text-sm text-gray-600">Overdue stores will be locked after their grace period. Before continuing, confirm:</p>
            <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1">
              {ENFORCEMENT_CHECKLIST.map(item => <li key={item}>{item}</li>)}
            </ul>
            <div>
              <FieldLabel
                label="Minimum kiosk version code"
                required
                help="The kiosk app build number (versionCode) that can show the overdue screen. 7 = app 1.1.0. Older kiosks show their generic “subscription ended” screen instead, so release the update first."
              />
              <input type="number" min={1} value={minVersion} onChange={e => setMinVersion(e.target.value)} className={inputClass} />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmOpen(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmEnforcement}
                disabled={toggling !== null}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                Enable enforcement
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ToggleRow({
  label,
  help,
  description,
  enabled,
  disabled,
  onToggle,
}: {
  label: string;
  help?: string;
  description: string;
  enabled: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between py-3 gap-4">
      <div>
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium text-gray-900">{label}</p>
          {help && <HelpTip text={help} label={label} />}
        </div>
        <p className="text-xs text-gray-400">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={label}
        onClick={onToggle}
        disabled={disabled}
        className={`w-10 h-6 shrink-0 rounded-full flex items-center px-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          enabled ? 'bg-indigo-600' : 'bg-gray-200'
        }`}
      >
        <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-4' : 'translate-x-0'}`} />
      </button>
    </div>
  );
}

function FallbackQrUpload({ imageUrl, onChanged }: { imageUrl: string | null; onChanged: (c: BillingConfig) => void }) {
  const [busy, setBusy] = useState(false);

  async function upload(file: File | undefined) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('The QR image must be 2 MB or smaller'); return; }
    setBusy(true);
    try {
      onChanged(await api.uploadFallbackQr(file));
      toast.success('Fallback QR uploaded');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Upload failed'));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      onChanged(await api.removeFallbackQr());
      toast.success('Fallback QR removed');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to remove'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-start gap-4">
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="Fallback bank QR" className="w-28 h-28 object-contain border rounded-md bg-white" />
      ) : (
        <div className="w-28 h-28 border border-dashed rounded-md flex items-center justify-center text-xs text-gray-400 text-center px-2">
          No QR uploaded
        </div>
      )}
      <div className="space-y-2 text-sm">
        <label className={`inline-block px-3 py-2 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
          {imageUrl ? 'Replace QR image' : 'Upload QR image'}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={e => { upload(e.target.files?.[0]); e.target.value = ''; }}
          />
        </label>
        {imageUrl && (
          <button type="button" onClick={remove} disabled={busy} className="block text-xs text-red-600 hover:underline">
            Remove
          </button>
        )}
        <p className="text-xs text-gray-400 max-w-xs">
          Your InstaPay / QR Ph code from your bank app. Payments to it can&apos;t be confirmed automatically — stores submit
          &ldquo;I&apos;ve paid&rdquo; and you approve them under Subscriptions → Payment claims.
        </p>
      </div>
    </div>
  );
}
