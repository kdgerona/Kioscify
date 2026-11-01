// Reward-type registry for the kiosk, keyed by program type (mirrors the API's
// RewardTypeRegistry). home.tsx and CheckoutModal only talk to this module, so
// a new program type means one entry here plus its panel section.

import * as loyaltyCard from "./loyaltyCard";
import type {
  ActiveRewardProgram,
  LoyaltyCardSelection,
  RewardApplication,
  RewardCartLine,
  RewardReceiptProgram,
  RewardSelections,
} from "./types";

export * from "./types";

export type RewardTypeClient = {
  type: string;
  label: string;
  sanitize: (
    program: ActiveRewardProgram,
    lines: RewardCartLine[],
    finalTotal: number,
    selection: LoyaltyCardSelection,
    rewardOnLineByOthers: (orderId: string) => boolean,
  ) => { selection: LoyaltyCardSelection; lost: boolean };
  buildApplications: (
    program: ActiveRewardProgram,
    selection: LoyaltyCardSelection,
    lines: RewardCartLine[],
  ) => RewardApplication[];
  summarize: (program: ActiveRewardProgram, selection: LoyaltyCardSelection | undefined) => string[];
  count: (selection: LoyaltyCardSelection | undefined) => number;
  receipt: (
    program: ActiveRewardProgram,
    selection: LoyaltyCardSelection,
    lines: RewardCartLine[],
  ) => RewardReceiptProgram | null;
};

export const REWARD_TYPES: Record<string, RewardTypeClient> = {
  LOYALTY_CARD: {
    type: "LOYALTY_CARD",
    label: "Loyalty Card",
    sanitize: (program, lines, finalTotal, selection, others) => {
      const { selection: next, changed } = loyaltyCard.sanitizeSelection(
        program,
        lines,
        finalTotal,
        selection,
        others,
      );
      return { selection: next, lost: changed && loyaltyCard.selectionLost(selection, next) };
    },
    buildApplications: loyaltyCard.buildRewardApplications,
    summarize: loyaltyCard.summarizeSelection,
    count: loyaltyCard.selectionCount,
    receipt: loyaltyCard.buildReceipt,
  },
};

export const getRewardType = (type: string): RewardTypeClient | undefined => REWARD_TYPES[type];

/** Programs the kiosk can run right now: known type, ACTIVE, inside its dates. */
export function filterRunnablePrograms(
  programs: ActiveRewardProgram[],
  now: Date = new Date(),
): ActiveRewardProgram[] {
  return programs.filter((p) => {
    if (!p || !getRewardType(p.type)) return false;
    if (p.status && p.status !== "ACTIVE") return false;
    if (p.startsAt && now < new Date(p.startsAt)) return false;
    if (p.endsAt && now > new Date(p.endsAt)) return false;
    return Array.isArray(p.config?.slots) && p.config.slots.length > 0;
  });
}

/** Reward discount per cart line (orderId → ₱ on one unit), summed across programs. */
export function rewardDiscountsByOrderId(selections: RewardSelections): Record<string, number> {
  const out: Record<string, number> = {};
  for (const sel of Object.values(selections)) {
    const r = sel.redemption;
    if (r) out[r.orderId] = loyaltyCard.round2((out[r.orderId] ?? 0) + r.discountAmount);
  }
  return out;
}

/** Program-name lookup for redemptions, used for cart labels ("Reward: Reward 1"). */
export function rewardLabelsByOrderId(
  programs: ActiveRewardProgram[],
  selections: RewardSelections,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of programs) {
    const r = selections[p.id]?.redemption;
    if (!r) continue;
    const slot = loyaltyCard.getSlots(p).find((s) => s.key === r.slotKey);
    if (slot) out[r.orderId] = slot.label;
  }
  return out;
}

/**
 * Re-validates every program's selection. Drops selections for programs that
 * are no longer runnable. `lost` is true when a stamp or redemption had to be
 * removed (drives the "order changed" notice); `endedNames` lists programs
 * whose selections were dropped because they ended.
 */
export function sanitizeSelections(
  programs: ActiveRewardProgram[],
  selections: RewardSelections,
  lines: RewardCartLine[],
  finalTotal: number,
): { selections: RewardSelections; changed: boolean; lost: boolean; endedNames: string[] } {
  const runnable = new Map(filterRunnablePrograms(programs).map((p) => [p.id, p]));
  const allById = new Map(programs.map((p) => [p.id, p]));
  const next: RewardSelections = {};
  let changed = false;
  let lost = false;
  const endedNames: string[] = [];

  for (const [programId, sel] of Object.entries(selections)) {
    const program = runnable.get(programId);
    const client = program && getRewardType(program.type);
    if (!program || !client) {
      changed = true;
      if (loyaltyCard.selectionCount(sel) > 0)
        endedNames.push(allById.get(programId)?.name ?? "A reward program");
      continue;
    }
    const others = (orderId: string) =>
      Object.entries(selections).some(
        ([pid, s]) => pid !== programId && s.redemption?.orderId === orderId,
      );
    const res = client.sanitize(program, lines, finalTotal, sel, others);
    if (res.selection !== sel) changed = true;
    if (res.lost) lost = true;
    next[programId] = res.selection;
  }
  return { selections: changed ? next : selections, changed, lost, endedNames };
}

/** All `rewards` entries for the payload. `lines` in payload items order. */
export function buildAllRewardApplications(
  programs: ActiveRewardProgram[],
  selections: RewardSelections,
  lines: RewardCartLine[],
): RewardApplication[] {
  return programs.flatMap((p) => {
    const sel = selections[p.id];
    const client = getRewardType(p.type);
    return sel && client ? client.buildApplications(p, sel, lines) : [];
  });
}

export function buildRewardReceipt(
  programs: ActiveRewardProgram[],
  selections: RewardSelections,
  lines: RewardCartLine[],
): RewardReceiptProgram[] {
  return programs
    .map((p) => {
      const sel = selections[p.id];
      const client = getRewardType(p.type);
      return sel && client ? client.receipt(p, sel, lines) : null;
    })
    .filter((r): r is RewardReceiptProgram => !!r);
}

/** Number of paper-card circles the cashier must physically stamp. */
export const stampCircleCount = (receipt: RewardReceiptProgram[]): number =>
  receipt.reduce((n, r) => n + r.stampLabels.length, 0);

export { loyaltyCard };
