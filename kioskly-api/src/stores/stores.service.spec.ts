import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StoresService } from './stores.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AuthService } from '../auth/auth.service';
import { GRACE_PERIOD_DAYS } from '../common/utils/account-status.util';
import { ConflictException, ForbiddenException } from '@nestjs/common';

const tx = {
  tenant: { create: jest.fn() },
  storeSubscription: { create: jest.fn() },
};

const mockPrisma = {
  tenant: { findFirst: jest.fn(), update: jest.fn() },
  company: { findUnique: jest.fn() },
  $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
};

const mockStorage = {};
const mockAuthService = {};
const mockConfigService = { get: jest.fn().mockReturnValue('') };

describe('StoresService', () => {
  let service: StoresService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockConfigService.get.mockReturnValue('');
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-01T12:00:00.000Z'));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StoresService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StorageService, useValue: mockStorage },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compile();
    service = module.get<StoresService>(StoresService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('deactivate()', () => {
    it('throws NotFoundException when the store does not exist', async () => {
      mockPrisma.tenant.findFirst.mockResolvedValue(null);
      await expect(service.deactivate('missing-id')).rejects.toThrow(NotFoundException);
      expect(mockPrisma.tenant.update).not.toHaveBeenCalled();
    });

    it('stamps the store and always resets deactivationCascaded to false, even if it was previously cascade-deactivated', async () => {
      mockPrisma.tenant.findFirst.mockResolvedValue({
        id: 'store-1',
        isActive: true,
        deactivationCascaded: true, // previously cascaded from a company deactivate
        tombstone: 0,
      });
      const now = new Date('2026-07-01T12:00:00.000Z');
      const expectedGraceEnd = new Date(now.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);
      mockPrisma.tenant.update.mockResolvedValue({
        id: 'store-1',
        isActive: false,
        deactivatedAt: now,
        gracePeriodEndsAt: expectedGraceEnd,
        deactivationCascaded: false,
      });

      await service.deactivate('store-1');

      expect(mockPrisma.tenant.update).toHaveBeenCalledWith({
        where: { id: 'store-1' },
        data: {
          isActive: false,
          deactivatedAt: now,
          gracePeriodEndsAt: expectedGraceEnd,
          deactivationCascaded: false,
        },
      });
    });
  });

  describe('reactivate()', () => {
    it('throws NotFoundException when the store does not exist', async () => {
      mockPrisma.tenant.findFirst.mockResolvedValue(null);
      await expect(service.reactivate('missing-id')).rejects.toThrow(NotFoundException);
      expect(mockPrisma.tenant.update).not.toHaveBeenCalled();
    });

    it('clears the store directly, regardless of parent company state', async () => {
      mockPrisma.tenant.findFirst.mockResolvedValue({
        id: 'store-1',
        isActive: false,
        deactivationCascaded: false,
        tombstone: 0,
      });
      mockPrisma.tenant.update.mockResolvedValue({
        id: 'store-1',
        isActive: true,
        deactivatedAt: null,
        gracePeriodEndsAt: null,
        deactivationCascaded: false,
      });

      await service.reactivate('store-1');

      expect(mockPrisma.tenant.update).toHaveBeenCalledWith({
        where: { id: 'store-1' },
        data: {
          isActive: true,
          deactivatedAt: null,
          gracePeriodEndsAt: null,
          deactivationCascaded: false,
        },
      });
    });
  });

  describe('create()', () => {
    // Manila midnight for a calendar date.
    const m = (y: number, mo: number, d: number) => new Date(Date.UTC(y, mo - 1, d) - 8 * 60 * 60 * 1000);
    const dto = {
      name: 'Branch 1',
      slug: 'branch-1',
      brandId: 'b-1',
      companyId: 'c-1',
      // Trial Jul 1–15, first month Jul 16 – Aug 15, paid at its end on Aug 16
      billing: { priceCentavos: 150000, trialDays: 15, firstBillingDate: '2026-08-16' },
    };

    beforeEach(() => {
      mockPrisma.tenant.findFirst.mockResolvedValue(null);
      tx.tenant.create.mockResolvedValue({ id: 't-new', name: 'Branch 1' });
    });

    it('writes tenant and StoreSubscription in one $transaction', async () => {
      const result = await service.create(dto as any, 'PLATFORM_ADMIN');
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.storeSubscription.create).toHaveBeenCalledWith({
        data: {
          tenantId: 't-new',
          billingEnabled: true,
          priceCentavos: 150000,
          // Stored as Manila midnight, like the Platform detail form does.
          activatedAt: m(2026, 7, 1),
          trialStartAt: m(2026, 7, 1),
          trialDays: 15,
          nextBillingAt: m(2026, 8, 16),
          anchorDay: 16,
          nextBillingOverridden: false,
          billedInArrears: true,
        },
      });
      expect(result).toEqual({ id: 't-new', name: 'Branch 1' });
    });

    it('uses the given activatedAt, normalised to its Manila day', async () => {
      await service.create({ ...dto, billing: { ...dto.billing, activatedAt: '2026-06-20T05:00:00.000Z' } } as any, 'PLATFORM_ADMIN');
      expect(tx.storeSubscription.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          activatedAt: m(2026, 6, 20),
          trialStartAt: m(2026, 6, 20),
        }),
      });
    });

    it('without a first billing date, the first payment is a month after the trial ends', async () => {
      const { firstBillingDate: _omit, ...billing } = dto.billing;
      await service.create({ ...dto, billing } as any, 'PLATFORM_ADMIN');
      expect(tx.storeSubscription.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ nextBillingAt: m(2026, 8, 16), anchorDay: 16, nextBillingOverridden: false, billedInArrears: true }),
      });
    });

    it('a first billing date other than a month after the trial is kept as an override', async () => {
      await service.create({ ...dto, billing: { ...dto.billing, firstBillingDate: '2026-07-20' } } as any, 'PLATFORM_ADMIN');
      expect(tx.storeSubscription.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ nextBillingAt: m(2026, 7, 20), anchorDay: 20, nextBillingOverridden: true }),
      });
    });

    it('does not pass billing into tenant.create data', async () => {
      await service.create(dto as any, 'PLATFORM_ADMIN');
      expect(tx.tenant.create).toHaveBeenCalledWith({
        data: { name: 'Branch 1', slug: 'branch-1', brandId: 'b-1', companyId: 'c-1' },
      });
    });

    it('still enforces canOnboardStores before creating anything', async () => {
      mockPrisma.company.findUnique.mockResolvedValue({ canOnboardStores: false });
      await expect(service.create(dto as any, 'COMPANY_ADMIN', 'c-1')).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('still rejects a slug conflict before creating anything', async () => {
      mockPrisma.tenant.findFirst.mockResolvedValue({ id: 'other' });
      await expect(service.create(dto as any, 'PLATFORM_ADMIN')).rejects.toBeInstanceOf(ConflictException);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
