import { selectPaymentKind } from './payment-kind.util';

const base = { providerMode: 'test' as const, qrphCollectedThisMonthCentavos: 0, amountCentavos: 150000, limitCentavos: 1000000, hasFallback: true };

describe('selectPaymentKind', () => {
  it('uses PayMongo while under the limit', () => {
    expect(selectPaymentKind(base)).toBe('paymongo');
  });
  it('an unconfigured provider uses the fallback QR when there is one', () => {
    expect(selectPaymentKind({ ...base, providerMode: 'unconfigured' })).toBe('fallback');
  });
  it('an unconfigured provider without a fallback is unavailable', () => {
    expect(selectPaymentKind({ ...base, providerMode: 'unconfigured', hasFallback: false })).toBe('unavailable');
  });
  it('switches to the fallback when this payment would exceed the limit', () => {
    expect(selectPaymentKind({ ...base, qrphCollectedThisMonthCentavos: 900000 })).toBe('fallback');
  });
  it('exactly reaching the limit is still PayMongo', () => {
    expect(selectPaymentKind({ ...base, qrphCollectedThisMonthCentavos: 850000 })).toBe('paymongo');
  });
  it('over the limit without a fallback still offers PayMongo (the limit is advisory)', () => {
    expect(selectPaymentKind({ ...base, qrphCollectedThisMonthCentavos: 900000, hasFallback: false })).toBe('paymongo');
  });
});
