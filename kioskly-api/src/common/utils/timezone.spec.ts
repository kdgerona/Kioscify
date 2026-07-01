import {
  getZonedHour,
  getZonedDateString,
  getZonedDayBounds,
  getZonedWeekBounds,
  getZonedMonthBounds,
  getZonedYearBounds,
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
