import { SetMetadata } from '@nestjs/common';

// Marks a route as reachable by a Store Admin whose store was switched off but
// can be brought back by paying ("Your subscription has ended" → Resubscribe;
// see common/utils/resubscribe.util.ts). Past the grace period AccountStatusGuard
// lets such a caller through only on these routes (billing, account status,
// logout, change password); everything else stays blocked, as before.
export const ALLOW_WHEN_SUBSCRIPTION_ENDED_KEY = 'allowWhenSubscriptionEnded';
export const AllowWhenSubscriptionEnded = () =>
  SetMetadata(ALLOW_WHEN_SUBSCRIPTION_ENDED_KEY, true);
