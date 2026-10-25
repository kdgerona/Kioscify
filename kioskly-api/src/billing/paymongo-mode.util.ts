export type PaymongoMode = 'test' | 'live' | 'unconfigured';

/** Mode is inferred from the secret key prefix; the key itself never leaves the server. */
export function getPaymongoMode(secretKey?: string): PaymongoMode {
  if (secretKey?.startsWith('sk_test_')) return 'test';
  if (secretKey?.startsWith('sk_live_')) return 'live';
  return 'unconfigured';
}

/** A real value — not blank and not an unfilled `<PLACEHOLDER>` copied from .env.example. */
export function isSecretConfigured(secret?: string): secret is string {
  const v = secret?.trim();
  return !!v && !/^<.*>$/.test(v);
}
