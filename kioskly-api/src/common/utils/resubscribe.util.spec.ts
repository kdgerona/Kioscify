import { canResubscribe, ResubscribeInput } from './resubscribe.util';

const eligible: ResubscribeInput = {
  role: 'STORE_ADMIN',
  storeStatus: 'DEACTIVATED',
  companyStatus: 'ACTIVE',
  billingEnabledGlobally: true,
  subscription: { billingEnabled: true, priceCentavos: 150000 },
};

describe('canResubscribe', () => {
  it('lets a Store Admin of a switched-off, billed store resubscribe', () => {
    expect(canResubscribe(eligible)).toBe(true);
    expect(canResubscribe({ ...eligible, role: 'ADMIN' })).toBe(true);
  });

  it('applies during the grace period too', () => {
    expect(canResubscribe({ ...eligible, storeStatus: 'GRACE_PERIOD' })).toBe(true);
  });

  it('works for a store without a Company', () => {
    expect(canResubscribe({ ...eligible, companyStatus: null })).toBe(true);
  });

  it('is never needed for an active store', () => {
    expect(canResubscribe({ ...eligible, storeStatus: 'ACTIVE' })).toBe(false);
  });

  it('is Store Admin only', () => {
    expect(canResubscribe({ ...eligible, role: 'CASHIER' })).toBe(false);
  });

  it('is not offered when the whole Company is switched off', () => {
    expect(canResubscribe({ ...eligible, companyStatus: 'DEACTIVATED' })).toBe(false);
    expect(canResubscribe({ ...eligible, companyStatus: 'GRACE_PERIOD' })).toBe(false);
  });

  it('needs something to pay: billing on globally, store billed, price set', () => {
    expect(canResubscribe({ ...eligible, billingEnabledGlobally: false })).toBe(false);
    expect(canResubscribe({ ...eligible, subscription: null })).toBe(false);
    expect(canResubscribe({ ...eligible, subscription: { billingEnabled: false, priceCentavos: 150000 } })).toBe(false);
    expect(canResubscribe({ ...eligible, subscription: { billingEnabled: null, priceCentavos: 150000 } })).toBe(false);
    expect(canResubscribe({ ...eligible, subscription: { billingEnabled: true, priceCentavos: null } })).toBe(false);
  });
});
