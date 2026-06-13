import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { STORE_PRIVILEGE_KEY, StorePrivilegeMetadata } from '../decorators/require-store-privilege.decorator';
import { hasPrivilege } from '../utils/privileges';

@Injectable()
export class StorePrivilegeGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const metadata = this.reflector.getAllAndOverride<StorePrivilegeMetadata | undefined>(
      STORE_PRIVILEGE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!metadata) return true;

    const { user } = context.switchToHttp().getRequest();

    // Only enforce for STORE_ADMIN / ADMIN — platform and company admins are unrestricted
    if (!user || !['STORE_ADMIN', 'ADMIN'].includes(user.role)) return true;

    const allowed = hasPrivilege(
      user.storePrivileges ?? null,
      metadata.section,
      metadata.level,
    );

    if (!allowed) {
      throw new ForbiddenException(
        `Insufficient privilege: requires '${metadata.level}' on '${metadata.section}'`,
      );
    }

    return true;
  }
}
