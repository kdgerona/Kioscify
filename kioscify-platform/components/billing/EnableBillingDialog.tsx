'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { getErrorMessage } from '@/lib/utils';
import { formatManilaDate, formatPeso, toManilaDateInput } from '@/lib/money';
import type { EnableDatesPreview } from '@/types';
import { dayOfMonth } from '@/lib/billing-schedule';
import { BillingScheduleSummary } from './BillingScheduleSummary';
import { FieldLabel } from './FieldLabel';

/** Shows the derived dates and a plain-language billing schedule before billing is enabled. */
export function EnableBillingDialog({
  tenantId,
  priceCentavos,
  graceDays,
  enforcement,
  globalBillingEnabled,
  reminderLeadDays,
  onCancel,
  onEnabled,
}: {
  tenantId: string;
  priceCentavos: number | null;
  graceDays: number;
  enforcement: boolean;
  globalBillingEnabled: boolean;
  reminderLeadDays: number;
  onCancel: () => void;
  onEnabled: () => void;
}) {
  const [preview, setPreview] = useState<EnableDatesPreview | null>(null);
  const [nextBilling, setNextBilling] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.getEnablePreview(tenantId)
      .then(p => { setPreview(p); setNextBilling(toManilaDateInput(p.nextBillingAt)); })
      .catch(err => setError(getErrorMessage(err, 'Could not compute billing dates')));
  }, [tenantId]);

  async function enable() {
    if (!preview) return;
    setBusy(true);
    try {
      const edited = nextBilling && nextBilling !== toManilaDateInput(preview.nextBillingAt);
      await api.updateStoreBilling(tenantId, { billingEnabled: true, ...(edited ? { nextBillingAt: nextBilling } : {}) });
      toast.success('Billing enabled for this store');
      onEnabled();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to enable billing'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h3 className="font-semibold text-gray-900">Enable billing</h3>
        {error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : !preview ? (
          <p className="text-sm text-gray-400">Computing dates...</p>
        ) : (
          <div className="space-y-3 text-sm">
            <Row label="Monthly price" value={formatPeso(priceCentavos)} />
            <Row label="Trial ends" value={formatManilaDate(preview.trialEndsAt)} />
            <Row label="Paid through" value={preview.paidThroughAt ? formatManilaDate(preview.paidThroughAt) : 'Nothing prepaid'} />
            {preview.honoredMonths.length > 0 && (
              <p className="text-xs text-gray-500">Honoring months already marked paid: {preview.honoredMonths.join(', ')}</p>
            )}
            <div>
              <FieldLabel
                label="First invoice on"
                required
                help="The day of this store's first invoice, worked out from its trial and any months already marked paid. Change it to bill on a different day; the new day becomes the monthly billing day."
              />
              <input type="date" value={nextBilling} onChange={e => setNextBilling(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
              <p className="text-xs text-gray-400 mt-0.5">
                {preview.nextBillingOverridden ? 'This is the override you set. ' : ''}
                Nothing is invoiced, shown or locked before this date. Editing it sets an override.
              </p>
            </div>
            <BillingScheduleSummary
              priceCentavos={priceCentavos}
              firstInvoice={nextBilling}
              // An edited first date becomes the billing day, as the API does.
              anchorDay={nextBilling && nextBilling !== toManilaDateInput(preview.nextBillingAt) ? dayOfMonth(nextBilling) : preview.anchorDay}
              graceDays={graceDays}
              enforcement={enforcement}
              globalBillingEnabled={globalBillingEnabled}
              reminderLeadDays={reminderLeadDays}
            />
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">Cancel</button>
          <button
            onClick={enable}
            disabled={busy || !preview}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy ? 'Enabling...' : 'Enable billing'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-900">{value}</span>
    </div>
  );
}
