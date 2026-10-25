'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { getErrorMessage } from '@/lib/utils';
import { formatManilaDate, formatPeso } from '@/lib/money';
import type { BillingInvoice } from '@/types';
import { INVOICE_STATUS_STYLES, METHOD_LABELS } from './labels';
import { MarkPaidDialog } from './MarkPaidDialog';
import { ReasonDialog } from './ReasonDialog';
import { ExtendGraceDialog } from './ExtendGraceDialog';

type Action = { kind: 'paid' | 'void' | 'waive' | 'grace'; invoice: BillingInvoice } | null;

export function InvoicesPanel({ invoices, onChanged }: { invoices: BillingInvoice[]; onChanged: () => void }) {
  const [action, setAction] = useState<Action>(null);
  const [rechecking, setRechecking] = useState<string | null>(null);
  const done = () => { setAction(null); onChanged(); };

  async function recheck(invoice: BillingInvoice) {
    setRechecking(invoice.id);
    try {
      const { paid } = await api.recheckInvoice(invoice.id);
      toast[paid ? 'success' : 'info'](paid ? `${invoice.number} is paid` : 'PayMongo has no payment for this invoice yet');
      if (paid) onChanged();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Re-check failed'));
    } finally {
      setRechecking(null);
    }
  }

  async function resendReminder(invoice: BillingInvoice) {
    try {
      await api.resendInvoiceReminder(invoice.id);
      toast.success('Store admins will see the reminder again');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not resend the reminder'));
    }
  }

  if (invoices.length === 0) {
    return <div className="py-10 text-center text-sm text-gray-400">No invoices yet.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-gray-500 uppercase tracking-wide text-left">
          <tr>
            <th className="py-2 pr-3">Invoice</th>
            <th className="py-2 pr-3">Period</th>
            <th className="py-2 pr-3 text-right">Amount</th>
            <th className="py-2 pr-3">Due</th>
            <th className="py-2 pr-3">Status</th>
            <th className="py-2 pr-3">Paid</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {invoices.map(inv => {
            const style = INVOICE_STATUS_STYLES[inv.status];
            return (
              <tr key={inv.id} className="align-top">
                <td className="py-3 pr-3 font-mono text-xs">
                  {inv.number}
                  {inv.revision > 0 && <span className="ml-1 text-gray-400">(reissue {inv.revision})</span>}
                </td>
                <td className="py-3 pr-3 whitespace-nowrap">{formatManilaDate(inv.periodStart)} – {formatManilaDate(inv.periodEnd)}</td>
                <td className="py-3 pr-3 text-right tabular-nums">{formatPeso(inv.amountCentavos)}</td>
                <td className="py-3 pr-3 whitespace-nowrap">
                  {formatManilaDate(inv.dueAt)}
                  {inv.graceExtendedUntil && (
                    // Stored as the first locked instant; show the last unlocked day.
                    <p className="text-xs text-gray-400">
                      Grace through {formatManilaDate(new Date(new Date(inv.graceExtendedUntil).getTime() - 1).toISOString())}
                    </p>
                  )}
                </td>
                <td className="py-3 pr-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${style.className}`}>{style.label}</span>
                  {inv.voidReason && <p className="text-xs text-gray-400 mt-1">{inv.voidReason}</p>}
                </td>
                <td className="py-3 pr-3 whitespace-nowrap">
                  {inv.paidAt ? `${formatManilaDate(inv.paidAt)}${inv.paymentMethod ? ` · ${METHOD_LABELS[inv.paymentMethod]}` : ''}` : '—'}
                </td>
                <td className="py-3 text-right">
                  {inv.status === 'OPEN' && (
                    <div className="flex flex-wrap justify-end gap-1">
                      <SmallButton onClick={() => setAction({ kind: 'paid', invoice: inv })}>Mark paid</SmallButton>
                      <SmallButton onClick={() => recheck(inv)} disabled={rechecking === inv.id}>
                        {rechecking === inv.id ? 'Checking…' : 'Re-check'}
                      </SmallButton>
                      <SmallButton onClick={() => setAction({ kind: 'grace', invoice: inv })}>Extend grace</SmallButton>
                      <SmallButton onClick={() => resendReminder(inv)}>Resend reminder</SmallButton>
                      <SmallButton onClick={() => setAction({ kind: 'waive', invoice: inv })}>Waive</SmallButton>
                      <SmallButton onClick={() => setAction({ kind: 'void', invoice: inv })}>Void</SmallButton>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {action?.kind === 'paid' && <MarkPaidDialog invoice={action.invoice} onClose={() => setAction(null)} onDone={done} />}
      {action?.kind === 'grace' && <ExtendGraceDialog invoice={action.invoice} onClose={() => setAction(null)} onDone={done} />}
      {action?.kind === 'void' && (
        <ReasonDialog
          title={`Void ${action.invoice.number}`}
          description="Use when the invoice was issued in error. The same period is reissued as a new invoice at the current price."
          confirmLabel="Void invoice"
          danger
          action={reason => api.voidInvoice(action.invoice.id, reason)}
          onClose={() => setAction(null)}
          onDone={done}
        />
      )}
      {action?.kind === 'waive' && (
        <ReasonDialog
          title={`Waive ${action.invoice.number}`}
          description="The period counts as covered without payment."
          confirmLabel="Waive invoice"
          action={reason => api.waiveInvoice(action.invoice.id, reason)}
          onClose={() => setAction(null)}
          onDone={done}
        />
      )}
    </div>
  );
}

function SmallButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="px-2 py-1 text-xs border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50 whitespace-nowrap"
    >
      {children}
    </button>
  );
}
