import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BILLING_LOCK_ALLOWED_KEY } from '../decorators/allow-when-billing-locked.decorator';

const STORE_ROLES = ['STORE_ADMIN', 'ADMIN', 'CASHIER'];

// Runs after AccountStatusGuard. `request.user.billingStatus` is derived fresh
// per request by JwtStrategy (and only when billing is enabled), so paying
// unlocks on the very next request. Deactivation takes priority: a store that
// is not ACTIVE is handled entirely by AccountStatusGuard.
@Injectable()
export class BillingStatusGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();
    if (!user || !STORE_ROLES.includes(user.role)) return true;
    if (user.accountStatus && user.accountStatus !== 'ACTIVE') return true;

    const billing = user.billingStatus;
    if (!billing || billing.status !== 'LOCKED') return true;

    const allowed = this.reflector.getAllAndOverride<boolean>(BILLING_LOCK_ALLOWED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (allowed) return true;

    throw new ForbiddenException({
      code: 'SUBSCRIPTION_LOCKED',
      message: "This store's subscription is overdue. Please settle the invoice to continue.",
      billing: { amountCentavos: billing.amountCentavos, dueAt: billing.dueAt, invoiceId: billing.openInvoiceId },
    });
  }
}
