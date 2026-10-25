'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { getErrorMessage } from '@/lib/utils';
import { formatManilaDate, formatPeso } from '@/lib/money';
import type { BillingClaim } from '@/types';
import { ReasonDialog } from './ReasonDialog';

const STATUS_STYLE: Record<BillingClaim['status'], string> = {
  PENDING: 'bg-amber-50 text-amber-700',
  APPROVED: 'bg-green-50 text-green-700',
  REJECTED: 'bg-gray-100 text-gray-500',
};

/** "I've paid" claims for bank-QR payments — compare the reference against your bank app, then approve. */
export function ClaimsQueue({ claims, showStore, onChanged }: { claims: BillingClaim[]; showStore?: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<BillingClaim | null>(null);

  async function approve(claim: BillingClaim) {
    setBusy(claim.id);
    try {
      await api.approveBillingClaim(claim.id);
      toast.success('Payment approved');
      onChanged();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to approve'));
    } finally {
      setBusy(null);
    }
  }

  if (claims.length === 0) {
    return <div className="py-10 text-center text-sm text-gray-400">No payment claims.</div>;
  }

  return (
    <>
      <ul className="divide-y">
        {claims.map(c => {
          const mismatch = c.invoiceAmountCentavos != null && c.invoiceAmountCentavos !== c.amountCentavos;
          return (
            <li key={c.id} className="py-3 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">
                  {showStore && c.storeName ? `${c.storeName} · ` : ''}
                  {formatPeso(c.amountCentavos)}
                  {mismatch && <span className="ml-2 text-xs text-red-600">invoice is {formatPeso(c.invoiceAmountCentavos ?? null)}</span>}
                </p>
                <p className="text-xs text-gray-500">
                  Ref <span className="font-mono">{c.reference}</span> · paid {formatManilaDate(c.paidAt)}
                  {c.invoiceNumber ? ` · ${c.invoiceNumber}` : ''}
                </p>
                {c.note && <p className="text-xs text-gray-500 mt-0.5">“{c.note}”</p>}
                {c.rejectReason && <p className="text-xs text-gray-400 mt-0.5">Rejected: {c.rejectReason}</p>}
                {c.receiptImageUrl && (
                  <a href={c.receiptImageUrl} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 hover:underline">
                    View receipt
                  </a>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[c.status]}`}>{c.status.toLowerCase()}</span>
                {c.status === 'PENDING' && c.invoiceStatus && c.invoiceStatus !== 'OPEN' && (
                  <span className="text-xs text-gray-500" title="Approving is only possible while the invoice is open">
                    invoice {c.invoiceStatus.toLowerCase()}
                  </span>
                )}
                {c.status === 'PENDING' && (
                  <>
                    <button
                      onClick={() => approve(c)}
                      disabled={busy === c.id || (!!c.invoiceStatus && c.invoiceStatus !== 'OPEN')}
                      className="px-3 py-1 text-xs rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button onClick={() => setRejecting(c)} className="px-3 py-1 text-xs rounded-md border border-gray-300 hover:bg-gray-50">
                      Reject
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {rejecting && (
        <ReasonDialog
          title="Reject payment claim"
          description="The store admin sees this reason on their banner."
          confirmLabel="Reject claim"
          danger
          action={reason => api.rejectBillingClaim(rejecting.id, reason)}
          onClose={() => setRejecting(null)}
          onDone={() => { setRejecting(null); onChanged(); }}
        />
      )}
    </>
  );
}
