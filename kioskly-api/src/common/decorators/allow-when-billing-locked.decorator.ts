import { SetMetadata } from '@nestjs/common';

export const BILLING_LOCK_ALLOWED_KEY = 'allowWhenBillingLocked';

/**
 * Route stays reachable while the store's subscription is LOCKED: auth,
 * billing status / pay, and every offline-sync upload (sales and reports
 * created before the lock must never be lost).
 */
export const AllowWhenBillingLocked = () => SetMetadata(BILLING_LOCK_ALLOWED_KEY, true);
