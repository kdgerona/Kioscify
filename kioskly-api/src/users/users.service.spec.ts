// kioskly-api/src/users/users.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { ForbiddenException, BadRequestException, ConflictException } from '@nestjs/common';

const mockPrisma = {
  user: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  userStoreAccess: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  tenant: {
    findUnique: jest.fn(),
  },
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuthService, useValue: { generateSecurePassword: jest.fn().mockReturnValue('tmp-pw') } },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    jest.clearAllMocks();
  });

  describe('getManagedStoreIds', () => {
    it('returns primary tenantId plus UserStoreAccess store IDs', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ tenantId: 'store-a' });
      mockPrisma.userStoreAccess.findMany.mockResolvedValue([
        { tenantId: 'store-b' },
        { tenantId: 'store-c' },
      ]);

      const result = await (service as any).getManagedStoreIds('user-1');

      expect(result).toHaveLength(3);
      expect(result).toEqual(expect.arrayContaining(['store-a', 'store-b', 'store-c']));
    });

    it('deduplicates when primary tenantId appears in access records', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ tenantId: 'store-a' });
      mockPrisma.userStoreAccess.findMany.mockResolvedValue([{ tenantId: 'store-a' }]);

      const result = await (service as any).getManagedStoreIds('user-1');

      expect(result).toHaveLength(1);
      expect(result).toEqual(['store-a']);
    });

    it('returns empty array when user has no tenantId and no access records', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ tenantId: null });
      mockPrisma.userStoreAccess.findMany.mockResolvedValue([]);

      const result = await (service as any).getManagedStoreIds('user-1');

      expect(result).toEqual([]);
    });
  });
});
