import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ALLOW_IN_GRACE_PERIOD_KEY } from '../decorators/allow-in-grace-period.decorator';

// Runs after JwtAuthGuard/RolesGuard on every authenticated request.
// `request.user.accountStatus` is computed fresh on every request by
// JwtStrategy.validate() (see auth/strategies/jwt.strategy.ts), so a
// mid-session deactivation or an expiring grace period takes effect on the
// very next request without any token invalidation.
@Injectable()
export class AccountStatusGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();

    // No user on the request (e.g. a @Public() route that JwtAuthGuard let
    // through without running the strategy) — nothing to check.
    if (!user) return true;

    // PLATFORM_ADMIN is never tied to a Company/Tenant — always exempt.
    if (user.role === 'PLATFORM_ADMIN') return true;

    const status = user.accountStatus;

    // ACTIVE, or no accountStatus at all (e.g. PLATFORM_ADMIN, or a user
    // whose JWT carries neither tenantId nor companyId) — pass through.
    if (!status || status === 'ACTIVE') return true;

    if (status === 'DEACTIVATED') {
      // Reuses the same 401 handling the portals/mobile already have for
      // forced logout — no new status code.
      throw new UnauthorizedException();
    }

    // GRACE_PERIOD
    const allowed = this.reflector.getAllAndOverride<boolean>(
      ALLOW_IN_GRACE_PERIOD_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (allowed) return true;

    throw new ForbiddenException({
      code: 'ACCOUNT_GRACE_PERIOD',
      message:
        'This account is in its post-deactivation grace period. This action is not available until it is reactivated.',
    });
  }
}
