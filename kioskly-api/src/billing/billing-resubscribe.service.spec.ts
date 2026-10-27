import { Test, TestingModule } from '@nestjs/testing';
import { BillingResubscribeService } from './billing-resubscribe.service';
import { PrismaService } from '../prisma/prisma.service';
import { BillingConfigService } from './billing-config.service';
import { BillingAuditService } from './billing-audit.service';

const pastGrace = new Date(Date.now() - 24 * 60 * 60 * 1000);
const inactiveStore = {
  isActive: false,
  gracePeriodEndsAt: pastGrace,
  company: { isActive: true, gracePeriodEndsAt: null },
};

const mockPrisma = {
  tenant: { findUnique: jest.fn(), updateMany: jest.fn() },
  storeSubscription: { findUnique: jest.fn() },
};
const mockConfig = { get: jest.fn() };
const mockAudit = { log: jest.fn() };

describe('BillingResubscribeService', () => {
  let service: BillingResubscribeService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.tenant.findUnique.mockResolvedValue(inactiveStore);
    mockPrisma.storeSubscription.findUnique.mockResolvedValue({ billingEnabled: true, priceCentavos: 150000 });
    mockPrisma.tenant.updateMany.mockResolvedValue({ count: 1 });
    mockConfig.get.mockResolvedValue({ billingEnabled: true });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingResubscribeService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: BillingConfigService, useValue: mockConfig },
        { provide: BillingAuditService, useValue: mockAudit },
      ],
    }).compile();
    service = module.get(BillingResubscribeService);
  });

  describe('canResubscribe', () => {
    it('is true for a Store Admin of a switched-off, billed store with an active Company', async () => {
      expect(await service.canResubscribe('t-1', 'STORE_ADMIN')).toBe(true);
    });

    it('is false when the Company is switched off', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        ...inactiveStore,
        company: { isActive: false, gracePeriodEndsAt: pastGrace },
      });
      expect(await service.canResubscribe('t-1', 'STORE_ADMIN')).toBe(false);
    });

    it('is false for an unknown store', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(null);
      expect(await service.canResubscribe('t-1', 'STORE_ADMIN')).toBe(false);
    });
  });

  describe('reactivateAfterPayment', () => {
    it('switches an eligible inactive store back on and audits it', async () => {
      expect(await service.reactivateAfterPayment('t-1', 'admin-1')).toBe(true);
      expect(mockPrisma.tenant.updateMany).toHaveBeenCalledWith({
        where: { id: 't-1', isActive: false },
        data: { isActive: true, deactivatedAt: null, gracePeriodEndsAt: null, deactivationCascaded: false },
      });
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 't-1', actorUserId: 'admin-1', action: 'store.reactivate' }),
      );
    });

    it('leaves an active store alone', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ ...inactiveStore, isActive: true, gracePeriodEndsAt: null });
      expect(await service.reactivateAfterPayment('t-1', null)).toBe(false);
      expect(mockPrisma.tenant.updateMany).not.toHaveBeenCalled();
    });

    it('leaves a store alone when its Company is switched off', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        ...inactiveStore,
        company: { isActive: false, gracePeriodEndsAt: pastGrace },
      });
      expect(await service.reactivateAfterPayment('t-1', null)).toBe(false);
      expect(mockPrisma.tenant.updateMany).not.toHaveBeenCalled();
    });

    it('leaves an exempt (not billed) store alone', async () => {
      mockPrisma.storeSubscription.findUnique.mockResolvedValue({ billingEnabled: false, priceCentavos: 150000 });
      expect(await service.reactivateAfterPayment('t-1', null)).toBe(false);
      expect(mockPrisma.tenant.updateMany).not.toHaveBeenCalled();
    });

    it('does not audit when another request already reactivated it', async () => {
      mockPrisma.tenant.updateMany.mockResolvedValue({ count: 0 });
      expect(await service.reactivateAfterPayment('t-1', null)).toBe(false);
      expect(mockAudit.log).not.toHaveBeenCalled();
    });
  });
});
