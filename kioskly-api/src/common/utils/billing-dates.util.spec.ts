import { deriveEnableDates, dueForPeriodStart, effectiveNextBillingAt, laterOf, periodForDue } from './billing-dates.util';

const m = (y: number, mo: number, d: number) => new Date(Date.UTC(y, mo - 1, d) - 8 * 60 * 60 * 1000);

describe('deriveEnableDates', () => {
  it('no paid run, trial in the future: bills the day after the trial', () => {
    const r = deriveEnableDates({ activatedAt: m(2026, 10, 1), trialStartAt: null, trialDays: 15, anchorDay: null, paidMonthStarts: [], now: m(2026, 10, 5) });
    expect(r.trialEndsAt).toEqual(m(2026, 10, 16));
    expect(r.nextBillingAt).toEqual(m(2026, 10, 16));
    expect(r.anchorDay).toBe(16);
    expect(r.paidThroughAt).toBeNull();
    expect(r.honoredMonths).toEqual([]);
  });

  it('no retroactive charges: an old activation rolls forward to the next anchor date', () => {
    const r = deriveEnableDates({ activatedAt: m(2025, 1, 10), trialStartAt: null, trialDays: 15, anchorDay: null, paidMonthStarts: [], now: m(2026, 10, 24) });
    expect(r.anchorDay).toBe(25);
    expect(r.nextBillingAt).toEqual(m(2026, 10, 25));
  });

  it('deriveEnableDates honors a paid run that extends into future months', () => {
    const r = deriveEnableDates({
      activatedAt: m(2025, 1, 10), trialStartAt: null, trialDays: 15, anchorDay: null,
      paidMonthStarts: [m(2026, 9, 1), m(2026, 10, 1), m(2026, 11, 1), m(2026, 12, 1)],
      now: m(2026, 10, 24),
    });
    expect(r.paidThroughAt).toEqual(m(2026, 12, 31));
    expect(r.nextBillingAt).toEqual(m(2027, 1, 1));
    expect(r.anchorDay).toBe(1);
    expect(r.honoredMonths).toEqual(['2026-09', '2026-10', '2026-11', '2026-12']);
  });

  it('ignores a paid run that ended before the current month', () => {
    const r = deriveEnableDates({ activatedAt: m(2025, 1, 10), trialStartAt: null, trialDays: 15, anchorDay: null, paidMonthStarts: [m(2026, 5, 1)], now: m(2026, 10, 24) });
    expect(r.paidThroughAt).toBeNull();
    expect(r.honoredMonths).toEqual([]);
  });

  it('a run broken by a gap uses the latest run', () => {
    const r = deriveEnableDates({ activatedAt: m(2025, 1, 10), trialStartAt: null, trialDays: 15, anchorDay: null, paidMonthStarts: [m(2026, 10, 1), m(2026, 8, 1)], now: m(2026, 10, 24) });
    expect(r.paidThroughAt).toEqual(m(2026, 10, 31));
    expect(r.nextBillingAt).toEqual(m(2026, 11, 1));
    expect(r.honoredMonths).toEqual(['2026-10']);
  });

  it('nextBillingAt is never before trialEndsAt, and the anchor follows the trial end', () => {
    const r = deriveEnableDates({ activatedAt: m(2026, 10, 20), trialStartAt: null, trialDays: 15, anchorDay: null, paidMonthStarts: [m(2026, 10, 1)], now: m(2026, 10, 24) });
    expect(r.nextBillingAt).toEqual(m(2026, 11, 4));
    expect(r.anchorDay).toBe(4);
  });

  it('an explicit anchorDay is kept', () => {
    const r = deriveEnableDates({ activatedAt: m(2026, 10, 1), trialStartAt: null, trialDays: 15, anchorDay: 20, paidMonthStarts: [], now: m(2026, 10, 5) });
    expect(r.anchorDay).toBe(20);
    expect(r.nextBillingAt).toEqual(m(2026, 10, 20));
  });

  it('trialStartAt overrides activatedAt for the trial end', () => {
    const r = deriveEnableDates({ activatedAt: m(2026, 10, 1), trialStartAt: m(2026, 10, 10), trialDays: 15, anchorDay: null, paidMonthStarts: [], now: m(2026, 10, 5) });
    expect(r.trialEndsAt).toEqual(m(2026, 10, 25));
  });
});

describe('effectiveNextBillingAt', () => {
  it('keeps a next billing date after the paid period', () => {
    expect(effectiveNextBillingAt(m(2026, 11, 1), m(2026, 10, 31))).toEqual(m(2026, 11, 1));
  });

  it('keeps a later gap set by a prepayment', () => {
    expect(effectiveNextBillingAt(m(2027, 1, 15), m(2026, 12, 31))).toEqual(m(2027, 1, 15));
  });

  it('moves a date inside the paid period to the day after it', () => {
    expect(effectiveNextBillingAt(m(2026, 11, 1), m(2026, 11, 30))).toEqual(m(2026, 12, 1));
    expect(effectiveNextBillingAt(m(2026, 11, 30), m(2026, 11, 30))).toEqual(m(2026, 12, 1));
  });

  it('passes through when either date is missing', () => {
    expect(effectiveNextBillingAt(m(2026, 11, 1), null)).toEqual(m(2026, 11, 1));
    expect(effectiveNextBillingAt(null, m(2026, 11, 30))).toBeNull();
  });
});

describe('billing timing (in advance vs at the end of the month)', () => {
  const arrears = { arrears: true };

  it('in advance a bill covers the month starting on its due date', () => {
    expect(periodForDue(m(2026, 11, 10))).toEqual({ periodStart: m(2026, 11, 10), periodEnd: m(2026, 12, 10) });
    expect(dueForPeriodStart(m(2026, 11, 10))).toEqual(m(2026, 11, 10));
  });

  it('in arrears a bill covers the month that ended the day before its due date', () => {
    expect(periodForDue(m(2026, 12, 10), arrears)).toEqual({ periodStart: m(2026, 11, 10), periodEnd: m(2026, 12, 10) });
    expect(dueForPeriodStart(m(2026, 11, 10), arrears)).toEqual(m(2026, 12, 10));
  });

  it('in arrears the anchor day clamps to shorter months both ways', () => {
    expect(periodForDue(m(2027, 2, 28), { arrears: true, anchorDay: 31 }).periodStart).toEqual(m(2027, 1, 31));
    expect(dueForPeriodStart(m(2027, 1, 31), { arrears: true, anchorDay: 31 })).toEqual(m(2027, 2, 28));
  });

  it('in arrears a due date whose month is already paid moves to a month after paid-through', () => {
    // Paid through Dec 9 (the month Nov 10 – Dec 9): the next month starts Dec 10, due Jan 10
    expect(effectiveNextBillingAt(m(2026, 12, 10), m(2026, 12, 9), arrears)).toEqual(m(2027, 1, 10));
    expect(effectiveNextBillingAt(m(2027, 1, 10), m(2026, 12, 9), arrears)).toEqual(m(2027, 1, 10));
  });

  it('deriveEnableDates in arrears: the first month starts when the trial ends and is due a month later', () => {
    const r = deriveEnableDates({ activatedAt: m(2026, 10, 26), arrears: true, trialStartAt: null, trialDays: 15, anchorDay: null, paidMonthStarts: [], now: m(2026, 10, 29) });
    expect(r.trialEndsAt).toEqual(m(2026, 11, 10));
    expect(r.nextBillingAt).toEqual(m(2026, 12, 10));
    expect(r.anchorDay).toBe(10);
  });

  it('deriveEnableDates in arrears with an old activation: the first month starts on the next billing day', () => {
    const r = deriveEnableDates({ activatedAt: m(2025, 1, 10), arrears: true, trialStartAt: null, trialDays: 15, anchorDay: null, paidMonthStarts: [], now: m(2026, 10, 24) });
    expect(r.nextBillingAt).toEqual(m(2026, 11, 25));
  });
});

describe('laterOf', () => {
  it('never moves a date backwards', () => {
    expect(laterOf(m(2026, 11, 30), m(2026, 10, 30))).toEqual(m(2026, 11, 30));
    expect(laterOf(m(2026, 10, 30), m(2026, 11, 30))).toEqual(m(2026, 11, 30));
    expect(laterOf(null, m(2026, 10, 30))).toEqual(m(2026, 10, 30));
  });
});
