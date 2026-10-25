import { randomBytes, randomInt } from 'crypto';
import { getZonedMonthKey } from '../common/utils/timezone';

// No 0/O/1/I so numbers read cleanly over the phone or on a receipt.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** KSF-YYYYMM-XXXXX, where YYYYMM is the Manila month of the billing period. */
export function generateInvoiceNumber(periodStart: Date): string {
  const month = getZonedMonthKey(periodStart).replace('-', '');
  let suffix = '';
  for (let i = 0; i < 5; i++) suffix += ALPHABET[randomInt(ALPHABET.length)];
  return `KSF-${month}-${suffix}`;
}

/** Unguessable token for the public /pay/<token> page. */
export function generatePayToken(): string {
  return randomBytes(24).toString('base64url');
}
