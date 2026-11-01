// Shared reward types. Mirrors kioskly-api/src/rewards (DTOs, service
// responses and types/loyalty-card.types.ts). This folder is copied verbatim
// into the store portal, so keep it free of imports from app/ or lib/.

export type RewardProgramType = 'LOYALTY_CARD' | 'BUY_X_GET_Y' | 'PERCENT_OFF';
export type RewardProgramStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
export type RewardProgramScope = 'COMPANY' | 'STORE';
export type RewardEventType = 'CARD_ISSUED' | 'STAMP_ADDED' | 'REWARD_REDEEMED';

// ─── Loyalty card config ──────────────────────────────────────────────────

export type StampCondition =
  | { type: 'ITEM_MIN_PRICE'; minPrice: number; categoryNames?: string[] }
  | { type: 'ITEM_PRODUCT_NAMES'; names: string[] }
  | { type: 'ITEM_CATEGORY_NAMES'; names: string[] }
  | { type: 'TRANSACTION_MIN_TOTAL'; minTotal: number };

export type StampConditionType = StampCondition['type'];

export interface ItemRewardFilters {
  categoryNames?: string[];
  sizeNames?: string[];
}

export type MilestoneReward =
  | ({ type: 'PERCENT_OFF_ITEM'; percent: number } & ItemRewardFilters)
  | ({ type: 'FREE_ITEM' } & ItemRewardFilters)
  | ({ type: 'AMOUNT_OFF_ITEM'; amount: number } & ItemRewardFilters);

export type MilestoneRewardType = MilestoneReward['type'];

/**
 * Builder-side slot. `condition`/`reward` are optional while the slot is being
 * designed; the API requires them (STAMP → condition, MILESTONE → reward).
 * `key` is generated once and never shown, edited or reused: events reference it.
 */
export interface LoyaltyCardSlot {
  key: string;
  kind: 'STAMP' | 'MILESTONE';
  label: string;
  row: number;
  position: number;
  condition?: StampCondition;
  reward?: MilestoneReward;
}

export type StampMode = 'MATCH_CONDITIONS' | 'ONE_PER_VISIT';

export interface LoyaltyCardConfig {
  /** Missing = MATCH_CONDITIONS (every program created before this field existed). */
  stampMode?: StampMode;
  slots: LoyaltyCardSlot[];
}

/** Names offered by NamePicker: distinct, case-insensitive, sorted A–Z. */
export interface RewardCatalog {
  productNames: string[];
  categoryNames: string[];
  sizeNames: string[];
  /** True when the menus couldn't be loaded; pickers still accept typed names. */
  failed?: boolean;
}

/** Per-field validation messages for one slot. */
export type SlotFieldErrors = Partial<
  Record<'label' | 'condition' | 'minPrice' | 'minTotal' | 'names' | 'reward' | 'percent' | 'amount', string>
>;

/** slotKey → field errors. */
export type SlotErrors = Record<string, SlotFieldErrors>;

// ─── Program ──────────────────────────────────────────────────────────────

export interface RewardProgram {
  id: string;
  companyId: string;
  brandId: string;
  tenantId: string | null;
  scope: RewardProgramScope;
  type: RewardProgramType;
  name: string;
  description: string | null;
  status: RewardProgramStatus;
  startsAt: string | null;
  endsAt: string | null;
  config: unknown;
  summary: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  /** Omitted for store users. */
  storeIds?: string[];
  storeCount: number;
  editable: boolean;
}

/** Editable header fields (ProgramHeaderForm). Dates are `yyyy-MM-dd` (Asia/Manila) or ''. */
export interface ProgramHeaderValue {
  name: string;
  description: string;
  status: RewardProgramStatus;
  startsAt: string;
  endsAt: string;
}

export type ProgramHeaderErrors = Partial<Record<'name' | 'endsAt' | 'status', string>>;

export interface CreateRewardProgramPayload {
  name: string;
  description?: string;
  type: RewardProgramType;
  status?: RewardProgramStatus;
  startsAt?: string;
  endsAt?: string;
  config: unknown;
  /** Required for company admins; ignored for store admins. */
  brandId?: string;
}

export interface UpdateRewardProgramPayload {
  name?: string;
  description?: string | null;
  status?: RewardProgramStatus;
  startsAt?: string | null;
  endsAt?: string | null;
  config?: unknown;
}

// ─── Events & summary ─────────────────────────────────────────────────────

export interface RewardEvent {
  id: string;
  programId: string;
  programType: RewardProgramType;
  programName: string;
  type: RewardEventType;
  slotKey: string | null;
  slotLabel: string | null;
  itemIndex: number | null;
  productName: string | null;
  discountAmount: number | null;
  isVoided: boolean;
  /** Non-empty when the sale synced after the program changed (offline drift). */
  validationWarnings?: string[];
  occurredAt: string;
  tenantId: string;
  storeName: string | null;
  transactionId: string;
  transactionCode: string | null;
  userId: string;
  cashierName: string | null;
  createdAt: string;
}

export interface RewardEventsQuery {
  storeId?: string;
  programId?: string;
  type?: RewardEventType;
  startDate?: string;
  endDate?: string;
  includeVoided?: boolean;
  onlyFlagged?: boolean;
  page?: number;
  limit?: number;
}

export interface Paginated<T> {
  data: T[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface RewardSummary {
  /** flaggedEvents = events with non-empty validationWarnings (offline drift). */
  totals: Record<RewardEventType, number> & { flaggedEvents: number };
  /** Counts only the three event types. */
  totalEvents: number;
  totalRewardDiscount: number;
  bySlot: {
    programId: string;
    programName: string | null;
    type: RewardEventType;
    slotKey: string | null;
    slotLabel: string | null;
    count: number;
    discountTotal: number;
  }[];
  byStore: ({
    tenantId: string;
    storeName: string | null;
    totalRewardDiscount: number;
  } & Record<RewardEventType, number>)[];
}
