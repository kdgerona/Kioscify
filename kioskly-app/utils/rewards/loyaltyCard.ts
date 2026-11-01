// Pure LOYALTY_CARD logic for the kiosk. No React, no I/O, so it can be
// exercised from a plain node script. The math MUST match
// kioskly-api/src/rewards/types/loyalty-card.handler.ts (the server is the
// authority and rejects the whole sale when these disagree).

import type {
  ActiveRewardProgram,
  LoyaltyCardSelection,
  LoyaltyCardSlot,
  LoyaltyRedemption,
  LoyaltyStampSelection,
  MilestoneReward,
  MilestoneSlot,
  RewardApplication,
  RewardCartLine,
  RewardReceiptProgram,
  StampCondition,
  StampSlot,
} from "./types";

/** Rounding tolerance for money comparisons (₱0.01), same as the API. */
export const MONEY_EPSILON = 0.01;

export const round2 = (n: number) => Math.round(n * 100) / 100;

export function normalizeName(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/** Empty/absent filter matches everything; otherwise trimmed, case-insensitive. */
export function nameIn(value: string | null | undefined, names: string[] | undefined): boolean {
  if (!names || names.length === 0) return true;
  const v = normalizeName(value);
  return v !== "" && names.some((n) => normalizeName(n) === v);
}

/** True when any purchase earns the next stamp (no per-circle conditions). */
export function isOnePerVisit(program: ActiveRewardProgram): boolean {
  return program.config?.stampMode === "ONE_PER_VISIT";
}

export const emptySelection = (): LoyaltyCardSelection => ({ issued: false, stamps: [] });

export function getSlots(program: ActiveRewardProgram): LoyaltyCardSlot[] {
  const slots = program.config?.slots;
  return Array.isArray(slots) ? slots : [];
}

/** Slots grouped by row, rows ascending, each row sorted by position. */
export function slotRows(program: ActiveRewardProgram): LoyaltyCardSlot[][] {
  const byRow = new Map<number, LoyaltyCardSlot[]>();
  for (const s of getSlots(program)) {
    const list = byRow.get(s.row) ?? [];
    list.push(s);
    byRow.set(s.row, list);
  }
  return [...byRow.keys()]
    .sort((a, b) => a - b)
    .map((r) => byRow.get(r)!.sort((a, b) => a.position - b.position));
}

const isItemCondition = (c: StampCondition) => c.type !== "TRANSACTION_MIN_TOTAL";

/** True when the cart line satisfies an item-level stamp condition. */
export function lineMeetsCondition(condition: StampCondition, line: RewardCartLine): boolean {
  switch (condition.type) {
    case "ITEM_MIN_PRICE":
      return (
        line.basePrice >= condition.minPrice - MONEY_EPSILON &&
        nameIn(line.categoryName, condition.categoryNames)
      );
    case "ITEM_PRODUCT_NAMES":
      return nameIn(line.productName, condition.names);
    case "ITEM_CATEGORY_NAMES":
      return nameIn(line.categoryName, condition.names);
    default:
      return false;
  }
}

// ─── Stamp assignment ───────────────────────────────────────────────────────

// Most restrictive first, so the greedy seed rarely needs augmenting.
const RESTRICTIVENESS: Record<StampCondition["type"], number> = {
  ITEM_PRODUCT_NAMES: 0,
  ITEM_CATEGORY_NAMES: 1,
  ITEM_MIN_PRICE: 2,
  TRANSACTION_MIN_TOTAL: 3,
};

/**
 * Assigns each item-based stamp to a cart line so that no line backs more
 * stamps than its quantity (one unit = one stamp). Uses augmenting paths
 * (bipartite matching with capacities), so ticking stamps in any order never
 * blocks an assignment that is actually possible.
 *
 * Returns slotKey → orderId for every slot it could place. Slots it could not
 * place are absent. Non-item (TRANSACTION_MIN_TOTAL) and unknown slots are ignored.
 */
export function assignStamps(
  program: ActiveRewardProgram,
  lines: RewardCartLine[],
  slotKeys: string[],
): Map<string, string> {
  if (isOnePerVisit(program)) return new Map(); // stamps carry no line
  type ItemStamp = StampSlot & { condition: StampCondition };
  const slotByKey = new Map(getSlots(program).map((s) => [s.key, s]));
  const stamps = slotKeys
    .map((k, order) => ({ slot: slotByKey.get(k), order }))
    .filter(
      (x): x is { slot: ItemStamp; order: number } =>
        !!x.slot &&
        x.slot.kind === "STAMP" &&
        !!x.slot.condition &&
        isItemCondition(x.slot.condition),
    )
    .sort(
      (a, b) =>
        RESTRICTIVENESS[a.slot.condition.type] - RESTRICTIVENESS[b.slot.condition.type] ||
        a.order - b.order,
    )
    .map((x) => x.slot);

  const candidates = stamps.map((s) =>
    lines.map((l, i) => (lineMeetsCondition(s.condition, l) ? i : -1)).filter((i) => i >= 0),
  );
  // lineHolders[lineIndex] = stamp indexes currently assigned to that line
  const lineHolders: number[][] = lines.map(() => []);
  const stampLine: number[] = stamps.map(() => -1);

  const tryAssign = (si: number, seen: Set<number>): boolean => {
    for (const li of candidates[si]) {
      if (seen.has(li)) continue;
      seen.add(li);
      if (lineHolders[li].length < Math.max(0, lines[li].quantity)) {
        lineHolders[li].push(si);
        stampLine[si] = li;
        return true;
      }
      for (const other of lineHolders[li]) {
        if (tryAssign(other, seen)) {
          lineHolders[li] = lineHolders[li].filter((x) => x !== other);
          lineHolders[li].push(si);
          stampLine[si] = li;
          return true;
        }
      }
    }
    return false;
  };

  stamps.forEach((_, si) => tryAssign(si, new Set()));

  const result = new Map<string, string>();
  stamps.forEach((s, si) => {
    if (stampLine[si] >= 0) result.set(s.key, lines[stampLine[si]].orderId);
  });
  return result;
}

export type StampSlotStatus = {
  slot: StampSlot;
  /** Condition is met by this order (some line or the final total). */
  matches: boolean;
  /** Ticked by the cashier. */
  checked: boolean;
  /** Matches, but every matching unit already backs another stamp. */
  usedUp: boolean;
  /** Line backing this stamp when checked and item-based. */
  orderId?: string;
};

/**
 * Status of every STAMP slot for the panel: what matches this order, what is
 * ticked, and what can still be ticked given unit availability.
 * `finalTotal` is the transaction total after ALL discounts (item, reward
 * redemption and order discount), the number the API compares
 * TRANSACTION_MIN_TOTAL against.
 */
export function eligibleStampSlots(
  program: ActiveRewardProgram,
  lines: RewardCartLine[],
  finalTotal: number,
  selection: LoyaltyCardSelection,
): StampSlotStatus[] {
  const checkedKeys = selection.stamps.map((s) => s.slotKey);
  const onePerVisit = isOnePerVisit(program);
  const current = assignStamps(program, lines, checkedKeys);
  return getSlots(program)
    .filter((s): s is StampSlot => s.kind === "STAMP")
    .map((slot) => {
      const checked = checkedKeys.includes(slot.key);
      // ONE_PER_VISIT: any purchase qualifies, so every circle is a candidate.
      if (onePerVisit) return { slot, matches: true, checked, usedUp: false };
      const c = slot.condition;
      // A stamp with no condition (program switched modes) can't be matched.
      if (!c) return { slot, matches: false, checked, usedUp: false };
      if (c.type === "TRANSACTION_MIN_TOTAL") {
        const matches = finalTotal >= c.minTotal - MONEY_EPSILON;
        return { slot, matches, checked, usedUp: false };
      }
      const matches = lines.some((l) => lineMeetsCondition(c, l));
      if (checked) return { slot, matches, checked, usedUp: false, orderId: current.get(slot.key) };
      // Used up unless adding it grows the matching: otherwise it could only be
      // placed by evicting a stamp the cashier already ticked.
      const usedUp =
        matches && assignStamps(program, lines, [...checkedKeys, slot.key]).size <= current.size;
      return { slot, matches, checked, usedUp };
    });
}

/** Toggle one stamp and re-run the assignment. Returns the selection unchanged if it can't be placed. */
export function toggleStamp(
  program: ActiveRewardProgram,
  lines: RewardCartLine[],
  finalTotal: number,
  selection: LoyaltyCardSelection,
  slotKey: string,
): LoyaltyCardSelection {
  const has = selection.stamps.some((s) => s.slotKey === slotKey);
  if (isOnePerVisit(program)) {
    // At most one tick per sale: tapping another circle moves it.
    const slot = getSlots(program).find((s) => s.key === slotKey);
    if (!slot || slot.kind !== "STAMP") return selection;
    return { ...selection, stamps: has ? [] : [{ slotKey }] };
  }
  const keys = has
    ? selection.stamps.filter((s) => s.slotKey !== slotKey).map((s) => s.slotKey)
    : [...selection.stamps.map((s) => s.slotKey), slotKey];
  if (!has) {
    const status = eligibleStampSlots(program, lines, finalTotal, selection).find(
      (s) => s.slot.key === slotKey,
    );
    if (!status || !status.matches || status.usedUp) return selection;
  }
  return { ...selection, stamps: resolveStamps(program, lines, finalTotal, keys) };
}

/** Rebuild stamp selections from keys: assign lines, drop what no longer qualifies. */
function resolveStamps(
  program: ActiveRewardProgram,
  lines: RewardCartLine[],
  finalTotal: number,
  keys: string[],
): LoyaltyStampSelection[] {
  const slotByKey = new Map(getSlots(program).map((s) => [s.key, s]));
  if (isOnePerVisit(program)) {
    const first = keys.find((k) => slotByKey.get(k)?.kind === "STAMP");
    return first ? [{ slotKey: first }] : [];
  }
  const assigned = assignStamps(program, lines, keys);
  const out: LoyaltyStampSelection[] = [];
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) continue; // each slot at most once per transaction
    const slot = slotByKey.get(key);
    if (!slot || slot.kind !== "STAMP" || !slot.condition) continue;
    if (slot.condition.type === "TRANSACTION_MIN_TOTAL") {
      if (finalTotal >= slot.condition.minTotal - MONEY_EPSILON) {
        out.push({ slotKey: key });
        seen.add(key);
      }
      continue;
    }
    const orderId = assigned.get(key);
    if (orderId) {
      out.push({ slotKey: key, orderId });
      seen.add(key);
    }
  }
  return out;
}

// ─── Redemption ─────────────────────────────────────────────────────────────

/** Max discount on ONE unit, identical to the API's computeMaxRedemption. */
export function computeMaxRedemption(reward: MilestoneReward, unitPrice: number): number {
  const price = Math.max(0, unitPrice);
  switch (reward.type) {
    case "PERCENT_OFF_ITEM":
      return round2((price * reward.percent) / 100);
    case "FREE_ITEM":
      return round2(price);
    case "AMOUNT_OFF_ITEM":
      return round2(Math.min(reward.amount, price));
    default:
      return 0;
  }
}

export type RedemptionCheck =
  | { eligible: true; discountAmount: number }
  | { eligible: false; reason: "NOT_ELIGIBLE" | "HAS_DISCOUNT"; discountAmount: 0 };

/**
 * Can `reward` be applied to `line`, and for how much (one unit)?
 * `otherRewardOnLine` is true when another program's redemption already sits on
 * this line: treated like a manual discount so two sources never stack.
 */
export function computeRedemption(
  reward: MilestoneReward,
  line: RewardCartLine,
  otherRewardOnLine = false,
): RedemptionCheck {
  if (!nameIn(line.categoryName, reward.categoryNames) || !nameIn(line.sizeName, reward.sizeNames))
    return { eligible: false, reason: "NOT_ELIGIBLE", discountAmount: 0 };
  if (line.hasManualDiscount || otherRewardOnLine)
    return { eligible: false, reason: "HAS_DISCOUNT", discountAmount: 0 };
  return { eligible: true, discountAmount: computeMaxRedemption(reward, line.unitPrice) };
}

/** True when the line passes the reward's category/size filters (ignoring discounts). */
export function rewardMatchesLine(reward: MilestoneReward, line: RewardCartLine): boolean {
  return nameIn(line.categoryName, reward.categoryNames) && nameIn(line.sizeName, reward.sizeNames);
}

export function describeReward(reward: MilestoneReward): string {
  switch (reward.type) {
    case "PERCENT_OFF_ITEM":
      return `${reward.percent}% off 1 item`;
    case "FREE_ITEM":
      return "1 free item";
    case "AMOUNT_OFF_ITEM":
      return `₱${reward.amount.toFixed(2)} off 1 item`;
    default:
      return "";
  }
}

export function describeCondition(condition: StampCondition): string {
  switch (condition.type) {
    case "ITEM_MIN_PRICE":
      return `₱${condition.minPrice % 1 === 0 ? condition.minPrice : condition.minPrice.toFixed(2)}+`;
    case "ITEM_PRODUCT_NAMES":
      return condition.names.length === 1 ? condition.names[0] : `${condition.names.length} products`;
    case "ITEM_CATEGORY_NAMES":
      return condition.names.length === 1 ? condition.names[0] : `${condition.names.length} categories`;
    case "TRANSACTION_MIN_TOTAL":
      return `₱${condition.minTotal % 1 === 0 ? condition.minTotal : condition.minTotal.toFixed(2)}+ total`;
    default:
      return "";
  }
}

// ─── Redeem prompts ─────────────────────────────────────────────────────────

const pesoShort = (n: number) => `₱${Number.isInteger(n) ? n : n.toFixed(2)}`;

function joinOr(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

/** "a Nata de Coco item" / "any item" (no category filter). */
export function rewardItemPhrase(reward: MilestoneReward): string {
  const cats = (reward.categoryNames ?? []).map((n) => n.trim()).filter(Boolean);
  if (cats.length === 0) return "any item";
  const name = joinOr(cats);
  return `${/^[aeiou]/i.test(name) ? "an" : "a"} ${name} item`;
}

function rewardSizePhrase(reward: MilestoneReward): string {
  const sizes = (reward.sizeNames ?? []).map((n) => n.trim()).filter(Boolean);
  return sizes.length ? ` (${joinOr(sizes)} size)` : "";
}

function rewardOutcome(reward: MilestoneReward): string {
  switch (reward.type) {
    case "FREE_ITEM":
      return "It will be free.";
    case "PERCENT_OFF_ITEM":
      return `It will be ${reward.percent}% off.`;
    case "AMOUNT_OFF_ITEM":
      return `It will be ${pesoShort(reward.amount)} off.`;
    default:
      return "";
  }
}

/** Shown when Redeem is tapped but no cart item qualifies. */
export function addItemPrompt(reward: MilestoneReward): { title: string; message: string } {
  return {
    title: reward.type === "FREE_ITEM" ? "Add the free item first" : "Add the item to discount first",
    message: `Add ${rewardItemPhrase(reward)} to the order${rewardSizePhrase(reward)}, then tap Redeem again. ${rewardOutcome(reward)}`,
  };
}

/** Short caption under a milestone with nothing to redeem against. */
export function addItemHint(reward: MilestoneReward): string {
  return `Add ${rewardItemPhrase(reward)} to redeem.`;
}

/**
 * Card-check confirmation before redeeming `milestoneKey`: the STAMP slots
 * after the previous milestone and before this one, in card order. Uses the
 * stamps' labels when all are short, otherwise their ordinal numbers on the card.
 */
export function cardCheckPrompt(
  program: ActiveRewardProgram,
  milestoneKey: string,
): { title: string; message: string } {
  const ordered = slotRows(program).flat();
  const idx = ordered.findIndex((s) => s.key === milestoneKey);
  const title = "Check the customer's card";
  if (idx < 0) return { title, message: "Is the card stamped for this reward?" };
  let start = 0;
  for (let i = idx - 1; i >= 0; i--) {
    if (ordered[i].kind === "MILESTONE") {
      start = i + 1;
      break;
    }
  }
  const segment = ordered.slice(start, idx).filter((s) => s.kind === "STAMP");
  if (segment.length === 0) return { title, message: "Is the card stamped for this reward?" };

  let ordinal = 0;
  const ordinals = new Map<string, number>();
  for (const s of ordered) if (s.kind === "STAMP") ordinals.set(s.key, ++ordinal);

  const labels = segment.map((s) => s.label.trim());
  const useLabels = labels.every((l) => l.length > 0 && l.length <= 4);
  const names = useLabels ? labels : segment.map((s) => String(ordinals.get(s.key)));
  const text =
    names.length === 1
      ? `Is circle ${names[0]} stamped?`
      : names.length === 2
        ? `Are circles ${names[0]} and ${names[1]} stamped?`
        : `Are circles ${names[0]}–${names[names.length - 1]} stamped?`;
  return { title, message: text };
}

// ─── Keeping selections valid as the cart changes ──────────────────────────

/**
 * Re-validates a selection against the current cart and total. Drops stamps
 * that no longer qualify (item removed, quantity lowered, total dropped below
 * a TRANSACTION_MIN_TOTAL) and a redemption whose line is gone or no longer
 * eligible; refreshes the redemption amount if the line's unit price changed.
 * `rewardOnLineByOthers(orderId)` reports redemptions from other programs.
 */
export function sanitizeSelection(
  program: ActiveRewardProgram,
  lines: RewardCartLine[],
  finalTotal: number,
  selection: LoyaltyCardSelection,
  rewardOnLineByOthers: (orderId: string) => boolean = () => false,
): { selection: LoyaltyCardSelection; changed: boolean } {
  let redemption: LoyaltyRedemption | undefined = selection.redemption;
  if (redemption) {
    const slot = getSlots(program).find((s) => s.key === redemption!.slotKey);
    const line = lines.find((l) => l.orderId === redemption!.orderId);
    const check =
      slot && slot.kind === "MILESTONE" && line
        ? computeRedemption(slot.reward, line, rewardOnLineByOthers(line.orderId))
        : null;
    redemption =
      check && check.eligible ? { ...redemption, discountAmount: check.discountAmount } : undefined;
  }
  const stamps = resolveStamps(
    program,
    lines,
    finalTotal,
    selection.stamps.map((s) => s.slotKey),
  );
  const changed =
    stamps.length !== selection.stamps.length ||
    stamps.some(
      (s, i) => s.slotKey !== selection.stamps[i].slotKey || s.orderId !== selection.stamps[i].orderId,
    ) ||
    !!redemption !== !!selection.redemption ||
    (!!redemption && redemption.discountAmount !== selection.redemption!.discountAmount);
  // Only stamp/redemption loss is a user-visible "cleared" change; a reassignment is silent.
  return {
    selection: changed ? { issued: selection.issued, stamps, ...(redemption && { redemption }) } : selection,
    changed,
  };
}

/** True when anything was lost (not just reassigned), for the "order changed" notice. */
export function selectionLost(before: LoyaltyCardSelection, after: LoyaltyCardSelection): boolean {
  return after.stamps.length < before.stamps.length || (!!before.redemption && !after.redemption);
}

// ─── Payload ────────────────────────────────────────────────────────────────

/**
 * Builds the POST /transactions `rewards` entries for one program.
 * `lines` must be in payload `items` order: itemIndex = index in `lines`.
 * Anything that no longer maps to a line is skipped rather than sent invalid.
 */
export function buildRewardApplications(
  program: ActiveRewardProgram,
  selection: LoyaltyCardSelection,
  lines: RewardCartLine[],
): RewardApplication[] {
  const out: RewardApplication[] = [];
  const indexOf = (orderId: string | undefined) =>
    orderId ? lines.findIndex((l) => l.orderId === orderId) : -1;
  const slotByKey = new Map(getSlots(program).map((s) => [s.key, s]));

  if (selection.issued) out.push({ programId: program.id, type: "CARD_ISSUED" });

  const used = new Set<string>();
  for (const stamp of selection.stamps) {
    const slot = slotByKey.get(stamp.slotKey);
    if (!slot || slot.kind !== "STAMP" || used.has(slot.key)) continue;
    if (isOnePerVisit(program)) {
      // Any purchase qualifies: slotKey only, never an itemIndex, max one per sale.
      if (out.some((a) => a.type === "STAMP_ADDED")) break;
      out.push({ programId: program.id, type: "STAMP_ADDED", slotKey: slot.key });
      used.add(slot.key);
      continue;
    }
    if (!slot.condition) continue;
    if (slot.condition.type === "TRANSACTION_MIN_TOTAL") {
      out.push({ programId: program.id, type: "STAMP_ADDED", slotKey: slot.key });
    } else {
      const itemIndex = indexOf(stamp.orderId);
      if (itemIndex < 0) continue;
      out.push({ programId: program.id, type: "STAMP_ADDED", slotKey: slot.key, itemIndex });
    }
    used.add(slot.key);
  }

  const r = selection.redemption;
  if (r && !used.has(r.slotKey)) {
    const slot = slotByKey.get(r.slotKey);
    const itemIndex = indexOf(r.orderId);
    if (slot && slot.kind === "MILESTONE" && itemIndex >= 0 && r.discountAmount > 0) {
      out.push({
        programId: program.id,
        type: "REWARD_REDEEMED",
        slotKey: r.slotKey,
        itemIndex,
        discountAmount: round2(r.discountAmount),
      });
    }
  }
  return out;
}

// ─── Summaries ──────────────────────────────────────────────────────────────

export function selectionCount(selection: LoyaltyCardSelection | undefined): number {
  if (!selection) return 0;
  return (selection.issued ? 1 : 0) + selection.stamps.length + (selection.redemption ? 1 : 0);
}

/** Short chips: "New card", "2 stamps", "Reward 1". */
export function summarizeSelection(
  program: ActiveRewardProgram,
  selection: LoyaltyCardSelection | undefined,
): string[] {
  if (!selection) return [];
  const chips: string[] = [];
  if (selection.issued) chips.push("New card");
  const n = selection.stamps.length;
  if (n > 0) chips.push(`${n} stamp${n === 1 ? "" : "s"}`);
  if (selection.redemption) {
    const slot = getSlots(program).find((s) => s.key === selection.redemption!.slotKey);
    if (slot) chips.push(slot.label);
  }
  return chips;
}

export function buildReceipt(
  program: ActiveRewardProgram,
  selection: LoyaltyCardSelection,
  lines: RewardCartLine[],
): RewardReceiptProgram | null {
  if (selectionCount(selection) === 0) return null;
  const slotByKey = new Map(getSlots(program).map((s) => [s.key, s]));
  const stampLabels = selection.stamps
    .map((s) => slotByKey.get(s.slotKey)?.label)
    .filter((l): l is string => !!l);
  let redemption: RewardReceiptProgram["redemption"];
  if (selection.redemption) {
    const slot = slotByKey.get(selection.redemption.slotKey) as MilestoneSlot | undefined;
    const line = lines.find((l) => l.orderId === selection.redemption!.orderId);
    if (slot && line)
      redemption = {
        label: slot.label,
        discountAmount: selection.redemption.discountAmount,
        productName: line.productName,
      };
  }
  return {
    programId: program.id,
    programName: program.name,
    cardIssued: selection.issued,
    stampLabels,
    ...(redemption && { redemption }),
  };
}
