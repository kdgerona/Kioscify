'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { getErrorMessage } from '@/lib/utils';
import { manilaDateInputFromToday } from '@/lib/money';
import type { BillingInvoice } from '@/types';
import { Dialog, dialogInputClass } from './Dialog';

export function ExtendGraceDialog({ invoice, onClose, onDone }: { invoice: BillingInvoice; onClose: () => void; onDone: () => void }) {
  const [until, setUntil] = useState(manilaDateInputFromToday(7));
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await api.extendInvoiceGrace(invoice.id, until);
      toast.success('Grace period extended');
      onDone();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to extend grace'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title={`Extend grace for ${invoice.number}`} onCancel={onClose} onConfirm={submit} confirmLabel="Extend" busy={busy}>
      <p className="text-sm text-gray-600">The store stays unlocked (banner only) through the end of this day.</p>
      <input type="date" value={until} onChange={e => setUntil(e.target.value)} className={dialogInputClass} />
    </Dialog>
  );
}
