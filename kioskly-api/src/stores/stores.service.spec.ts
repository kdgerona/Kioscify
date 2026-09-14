import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StoresService } from './stores.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AuthService } from '../auth/auth.service';
import { GRACE_PERIOD_DAYS } from '../common/utils/account-status.util';

const mockPrisma = {
  tenant: { findFirst: jest.fn(), update: jest.fn() },
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
});
