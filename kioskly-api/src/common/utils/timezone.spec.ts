import {
  getZonedHour,
  getZonedDateString,
  getZonedDayBounds,
  getZonedWeekBounds,
  getZonedMonthBounds,
  getZonedYearBounds,
  getZonedMonthKey,
  startOfZonedDay,
  addZonedDays,
  zonedDayOfMonth,
  addZonedMonthsClamped,
  zonedDaysBetween,
} from './timezone';

describe('getZonedHour', () => {
  it('converts a UTC morning timestamp to the correct Manila afternoon hour', () => {
    // 01:00 UTC == 09:00 Manila (UTC+8)
    expect(getZonedHour(new Date('2026-07-01T01:00:00.000Z'))).toBe(9);
  });

  it('rolls over to the next Manila hour/day just after the offset boundary', () => {
    expect(getZonedHour(new Date('2026-06-30T15:59:59.999Z'))).toBe(23);
    expect(getZonedHour(new Date('2026-06-30T16:00:00.000Z'))).toBe(0);
  });
});

describe('getZonedDateString', () => {
  it('reports the Manila calendar date across the UTC midnight rollover', () => {
    expect(getZonedDateString(new Date('2026-06-30T15:59:59.999Z'))).toBe('2026-06-30');
    expect(getZonedDateString(new Date('2026-06-30T16:00:00.000Z'))).toBe('2026-07-01');
  });
});

describe('getZonedDayBounds', () => {
  it('matches the production bug-report window for a Manila calendar day', () => {
    const { start, end } = getZonedDayBounds(new Date('2026-07-01T01:00:00.000Z'));
    expect(start.toISOString()).toBe('2026-06-30T16:00:00.000Z');
    expect(end.toISOString()).toBe('2026-07-01T15:59:59.999Z');
  });
});

describe('getZonedWeekBounds', () => {
  it('bounds Monday-Sunday in Manila time', () => {
    // 2026-07-01 is a Wednesday (Manila); week should start Monday 2026-06-29
    const { start, end } = getZonedWeekBounds(new Date('2026-07-01T01:00:00.000Z'));
    expect(getZonedDateString(start)).toBe('2026-06-29');
    expect(getZonedDateString(end)).toBe('2026-07-05');
  });
});

describe('getZonedMonthBounds', () => {
  it('bounds the full Manila calendar month', () => {
    const { start, end } = getZonedMonthBounds(new Date('2026-07-01T01:00:00.000Z'));
    expect(getZonedDateString(start)).toBe('2026-07-01');
    expect(getZonedDateString(end)).toBe('2026-07-31');
  });
});

describe('getZonedYearBounds', () => {
  it('bounds the full Manila calendar year', () => {
    const { start, end } = getZonedYearBounds(new Date('2026-07-01T01:00:00.000Z'));
    expect(getZonedDateString(start)).toBe('2026-01-01');
    expect(getZonedDateString(end)).toBe('2026-12-31');
  });
});

describe('getZonedMonthKey', () => {
  it('returns the store-local YYYY-MM, not the UTC one', () => {
    // 2026-07-01T01:00:00.000Z is 2026-07-01 09:00 in Asia/Manila (UTC+8) —
    // same calendar month as UTC here, so also check the actual boundary case below.
    expect(getZonedMonthKey(new Date('2026-07-01T01:00:00.000Z'))).toBe('2026-07');
  });

  it('rolls over to the next month before UTC midnight, due to the +8 offset', () => {
    // 2026-06-30T16:30:00.000Z is 2026-07-01 00:30 in Asia/Manila — July locally,
    // June in UTC. This is the exact class of bug fixed in commit fe5bbab.
    expect(getZonedMonthKey(new Date('2026-06-30T16:30:00.000Z'))).toBe('2026-07');
  });

  it('pads single-digit months', () => {
    expect(getZonedMonthKey(new Date('2026-01-15T04:00:00.000Z'))).toBe('2026-01');
  });
});

// Manila midnight for a calendar date.
const m = (y: number, mo: number, d: number) => new Date(Date.UTC(y, mo - 1, d) - 8 * 60 * 60 * 1000);

describe('billing date helpers', () => {
  it('startOfZonedDay maps 2026-11-30T16:30Z to Manila Dec 1 00:00', () => {
    expect(startOfZonedDay(new Date('2026-11-30T16:30:00Z')).toISOString()).toBe('2026-11-30T16:00:00.000Z');
  });

  it('addZonedDays crosses month end', () => {
    expect(addZonedDays(m(2026, 1, 31), 1).toISOString()).toBe(m(2026, 2, 1).toISOString());
  });

  it('zonedDayOfMonth reads the Manila day', () => {
    expect(zonedDayOfMonth(new Date('2026-11-30T16:30:00Z'))).toBe(1);
  });

  it('addZonedMonthsClamped keeps anchor 31 through Feb in a leap year', () => {
    const feb = addZonedMonthsClamped(m(2028, 1, 31), 1, 31);
    expect(feb.toISOString()).toBe(m(2028, 2, 29).toISOString());
    expect(addZonedMonthsClamped(feb, 1, 31).toISOString()).toBe(m(2028, 3, 31).toISOString());
  });

  it('addZonedMonthsClamped clamps 30 in non-leap Feb', () => {
    expect(addZonedMonthsClamped(m(2026, 1, 30), 1, 30).toISOString()).toBe(m(2026, 2, 28).toISOString());
  });

  it('addZonedMonthsClamped crosses year', () => {
    expect(addZonedMonthsClamped(m(2026, 12, 15), 1, 15).toISOString()).toBe(m(2027, 1, 15).toISOString());
  });

  it('zonedDaysBetween counts Manila days', () => {
    expect(zonedDaysBetween(m(2026, 11, 1), new Date('2026-11-07T15:59:00Z'))).toBe(6);
    expect(zonedDaysBetween(m(2026, 11, 7), m(2026, 11, 1))).toBe(-6);
  });
});
