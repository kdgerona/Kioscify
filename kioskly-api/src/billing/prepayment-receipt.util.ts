import { addZonedDays, addZonedMonthsClamped, getZonedMonthKey, zonedDayOfMonth } from '../common/utils/timezone';

/**
 * Prepayments have no invoice, but stores still need them in their billing
 * history with a receipt. These helpers present a PREPAYMENT BillingPayment
 * in the same shape as an invoice so existing clients render it unchanged.
 */

/** The period a prepayment covers, from the paid-through date it set (exclusive end, like invoices). */
export function prepaymentPeriodFromPaidThrough(paidThroughAt: Date, monthsCovered: number) {
  const periodEnd = addZonedDays(paidThroughAt, 1);
  const periodStart = addZonedMonthsClamped(periodEnd, -monthsCovered, zonedDayOfMonth(periodEnd));
  return { periodStart, periodEnd };
}

export interface PrepaymentLike {
  id: string;
  paidAt: Date;
  monthsCovered: number;
  periodStart?: Date | null;
  periodEnd?: Date | null;
}

/**
 * Stored period, or — for a prepayment recorded before the period was saved
 * and not yet backfilled — the months covered ending the day after it was paid.
 */
export function prepaymentPeriod(p: PrepaymentLike): { periodStart: Date; periodEnd: Date } {
  if (p.periodStart && p.periodEnd) return { periodStart: p.periodStart, periodEnd: p.periodEnd };
  return prepaymentPeriodFromPaidThrough(p.paidAt, p.monthsCovered);
}

/** Stable receipt number for a prepayment: KSF-PRE-YYYYMM-XXXXXX (month the period starts, tail of the id). */
export function prepaymentReceiptNumber(p: PrepaymentLike): string {
  const month = getZonedMonthKey(prepaymentPeriod(p).periodStart).replace('-', '');
  return `KSF-PRE-${month}-${p.id.slice(-6).toUpperCase()}`;
}
