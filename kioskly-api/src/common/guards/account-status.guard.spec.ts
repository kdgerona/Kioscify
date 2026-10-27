import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccountStatusGuard } from './account-status.guard';

function makeContext(user: unknown, handlerMeta = false): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => (handlerMeta ? handlerWithMeta : handlerWithoutMeta),
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

// Distinct function identities so Reflector.getAllAndOverride can be mocked
// per-handler without depending on real SetMetadata wiring.
function handlerWithMeta() {}
function handlerWithoutMeta() {}

describe('AccountStatusGuard', () => {
  let guard: AccountStatusGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new AccountStatusGuard(reflector);
  });

  it('passes through when there is no user on the request (e.g. a @Public() route)', () => {
    expect(guard.canActivate(makeContext(undefined))).toBe(true);
  });

  it('always exempts PLATFORM_ADMIN, regardless of accountStatus', () => {
    const ctx = makeContext({
      role: 'PLATFORM_ADMIN',
      accountStatus: 'DEACTIVATED',
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('passes through when accountStatus is ACTIVE', () => {
    const ctx = makeContext({ role: 'STORE_ADMIN', accountStatus: 'ACTIVE' });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('passes through when accountStatus is undefined', () => {
    const ctx = makeContext({ role: 'STORE_ADMIN' });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('throws UnauthorizedException when accountStatus is DEACTIVATED', () => {
    const ctx = makeContext({
      role: 'STORE_ADMIN',
      accountStatus: 'DEACTIVATED',
    });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException for DEACTIVATED even on an @AllowInGracePeriod() route', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    const ctx = makeContext(
      { role: 'STORE_ADMIN', accountStatus: 'DEACTIVATED' },
      true,
    );
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('throws ForbiddenException with code ACCOUNT_GRACE_PERIOD when GRACE_PERIOD and route is not allowlisted', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const ctx = makeContext({
      role: 'STORE_ADMIN',
      accountStatus: 'GRACE_PERIOD',
    });

    let thrown: ForbiddenException | undefined;
    try {
      guard.canActivate(ctx);
    } catch (e) {
      thrown = e as ForbiddenException;
    }

    expect(thrown).toBeInstanceOf(ForbiddenException);
    expect(thrown?.getResponse()).toMatchObject({
      code: 'ACCOUNT_GRACE_PERIOD',
    });
  });

  it('passes through when GRACE_PERIOD and the route is marked @AllowInGracePeriod()', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    const ctx = makeContext(
      { role: 'STORE_ADMIN', accountStatus: 'GRACE_PERIOD' },
      true,
    );
    expect(guard.canActivate(ctx)).toBe(true);
  });

  describe('resubscribe (canResubscribe set by JwtStrategy)', () => {
    // Answers per metadata key, so the two allowlists can be told apart
    function routeAllows(keys: string[]) {
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockImplementation((key: unknown) => (keys.includes(key as string) ? true : undefined));
    }

    it('lets a DEACTIVATED store\'s eligible Store Admin reach @AllowWhenSubscriptionEnded routes', () => {
      routeAllows(['allowWhenSubscriptionEnded']);
      const ctx = makeContext({ role: 'STORE_ADMIN', accountStatus: 'DEACTIVATED', canResubscribe: true });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('past the grace period, keeps grace-only routes (e.g. data export) closed', () => {
      routeAllows(['allowInGracePeriod']);
      const ctx = makeContext({ role: 'STORE_ADMIN', accountStatus: 'DEACTIVATED', canResubscribe: true });
      expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
    });

    it('during the grace period, grace-only routes (e.g. data export) stay open as before', () => {
      routeAllows(['allowInGracePeriod']);
      const ctx = makeContext({ role: 'STORE_ADMIN', accountStatus: 'GRACE_PERIOD', canResubscribe: true });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('still blocks every other route', () => {
      routeAllows([]);
      const ctx = makeContext({ role: 'STORE_ADMIN', accountStatus: 'DEACTIVATED', canResubscribe: true });
      expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
    });

    it('opens billing during the grace period too', () => {
      routeAllows(['allowWhenSubscriptionEnded']);
      const ctx = makeContext({ role: 'STORE_ADMIN', accountStatus: 'GRACE_PERIOD', canResubscribe: true });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('does not open billing routes for anyone else', () => {
      routeAllows(['allowWhenSubscriptionEnded']);
      const ctx = makeContext({ role: 'STORE_ADMIN', accountStatus: 'DEACTIVATED' });
      expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
    });
  });
});
