import { formatManilaDate, formatPeso } from '@/lib/money';
import type { BillingAttemptRow, BillingPaymentRow } from '@/types';
import { METHOD_LABELS, SOURCE_LABELS, manualMethodLabel } from './labels';

export function PaymentsPanel({ payments, attempts }: { payments: BillingPaymentRow[]; attempts: BillingAttemptRow[] }) {
  return (
    <div className="space-y-6">
      {payments.length === 0 ? (
        <div className="py-10 text-center text-sm text-gray-400">No payments recorded yet.</div>
      ) : (
        <ul className="divide-y">
          {payments.map(p => (
            <li key={p.id} className="py-3 flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {formatPeso(p.amountCentavos)} · {METHOD_LABELS[p.method]}
                  {p.manualMethod ? ` (${manualMethodLabel(p.manualMethod)})` : ''}
                  {p.monthsCovered > 1 ? ` · ${p.monthsCovered} months` : ''}
                </p>
                <p className="text-xs text-gray-500">
                  {SOURCE_LABELS[p.source]}
                  {p.reference ? ` · Ref ${p.reference}` : ''}
                  {p.note ? ` · ${p.note}` : ''}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500">{formatManilaDate(p.paidAt)}</p>
                {p.flagged && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-600" title="Not applied — the invoice was already settled. Check for a refund.">
                    Not applied
                  </span>
                )}
                {p.amountMismatch && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700" title="Applied, but the amount paid differs from the invoice">
                    Amount differs
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {attempts.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">PayMongo QR attempts</p>
          <ul className="divide-y text-xs text-gray-600">
            {attempts.map(a => (
              <li key={a.id} className="py-2 flex justify-between gap-2">
                <span className="font-mono">{a.providerIntentId}{a.livemode ? '' : ' (test)'}</span>
                <span>{a.status} · {new Date(a.createdAt).toLocaleString('en-US', { timeZone: 'Asia/Manila' })}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
