'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { getErrorMessage } from '@/lib/utils';
import { formatPeso, manilaDateInputFromToday } from '@/lib/money';
import type { BillingInvoice, ManualPaymentMethod } from '@/types';
import { Dialog, dialogInputClass } from './Dialog';
import { MANUAL_METHOD_OPTIONS } from './labels';
import { LabelText } from './FieldLabel';

export function MarkPaidDialog({ invoice, onClose, onDone }: { invoice: BillingInvoice; onClose: () => void; onDone: () => void }) {
  const [manualMethod, setManualMethod] = useState<ManualPaymentMethod>('cash');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [paidOn, setPaidOn] = useState(manilaDateInputFromToday(0));
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await api.markInvoicePaid(invoice.id, {
        manualMethod,
        reference: reference.trim() || undefined,
        note: note.trim() || undefined,
        // Noon Manila on the chosen day — a date, not a time, matters here.
        paidAt: new Date(`${paidOn}T12:00:00+08:00`).toISOString(),
      });
      toast.success(`${invoice.number} marked paid`);
      onDone();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to record payment'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title={`Mark ${invoice.number} paid`} onCancel={onClose} onConfirm={submit} confirmLabel="Record payment" busy={busy}>
      <p className="text-sm text-gray-600">Records {formatPeso(invoice.amountCentavos)} received outside PayMongo.</p>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm text-gray-700">
          <LabelText label="Method" required help="How the money was received. For your records and the payments export." />
          <select value={manualMethod} onChange={e => setManualMethod(e.target.value as ManualPaymentMethod)} className={dialogInputClass}>
            {MANUAL_METHOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label className="text-sm text-gray-700">
          <LabelText label="Paid on" required help="The day the store paid. If it was after the grace period, the store's billing date restarts from this day." />
          <input type="date" value={paidOn} onChange={e => setPaidOn(e.target.value)} className={dialogInputClass} />
        </label>
      </div>
      <label className="block text-sm text-gray-700">
        <LabelText label="Reference no." help="Bank or e-wallet reference, if any. Optional." />
        <input value={reference} onChange={e => setReference(e.target.value)} className={dialogInputClass} />
      </label>
      <label className="block text-sm text-gray-700">
        <LabelText label="Note" help="Anything worth remembering about this payment. Optional." />
        <textarea rows={2} value={note} onChange={e => setNote(e.target.value)} className={dialogInputClass} />
      </label>
    </Dialog>
  );
}
