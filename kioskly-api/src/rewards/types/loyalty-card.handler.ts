import { BadRequestException } from '@nestjs/common';
import { RewardEventType, RewardProgramType } from '@prisma/client';
import type { RewardApplicationDto } from '../dto/reward-application.dto';
import type {
  RewardEventBase,
  RewardEventDraft,
  RewardItemContext,
  RewardProgramLike,
  RewardTransactionContext,
  RewardTypeHandler,
  ValidatedRewardApplication,
} from './reward-type-handler.interface';
import {
  LOYALTY_CARD_LIMITS,
  LoyaltyCardConfig,
  LoyaltyCardSlot,
  MILESTONE_REWARD_TYPES,
  MilestoneReward,
  STAMP_CONDITION_TYPES,
  STAMP_MODES,
  StampCondition,
  StampMode,
} from './loyalty-card.types';

/** Rounding tolerance for money comparisons (₱0.01). */
export const MONEY_EPSILON = 0.01;

export function normalizeName(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function nameIn(
  value: string | null | undefined,
  names: string[] | undefined,
): boolean {
  if (!names || names.length === 0) return true;
  const v = normalizeName(value);
  return v !== '' && names.some((n) => normalizeName(n) === v);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Maximum discount a milestone reward may grant on ONE unit of a cart line.
 * `unitPrice` is the line's subtotal / quantity as sent by the kiosk.
 */
export function computeMaxRedemption(
  reward: MilestoneReward,
  unitPrice: number,
): number {
  const price = Math.max(0, unitPrice);
  switch (reward.type) {
    case 'PERCENT_OFF_ITEM':
      return round2((price * reward.percent) / 100);
    case 'FREE_ITEM':
      return round2(price);
    case 'AMOUNT_OFF_ITEM':
      return round2(Math.min(reward.amount, price));
    default:
      return 0;
  }
}

/** True when the cart line satisfies an item-level stamp condition. */
export function itemMeetsCondition(
  condition: StampCondition,
  item: RewardItemContext,
): boolean {
  switch (condition.type) {
    case 'ITEM_MIN_PRICE':
      return (
        item.basePrice !== null &&
        item.basePrice >= condition.minPrice - MONEY_EPSILON &&
        nameIn(item.categoryName, condition.categoryNames)
      );
    case 'ITEM_PRODUCT_NAMES':
      return nameIn(item.productName, condition.names);
    case 'ITEM_CATEGORY_NAMES':
      return nameIn(item.categoryName, condition.names);
    default:
      return false;
  }
}

// ─── config validation helpers ──────────────────────────────────────────────

const isPlainObject = (v: unknown): v is Record<string, any> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

function readNames(
  raw: unknown,
  path: string,
  errors: string[],
  required: boolean,
): string[] | undefined {
  if (raw === undefined || raw === null) {
    if (required) errors.push(`${path} must be a non-empty array of names`);
    return undefined;
  }
  if (!Array.isArray(raw)) {
    errors.push(`${path} must be an array of names`);
    return undefined;
  }
  const names = raw
    .filter((n) => typeof n === 'string')
    .map((n: string) => n.trim())
    .filter((n) => n.length > 0);
  if (names.length !== raw.length)
    errors.push(`${path} must contain only non-empty strings`);
  if (names.some((n) => n.length > LOYALTY_CARD_LIMITS.maxNameLength))
    errors.push(
      `${path} names must be at most ${LOYALTY_CARD_LIMITS.maxNameLength} characters`,
    );
  if (names.length > LOYALTY_CARD_LIMITS.maxNames)
    errors.push(
      `${path} must have at most ${LOYALTY_CARD_LIMITS.maxNames} names`,
    );
  if (required && names.length === 0)
    errors.push(`${path} must be a non-empty array of names`);
  if (!required && names.length === 0) return undefined;
  return Array.from(new Set(names));
}

function readCondition(
  raw: unknown,
  path: string,
  errors: string[],
): StampCondition | undefined {
  if (!isPlainObject(raw)) {
    errors.push(`${path} is required for STAMP slots`);
    return undefined;
  }
  switch (raw.type) {
    case 'ITEM_MIN_PRICE': {
      if (!isFiniteNumber(raw.minPrice) || raw.minPrice < 0) {
        errors.push(`${path}.minPrice must be a number >= 0`);
        return undefined;
      }
      const categoryNames = readNames(
        raw.categoryNames,
        `${path}.categoryNames`,
        errors,
        false,
      );
      return {
        type: 'ITEM_MIN_PRICE',
        minPrice: raw.minPrice,
        ...(categoryNames && { categoryNames }),
      };
    }
    case 'ITEM_PRODUCT_NAMES': {
      const names = readNames(raw.names, `${path}.names`, errors, true);
      return names ? { type: 'ITEM_PRODUCT_NAMES', names } : undefined;
    }
    case 'ITEM_CATEGORY_NAMES': {
      const names = readNames(raw.names, `${path}.names`, errors, true);
      return names ? { type: 'ITEM_CATEGORY_NAMES', names } : undefined;
    }
    case 'TRANSACTION_MIN_TOTAL': {
      if (!isFiniteNumber(raw.minTotal) || raw.minTotal < 0) {
        errors.push(`${path}.minTotal must be a number >= 0`);
        return undefined;
      }
      return { type: 'TRANSACTION_MIN_TOTAL', minTotal: raw.minTotal };
    }
    default:
      errors.push(
        `${path}.type must be one of ${STAMP_CONDITION_TYPES.join(', ')}`,
      );
      return undefined;
  }
}

function readReward(
  raw: unknown,
  path: string,
  errors: string[],
): MilestoneReward | undefined {
  if (!isPlainObject(raw)) {
    errors.push(`${path} is required for MILESTONE slots`);
    return undefined;
  }
  const categoryNames = readNames(
    raw.categoryNames,
    `${path}.categoryNames`,
    errors,
    false,
  );
  const sizeNames = readNames(
    raw.sizeNames,
    `${path}.sizeNames`,
    errors,
    false,
  );
  const filters = {
    ...(categoryNames && { categoryNames }),
    ...(sizeNames && { sizeNames }),
  };
  switch (raw.type) {
    case 'PERCENT_OFF_ITEM':
      if (
        !isFiniteNumber(raw.percent) ||
        raw.percent < 1 ||
        raw.percent > 100
      ) {
        errors.push(`${path}.percent must be a number between 1 and 100`);
        return undefined;
      }
      return { type: 'PERCENT_OFF_ITEM', percent: raw.percent, ...filters };
    case 'FREE_ITEM':
      return { type: 'FREE_ITEM', ...filters };
    case 'AMOUNT_OFF_ITEM':
      if (!isFiniteNumber(raw.amount) || raw.amount <= 0) {
        errors.push(`${path}.amount must be a number > 0`);
        return undefined;
      }
      return { type: 'AMOUNT_OFF_ITEM', amount: raw.amount, ...filters };
    default:
      errors.push(
        `${path}.type must be one of ${MILESTONE_REWARD_TYPES.join(', ')}`,
      );
      return undefined;
  }
}

function asConfig(config: unknown): LoyaltyCardConfig {
  if (isPlainObject(config) && Array.isArray(config.slots))
    return config as LoyaltyCardConfig;
  return { slots: [] };
}

export class LoyaltyCardHandler implements RewardTypeHandler {
  readonly type = RewardProgramType.LOYALTY_CARD;

  validateConfig(config: unknown): Record<string, unknown> {
    const errors: string[] = [];
    if (!isPlainObject(config) || !Array.isArray(config.slots)) {
      throw new BadRequestException(['config.slots must be an array']);
    }
    const rawSlots: unknown[] = config.slots;
    let stampMode: StampMode | undefined;
    if (config.stampMode !== undefined && config.stampMode !== null) {
      if (!STAMP_MODES.includes(config.stampMode))
        errors.push(
          `config.stampMode must be one of ${STAMP_MODES.join(', ')}`,
        );
      else stampMode = config.stampMode;
    }
    const onePerVisit = stampMode === 'ONE_PER_VISIT';
    if (rawSlots.length === 0)
      errors.push('config.slots must contain at least one slot');
    if (rawSlots.length > LOYALTY_CARD_LIMITS.maxSlots)
      errors.push(
        `config.slots must contain at most ${LOYALTY_CARD_LIMITS.maxSlots} slots`,
      );

    const keys = new Set<string>();
    const cells = new Set<string>();
    const slots: LoyaltyCardSlot[] = [];

    rawSlots.forEach((raw, i) => {
      const path = `config.slots[${i}]`;
      if (!isPlainObject(raw)) {
        errors.push(`${path} must be an object`);
        return;
      }
      const key = typeof raw.key === 'string' ? raw.key.trim() : '';
      const label = typeof raw.label === 'string' ? raw.label.trim() : '';
      if (!key) errors.push(`${path}.key must be a non-empty string`);
      else if (key.length > LOYALTY_CARD_LIMITS.maxKeyLength)
        errors.push(
          `${path}.key must be at most ${LOYALTY_CARD_LIMITS.maxKeyLength} characters`,
        );
      else if (keys.has(key)) errors.push(`${path}.key "${key}" is duplicated`);
      else keys.add(key);

      if (!label) errors.push(`${path}.label must be a non-empty string`);
      else if (label.length > LOYALTY_CARD_LIMITS.maxLabelLength)
        errors.push(
          `${path}.label must be at most ${LOYALTY_CARD_LIMITS.maxLabelLength} characters`,
        );

      const { row, position } = raw;
      if (!Number.isInteger(row) || row < 0)
        errors.push(`${path}.row must be an integer >= 0`);
      if (!Number.isInteger(position) || position < 0)
        errors.push(`${path}.position must be an integer >= 0`);
      if (Number.isInteger(row) && Number.isInteger(position)) {
        const cell = `${row}:${position}`;
        if (cells.has(cell))
          errors.push(`${path} reuses row ${row}, position ${position}`);
        cells.add(cell);
      }

      if (raw.kind === 'STAMP') {
        if (raw.reward !== undefined)
          errors.push(`${path}.reward is only allowed on MILESTONE slots`);
        if (onePerVisit) {
          // Any purchase qualifies: a stray condition is ignored and dropped.
          slots.push({ key, kind: 'STAMP', label, row, position });
        } else {
          const condition = readCondition(
            raw.condition,
            `${path}.condition`,
            errors,
          );
          if (condition)
            slots.push({ key, kind: 'STAMP', label, row, position, condition });
        }
      } else if (raw.kind === 'MILESTONE') {
        if (raw.condition !== undefined)
          errors.push(`${path}.condition is only allowed on STAMP slots`);
        const reward = readReward(raw.reward, `${path}.reward`, errors);
        if (reward)
          slots.push({ key, kind: 'MILESTONE', label, row, position, reward });
      } else {
        errors.push(`${path}.kind must be STAMP or MILESTONE`);
      }
    });

    if (errors.length) throw new BadRequestException(errors);
    return { ...(stampMode && { stampMode }), slots };
  }

  /**
   * HARD errors (malformed / tampering) throw 400. SOFT problems, which can be
   * caused by the program or catalog changing between an offline sale and its
   * sync, never reject the sale: the event is kept with `warnings`.
   */
  validateApplications(
    program: RewardProgramLike,
    applications: RewardApplicationDto[],
    tx: RewardTransactionContext,
  ): ValidatedRewardApplication[] {
    const config = asConfig(program.config);
    const slotsByKey = new Map(config.slots.map((s) => [s.key, s]));
    const errors: string[] = [];
    const usedSlots = new Set<string>();
    let cardIssued = false;
    let redeemed = false;
    // One cart unit can earn at most one item stamp per program.
    const stampsPerItem = new Map<number, number>();
    const onePerVisit = config.stampMode === 'ONE_PER_VISIT';
    let visitStamps = 0;
    const validated: ValidatedRewardApplication[] = [];
    const prefix = `rewards: program "${program.name}"`;

    for (const app of applications) {
      // ── HARD checks ──────────────────────────────────────────────────────
      let item: RewardItemContext | undefined;
      if (app.itemIndex !== undefined && app.itemIndex !== null) {
        item = tx.items[app.itemIndex];
        if (!item) {
          errors.push(`${prefix}: itemIndex ${app.itemIndex} is out of range`);
          continue;
        }
      }

      if (app.type === RewardEventType.CARD_ISSUED) {
        if (cardIssued) {
          errors.push(
            `${prefix}: CARD_ISSUED may appear only once per transaction`,
          );
          continue;
        }
        cardIssued = true;
        validated.push({
          type: app.type,
          slotKey: null,
          slotLabel: null,
          itemIndex: null,
          productName: null,
          discountAmount: null,
          warnings: [],
        });
        continue;
      }

      if (
        app.type !== RewardEventType.STAMP_ADDED &&
        app.type !== RewardEventType.REWARD_REDEEMED
      ) {
        errors.push(
          `${prefix}: unsupported application type ${String(app.type)}`,
        );
        continue;
      }

      const slotKey = app.slotKey ?? '';
      if (!slotKey) {
        errors.push(`${prefix}: ${app.type} requires slotKey`);
        continue;
      }
      if (usedSlots.has(slotKey)) {
        errors.push(
          `${prefix}: slot "${slotKey}" may be applied only once per transaction`,
        );
        continue;
      }
      usedSlots.add(slotKey);

      if (app.type === RewardEventType.STAMP_ADDED) {
        if (item && !onePerVisit) {
          const used = (stampsPerItem.get(item.index) ?? 0) + 1;
          if (used > item.quantity) {
            errors.push(
              `${prefix}: item ${item.index} has quantity ${item.quantity} and cannot earn ${used} item stamps`,
            );
            continue;
          }
          stampsPerItem.set(item.index, used);
        }
      } else {
        if (redeemed) {
          errors.push(
            `${prefix}: only one REWARD_REDEEMED is allowed per transaction`,
          );
          continue;
        }
        redeemed = true;
        if (!item) {
          errors.push(`${prefix}: REWARD_REDEEMED requires itemIndex`);
          continue;
        }
      }

      // ── SOFT checks (warnings) ───────────────────────────────────────────
      const warnings: string[] = [];
      const slot = slotsByKey.get(slotKey);
      const itemLabel = item
        ? `item ${item.index} (${item.productName ?? item.productId})`
        : '';

      if (!slot) {
        warnings.push(`slot "${slotKey}" is no longer in the program config`);
      } else if (app.type === RewardEventType.STAMP_ADDED) {
        if (slot.kind !== 'STAMP') {
          warnings.push(`slot "${slotKey}" is no longer a STAMP slot`);
        } else if (onePerVisit) {
          // Mode may have changed between an offline sale and its sync.
          visitStamps += 1;
          if (visitStamps > 1)
            warnings.push(
              'ONE_PER_VISIT allows only one stamp per transaction',
            );
          if (item)
            warnings.push(
              `slot "${slotKey}" is ONE_PER_VISIT; the itemIndex was ignored`,
            );
        } else if (!slot.condition) {
          warnings.push(
            `slot "${slotKey}" has no condition under the current config`,
          );
        } else if (slot.condition.type === 'TRANSACTION_MIN_TOTAL') {
          if (tx.total < slot.condition.minTotal - MONEY_EPSILON) {
            warnings.push(
              `transaction total ${tx.total} is below the slot minimum of ${slot.condition.minTotal}`,
            );
          }
        } else if (!item) {
          warnings.push(
            `slot "${slotKey}" has an item condition but no itemIndex was sent`,
          );
        } else if (!itemMeetsCondition(slot.condition, item)) {
          warnings.push(
            `${itemLabel} does not meet the current condition of slot "${slotKey}"`,
          );
        }
      } else if (slot.kind !== 'MILESTONE') {
        warnings.push(`slot "${slotKey}" is no longer a MILESTONE slot`);
      } else if (item) {
        const { reward } = slot;
        if (
          !nameIn(item.categoryName, reward.categoryNames) ||
          !nameIn(item.sizeName, reward.sizeNames)
        ) {
          warnings.push(
            `${itemLabel} is not eligible for "${slot.label}" under the current config`,
          );
        }
        const max = computeMaxRedemption(reward, item.unitPrice);
        const discount = app.discountAmount ?? 0;
        if (discount > max + MONEY_EPSILON) {
          warnings.push(
            `discount ${discount} exceeds the computed maximum ${max} for ${itemLabel}`,
          );
        }
      }

      validated.push({
        type: app.type,
        slotKey,
        slotLabel: slot?.label ?? slotKey,
        itemIndex: item ? item.index : null,
        productName: item?.productName ?? null,
        discountAmount:
          app.type === RewardEventType.REWARD_REDEEMED
            ? round2(app.discountAmount ?? 0)
            : null,
        warnings,
      });
    }

    if (errors.length) throw new BadRequestException(errors);
    return validated;
  }

  toEvents(
    validated: ValidatedRewardApplication[],
    base: RewardEventBase,
  ): RewardEventDraft[] {
    return validated.map((v) => ({
      ...base,
      type: v.type,
      slotKey: v.slotKey,
      slotLabel: v.slotLabel,
      itemIndex: v.itemIndex,
      productName: v.productName,
      discountAmount: v.discountAmount,
      validationWarnings: [...(base.validationWarnings ?? []), ...v.warnings],
    }));
  }

  describe(config: unknown): string {
    const { slots } = asConfig(config);
    const stamps = slots.filter((s) => s.kind === 'STAMP').length;
    const milestones = slots.filter((s) => s.kind === 'MILESTONE').length;
    return `${stamps} stamp${stamps === 1 ? '' : 's'}, ${milestones} milestone${milestones === 1 ? '' : 's'}`;
  }
}
