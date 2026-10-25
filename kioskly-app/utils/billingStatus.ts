import type { BillingMe, BillingStatus } from "../contexts/BillingContext";

/**
 * Offline lock policy (decision 4): when the API is unreachable the kiosk
 * enforces from the last status it cached — once that status's lock moment
 * (`cache.validUntil` = due date + grace) passes, it locks itself. It only
 * unlocks after an online check says the store is no longer locked.
 * Known limitation: a device clock moved backwards defeats the offline lock;
 * the server still enforces on every request.
 */
export function effectiveBillingStatus(
  me: BillingMe | null,
  fromCache: boolean,
  now: Date = new Date(),
  /** Login / account-status reported SUBSCRIPTION_LOCKED; used until billing/me loads. */
  serverSaysLocked = false,
): BillingStatus | null {
  if (!me) return serverSaysLocked ? "LOCKED" : null;
  if (!fromCache) return me.status.status;
  const { enforcement, validUntil } = me.cache;
  if (enforcement && validUntil && now.getTime() >= new Date(validUntil).getTime()) return "LOCKED";
  return me.status.status;
}
