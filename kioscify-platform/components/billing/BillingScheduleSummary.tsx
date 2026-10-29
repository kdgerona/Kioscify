import { formatPeso } from '@/lib/money';
import { addDays, billingSchedule, formatDay, ordinal } from '@/lib/billing-schedule';

/**
 * Plain-language preview of how a store will be billed, so the admin can
 * check the price and dates before saving.
 */
export function BillingScheduleSummary({
  priceCentavos,
  firstInvoice,
  anchorDay,
  graceDays,
  enforcement,
  globalBillingEnabled,
  reminderLeadDays,
  heading = 'What will happen',
  isFirst = true,
  arrears = false,
}: {
  priceCentavos: number | null;
  /** "YYYY-MM-DD" (Manila). */
  firstInvoice: string;
  anchorDay: number;
  graceDays: number;
  enforcement: boolean;
  globalBillingEnabled: boolean;
  /** Days before the due date that the reminder banner starts (0 = none). */
  reminderLeadDays: number;
  heading?: string;
  /** False once the store has had invoices — then this is just the next one. */
  isFirst?: boolean;
  /** Each month is paid at its end instead of the start. */
  arrears?: boolean;
}) {
  if (!firstInvoice) return null;
  const s = billingSchedule(firstInvoice, anchorDay, graceDays, arrears);
  const price = priceCentavos ? formatPeso(priceCentavos) : 'The monthly price';

  return (
    <div className="rounded-md border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-sm text-gray-700 space-y-1.5">
      <p className="text-xs font-semibold text-indigo-900 uppercase tracking-wide">{heading}</p>
      <ul className="space-y-1 list-disc pl-4">
        <li>
          <span className="font-medium text-gray-900">{price}</span> every month, billed on the {ordinal(anchorDay)}
          {anchorDay > 28 ? ' (or the last day of shorter months)' : ''}
          {arrears ? ', for the month just ended' : ', for the month ahead'}.
        </li>
        <li>
          {isFirst ? 'First' : 'Next'} invoice due on <span className="font-medium text-gray-900">{formatDay(s.firstInvoice)}</span>, for{' '}
          {formatDay(s.covers.from)} – {formatDay(s.covers.to)}.
        </li>
        <li>
          {reminderLeadDays > 0 ? (
            <>
              From <span className="font-medium text-gray-900">{formatDay(addDays(s.firstInvoice, -reminderLeadDays))}</span> (
              {reminderLeadDays} {reminderLeadDays === 1 ? 'day' : 'days'} before) the store sees a reminder banner, and store admins
              can pay early. Nothing is shown before that.
            </>
          ) : (
            <>No reminder before the due date: the store sees nothing until then.</>
          )}
        </li>
        <li>
          If it isn&apos;t paid by then, the store sees a due banner for {graceDays} {graceDays === 1 ? 'day' : 'days'},{' '}
          {enforcement ? (
            <>
              then is <span className="font-medium text-gray-900">locked from {formatDay(s.lockFrom)}</span>.
            </>
          ) : (
            <>but is not locked while enforcement is off.</>
          )}
        </li>
        <li>Then: {s.following.map(formatDay).join(' · ')}.</li>
      </ul>
      {!globalBillingEnabled && (
        <p className="text-xs text-amber-800">
          Billing is OFF platform-wide, so nothing is invoiced or shown until it&apos;s turned on in Settings. A first invoice
          date already in the past then moves to the next billing day.
        </p>
      )}
    </div>
  );
}
