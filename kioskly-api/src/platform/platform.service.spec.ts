// kioskly-api/src/platform/platform.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { PlatformService } from './platform.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';

const mockPrisma = {
  user: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  company: { count: jest.fn() },
  brand: { count: jest.fn() },
  tenant: { count: jest.fn() },
  transaction: { findMany: jest.fn() },
  platformConfig: { upsert: jest.fn() },
};

const mockAuthService = {
  generateSecurePassword: jest.fn().mockReturnValue('TempPass@123'),
};

const mockAdmin = {
  id: 'admin-1',
  username: 'admin1',
  firstName: 'Alice',
  lastName: 'Smith',
  email: 'alice@kioscify.com',
  role: 'PLATFORM_ADMIN',
  isActive: true,
  isFirstLogin: false,
  createdAt: new Date('2026-01-01'),
};

describe('PlatformService — admin management', () => {
  let service: PlatformService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compile();
    service = module.get<PlatformService>(PlatformService);
  });

  describe('getPlatformAdmins', () => {
    it('returns all PLATFORM_ADMIN users', async () => {
      mockPrisma.user.findMany.mockResolvedValue([mockAdmin]);
      const result = await service.getPlatformAdmins();
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
        where: { role: 'PLATFORM_ADMIN' },
        select: {
          id: true,
          username: true,
          firstName: true,
          lastName: true,
          email: true,
          isActive: true,
          isFirstLogin: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual([mockAdmin]);
    });
  });
});
