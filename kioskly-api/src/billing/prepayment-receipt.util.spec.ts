import { prepaymentPeriod, prepaymentPeriodFromPaidThrough, prepaymentReceiptNumber } from './prepayment-receipt.util';

const m = (y: number, mo: number, d: number) => new Date(Date.UTC(y, mo - 1, d) - 8 * 60 * 60 * 1000);

describe('prepayment-receipt.util', () => {
  it('covers monthsCovered months ending the day after paid-through', () => {
    expect(prepaymentPeriodFromPaidThrough(m(2026, 12, 31), 3)).toEqual({ periodStart: m(2026, 10, 1), periodEnd: m(2027, 1, 1) });
    expect(prepaymentPeriodFromPaidThrough(m(2026, 11, 15), 1)).toEqual({ periodStart: m(2026, 10, 16), periodEnd: m(2026, 11, 16) });
  });

  it('clamps month-end anchors', () => {
    // Paid through Mar 30 → ends Mar 31; one month back is Feb 28
    expect(prepaymentPeriodFromPaidThrough(m(2027, 3, 30), 1).periodStart).toEqual(m(2027, 2, 28));
  });

  it('prefers the stored period and falls back to the paid date', () => {
    const stored = { id: 'x', paidAt: m(2026, 10, 20), monthsCovered: 2, periodStart: m(2026, 11, 1), periodEnd: m(2027, 1, 1) };
    expect(prepaymentPeriod(stored)).toEqual({ periodStart: m(2026, 11, 1), periodEnd: m(2027, 1, 1) });
    expect(prepaymentPeriod({ ...stored, periodStart: null, periodEnd: null })).toEqual({ periodStart: m(2026, 8, 21), periodEnd: m(2026, 10, 21) });
  });

  it('numbers the receipt from the period month and the id tail', () => {
    expect(prepaymentReceiptNumber({ id: '6720aa00bb11cc22dd33ef9a', paidAt: m(2026, 10, 20), monthsCovered: 2, periodStart: m(2026, 11, 1), periodEnd: m(2027, 1, 1) })).toBe(
      'KSF-PRE-202611-33EF9A',
    );
  });
});
