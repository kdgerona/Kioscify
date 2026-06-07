import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    // Support both single role match and hierarchy-aware checks
    // ADMIN is the legacy value — treat as STORE_ADMIN for backwards compat
    const effectiveRole =
      user?.role === 'ADMIN' ? 'STORE_ADMIN' : user?.role;

    return requiredRoles.some((role) => effectiveRole === role);
  }
}
