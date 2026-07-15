// Mirrors kioskly-api/src/common/utils/timezone.ts. All stores currently
// operate in the Philippines (Asia/Manila, UTC+8, no DST) — a fixed-offset
// hardcode, not a per-store setting. Analytics date-range presets ("Today",
// "This Week", etc.) must anchor to this store timezone, not the viewer's
// browser timezone, because the backend filters transactions literally
// against whatever UTC instants we send (no server-side re-zoning) — see
// kioskly-api/src/analytics/analytics.service.ts. A Company Admin browsing
// from outside Manila who computed "Today" using their own local clock would
// get a window that doesn't match the stores' actual business day, silently
// over/under-counting revenue for that period.
const STORE_TIMEZONE_OFFSET_MS = 8 * 60 * 60 * 1000;

function toZoned(date: Date): Date {
  return new Date(date.getTime() + STORE_TIMEZONE_OFFSET_MS);
}

function toUtcInstant(zonedMs: number): Date {
  return new Date(zonedMs - STORE_TIMEZONE_OFFSET_MS);
}

/** UTC instants bounding the store-local calendar day that `date` falls in. */
export function getZonedDayBounds(date: Date): { start: Date; end: Date } {
  const zoned = toZoned(date);
  const startMs = Date.UTC(
    zoned.getUTCFullYear(),
    zoned.getUTCMonth(),
    zoned.getUTCDate(),
    0, 0, 0, 0,
  );
  return { start: toUtcInstant(startMs), end: toUtcInstant(startMs + 24 * 60 * 60 * 1000 - 1) };
}

/** UTC instants bounding the store-local calendar day for the literal
 * "YYYY-MM-DD" parts a user typed into a date picker (avoids parsing the
 * string as browser-local or UTC midnight, either of which can land on the
 * wrong Manila calendar day). */
export function getZonedDayBoundsFromParts(year: number, month1based: number, day: number): { start: Date; end: Date } {
  const startMs = Date.UTC(year, month1based - 1, day, 0, 0, 0, 0);
  return { start: toUtcInstant(startMs), end: toUtcInstant(startMs + 24 * 60 * 60 * 1000 - 1) };
}

/** UTC instants bounding the store-local calendar week (Monday-Sunday) that `date` falls in. */
export function getZonedWeekBounds(date: Date): { start: Date; end: Date } {
  const zoned = toZoned(date);
  const day = zoned.getUTCDay();
  const diffToMonday = day === 0 ? 6 : day - 1;
  const startMs = Date.UTC(
    zoned.getUTCFullYear(),
    zoned.getUTCMonth(),
    zoned.getUTCDate() - diffToMonday,
    0, 0, 0, 0,
  );
  return { start: toUtcInstant(startMs), end: toUtcInstant(startMs + 7 * 24 * 60 * 60 * 1000 - 1) };
}

/** UTC instants bounding the store-local calendar month that `date` falls in.
 * `monthOffset` shifts by whole months first (e.g. -2 for "2 months ago"). */
export function getZonedMonthBounds(date: Date, monthOffset = 0): { start: Date; end: Date } {
  const zoned = toZoned(date);
  const y = zoned.getUTCFullYear();
  const m = zoned.getUTCMonth() + monthOffset;
  const startMs = Date.UTC(y, m, 1, 0, 0, 0, 0);
  const endMs = Date.UTC(y, m + 1, 0, 23, 59, 59, 999);
  return { start: toUtcInstant(startMs), end: toUtcInstant(endMs) };
}

/** UTC instants bounding the store-local calendar year that `date` falls in. */
export function getZonedYearBounds(date: Date): { start: Date; end: Date } {
  const zoned = toZoned(date);
  const y = zoned.getUTCFullYear();
  const startMs = Date.UTC(y, 0, 1, 0, 0, 0, 0);
  const endMs = Date.UTC(y, 11, 31, 23, 59, 59, 999);
  return { start: toUtcInstant(startMs), end: toUtcInstant(endMs) };
}
