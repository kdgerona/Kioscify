// Config shape for RewardProgramType.LOYALTY_CARD: a paper card with stamp
// circles (each with its own earning condition) and milestone rewards.
// Names are matched case-insensitively and trimmed, never by id, because menus
// are cloned with fresh ids.

export type StampCondition =
  | { type: 'ITEM_MIN_PRICE'; minPrice: number; categoryNames?: string[] }
  | { type: 'ITEM_PRODUCT_NAMES'; names: string[] }
  | { type: 'ITEM_CATEGORY_NAMES'; names: string[] }
  | { type: 'TRANSACTION_MIN_TOTAL'; minTotal: number };

interface ItemRewardFilters {
  categoryNames?: string[];
  sizeNames?: string[];
}

export type MilestoneReward =
  | ({ type: 'PERCENT_OFF_ITEM'; percent: number } & ItemRewardFilters)
  | ({ type: 'FREE_ITEM' } & ItemRewardFilters)
  | ({ type: 'AMOUNT_OFF_ITEM'; amount: number } & ItemRewardFilters);

export interface StampSlot {
  key: string;
  kind: 'STAMP';
  label: string;
  row: number;
  position: number;
  /** Required in MATCH_CONDITIONS; ignored (and dropped on save) in ONE_PER_VISIT. */
  condition?: StampCondition;
}

export interface MilestoneSlot {
  key: string;
  kind: 'MILESTONE';
  label: string;
  row: number;
  position: number;
  reward: MilestoneReward;
}

export type LoyaltyCardSlot = StampSlot | MilestoneSlot;

export const STAMP_MODES = ['MATCH_CONDITIONS', 'ONE_PER_VISIT'] as const;
export type StampMode = (typeof STAMP_MODES)[number];

export interface LoyaltyCardConfig {
  /** Missing = MATCH_CONDITIONS (all programs created before this field). */
  stampMode?: StampMode;
  slots: LoyaltyCardSlot[];
}

export const STAMP_CONDITION_TYPES = [
  'ITEM_MIN_PRICE',
  'ITEM_PRODUCT_NAMES',
  'ITEM_CATEGORY_NAMES',
  'TRANSACTION_MIN_TOTAL',
] as const;

export const MILESTONE_REWARD_TYPES = [
  'PERCENT_OFF_ITEM',
  'FREE_ITEM',
  'AMOUNT_OFF_ITEM',
] as const;

export const LOYALTY_CARD_LIMITS = {
  maxSlots: 100,
  maxKeyLength: 64,
  maxLabelLength: 100,
  maxNames: 200,
  maxNameLength: 100,
} as const;
