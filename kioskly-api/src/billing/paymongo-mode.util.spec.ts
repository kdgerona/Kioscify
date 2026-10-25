import { getPaymongoMode, isSecretConfigured } from './paymongo-mode.util';

describe('getPaymongoMode', () => {
  it.each([
    ['sk_test_abc', 'test'],
    ['sk_live_abc', 'live'],
    [undefined, 'unconfigured'],
    ['', 'unconfigured'],
    ['garbage', 'unconfigured'],
  ])('%s → %s', (key, mode) => {
    expect(getPaymongoMode(key)).toBe(mode);
  });
});

describe('isSecretConfigured', () => {
  it.each([
    ['whsk_abc', true],
    [undefined, false],
    ['', false],
    ['   ', false],
    ['<PAYMONGO_WEBHOOK_SECRET>', false],
  ])('%s → %s', (secret, expected) => {
    expect(isSecretConfigured(secret)).toBe(expected);
  });
});
