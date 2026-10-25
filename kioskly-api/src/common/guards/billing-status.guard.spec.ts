import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BillingStatusGuard } from './billing-status.guard';
import { BILLING_LOCK_ALLOWED_KEY } from '../decorators/allow-when-billing-locked.decorator';
import { TransactionsController } from '../../transactions/transactions.controller';
import { ExpensesController } from '../../expenses/expenses.controller';
import { InventoryController } from '../../inventory/inventory.controller';
import { SubmittedReportsController } from '../../submitted-reports/submitted-reports.controller';
import { SubmittedInventoryReportsController } from '../../submitted-inventory-reports/submitted-inventory-reports.controller';
import { UserShiftReportsController } from '../../user-shift-reports/user-shift-reports.controller';
import { UserShiftInventoryReportsController } from '../../user-shift-inventory-reports/user-shift-inventory-reports.controller';
import { AuthController } from '../../auth/auth.controller';
import { StoreBillingController } from '../../billing/controllers/store-billing.controller';

const locked = {
  status: 'LOCKED',
  amountCentavos: 150000,
  dueAt: new Date('2026-10-15T16:00:00.000Z'),
  openInvoiceId: 'inv-1',
};

function ctx(user: unknown, allowed = false): ExecutionContext {
  const handler = () => {};
  const cls = class {};
  if (allowed) Reflect.defineMetadata(BILLING_LOCK_ALLOWED_KEY, true, handler);
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => handler,
    getClass: () => cls,
  } as unknown as ExecutionContext;
}

describe('BillingStatusGuard', () => {
  const guard = new BillingStatusGuard(new Reflector());
  const storeUser = (over: Record<string, unknown> = {}) => ({ role: 'CASHIER', accountStatus: 'ACTIVE', billingStatus: locked, ...over });

  it('blocks a normal route with SUBSCRIPTION_LOCKED and billing details', () => {
    let err: ForbiddenException | undefined;
    try {
      guard.canActivate(ctx(storeUser()));
    } catch (e) {
      err = e as ForbiddenException;
    }
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(err!.getResponse()).toEqual({
      code: 'SUBSCRIPTION_LOCKED',
      message: "This store's subscription is overdue. Please settle the invoice to continue.",
      billing: { amountCentavos: 150000, dueAt: locked.dueAt, invoiceId: 'inv-1' },
    });
  });

  it('allowlisted routes pass while LOCKED', () => {
    expect(guard.canActivate(ctx(storeUser(), true))).toBe(true);
  });

  it.each(['PLATFORM_ADMIN', 'COMPANY_ADMIN'])('%s passes', role => {
    expect(guard.canActivate(ctx(storeUser({ role })))).toBe(true);
  });

  it.each(['GRACE_PERIOD', 'DEACTIVATED'])('deactivation wins at the gate (%s)', accountStatus => {
    expect(guard.canActivate(ctx(storeUser({ accountStatus })))).toBe(true);
  });

  it.each([undefined, { ...locked, status: 'DUE' }, { ...locked, status: 'EXEMPT' }])('not locked → pass (%#)', billingStatus => {
    expect(guard.canActivate(ctx(storeUser({ billingStatus })))).toBe(true);
  });

  it('no user (public route) → pass', () => {
    expect(guard.canActivate(ctx(undefined))).toBe(true);
  });
});

describe('@AllowWhenBillingLocked allowlist', () => {
  // Handler metadata, or the controller's class-level metadata (as the guard reads it).
  const allowed = (target: any, method?: string) =>
    (method ? Reflect.getMetadata(BILLING_LOCK_ALLOWED_KEY, target.prototype[method]) === true : false) ||
    Reflect.getMetadata(BILLING_LOCK_ALLOWED_KEY, target) === true;

  it.each<[string, any, string]>([
    ['POST transactions', TransactionsController, 'create'],
    ['POST expenses', ExpensesController, 'create'],
    ['POST inventory/records', InventoryController, 'createRecord'],
    ['POST inventory/records/bulk', InventoryController, 'bulkCreateRecords'],
    ['POST submitted-reports', SubmittedReportsController, 'create'],
    ['POST submitted-inventory-reports', SubmittedInventoryReportsController, 'create'],
    ['POST user-shift-reports', UserShiftReportsController, 'create'],
    ['POST user-shift-inventory-reports', UserShiftInventoryReportsController, 'create'],
  ])('sync uploads pass while LOCKED (%s)', (_label, controller, method) => {
    expect(allowed(controller, method)).toBe(true);
  });

  it.each(['getAccountStatus', 'logout', 'changePassword', 'switchStore', 'getProfile'])('auth %s is allowed', method => {
    expect(allowed(AuthController, method)).toBe(true);
  });

  it('billing/me is allowed for the whole controller', () => {
    expect(allowed(StoreBillingController)).toBe(true);
  });

  it('ordinary operational reads are not allowlisted', () => {
    expect(allowed(TransactionsController, 'findAll')).toBe(false);
  });
});
