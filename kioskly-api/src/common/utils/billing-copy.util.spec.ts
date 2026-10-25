import { describeStoreView } from './billing-copy.util';
import { BillingStatusResult } from './billing-status.util';

const m = (y: number, mo: number, d: number) => new Date(Date.UTC(y, mo - 1, d) - 8 * 60 * 60 * 1000);

const result = (over: Partial<BillingStatusResult>): BillingStatusResult => ({
  status: 'DUE',
  enforcement: true,
  amountCentavos: 150000,
  dueAt: m(2026, 10, 16),
  graceEndsAt: m(2026, 10, 23),
  daysLeft: 3,
  daysOverdue: 4,
  trialEndsAt: m(2026, 10, 16),
  paidThroughAt: null,
  nextBillingAt: m(2026, 11, 16),
  openInvoiceId: 'inv-1',
  verificationPending: false,
  lastClaimRejectedReason: null,
  claimHoldEndsAt: null,
  upcomingDueAt: null,
  daysUntilDue: null,
  ...over,
});

describe('describeStoreView', () => {
  it.each(['EXEMPT', 'NOT_ACTIVATED', 'TRIAL', 'ACTIVE'] as const)('%s shows nothing', (status) => {
    expect(describeStoreView(result({ status }), 'admin').variant).toBe('none');
  });

  it('DUE admin gets a banner with a pay action, amount and days left', () => {
    const v = describeStoreView(result({}), 'admin');
    expect(v.variant).toBe('banner');
    expect(v.showPayAction).toBe(true);
    expect(v.title).toContain('3 days left');
    expect(v.body).toContain('₱1,500.00');
  });

  it('DUE cashier gets the contact-admin copy and no pay action', () => {
    const v = describeStoreView(result({}), 'cashier');
    expect(v.body).toContain('ask your store admin');
    expect(v.showPayAction).toBe(false);
  });

  it('DUE cashier also sees the days left before the lock date', () => {
    const v = describeStoreView(result({}), 'cashier');
    expect(v.title).toBe('Subscription due — 3 days left');
    expect(v.body).toBe("Your store's subscription is due. Please ask your store admin to pay before Oct 23, 2026.");
    expect(describeStoreView(result({ daysLeft: 1 }), 'cashier').title).toBe('Subscription due — 1 day left');
  });

  it('DUE cashier past grace with enforcement off sees overdue, no lock date', () => {
    const v = describeStoreView(result({ daysLeft: 0, enforcement: false }), 'cashier');
    expect(v.title).toBe('Subscription overdue');
    expect(v.body).toBe("Your store's subscription is overdue. Please contact your store admin.");
  });

  it('LOCKED is a lock view; cashier copy says overdue', () => {
    expect(describeStoreView(result({ status: 'LOCKED' }), 'admin').variant).toBe('lock');
    const v = describeStoreView(result({ status: 'LOCKED' }), 'cashier');
    expect(v.body).toContain('overdue');
    expect(v.showPayAction).toBe(false);
  });

  it('verificationPending shows the awaiting-verification title', () => {
    const v = describeStoreView(result({ verificationPending: true }), 'admin');
    expect(v.title).toBe('Payment submitted, awaiting verification');
    expect(v.showPayAction).toBe(false);
  });

  it('a rejected claim reason is shown to store admins', () => {
    const v = describeStoreView(result({ lastClaimRejectedReason: 'Reference not found' }), 'admin');
    expect(v.body).toContain('Your payment claim was not accepted: Reference not found');
    expect(v.showPayAction).toBe(true);
  });

  describe('reminder before the due date', () => {
    const upcoming = (over: Partial<BillingStatusResult> = {}) =>
      result({ status: 'ACTIVE', upcomingDueAt: m(2026, 11, 1), daysUntilDue: 7, graceEndsAt: null, daysLeft: null, ...over });

    it('admin gets a banner with the due date, days until due, amount and Pay now', () => {
      const v = describeStoreView(upcoming(), 'admin');
      expect(v).toEqual({
        variant: 'banner',
        title: 'Subscription due on Nov 1, 2026 — 7 days left',
        body: '₱1,500.00 is due on Nov 1, 2026. Pay now to stay ahead.',
        showPayAction: true,
      });
    });

    it('one day before says "1 day left"', () => {
      expect(describeStoreView(upcoming({ daysUntilDue: 1 }), 'admin').title).toBe('Subscription due on Nov 1, 2026 — 1 day left');
    });

    it('cashier gets the reminder without Pay now', () => {
      expect(describeStoreView(upcoming(), 'cashier')).toEqual({
        variant: 'banner',
        title: 'Subscription due on Nov 1, 2026 — 7 days left',
        body: "Please ask your store admin to pay on or before Nov 1, 2026.",
        showPayAction: false,
      });
    });

    it('during a trial too', () => {
      expect(describeStoreView(upcoming({ status: 'TRIAL' }), 'admin').variant).toBe('banner');
    });

    it('a pending "I\'ve paid" claim shows awaiting verification instead', () => {
      const v = describeStoreView(upcoming({ verificationPending: true }), 'admin');
      expect(v.title).toBe('Payment submitted, awaiting verification');
      expect(v.showPayAction).toBe(false);
    });
  });
});
