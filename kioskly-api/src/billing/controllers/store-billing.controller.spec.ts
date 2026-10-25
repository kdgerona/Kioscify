import { StoreBillingController } from './store-billing.controller';
import { PayPageController } from './pay-page.controller';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';

const rolesOf = (method: keyof StoreBillingController) =>
  Reflect.getMetadata('roles', StoreBillingController.prototype[method]) ?? Reflect.getMetadata('roles', StoreBillingController);

describe('StoreBillingController roles', () => {
  it.each(['payCurrent', 'payInvoice', 'submitClaim', 'listInvoices', 'getInvoice'] as const)(
    'cashier cannot create a pay link or see billing history (%s is store-admin only)',
    method => {
      expect(rolesOf(method)).toEqual(['STORE_ADMIN', 'ADMIN']);
    },
  );

  it.each(['getMe', 'paymentStatus'] as const)('%s is open to cashiers too', method => {
    expect(rolesOf(method)).toEqual(['STORE_ADMIN', 'ADMIN', 'CASHIER']);
  });

  it('the pay page is public', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, PayPageController)).toBe(true);
  });
});
