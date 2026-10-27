import { AccountStatus } from './account-status.util';

const STORE_ADMIN_ROLES = ['STORE_ADMIN', 'ADMIN'];

export interface ResubscribeInput {
  role: string;
  /** The store's own status (its Company's is passed separately) */
  storeStatus: AccountStatus;
  /** null when the store has no Company */
  companyStatus: AccountStatus | null;
  billingEnabledGlobally: boolean;
  subscription: { billingEnabled: boolean | null; priceCentavos: number | null } | null;
}

/**
 * Whether this user can bring an inactive store back by paying for it
 * ("Your subscription has ended" → Resubscribe).
 *
 * Only a Store Admin, only when the store itself was switched off (grace
 * period or past it), and only when paying can actually fix it: the parent
 * Company is still active (reactivating one store can't undo a Company
 * deactivation) and the store is billed with a price, so there is something
 * to pay. Everyone else keeps the existing deactivation behaviour.
 */
export function canResubscribe(input: ResubscribeInput): boolean {
  if (!STORE_ADMIN_ROLES.includes(input.role)) return false;
  if (input.storeStatus === 'ACTIVE') return false;
  if (input.companyStatus && input.companyStatus !== 'ACTIVE') return false;
  if (!input.billingEnabledGlobally) return false;
  return input.subscription?.billingEnabled === true && (input.subscription.priceCentavos ?? 0) > 0;
}
