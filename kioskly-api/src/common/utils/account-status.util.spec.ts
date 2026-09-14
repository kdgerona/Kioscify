import { computeAccountStatus, GRACE_PERIOD_DAYS } from './account-status.util';

describe('GRACE_PERIOD_DAYS', () => {
  it('is 15 days', () => {
    expect(GRACE_PERIOD_DAYS).toBe(15);
  });
});

describe('computeAccountStatus', () => {
  const NOW = new Date('2026-07-01T12:00:00.000Z');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns ACTIVE when isActive is true, regardless of gracePeriodEndsAt', () => {
    expect(computeAccountStatus({ isActive: true, gracePeriodEndsAt: null })).toBe('ACTIVE');
    expect(
      computeAccountStatus({
        isActive: true,
        gracePeriodEndsAt: new Date('2020-01-01T00:00:00.000Z'),
      }),
    ).toBe('ACTIVE');
  });

  it('returns GRACE_PERIOD when inactive and gracePeriodEndsAt is in the future', () => {
    const future = new Date(NOW.getTime() + 1000);
    expect(computeAccountStatus({ isActive: false, gracePeriodEndsAt: future })).toBe(
      'GRACE_PERIOD',
    );
  });

  it('returns DEACTIVATED when inactive and gracePeriodEndsAt is null', () => {
    expect(computeAccountStatus({ isActive: false, gracePeriodEndsAt: null })).toBe(
      'DEACTIVATED',
    );
  });

  it('returns DEACTIVATED when inactive and gracePeriodEndsAt is in the past', () => {
    const past = new Date(NOW.getTime() - 1000);
    expect(computeAccountStatus({ isActive: false, gracePeriodEndsAt: past })).toBe(
      'DEACTIVATED',
    );
  });

  it('boundary: gracePeriodEndsAt exactly now counts as expired (DEACTIVATED)', () => {
    expect(
      computeAccountStatus({ isActive: false, gracePeriodEndsAt: new Date(NOW.getTime()) }),
    ).toBe('DEACTIVATED');
  });

  it('boundary: gracePeriodEndsAt one millisecond after now is still GRACE_PERIOD', () => {
    expect(
      computeAccountStatus({ isActive: false, gracePeriodEndsAt: new Date(NOW.getTime() + 1) }),
    ).toBe('GRACE_PERIOD');
  });
});
