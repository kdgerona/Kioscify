// All stores currently operate in the Philippines (Asia/Manila, UTC+8, no DST).
// This is a fixed-offset hardcode, not a per-store setting — revisit if a
// non-PH store is onboarded.
const STORE_TIMEZONE_OFFSET_MS = 8 * 60 * 60 * 1000;

function toZoned(date: Date): Date {
  return new Date(date.getTime() + STORE_TIMEZONE_OFFSET_MS);
}

function toUtcInstant(zonedMs: number): Date {
  return new Date(zonedMs - STORE_TIMEZONE_OFFSET_MS);
}

/** Hour (0-23) of `date` in the store's local timezone. */
export function getZonedHour(date: Date): number {
  return toZoned(date).getUTCHours();
}

/** Calendar date (YYYY-MM-DD) of `date` in the store's local timezone. */
export function getZonedDateString(date: Date): string {
  return toZoned(date).toISOString().split('T')[0];
}

/** Calendar month (YYYY-MM) of `date` in the store's local timezone. */
export function getZonedMonthKey(date: Date): string {
  const zoned = toZoned(date);
  return `${zoned.getUTCFullYear()}-${String(zoned.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * UTC instants bounding the store-local calendar day that `date` falls in
 * (00:00:00.000 to 23:59:59.999 local time).
 */
export function getZonedDayBounds(date: Date): { start: Date; end: Date } {
  const zoned = toZoned(date);
  const startMs = Date.UTC(
    zoned.getUTCFullYear(),
    zoned.getUTCMonth(),
    zoned.getUTCDate(),
    0,
    0,
    0,
    0,
  );
  return {
    start: toUtcInstant(startMs),
    end: toUtcInstant(startMs + 24 * 60 * 60 * 1000 - 1),
  };
}

/**
 * UTC instants bounding the store-local calendar week (Monday-Sunday) that
 * `date` falls in.
 */
export function getZonedWeekBounds(date: Date): { start: Date; end: Date } {
  const zoned = toZoned(date);
  const day = zoned.getUTCDay();
  const diffToMonday = day === 0 ? 6 : day - 1;
  const startMs = Date.UTC(
    zoned.getUTCFullYear(),
    zoned.getUTCMonth(),
    zoned.getUTCDate() - diffToMonday,
    0,
    0,
    0,
    0,
  );
  return {
    start: toUtcInstant(startMs),
    end: toUtcInstant(startMs + 7 * 24 * 60 * 60 * 1000 - 1),
  };
}

/**
 * UTC instants bounding the store-local calendar month that `date` falls in.
 */
export function getZonedMonthBounds(date: Date): { start: Date; end: Date } {
  const zoned = toZoned(date);
  const y = zoned.getUTCFullYear();
  const m = zoned.getUTCMonth();
  const startMs = Date.UTC(y, m, 1, 0, 0, 0, 0);
  const endMs = Date.UTC(y, m + 1, 0, 23, 59, 59, 999);
  return { start: toUtcInstant(startMs), end: toUtcInstant(endMs) };
}

/**
 * UTC instants bounding the store-local calendar year that `date` falls in.
 */
export function getZonedYearBounds(date: Date): { start: Date; end: Date } {
  const zoned = toZoned(date);
  const y = zoned.getUTCFullYear();
  const startMs = Date.UTC(y, 0, 1, 0, 0, 0, 0);
  const endMs = Date.UTC(y, 11, 31, 23, 59, 59, 999);
  return { start: toUtcInstant(startMs), end: toUtcInstant(endMs) };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** UTC instant of 00:00 store-local on the day `date` falls in. */
export function startOfZonedDay(date: Date): Date {
  return getZonedDayBounds(date).start;
}

/** Store-local 00:00, `days` calendar days after the store-local day of `date`. */
export function addZonedDays(date: Date, days: number): Date {
  return new Date(startOfZonedDay(date).getTime() + days * DAY_MS);
}

/** Day of month (1-31) of `date` in the store's local timezone. */
export function zonedDayOfMonth(date: Date): number {
  return toZoned(date).getUTCDate();
}

/**
 * Store-local 00:00 on day `anchorDay` of the month `months` after `date`'s
 * store-local month, clamped to that month's last day (anchor 31 → Feb 28/29).
 * The anchor is passed separately so a clamped month never drags later
 * months earlier (Jan 31 → Feb 29 → Mar 31).
 */
export function addZonedMonthsClamped(date: Date, months: number, anchorDay: number): Date {
  const zoned = toZoned(date);
  const y = zoned.getUTCFullYear();
  const m = zoned.getUTCMonth() + months;
  const daysInTarget = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return toUtcInstant(Date.UTC(y, m, Math.min(anchorDay, daysInTarget)));
}

/** Whole store-local days from `from`'s day to `to`'s day (negative if `to` is earlier). */
export function zonedDaysBetween(from: Date, to: Date): number {
  return Math.round((startOfZonedDay(to).getTime() - startOfZonedDay(from).getTime()) / DAY_MS);
}
