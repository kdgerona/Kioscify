import { getZonedMonthBounds, getZonedMonthKey } from '../common/utils/timezone';

export interface SubscriptionPaymentRecord {
  month: Date;
  paid: boolean;
  paidAt: Date | null;
  note: string | null;
}

export interface SubscriptionMonthEntry {
  month: string; // 'YYYY-MM', store-local
  paid: boolean;
  paidAt: Date | null;
  note: string | null;
}

/**
 * Walks store-local calendar months from `activatedAt` to `now` (inclusive),
 * left-joining `payments` by month. A month with no matching payment record
 * defaults to unpaid — this is the sparse-ledger read path.
 */
export function buildSubscriptionMonths(
  activatedAt: Date,
  now: Date,
  payments: SubscriptionPaymentRecord[],
): SubscriptionMonthEntry[] {
  const paymentsByKey = new Map(payments.map(p => [getZonedMonthKey(p.month), p]));

  const months: SubscriptionMonthEntry[] = [];
  let cursorStart = getZonedMonthBounds(activatedAt).start;
  const endKey = getZonedMonthKey(now);
  const startKey = getZonedMonthKey(cursorStart);

  // Activation month is after "now" (bad data, clock skew, or a future-dated
  // activation) — nothing has been billable yet, so there's nothing to list.
  if (startKey > endKey) return [];

  // Safety cap: 100 years of months. Prevents any pathological infinite loop
  // from a bad activatedAt value from hanging the request.
  let key = startKey;
  for (let i = 0; i < 1200; i++) {
    const record = paymentsByKey.get(key);
    months.push({
      month: key,
      paid: record?.paid ?? false,
      paidAt: record?.paidAt ?? null,
      note: record?.note ?? null,
    });
    if (key === endKey) break;

    // Jump 32 days ahead (always lands in the next calendar month regardless
    // of month length), then re-derive that month's store-local start.
    const next = new Date(cursorStart.getTime() + 32 * 24 * 60 * 60 * 1000);
    cursorStart = getZonedMonthBounds(next).start;
    key = getZonedMonthKey(cursorStart);
  }

  return months;
}
