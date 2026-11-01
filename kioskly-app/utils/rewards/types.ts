// Shared reward types for the kiosk. Mirrors kioskly-api/src/rewards/types and
// the GET /rewards/active + POST /transactions `rewards` contract.

export type RewardProgramType = "LOYALTY_CARD";

export type StampCondition =
  | { type: "ITEM_MIN_PRICE"; minPrice: number; categoryNames?: string[] }
  | { type: "ITEM_PRODUCT_NAMES"; names: string[] }
  | { type: "ITEM_CATEGORY_NAMES"; names: string[] }
  | { type: "TRANSACTION_MIN_TOTAL"; minTotal: number };

type ItemRewardFilters = { categoryNames?: string[]; sizeNames?: string[] };

export type MilestoneReward =
  | ({ type: "PERCENT_OFF_ITEM"; percent: number } & ItemRewardFilters)
  | ({ type: "FREE_ITEM" } & ItemRewardFilters)
  | ({ type: "AMOUNT_OFF_ITEM"; amount: number } & ItemRewardFilters);

export type StampSlot = {
  key: string;
  kind: "STAMP";
  label: string;
  row: number;
  position: number;
  /** Absent in ONE_PER_VISIT programs. */
  condition?: StampCondition;
};

export type MilestoneSlot = {
  key: string;
  kind: "MILESTONE";
  label: string;
  row: number;
  position: number;
  reward: MilestoneReward;
};

export type LoyaltyCardSlot = StampSlot | MilestoneSlot;

export type StampMode = "MATCH_CONDITIONS" | "ONE_PER_VISIT";

/** Missing stampMode = MATCH_CONDITIONS (programs created before the field existed). */
export type LoyaltyCardConfig = { stampMode?: StampMode; slots: LoyaltyCardSlot[] };

export type ActiveRewardProgram = {
  id: string;
  name: string;
  description?: string | null;
  type: RewardProgramType | string;
  scope: "COMPANY" | "STORE";
  status: string;
  brandId?: string | null;
  tenantId?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  config: LoyaltyCardConfig;
  updatedAt?: string;
};

/** One entry of POST /transactions `rewards`. */
export type RewardApplication =
  | { programId: string; type: "CARD_ISSUED" }
  | { programId: string; type: "STAMP_ADDED"; slotKey: string; itemIndex?: number }
  | {
      programId: string;
      type: "REWARD_REDEEMED";
      slotKey: string;
      itemIndex: number;
      discountAmount: number;
    };

/**
 * A cart line as the reward engine sees it. The array of lines MUST be built
 * in the same order as the transaction payload's `items` array (both are a
 * plain `orders.map(...)` in home.tsx), so a line's array index IS the
 * payload `itemIndex`.
 */
export type RewardCartLine = {
  orderId: string;
  productName: string;
  categoryName: string | null;
  sizeName: string | null;
  quantity: number;
  /** getEffectiveProductPrice: base product price, before size and add-ons. */
  basePrice: number;
  /** calculateItemPrice: payload subtotal / quantity (includes size and add-ons). */
  unitPrice: number;
  /** True when the cashier set a manual item discount on this line. */
  hasManualDiscount: boolean;
};

export type LoyaltyStampSelection = {
  slotKey: string;
  /** Assigned cart line for item-based conditions; absent for TRANSACTION_MIN_TOTAL and ONE_PER_VISIT. */
  orderId?: string;
};

export type LoyaltyRedemption = {
  slotKey: string;
  orderId: string;
  /** Discount on ONE unit of the line. */
  discountAmount: number;
};

export type LoyaltyCardSelection = {
  issued: boolean;
  stamps: LoyaltyStampSelection[];
  redemption?: LoyaltyRedemption;
};

/** Keyed by program id. Owned by home.tsx. */
export type RewardSelections = Record<string, LoyaltyCardSelection>;

/** Post-sale summary of what was applied for one program (receipt + stamp hint). */
export type RewardReceiptProgram = {
  programId: string;
  programName: string;
  cardIssued: boolean;
  stampLabels: string[];
  redemption?: { label: string; discountAmount: number; productName: string };
};
