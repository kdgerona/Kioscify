import {
  addZonedDays,
  addZonedMonthsClamped,
  getZonedMonthBounds,
  getZonedMonthKey,
  startOfZonedDay,
  zonedDayOfMonth,
} from './timezone';

export interface EnableDatesInput {
  activatedAt: Date;
  trialStartAt: Date | null;
  trialDays: number;
  anchorDay: number | null;
  /** Ledger month starts (SubscriptionPayment.month) with paid: true. */
  paidMonthStarts: Date[];
  now: Date;
}

export interface EnableDatesResult {
  trialEndsAt: Date;
  anchorDay: number;
  paidThroughAt: Date | null;
  nextBillingAt: Date;
  /** YYYY-MM months taken as already paid. */
  honoredMonths: string[];
}

/**
 * The next billing date, never inside a period that is already paid.
 * `paidThroughAt` is the start of the last covered Manila day, so billing
 * resumes the day after it. A stored `nextBillingAt` can fall behind it when
 * invoices are paid out of order or the schedule is edited after a period was
 * paid; without this the store would be told (and invoiced) for a paid month.
 */
export function effectiveNextBillingAt(nextBillingAt: Date | null, paidThroughAt: Date | null): Date | null {
  if (!nextBillingAt || !paidThroughAt || nextBillingAt > paidThroughAt) return nextBillingAt;
  return addZonedDays(paidThroughAt, 1);
}

/** The later of two dates; paid-through only ever moves forward. */
export function laterOf(a: Date | null | undefined, b: Date): Date {
  return a && a > b ? a : b;
}

function nextMonthKey(key: string): string {
  const [y, mo] = key.split('-').map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
}

/** The latest run of consecutive month keys, in ascending order. */
function latestConsecutiveRun(keys: string[]): string[] {
  const sorted = [...new Set(keys)].sort();
  let run: string[] = [];
  for (const key of sorted) {
    run = run.length && nextMonthKey(run[run.length - 1]) === key ? [...run, key] : [key];
  }
  return run;
}

/**
 * Dates to use when billing is first enabled for a store — no retroactive
 * charges, and months already ticked paid in the manual ledger are honored.
 */
export function deriveEnableDates(input: EnableDatesInput): EnableDatesResult {
  const trialEndsAt = addZonedDays(input.trialStartAt ?? input.activatedAt, input.trialDays);
  const run = latestConsecutiveRun(input.paidMonthStarts.map(getZonedMonthKey));
  const honorRun = run.length > 0 && run[run.length - 1] >= getZonedMonthKey(input.now);

  let anchorDay: number;
  let paidThroughAt: Date | null = null;
  let candidate: Date;

  if (honorRun) {
    const lastMonthStart = input.paidMonthStarts.find(d => getZonedMonthKey(d) === run[run.length - 1])!;
    paidThroughAt = startOfZonedDay(getZonedMonthBounds(lastMonthStart).end);
    // The legacy ledger is calendar-monthly, so billing continues on the 1st.
    anchorDay = input.anchorDay ?? 1;
    candidate = addZonedMonthsClamped(getZonedMonthBounds(lastMonthStart).start, 1, anchorDay);
  } else {
    anchorDay = input.anchorDay ?? zonedDayOfMonth(trialEndsAt);
    const today = startOfZonedDay(input.now);
    candidate = addZonedMonthsClamped(trialEndsAt, 0, anchorDay);
    if (candidate < trialEndsAt) candidate = addZonedMonthsClamped(trialEndsAt, 1, anchorDay);
    while (candidate < today) candidate = addZonedMonthsClamped(candidate, 1, anchorDay);
  }

  if (candidate < trialEndsAt) {
    candidate = trialEndsAt;
    if (input.anchorDay == null) anchorDay = zonedDayOfMonth(trialEndsAt);
  }

  return {
    trialEndsAt,
    anchorDay,
    paidThroughAt,
    nextBillingAt: candidate,
    honoredMonths: honorRun ? run : [],
  };
}
