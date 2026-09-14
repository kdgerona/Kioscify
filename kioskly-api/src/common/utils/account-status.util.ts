// Number of days a Company/Tenant stays reachable (read-only) after
// deactivation before it is considered fully DEACTIVATED. Import this
// constant rather than hardcoding `15` elsewhere.
export const GRACE_PERIOD_DAYS = 15;

export type AccountStatus = 'ACTIVE' | 'GRACE_PERIOD' | 'DEACTIVATED';

/**
 * Account status is never persisted — it is derived on read from `isActive`
 * and `gracePeriodEndsAt`. A `gracePeriodEndsAt` that is exactly `now` (or in
 * the past) counts as expired, i.e. DEACTIVATED.
 */
export function computeAccountStatus(entity: {
  isActive: boolean;
  gracePeriodEndsAt: Date | null;
}): AccountStatus {
  if (entity.isActive) return 'ACTIVE';
  if (entity.gracePeriodEndsAt && entity.gracePeriodEndsAt > new Date()) return 'GRACE_PERIOD';
  return 'DEACTIVATED';
}

// DEACTIVATED > GRACE_PERIOD > ACTIVE — higher number wins when combining
// two independently-computed account statuses (e.g. a Company's and its
// Tenant's, or a Company's and its Brand-scoped Store's). Shared so every
// call site (brands.service.ts, jwt.strategy.ts, auth.service.ts, ...)
// agrees on the same priority order rather than keeping its own copy.
const STATUS_PRIORITY: Record<AccountStatus, number> = {
  ACTIVE: 0,
  GRACE_PERIOD: 1,
  DEACTIVATED: 2,
};

export function worstAccountStatus(a: AccountStatus, b: AccountStatus): AccountStatus {
  return STATUS_PRIORITY[b] > STATUS_PRIORITY[a] ? b : a;
}
