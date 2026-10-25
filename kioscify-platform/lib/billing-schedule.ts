// Billing schedule maths on Manila calendar days ("YYYY-MM-DD"), mirroring
// the API's rules: paid in advance (due on the billing date), monthly on an
// anchor day clamped to the end of shorter months, locked after grace.

function parts(day: string): [number, number, number] {
  const [y, m, d] = day.split('-').map(Number);
  return [y, m, d];
}

function fmt(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function addDays(day: string, days: number): string {
  const [y, m, d] = parts(day);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return fmt(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Same anchor day `months` later, clamped to the month's last day (31 → Feb 28). */
export function addMonthsClamped(day: string, months: number, anchorDay: number): string {
  const [y, m] = parts(day);
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return fmt(first.getUTCFullYear(), first.getUTCMonth() + 1, Math.min(anchorDay, lastDay));
}

export function dayOfMonth(day: string): number {
  return parts(day)[2];
}

/** "2026-11-01" → "Nov 1, 2026". */
export function formatDay(day: string): string {
  const [y, m, d] = parts(day);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${s}`;
}

export interface BillingSchedule {
  firstInvoice: string;
  /** First day the store is locked if the first invoice is still unpaid. */
  lockFrom: string;
  /** The billing dates after the first one. */
  following: string[];
}

export function billingSchedule(firstInvoice: string, anchorDay: number, graceDays: number, count = 3): BillingSchedule {
  return {
    firstInvoice,
    lockFrom: addDays(firstInvoice, graceDays),
    following: Array.from({ length: count }, (_, i) => addMonthsClamped(firstInvoice, i + 1, anchorDay)),
  };
}
