import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AuthService } from '../auth/auth.service';
import { GRACE_PERIOD_DAYS } from '../common/utils/account-status.util';

const mockPrisma = {
  company: { findFirst: jest.fn(), update: jest.fn() },
  tenant: { updateMany: jest.fn() },
  brand: { findMany: jest.fn() },
};

const mockStorage = {};
const mockAuthService = {};

describe('CompaniesService', () => {
  let service: CompaniesService;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-01T12:00:00.000Z'));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompaniesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StorageService, useValue: mockStorage },
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compile();
    service = module.get<CompaniesService>(CompaniesService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('deactivate()', () => {
    it('throws NotFoundException when the company does not exist', async () => {
      mockPrisma.company.findFirst.mockResolvedValue(null);
      await expect(service.deactivate('missing-id')).rejects.toThrow(NotFoundException);
      expect(mockPrisma.company.update).not.toHaveBeenCalled();
    });

    it('stamps the company and cascades only to currently-active stores, leaving already-inactive stores untouched', async () => {
      mockPrisma.company.findFirst.mockResolvedValue({ id: 'company-1', isActive: true, tombstone: 0 });
      mockPrisma.company.update.mockResolvedValue({ id: 'company-1', isActive: false });
      mockPrisma.tenant.updateMany.mockResolvedValue({ count: 2 });

      await service.deactivate('company-1');

      const now = new Date('2026-07-01T12:00:00.000Z');
      const expectedGraceEnd = new Date(now.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);

      expect(mockPrisma.company.update).toHaveBeenCalledWith({
        where: { id: 'company-1' },
        data: { isActive: false, deactivatedAt: now, gracePeriodEndsAt: expectedGraceEnd },
      });

      // The updateMany filter itself scopes the cascade to isActive:true
      // stores only — Prisma applies this filter server-side, so an
      // already-inactive Tenant's own deactivatedAt/gracePeriodEndsAt/
      // deactivationCascaded is never touched by this call.
      expect(mockPrisma.tenant.updateMany).toHaveBeenCalledWith({
        where: { companyId: 'company-1', isActive: true, tombstone: { not: 1 } },
        data: {
          isActive: false,
          deactivatedAt: now,
          gracePeriodEndsAt: expectedGraceEnd,
          deactivationCascaded: true,
        },
      });
    });
  });

  describe('reactivate()', () => {
    it('throws NotFoundException when the company does not exist', async () => {
      mockPrisma.company.findFirst.mockResolvedValue(null);
      await expect(service.reactivate('missing-id')).rejects.toThrow(NotFoundException);
      expect(mockPrisma.company.update).not.toHaveBeenCalled();
    });

    it('clears the company and only clears Tenants with deactivationCascaded=true — an independently-deactivated store is untouched', async () => {
      mockPrisma.company.findFirst.mockResolvedValue({ id: 'company-1', isActive: false, tombstone: 0 });
      mockPrisma.company.update.mockResolvedValue({ id: 'company-1', isActive: true });
      mockPrisma.tenant.updateMany.mockResolvedValue({ count: 1 });

      await service.reactivate('company-1');

      expect(mockPrisma.company.update).toHaveBeenCalledWith({
        where: { id: 'company-1' },
        data: { isActive: true, deactivatedAt: null, gracePeriodEndsAt: null },
      });

      // The updateMany where-clause restricts to deactivationCascaded:true —
      // a store that was deactivated directly (deactivationCascaded:false)
      // never matches this filter and is left exactly as it was, which is
      // how "an independently-deactivated store survives a company
      // reactivate" is enforced.
      expect(mockPrisma.tenant.updateMany).toHaveBeenCalledWith({
        where: { companyId: 'company-1', deactivationCascaded: true, tombstone: { not: 1 } },
        data: {
          isActive: true,
          deactivatedAt: null,
          gracePeriodEndsAt: null,
          deactivationCascaded: false,
        },
      });
    });
  });
});
