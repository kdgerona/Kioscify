import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BillingConfigService } from './billing-config.service';
import { BillingAuditService } from './billing-audit.service';
import { computeAccountStatus } from '../common/utils/account-status.util';
import { canResubscribe } from '../common/utils/resubscribe.util';

/**
 * "Your subscription has ended" → Resubscribe: an inactive store's Store Admin
 * pays, and the store switches itself back on. See canResubscribe for who
 * qualifies.
 */
@Injectable()
export class BillingResubscribeService {
  constructor(
    private prisma: PrismaService,
    private billingConfig: BillingConfigService,
    private audit: BillingAuditService,
  ) {}

  /** Loads the store, its Company and subscription and applies canResubscribe. */
  async canResubscribe(tenantId: string, role: string): Promise<boolean> {
    const [tenant, sub, config] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
          isActive: true,
          gracePeriodEndsAt: true,
          company: { select: { isActive: true, gracePeriodEndsAt: true } },
        },
      }),
      this.prisma.storeSubscription.findUnique({
        where: { tenantId },
        select: { billingEnabled: true, priceCentavos: true },
      }),
      this.billingConfig.get(),
    ]);
    if (!tenant) return false;
    return canResubscribe({
      role,
      storeStatus: computeAccountStatus(tenant),
      companyStatus: tenant.company ? computeAccountStatus(tenant.company) : null,
      billingEnabledGlobally: config.billingEnabled,
      subscription: sub,
    });
  }

  /**
   * Called after a payment is applied on any path (QR webhook, reconcile,
   * platform Mark paid, approved bank-QR claim). Switches an inactive store
   * back on when paying is what can bring it back; a store whose Company is
   * switched off, or that isn't billed, is left alone.
   */
  async reactivateAfterPayment(tenantId: string, actorUserId: string | null): Promise<boolean> {
    // Role is fixed to STORE_ADMIN here: the question is whether the *store*
    // qualifies, regardless of who recorded the payment.
    if (!(await this.canResubscribe(tenantId, 'STORE_ADMIN'))) return false;

    const reactivated = await this.prisma.tenant.updateMany({
      where: { id: tenantId, isActive: false },
      data: { isActive: true, deactivatedAt: null, gracePeriodEndsAt: null, deactivationCascaded: false },
    });
    if (reactivated.count === 0) return false;

    await this.audit.log({
      tenantId,
      actorUserId,
      action: 'store.reactivate',
      after: { reason: 'resubscribed' },
    });
    return true;
  }
}
