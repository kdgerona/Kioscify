'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { getErrorMessage } from '@/lib/utils';
import { Dialog, dialogInputClass } from './Dialog';

/** Asks for a required reason (void / waive / reject claim) and runs `action`. */
export function ReasonDialog({
  title,
  description,
  confirmLabel,
  danger,
  action,
  onClose,
  onDone,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  action: (reason: string) => Promise<void>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!reason.trim()) { toast.error('A reason is required'); return; }
    setBusy(true);
    try {
      await action(reason.trim());
      toast.success('Done');
      onDone();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Action failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title={title} onCancel={onClose} onConfirm={submit} confirmLabel={confirmLabel} busy={busy} danger={danger}>
      <p className="text-sm text-gray-600">{description}</p>
      <textarea autoFocus rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason" className={dialogInputClass} />
    </Dialog>
  );
}
