import {
  BillingConfigInput,
  DEFAULT_BILLING_CONFIG,
  OpenInvoiceInput,
  SubscriptionInput,
  computeBillingStatus,
} from './billing-status.util';

// Manila midnight for a calendar date.
const m = (y: number, mo: number, d: number) => new Date(Date.UTC(y, mo - 1, d) - 8 * 60 * 60 * 1000);

const on: BillingConfigInput = { ...DEFAULT_BILLING_CONFIG, billingEnabled: true };
const enforced: BillingConfigInput = { ...on, enforcementEnabled: true };

const baseSub: SubscriptionInput = {
  billingEnabled: true,
  priceCentavos: 150000,
  activatedAt: m(2026, 10, 1),
  trialStartAt: null,
  trialDays: null,
  nextBillingAt: m(2026, 10, 16),
  paidThroughAt: null,
  graceDaysOverride: null,
};

const invoice = (over: Partial<OpenInvoiceInput> = {}): OpenInvoiceInput => ({
  id: 'inv-1',
  dueAt: m(2026, 10, 16),
  amountCentavos: 150000,
  graceExtendedUntil: null,
  pendingClaimSubmittedAt: null,
  ...over,
});

describe('computeBillingStatus', () => {
  it('global off wins over store on', () => {
    expect(computeBillingStatus(DEFAULT_BILLING_CONFIG, baseSub, invoice(), m(2027, 1, 1)).status).toBe('EXEMPT');
  });

  it('treats a null config as global off', () => {
    expect(computeBillingStatus(null, baseSub, null, m(2027, 1, 1)).status).toBe('EXEMPT');
  });

  it.each([
    ['no subscription', null],
    ['not set up', { ...baseSub, billingEnabled: null }],
    ['exempt', { ...baseSub, billingEnabled: false }],
  ])('%s is EXEMPT', (_label, sub) => {
    expect(computeBillingStatus(on, sub as SubscriptionInput | null, null, m(2027, 1, 1)).status).toBe('EXEMPT');
  });

  it('activatedAt null is NOT_ACTIVATED', () => {
    expect(computeBillingStatus(on, { ...baseSub, activatedAt: null }, null, m(2027, 1, 1)).status).toBe('NOT_ACTIVATED');
  });

  it('is TRIAL before the trial ends', () => {
    const r = computeBillingStatus(on, baseSub, null, m(2026, 10, 10));
    expect(r.status).toBe('TRIAL');
    expect(r.trialEndsAt).toEqual(m(2026, 10, 16));
    expect(r.trialDaysLeft).toBe(6);
  });

  it('trialDaysLeft is only set during the trial', () => {
    expect(computeBillingStatus(on, baseSub, null, m(2026, 10, 15)).trialDaysLeft).toBe(1);
    expect(computeBillingStatus(on, { ...baseSub, paidThroughAt: m(2026, 11, 15) }, null, m(2026, 10, 10)).trialDaysLeft).toBeNull();
    expect(computeBillingStatus(on, baseSub, null, m(2026, 10, 20)).trialDaysLeft).toBeNull();
  });

  it('virtual due day 0 when the billing date passed and no invoice exists yet', () => {
    const r = computeBillingStatus(on, baseSub, null, m(2026, 10, 16));
    expect(r).toMatchObject({
      status: 'DUE',
      amountCentavos: 150000,
      dueAt: m(2026, 10, 16),
      graceEndsAt: m(2026, 10, 23),
      daysLeft: 7,
      openInvoiceId: null,
    });
  });

  it('day 6 is still DUE', () => {
    const r = computeBillingStatus(enforced, baseSub, invoice(), m(2026, 10, 22));
    expect(r.status).toBe('DUE');
    expect(r.daysLeft).toBe(1);
    expect(r.openInvoiceId).toBe('inv-1');
  });

  it('locks on day 7 with enforcement', () => {
    const r = computeBillingStatus(enforced, baseSub, invoice(), m(2026, 10, 23));
    expect(r.status).toBe('LOCKED');
    expect(r.daysOverdue).toBe(7);
  });

  it('enforcement off stays DUE past grace', () => {
    const r = computeBillingStatus(on, baseSub, invoice(), m(2026, 10, 23));
    expect(r.status).toBe('DUE');
    expect(r.daysOverdue).toBe(7);
  });

  it('an open invoice not yet due is ACTIVE', () => {
    const sub = { ...baseSub, paidThroughAt: m(2026, 11, 15), nextBillingAt: m(2026, 12, 16) };
    const r = computeBillingStatus(on, sub, invoice({ dueAt: m(2026, 11, 16) }), m(2026, 11, 10));
    expect(r.status).toBe('ACTIVE');
    expect(r.openInvoiceId).toBe('inv-1');
  });

  it('graceExtendedUntil keeps the store DUE', () => {
    const r = computeBillingStatus(enforced, baseSub, invoice({ graceExtendedUntil: m(2026, 10, 30) }), m(2026, 10, 25));
    expect(r.status).toBe('DUE');
    expect(r.graceEndsAt).toEqual(m(2026, 10, 30));
  });

  it('graceDaysOverride shortens grace', () => {
    const r = computeBillingStatus(enforced, { ...baseSub, graceDaysOverride: 3 }, invoice(), m(2026, 10, 19));
    expect(r.status).toBe('LOCKED');
  });

  it('a pending claim holds the lock for claimLockHoldDays', () => {
    const inv = invoice({ pendingClaimSubmittedAt: m(2026, 10, 23) });
    const held = computeBillingStatus(enforced, baseSub, inv, m(2026, 10, 24));
    expect(held.status).toBe('DUE');
    expect(held.verificationPending).toBe(true);
    const expired = computeBillingStatus(enforced, baseSub, inv, m(2026, 10, 26));
    expect(expired.status).toBe('LOCKED');
    expect(expired.verificationPending).toBe(true);
  });

  it('paidThroughAt set during the trial window is ACTIVE, not TRIAL', () => {
    const sub = { ...baseSub, paidThroughAt: m(2026, 11, 15), nextBillingAt: m(2026, 11, 16) };
    expect(computeBillingStatus(on, sub, null, m(2026, 10, 10)).status).toBe('ACTIVE');
  });

  it('computeBillingStatus treats 16:30Z as next Manila day', () => {
    const sub = { ...baseSub, paidThroughAt: m(2026, 11, 30), nextBillingAt: m(2026, 12, 1) };
    expect(computeBillingStatus(on, sub, null, new Date('2026-11-30T15:59:00Z')).status).toBe('ACTIVE');
    expect(computeBillingStatus(on, sub, null, new Date('2026-11-30T16:30:00Z')).status).toBe('DUE');
  });

  it('surfaces a rejected claim reason when no claim is pending', () => {
    const r = computeBillingStatus(on, baseSub, invoice({ lastRejectedClaimReason: 'Reference not found' }), m(2026, 10, 18));
    expect(r.lastClaimRejectedReason).toBe('Reference not found');
    expect(r.verificationPending).toBe(false);
  });

  it('defaults lastClaimRejectedReason to null', () => {
    expect(computeBillingStatus(on, baseSub, null, m(2026, 10, 18)).lastClaimRejectedReason).toBeNull();
  });

  it('reports when a pending claim stops holding off the lock', () => {
    const r = computeBillingStatus(enforced, baseSub, invoice({ pendingClaimSubmittedAt: m(2026, 10, 23) }), m(2026, 10, 24));
    expect(r.claimHoldEndsAt).toEqual(m(2026, 10, 26));
    expect(computeBillingStatus(enforced, baseSub, invoice(), m(2026, 10, 24)).claimHoldEndsAt).toBeNull();
  });
});

describe('computeBillingStatus — reminder before the due date', () => {
  const paidUp: SubscriptionInput = { ...baseSub, paidThroughAt: m(2026, 10, 31), nextBillingAt: m(2026, 11, 1) };

  it('defaults to a 7-day reminder window', () => {
    expect(DEFAULT_BILLING_CONFIG.reminderLeadDays).toBe(7);
  });

  it('within the window: stays ACTIVE, with the upcoming due date, days until due and price', () => {
    const r = computeBillingStatus(enforced, paidUp, null, new Date(m(2026, 10, 25).getTime() + 10 * 3600_000));
    expect(r.status).toBe('ACTIVE');
    expect(r.upcomingDueAt).toEqual(m(2026, 11, 1));
    expect(r.daysUntilDue).toBe(7);
    expect(r.amountCentavos).toBe(150000);
    expect(r.graceEndsAt).toBeNull();
  });

  it('the day before the window opens has no reminder', () => {
    const r = computeBillingStatus(enforced, paidUp, null, new Date(m(2026, 10, 25).getTime() - 1));
    expect(r.upcomingDueAt).toBeNull();
    expect(r.daysUntilDue).toBeNull();
  });

  it('an invoice issued early is the upcoming one, with its own amount', () => {
    const early = invoice({ id: 'inv-2', dueAt: m(2026, 11, 1), amountCentavos: 99900 });
    const r = computeBillingStatus(enforced, paidUp, early, m(2026, 10, 30));
    expect(r.status).toBe('ACTIVE');
    expect(r.upcomingDueAt).toEqual(m(2026, 11, 1));
    expect(r.daysUntilDue).toBe(2);
    expect(r.amountCentavos).toBe(99900);
    expect(r.openInvoiceId).toBe('inv-2');
  });

  it('reminderLeadDays 0 turns the reminder off', () => {
    const r = computeBillingStatus({ ...enforced, reminderLeadDays: 0 }, paidUp, null, m(2026, 10, 31));
    expect(r.upcomingDueAt).toBeNull();
  });

  it('once due, there is no upcoming reminder (the due banner takes over)', () => {
    const r = computeBillingStatus(enforced, paidUp, null, m(2026, 11, 1));
    expect(r.status).toBe('DUE');
    expect(r.upcomingDueAt).toBeNull();
  });
});

describe('computeBillingStatus — next billing date inside an already-paid period', () => {
  // November was paid (paid through Nov 30) but the stored next billing date still says Nov 1
  const behind: SubscriptionInput = { ...baseSub, paidThroughAt: m(2026, 11, 30), nextBillingAt: m(2026, 11, 1) };

  it('no reminder for the paid month', () => {
    const r = computeBillingStatus(enforced, behind, null, m(2026, 10, 29));
    expect(r.status).toBe('ACTIVE');
    expect(r.upcomingDueAt).toBeNull();
    expect(r.nextBillingAt).toEqual(m(2026, 12, 1));
  });

  it('not due once the stale date passes', () => {
    const r = computeBillingStatus(enforced, behind, null, m(2026, 11, 10));
    expect(r.status).toBe('ACTIVE');
    expect(r.dueAt).toBeNull();
  });

  it('the reminder and due date move to the day after the paid period', () => {
    expect(computeBillingStatus(enforced, behind, null, m(2026, 11, 26)).upcomingDueAt).toEqual(m(2026, 12, 1));
    expect(computeBillingStatus(enforced, behind, null, m(2026, 12, 2)).status).toBe('DUE');
  });
});
