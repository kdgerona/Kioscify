import { SetMetadata } from '@nestjs/common';

// Marks a route as reachable while the caller's Company/Tenant is in
// GRACE_PERIOD (read-only wind-down window after deactivation). Routes
// without this decorator are blocked for GRACE_PERIOD callers by
// AccountStatusGuard — see kioskly-api/src/common/guards/account-status.guard.ts.
export const ALLOW_IN_GRACE_PERIOD_KEY = 'allowInGracePeriod';
export const AllowInGracePeriod = () =>
  SetMetadata(ALLOW_IN_GRACE_PERIOD_KEY, true);
