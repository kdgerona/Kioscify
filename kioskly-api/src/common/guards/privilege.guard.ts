import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PRIVILEGE_KEY, PrivilegeMetadata } from '../decorators/require-privilege.decorator';
import { hasPrivilege } from '../utils/privileges';

@Injectable()
export class PrivilegeGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const metadata = this.reflector.getAllAndOverride<PrivilegeMetadata | undefined>(
      PRIVILEGE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!metadata) return true;

    const { user } = context.switchToHttp().getRequest();

    // Only enforce for COMPANY_ADMIN — platform admins are unrestricted
    if (!user || user.role !== 'COMPANY_ADMIN') return true;

    const allowed = hasPrivilege(
      user.companyPrivileges ?? null,
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
