'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { getErrorMessage } from '@/lib/utils';
import { pesoToCentavos } from '@/lib/money';
import type { ManualPaymentMethod } from '@/types';
import { Dialog, dialogInputClass } from './Dialog';
import { MANUAL_METHOD_OPTIONS } from './labels';
import { LabelText } from './FieldLabel';

/** For stores that paid in advance outside the platform: nothing is invoiced before "next billing". */
export function PrepaymentDialog({ tenantId, onClose, onDone }: { tenantId: string; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState('');
  const [months, setMonths] = useState('1');
  const [paidThrough, setPaidThrough] = useState('');
  const [nextBilling, setNextBilling] = useState('');
  const [manualMethod, setManualMethod] = useState<ManualPaymentMethod>('bank_transfer');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    const amountCentavos = pesoToCentavos(amount);
    const monthsCovered = Number(months);
    if (!amountCentavos) { toast.error('Enter the amount received'); return; }
    if (!Number.isInteger(monthsCovered) || monthsCovered < 1 || monthsCovered > 36) { toast.error('Months covered must be 1–36'); return; }
    if (!paidThrough || !nextBilling) { toast.error('Set both the paid-through and next billing dates'); return; }
    setBusy(true);
    try {
      await api.recordPrepayment(tenantId, {
        amountCentavos,
        monthsCovered,
        paidThroughAt: paidThrough,
        nextBillingAt: nextBilling,
        manualMethod,
        reference: reference.trim() || undefined,
        note: note.trim() || undefined,
      });
      toast.success('Prepayment recorded');
      onDone();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to record prepayment'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title="Record prepayment" onCancel={onClose} onConfirm={submit} confirmLabel="Record prepayment" busy={busy}>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm text-gray-700">
          <LabelText label="Amount (₱)" required help="The total the store paid you outside Kioscify for the months covered." />
          <input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="4,500.00" className={dialogInputClass} />
        </label>
        <label className="text-sm text-gray-700">
          <LabelText label="Months covered" required help="How many months this payment covers (1–36). Those months are marked paid in the monthly checklist." />
          <input type="number" min={1} max={36} value={months} onChange={e => setMonths(e.target.value)} className={dialogInputClass} />
        </label>
        <label className="text-sm text-gray-700">
          <LabelText label="Paid through" required help="The last day this payment covers. Shown as the store's paid-through date." />
          <input type="date" value={paidThrough} onChange={e => setPaidThrough(e.target.value)} className={dialogInputClass} />
        </label>
        <label className="text-sm text-gray-700">
          <LabelText label="First invoice on" required help="When Kioscify should send this store its next invoice. Its day also becomes the monthly billing day. Nothing is invoiced, shown or locked before then, apart from the reminder banner in the days just before." />
          <input type="date" value={nextBilling} onChange={e => setNextBilling(e.target.value)} className={dialogInputClass} />
        </label>
        <label className="text-sm text-gray-700">
          <LabelText label="Method" required help="How the money was received. For your records and the payments export." />
          <select value={manualMethod} onChange={e => setManualMethod(e.target.value as ManualPaymentMethod)} className={dialogInputClass}>
            {MANUAL_METHOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label className="text-sm text-gray-700">
          <LabelText label="Reference no." help="Bank or e-wallet reference, if any. Optional." />
          <input value={reference} onChange={e => setReference(e.target.value)} className={dialogInputClass} />
        </label>
      </div>
      <label className="block text-sm text-gray-700">
        <LabelText label="Note" help="Anything worth remembering about this payment. Optional." />
        <textarea rows={2} value={note} onChange={e => setNote(e.target.value)} className={dialogInputClass} />
      </label>
      <p className="text-xs text-gray-400"><span className="text-red-500">*</span> Required. No invoice, due banner or lock happens before the first invoice date. The covered months are marked paid in the monthly checklist.</p>
    </Dialog>
  );
}
