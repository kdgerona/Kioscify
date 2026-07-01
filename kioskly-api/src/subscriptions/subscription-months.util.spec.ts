import { buildSubscriptionMonths } from './subscription-months.util';

describe('buildSubscriptionMonths', () => {
  it('returns a single month when activation and now are the same store-local month', () => {
    const activatedAt = new Date('2026-07-05T03:00:00.000Z');
    const now = new Date('2026-07-20T03:00:00.000Z');
    const result = buildSubscriptionMonths(activatedAt, now, []);
    expect(result).toEqual([{ month: '2026-07', paid: false, paidAt: null, note: null }]);
  });

  it('spans multiple months including a year boundary, defaulting to unpaid', () => {
    const activatedAt = new Date('2025-12-10T03:00:00.000Z');
    const now = new Date('2026-02-15T03:00:00.000Z');
    const result = buildSubscriptionMonths(activatedAt, now, []);
    expect(result.map(m => m.month)).toEqual(['2025-12', '2026-01', '2026-02']);
    expect(result.every(m => m.paid === false && m.paidAt === null && m.note === null)).toBe(true);
  });

  it('applies a matching payment record onto its month', () => {
    const activatedAt = new Date('2026-01-10T03:00:00.000Z');
    const now = new Date('2026-03-10T03:00:00.000Z');
    const paidAt = new Date('2026-02-03T05:00:00.000Z');
    const payments = [
      {
        month: new Date('2026-02-01T00:00:00.000Z'), // any instant that store-local-resolves to Feb 2026
        paid: true,
        paidAt,
        note: 'Paid via bank transfer',
      },
    ];
    const result = buildSubscriptionMonths(activatedAt, now, payments);
    expect(result).toEqual([
      { month: '2026-01', paid: false, paidAt: null, note: null },
      { month: '2026-02', paid: true, paidAt, note: 'Paid via bank transfer' },
      { month: '2026-03', paid: false, paidAt: null, note: null },
    ]);
  });

  it('respects store-local zoning at the activation boundary, not raw UTC', () => {
    // 2026-06-30T16:30:00.000Z is 2026-07-01 00:30 in Asia/Manila (UTC+8) — the
    // checklist must start at July, not June, matching getZonedMonthKey.
    const activatedAt = new Date('2026-06-30T16:30:00.000Z');
    const now = new Date('2026-06-30T16:30:00.000Z');
    const result = buildSubscriptionMonths(activatedAt, now, []);
    expect(result).toEqual([{ month: '2026-07', paid: false, paidAt: null, note: null }]);
  });
});
