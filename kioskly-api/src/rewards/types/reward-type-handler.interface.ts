import type {
  Prisma,
  RewardEventType,
  RewardProgramType,
} from '@prisma/client';
import type { RewardApplicationDto } from '../dto/reward-application.dto';

/**
 * A cart line as the reward engine sees it. Built by RewardsService from the
 * incoming CreateTransactionDto plus a catalog lookup, so handlers stay pure
 * (no Prisma access) and are trivially unit-testable.
 */
export interface RewardItemContext {
  index: number;
  productId: string;
  /** Catalog name at sync time; null when the product id is unknown. */
  productName: string | null;
  categoryName: string | null;
  sizeName: string | null;
  quantity: number;
  /** subtotal / quantity, as sent by the kiosk (includes size and add-ons). */
  unitPrice: number;
  /**
   * Effective BASE unit price at the store: the product's price-tier override
   * when the store resolves a tier that has one, else the catalog price.
   * Excludes size modifiers and add-ons. Null when the product is unknown.
   */
  basePrice: number | null;
  /** The line's existing manual/reward discount (DTO discountAmount ?? 0). */
  discountAmount: number;
}

export interface RewardTransactionContext {
  subtotal: number;
  total: number;
  items: RewardItemContext[];
}

/** The program fields handlers need. */
export interface RewardProgramLike {
  id: string;
  name: string;
  type: RewardProgramType;
  config: unknown;
}

/** One validated application, ready to become a RewardEvent row. */
export interface ValidatedRewardApplication {
  type: RewardEventType;
  slotKey: string | null;
  slotLabel: string | null;
  itemIndex: number | null;
  productName: string | null;
  discountAmount: number | null;
  /**
   * SOFT problems (program/catalog changed since the sale). The event is still
   * recorded, flagged with these messages.
   */
  warnings: string[];
}

/** Fields shared by every event written for one transaction + program. */
export interface RewardEventBase {
  programId: string;
  programType: RewardProgramType;
  programName: string;
  tenantId: string;
  companyId: string;
  brandId: string;
  userId: string;
  occurredAt: Date;
  /** Program-level SOFT warnings, prepended to every event's own warnings. */
  validationWarnings?: string[];
}

export type RewardEventDraft = Omit<
  Prisma.RewardEventCreateManyInput,
  'transactionId'
>;

/**
 * Contract every reward program type implements. Adding a new type means one
 * enum value + one handler registered in RewardTypeRegistry.
 */
export interface RewardTypeHandler {
  readonly type: RewardProgramType;

  /**
   * Validates a program's type-specific `config` and returns a normalized copy
   * (unknown keys dropped, strings trimmed). Throws BadRequestException.
   */
  validateConfig(config: unknown): Record<string, unknown>;

  /**
   * Validates all applications for ONE program within one transaction.
   * Throws BadRequestException only for HARD errors (malformed / tampering);
   * eligibility problems are returned as per-application `warnings`.
   */
  validateApplications(
    program: RewardProgramLike,
    applications: RewardApplicationDto[],
    tx: RewardTransactionContext,
  ): ValidatedRewardApplication[];

  toEvents(
    validated: ValidatedRewardApplication[],
    base: RewardEventBase,
  ): RewardEventDraft[];

  /** Short human-readable summary, e.g. "12 stamps, 3 milestones". */
  describe(config: unknown): string;
}
