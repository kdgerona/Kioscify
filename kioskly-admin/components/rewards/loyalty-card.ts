// Pure helpers for the loyalty-card builder: slot ids, ordering, copy and
// client-side validation (the API runs the same checks).

import type {
  LoyaltyCardConfig,
  LoyaltyCardSlot,
  MilestoneReward,
  ProgramHeaderErrors,
  ProgramHeaderValue,
  SlotErrors,
  SlotFieldErrors,
  StampCondition,
  StampMode,
} from './types';

export const MAX_SLOTS_PER_ROW = 8;
export const MAX_ROWS = 6;
export const MAX_SLOT_LABEL = 40;
export const MAX_PROGRAM_NAME = 60;

export function peso(n: number): string {
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Short peso amount for tiles: ₱49 or ₱49.50. */
function pesoShort(n: number): string {
  return `₱${Number.isInteger(n) ? n : n.toFixed(2)}`;
}

export function newSlotKey(existing: Iterable<string> = []): string {
  const taken = new Set(existing);
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  for (;;) {
    let key = 's_';
    for (let i = 0; i < 6; i++) key += chars[Math.floor(Math.random() * chars.length)];
    if (!taken.has(key)) return key;
  }
}

/** Reads any stored config into a builder config (unknown shapes become empty). */
export function asLoyaltyConfig(config: unknown): LoyaltyCardConfig {
  if (config && typeof config === 'object' && Array.isArray((config as { slots?: unknown }).slots)) {
    const { stampMode, slots } = config as LoyaltyCardConfig;
    return { ...(stampMode && { stampMode }), slots: [...slots] };
  }
  return { slots: [] };
}

/** Slots grouped by row (index = row), each row sorted by position. */
export function slotsByRow(slots: LoyaltyCardSlot[]): LoyaltyCardSlot[][] {
  const rowCount = slots.reduce((max, s) => Math.max(max, s.row + 1), 0);
  const rows: LoyaltyCardSlot[][] = Array.from({ length: rowCount }, () => []);
  for (const s of slots) rows[s.row].push(s);
  rows.forEach(r => r.sort((a, b) => a.position - b.position));
  return rows;
}

/**
 * Renumbers rows to 0…n-1 (dropping empty rows unless `keepEmptyRows`) and
 * positions to 0…n-1 within each row, in their current visual order.
 */
export function normalizeSlots(slots: LoyaltyCardSlot[], keepRows = 0): LoyaltyCardSlot[] {
  const rows = slotsByRow(slots);
  while (rows.length < keepRows) rows.push([]);
  const out: LoyaltyCardSlot[] = [];
  let rowIndex = 0;
  rows.forEach((row, i) => {
    if (row.length === 0 && i >= keepRows) return;
    row.forEach((s, position) => out.push({ ...s, row: rowIndex, position }));
    rowIndex++;
  });
  return out;
}

export function countKinds(slots: LoyaltyCardSlot[]) {
  return {
    stamps: slots.filter(s => s.kind === 'STAMP').length,
    milestones: slots.filter(s => s.kind === 'MILESTONE').length,
  };
}

export function summarizeLoyaltyConfig(config: unknown): string {
  const { stamps, milestones } = countKinds(asLoyaltyConfig(config).slots);
  return `${stamps} stamp${stamps === 1 ? '' : 's'} · ${milestones} milestone${milestones === 1 ? '' : 's'}`;
}

export function blankSlot(kind: LoyaltyCardSlot['kind'], row: number, position: number, taken: Iterable<string>): LoyaltyCardSlot {
  return { key: newSlotKey(taken), kind, label: '', row, position };
}

/** "Start with 3 rows of 4 stamps + a reward". */
export function starterCard(): LoyaltyCardConfig {
  const keys: string[] = [];
  const slots: LoyaltyCardSlot[] = [];
  for (let row = 0; row < 3; row++) {
    for (let position = 0; position < 5; position++) {
      const slot = blankSlot(position < 4 ? 'STAMP' : 'MILESTONE', row, position, keys);
      keys.push(slot.key);
      slots.push(slot);
    }
  }
  return { slots };
}

export const STAMP_MODE_OPTIONS: { value: StampMode; label: string; description: string }[] = [
  {
    value: 'ONE_PER_VISIT',
    label: 'One stamp per visit',
    description: 'Any purchase earns the next stamp. Circles are stamped in order, one per visit.',
  },
  {
    value: 'MATCH_CONDITIONS',
    label: 'Each circle has its own condition',
    description: 'A circle can be stamped when the order matches it (product, category, price, total).',
  },
];

/** Missing stampMode means MATCH_CONDITIONS. */
export function isOnePerVisit(mode?: StampMode): boolean {
  return mode === 'ONE_PER_VISIT';
}

/** stamp key → 1-based visit number, in card order (row, then position). */
export function stampOrdinals(slots: LoyaltyCardSlot[]): Map<string, number> {
  const out = new Map<string, number>();
  let n = 0;
  for (const row of slotsByRow(slots)) for (const s of row) if (s.kind === 'STAMP') out.set(s.key, ++n);
  return out;
}

// ─── Copy ─────────────────────────────────────────────────────────────────

export function conditionHint(c?: StampCondition): string {
  if (!c) return '';
  switch (c.type) {
    case 'ITEM_MIN_PRICE':
      return c.minPrice > 0 ? `${pesoShort(c.minPrice)}+` : '';
    case 'ITEM_PRODUCT_NAMES':
      return c.names.length ? `${c.names.length} product${c.names.length === 1 ? '' : 's'}` : '';
    case 'ITEM_CATEGORY_NAMES':
      return c.names.length ? (c.names.length === 1 ? c.names[0] : `${c.names.length} categories`) : '';
    case 'TRANSACTION_MIN_TOTAL':
      return c.minTotal > 0 ? `${pesoShort(c.minTotal)}+ total` : '';
  }
}

export function rewardHint(r?: MilestoneReward): string {
  if (!r) return '';
  switch (r.type) {
    case 'PERCENT_OFF_ITEM':
      return r.percent > 0 ? `${r.percent}% off 1 item` : '';
    case 'FREE_ITEM':
      return '1 free item';
    case 'AMOUNT_OFF_ITEM':
      return r.amount > 0 ? `${pesoShort(r.amount)} off 1 item` : '';
  }
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
}

/** "Cashier can take 50% off one Drinks item (Regular)." */
export function rewardPreview(r?: MilestoneReward): string {
  if (!r) return '';
  const cats = r.categoryNames?.length ? `${joinNames(r.categoryNames)} ` : '';
  const sizes = r.sizeNames?.length ? ` (${joinNames(r.sizeNames)})` : '';
  const item = `one ${cats}item${sizes}`;
  switch (r.type) {
    case 'PERCENT_OFF_ITEM':
      return r.percent > 0 ? `Cashier can take ${r.percent}% off ${item}.` : '';
    case 'FREE_ITEM':
      return `Cashier can give ${item} for free.`;
    case 'AMOUNT_OFF_ITEM':
      return r.amount > 0 ? `Cashier can take ${peso(r.amount)} off ${item}.` : '';
  }
}

export const CONDITION_OPTIONS: { value: StampCondition['type']; label: string }[] = [
  { value: 'ITEM_MIN_PRICE', label: 'An item costs at least…' },
  { value: 'ITEM_PRODUCT_NAMES', label: 'A specific product is bought' },
  { value: 'ITEM_CATEGORY_NAMES', label: 'An item from a category is bought' },
  { value: 'TRANSACTION_MIN_TOTAL', label: 'The order total reaches…' },
];

export const REWARD_OPTIONS: { value: MilestoneReward['type']; label: string }[] = [
  { value: 'PERCENT_OFF_ITEM', label: 'Percent off one item' },
  { value: 'FREE_ITEM', label: 'One free item' },
  { value: 'AMOUNT_OFF_ITEM', label: 'Amount off one item' },
];

export function defaultCondition(type: StampCondition['type']): StampCondition {
  switch (type) {
    case 'ITEM_MIN_PRICE':
      return { type, minPrice: 0 };
    case 'ITEM_PRODUCT_NAMES':
      return { type, names: [] };
    case 'ITEM_CATEGORY_NAMES':
      return { type, names: [] };
    case 'TRANSACTION_MIN_TOTAL':
      return { type, minTotal: 0 };
  }
}

export function defaultReward(type: MilestoneReward['type'], keep?: MilestoneReward): MilestoneReward {
  const filters = { categoryNames: keep?.categoryNames, sizeNames: keep?.sizeNames };
  switch (type) {
    case 'PERCENT_OFF_ITEM':
      return { type, percent: 0, ...filters };
    case 'FREE_ITEM':
      return { type, ...filters };
    case 'AMOUNT_OFF_ITEM':
      return { type, amount: 0, ...filters };
  }
}

// ─── Validation ───────────────────────────────────────────────────────────

const positive = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n > 0;

export function validateSlot(slot: LoyaltyCardSlot, stampMode?: StampMode): SlotFieldErrors {
  const e: SlotFieldErrors = {};
  const label = slot.label.trim();
  if (!label || label.length > MAX_SLOT_LABEL) e.label = 'Add the text printed on this slot.';

  if (slot.kind === 'STAMP') {
    const c = slot.condition;
    if (isOnePerVisit(stampMode)) {
      // Any purchase qualifies: no condition to check.
    } else if (!c) e.condition = 'Choose when this stamp is earned.';
    else if (c.type === 'ITEM_MIN_PRICE' && !positive(c.minPrice)) e.minPrice = 'Enter an amount above ₱0.';
    else if (c.type === 'TRANSACTION_MIN_TOTAL' && !positive(c.minTotal)) e.minTotal = 'Enter an amount above ₱0.';
    else if (c.type === 'ITEM_PRODUCT_NAMES' && c.names.length === 0) e.names = 'Pick at least one product.';
    else if (c.type === 'ITEM_CATEGORY_NAMES' && c.names.length === 0) e.names = 'Pick at least one category.';
  } else {
    const r = slot.reward;
    if (!r) e.reward = 'Choose the reward.';
    else if (r.type === 'PERCENT_OFF_ITEM' && !(positive(r.percent) && r.percent >= 1 && r.percent <= 100))
      e.percent = 'Enter 1–100%.';
    else if (r.type === 'AMOUNT_OFF_ITEM' && !positive(r.amount)) e.amount = 'Enter an amount above ₱0.';
  }
  return e;
}

export function validateLoyaltyConfig(config: LoyaltyCardConfig): SlotErrors {
  const errors: SlotErrors = {};
  for (const slot of config.slots) {
    const e = validateSlot(slot, config.stampMode);
    if (Object.keys(e).length) errors[slot.key] = e;
  }
  return errors;
}

export function validateProgramHeader(value: ProgramHeaderValue, config: LoyaltyCardConfig): ProgramHeaderErrors {
  const e: ProgramHeaderErrors = {};
  const name = value.name.trim();
  if (!name || name.length > MAX_PROGRAM_NAME) e.name = 'Give the program a name.';
  if (value.startsAt && value.endsAt && value.endsAt < value.startsAt) e.endsAt = 'End date must be after the start date.';
  if (value.status === 'ACTIVE' && countKinds(config.slots).stamps === 0)
    e.status = 'Add at least one stamp before activating.';
  return e;
}

/** Strips builder-only empties so the payload matches the API's config shape. */
export function toApiConfig(config: LoyaltyCardConfig): LoyaltyCardConfig {
  const clean = (names?: string[]) => (names && names.length ? names : undefined);
  const onePerVisit = isOnePerVisit(config.stampMode);
  return {
    ...(config.stampMode && { stampMode: config.stampMode }),
    slots: normalizeSlots(config.slots).map(s => {
      const base = { key: s.key, kind: s.kind, label: s.label.trim(), row: s.row, position: s.position };
      if (s.kind === 'STAMP') {
        if (onePerVisit) return base; // conditions stay in builder state only
        const c = s.condition;
        if (c?.type === 'ITEM_MIN_PRICE') return { ...base, condition: { type: c.type, minPrice: c.minPrice, ...(clean(c.categoryNames) && { categoryNames: c.categoryNames }) } };
        return { ...base, condition: c };
      }
      const r = s.reward;
      if (!r) return { ...base, reward: r };
      const { categoryNames, sizeNames, ...rest } = r;
      return {
        ...base,
        reward: { ...rest, ...(clean(categoryNames) && { categoryNames }), ...(clean(sizeNames) && { sizeNames }) } as MilestoneReward,
      };
    }),
  };
}

// ─── Dates (Asia/Manila, UTC+8, no DST, same as the rest of the portals) ──

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

/** ISO instant → `yyyy-MM-dd` in Manila, or ''. */
export function isoToDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(new Date(iso).getTime() + MANILA_OFFSET_MS);
  return d.toISOString().slice(0, 10);
}

/** `yyyy-MM-dd` → ISO instant at the start (or end) of that Manila day, or null. */
export function dateInputToIso(value: string, edge: 'start' | 'end'): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = edge === 'start' ? 'T00:00:00.000+08:00' : 'T23:59:59.999+08:00';
  return new Date(`${value}${time}`).toISOString();
}

export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Manila',
  });
}

/** Distinct names (case-insensitive, first spelling wins), trimmed and sorted A–Z. */
export function distinctNames(names: Iterable<string | null | undefined>): string[] {
  const seen = new Map<string, string>();
  for (const raw of names) {
    const name = raw?.trim();
    if (name && !seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), name);
  }
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}
