// kioskly-api/src/users/users.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { ForbiddenException, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn().mockResolvedValue(true),
}));

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
    jest.resetAllMocks();
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

  describe('getStoreUsers', () => {
    it('throws ForbiddenException when STORE_ADMIN does not manage the store', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ tenantId: 'store-x' });
      mockPrisma.userStoreAccess.findMany.mockResolvedValue([]);

      await expect(
        service.getStoreUsers('store-other', 'STORE_ADMIN', 'user-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('includes primary users with isAssigned=false', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ tenantId: 'store-a' });
      mockPrisma.userStoreAccess.findMany
        .mockResolvedValueOnce([])  // getManagedStoreIds call
        .mockResolvedValueOnce([]);  // assigned-users-in-store call

      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'u1', username: 'alice', firstName: 'Alice', lastName: 'A', email: 'a@a.com',
          role: 'CASHIER', isActive: true, isFirstLogin: false, createdAt: new Date(), tenant: null },
      ]);

      const result = await service.getStoreUsers('store-a', 'STORE_ADMIN', 'user-1');

      expect(result[0].isAssigned).toBe(false);
      expect(result[0].id).toBe('u1');
    });

    it('includes assigned users with isAssigned=true and assignedRole from UserStoreAccess', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ tenantId: 'store-a' });
      mockPrisma.userStoreAccess.findMany
        .mockResolvedValueOnce([{ tenantId: 'store-b' }])  // getManagedStoreIds
        .mockResolvedValueOnce([  // assigned users in store
          {
            userId: 'u2',
            role: 'STORE_ADMIN',
            user: { id: 'u2', username: 'bob', firstName: 'Bob', lastName: 'B', email: 'b@b.com',
                    role: 'CASHIER', isActive: true, isFirstLogin: false, createdAt: new Date(),
                    tenant: { id: 'store-b', name: 'Store B', slug: 'store-b' } },
          },
        ]);

      mockPrisma.user.findMany.mockResolvedValue([]);  // no primary users

      const result = await service.getStoreUsers('store-a', 'STORE_ADMIN', 'user-1');

      expect(result[0].isAssigned).toBe(true);
      expect(result[0].assignedRole).toBe('STORE_ADMIN');
      expect(result[0].primaryStore).toEqual({ id: 'store-b', name: 'Store B', slug: 'store-b' });
    });
  });

  describe('getAssignablePool', () => {
    it('throws ForbiddenException when STORE_ADMIN does not manage the target store', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ tenantId: 'store-x' });
      mockPrisma.userStoreAccess.findMany.mockResolvedValue([]);

      await expect(
        service.getAssignablePool('store-other', 'user-1', 'STORE_ADMIN', ''),
      ).rejects.toThrow(ForbiddenException);
    });

    it('returns users from managed stores excluding those already in the target store', async () => {
      // getManagedStoreIds: user-1 manages store-a (primary) and store-b (via access)
      mockPrisma.user.findUnique.mockResolvedValue({ tenantId: 'store-a' });
      mockPrisma.userStoreAccess.findMany
        .mockResolvedValueOnce([{ tenantId: 'store-b' }])  // getManagedStoreIds (userStoreAccess)
        .mockResolvedValueOnce([])                          // assigned users in managed stores pool
        .mockResolvedValueOnce([]);                         // existing assigned in target store-a

      // Pool queries
      mockPrisma.user.findMany
        .mockResolvedValueOnce([  // primary users in managed stores
          { id: 'u2' },
        ])
        .mockResolvedValueOnce([])  // existing primary users in target store-a (for exclusion)
        .mockResolvedValueOnce([    // final filtered query
          { id: 'u2', username: 'bob', firstName: 'Bob', lastName: 'B',
            role: 'CASHIER', tenant: { id: 'store-b', name: 'Store B', slug: 'store-b' } },
        ]);

      const result = await service.getAssignablePool('store-a', 'user-1', 'STORE_ADMIN', '');

      expect(result).toHaveLength(1);
      expect(result[0].username).toBe('bob');
    });
  });

  describe('assignUserToStore (STORE_ADMIN path)', () => {
    it('throws ForbiddenException when target store is not in managed stores', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: 'store-other', companyId: 'co-1' });
      mockPrisma.user.findUnique.mockResolvedValue({ tenantId: 'store-a' });
      mockPrisma.userStoreAccess.findMany.mockResolvedValue([]);

      await expect(
        service.assignUserToStore(
          'store-other',
          { username: 'bob', role: 'CASHIER' },
          'co-1',
          'STORE_ADMIN',
          'user-1',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when user is not found in the company', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: 'store-a', companyId: 'co-1' });
      mockPrisma.user.findUnique.mockResolvedValue({ tenantId: 'store-a' });
      mockPrisma.userStoreAccess.findMany.mockResolvedValue([]); // getManagedStoreIds

      mockPrisma.user.findFirst.mockResolvedValue(null); // user not found

      await expect(
        service.assignUserToStore(
          'store-a',
          { username: 'ghost', role: 'CASHIER' },
          'co-1',
          'STORE_ADMIN',
          'user-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when target user is not in managed pool', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: 'store-a', companyId: 'co-1' });
      mockPrisma.user.findUnique.mockResolvedValue({ tenantId: 'store-a' });
      mockPrisma.userStoreAccess.findMany.mockResolvedValueOnce([]); // getManagedStoreIds

      mockPrisma.user.findFirst.mockResolvedValue(
        { id: 'u-bob', username: 'bob', tenantId: 'store-z', isActive: true },
      );
      mockPrisma.userStoreAccess.findFirst.mockResolvedValue(null); // pool check (user has no access to managed stores)

      await expect(
        service.assignUserToStore(
          'store-a',
          { username: 'bob', role: 'CASHIER' },
          'co-1',
          'STORE_ADMIN',
          'user-1',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('creates a UserStoreAccess record when all checks pass', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: 'store-a', companyId: 'co-1' });
      // getManagedStoreIds: user-1 manages store-a (primary) and store-b (via access)
      mockPrisma.user.findUnique.mockResolvedValue({ tenantId: 'store-a' });
      mockPrisma.userStoreAccess.findMany
        .mockResolvedValueOnce([{ tenantId: 'store-b' }])  // getManagedStoreIds (UserStoreAccess)
        .mockResolvedValueOnce([]);                          // pool check (no existing access for bob)

      mockPrisma.user.findFirst.mockResolvedValue(
        { id: 'u-bob', username: 'bob', tenantId: 'store-b', isActive: true },
      );

      mockPrisma.userStoreAccess.findFirst.mockResolvedValue(null);
      mockPrisma.userStoreAccess.create.mockResolvedValue({ id: 'access-1' });

      const result = await service.assignUserToStore(
        'store-a',
        { username: 'bob', role: 'CASHIER' },
        'co-1',
        'STORE_ADMIN',
        'user-1',
      );

      expect(mockPrisma.userStoreAccess.create).toHaveBeenCalledWith({
        data: { userId: 'u-bob', tenantId: 'store-a', role: 'CASHIER' },
      });
      expect(result).toEqual({ id: 'access-1' });
    });
  });

  describe('getAssignablePool — no query returns all', () => {
    it('should not apply take limit when query is empty', async () => {
      // Requesting user manages storeId as primary store
      mockPrisma.user.findUnique.mockResolvedValue({ tenantId: 'storeId' });
      mockPrisma.userStoreAccess.findMany
        .mockResolvedValueOnce([])   // getManagedStoreIds access records
        .mockResolvedValueOnce([])   // assignedInManaged
        .mockResolvedValueOnce([]);  // existingAssigned

      mockPrisma.user.findMany
        .mockResolvedValueOnce([{ id: 'u1' }])  // primaryInManaged
        .mockResolvedValueOnce([])               // existingPrimary in target store
        .mockResolvedValueOnce([]);              // final user fetch

      await service.getAssignablePool('storeId', 'requestorId', 'STORE_ADMIN', '');

      // The final findMany (returning actual users) should NOT include take
      const finalCall = mockPrisma.user.findMany.mock.calls.at(-1)?.[0];
      expect(finalCall?.take).toBeUndefined();
    });

    it('should apply take: 20 when query is provided', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ tenantId: 'storeId' });
      mockPrisma.userStoreAccess.findMany
        .mockResolvedValueOnce([])   // getManagedStoreIds access records
        .mockResolvedValueOnce([])   // assignedInManaged
        .mockResolvedValueOnce([]);  // existingAssigned

      mockPrisma.user.findMany
        .mockResolvedValueOnce([{ id: 'u1' }])  // primaryInManaged
        .mockResolvedValueOnce([])               // existingPrimary in target store
        .mockResolvedValueOnce([]);              // final user fetch

      await service.getAssignablePool('storeId', 'requestorId', 'STORE_ADMIN', 'john');

      const finalCall = mockPrisma.user.findMany.mock.calls.at(-1)?.[0];
      expect(finalCall?.take).toBe(20);
    });
  });

  describe('searchUsersInCompany — no query returns all', () => {
    it('should not apply take limit when query is empty', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);

      await service.searchUsersInCompany('companyId', '');

      const call = mockPrisma.user.findMany.mock.calls[0]?.[0];
      expect(call?.take).toBeUndefined();
    });

    it('should apply take: 20 when query is provided', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);

      await service.searchUsersInCompany('companyId', 'alice');

      const call = mockPrisma.user.findMany.mock.calls[0]?.[0];
      expect(call?.take).toBe(20);
    });
  });

  describe('createCompanyUser', () => {
    it('uses provided companyPrivileges when requesting user is owner (null)', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce(null); // no conflict
      mockPrisma.user.create.mockResolvedValue({ id: 'u1', username: 'jane', firstName: 'Jane', lastName: 'Doe', email: 'jane@co.com', role: 'COMPANY_ADMIN', isFirstLogin: true });

      const dto = { firstName: 'Jane', lastName: 'Doe', email: 'jane@co.com', username: 'jane', companyPrivileges: { brands: 'write', analytics: 'read', users: 'no_access', settings: 'read' } };
      await service.createCompanyUser('co1', 'co1', dto, null /* requestingPrivileges = owner */);

      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyPrivileges: { brands: 'write', analytics: 'read', users: 'no_access', settings: 'read' },
          }),
        }),
      );
    });

    it('ignores provided companyPrivileges when requester has users:write (not all)', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce(null);
      mockPrisma.user.create.mockResolvedValue({ id: 'u2', username: 'bob', firstName: 'Bob', lastName: 'Smith', email: 'bob@co.com', role: 'COMPANY_ADMIN', isFirstLogin: true });

      const dto = { firstName: 'Bob', lastName: 'Smith', email: 'bob@co.com', username: 'bob', companyPrivileges: { brands: 'all', analytics: 'all', users: 'all', settings: 'all' } };
      const requestingPrivileges = { brands: 'write', analytics: 'read', users: 'write', settings: 'read' };
      await service.createCompanyUser('co1', 'co1', dto, requestingPrivileges);

      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyPrivileges: { brands: 'read', analytics: 'read', users: 'read', settings: 'read' },
          }),
        }),
      );
    });

    it('defaults to read for all sections when no companyPrivileges provided', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce(null);
      mockPrisma.user.create.mockResolvedValue({ id: 'u3', username: 'carol', firstName: 'Carol', lastName: 'Lee', email: 'carol@co.com', role: 'COMPANY_ADMIN', isFirstLogin: true });

      await service.createCompanyUser('co1', 'co1', { firstName: 'Carol', lastName: 'Lee', email: 'carol@co.com', username: 'carol' }, null);

      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyPrivileges: { brands: 'read', analytics: 'read', users: 'read', settings: 'read' },
          }),
        }),
      );
    });

    it('throws ForbiddenException for a non-PLATFORM_ADMIN requester whose companyId does not match', async () => {
      await expect(
        service.createCompanyUser('co1', 'co2', { firstName: 'Dan', lastName: 'Ng', email: 'dan@co.com', username: 'dan' }, null, 'COMPANY_ADMIN'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows a PLATFORM_ADMIN requester to create a user in a company whose JWT carries no companyId', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce(null);
      mockPrisma.user.create.mockResolvedValue({ id: 'u4', username: 'erin', firstName: 'Erin', lastName: 'Cruz', email: 'erin@co.com', role: 'COMPANY_ADMIN', isFirstLogin: true });

      await service.createCompanyUser('co1', undefined, { firstName: 'Erin', lastName: 'Cruz', email: 'erin@co.com', username: 'erin' }, null, 'PLATFORM_ADMIN');

      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ companyId: 'co1', role: 'COMPANY_ADMIN' }) }),
      );
    });
  });

  describe('updateCompanyUser', () => {
    it('throws ForbiddenException when requester lacks users:all and tries to set companyPrivileges', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'u2', companyId: 'co1' });

      const requestingPrivileges = { brands: 'read', analytics: 'read', users: 'write', settings: 'read' };
      await expect(
        service.updateCompanyUser('co1', 'u2', 'co1', 'COMPANY_ADMIN', 'req-user', { companyPrivileges: { brands: 'all', analytics: 'all', users: 'all', settings: 'all' } }, requestingPrivileges),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows companyPrivileges update when requester is owner (null)', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'u2', companyId: 'co1' });
      mockPrisma.user.update.mockResolvedValue({ id: 'u2', companyPrivileges: { brands: 'write', analytics: 'read', users: 'read', settings: 'read' } });

      await service.updateCompanyUser('co1', 'u2', 'co1', 'COMPANY_ADMIN', 'req-user', { companyPrivileges: { brands: 'write', analytics: 'read', users: 'read', settings: 'read' } }, null);

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ companyPrivileges: { brands: 'write', analytics: 'read', users: 'read', settings: 'read' } }),
        }),
      );
    });
  });

  describe('revokeStoreAccess (STORE_ADMIN path)', () => {
    it('throws ForbiddenException when target store is not in managed stores', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ companyId: 'co-1' });
      mockPrisma.user.findUnique.mockResolvedValue({ tenantId: 'store-x' }); // getManagedStoreIds primary tenantId
      mockPrisma.userStoreAccess.findMany.mockResolvedValue([]); // getManagedStoreIds access records

      await expect(
        service.revokeStoreAccess('store-other', 'u-bob', 'co-1', 'STORE_ADMIN', 'user-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException when target user is primary in the store', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ companyId: 'co-1' });
      mockPrisma.user.findUnique
        .mockResolvedValueOnce({ tenantId: 'store-a' }) // getManagedStoreIds: primary tenantId of requester
        .mockResolvedValueOnce({ tenantId: 'store-a' }); // targetUser lookup
      mockPrisma.userStoreAccess.findMany.mockResolvedValue([]); // getManagedStoreIds access records

      await expect(
        service.revokeStoreAccess('store-a', 'u-bob', 'co-1', 'STORE_ADMIN', 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('revokes access for an assigned (non-primary) user', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ companyId: 'co-1' });
      mockPrisma.user.findUnique
        .mockResolvedValueOnce({ tenantId: 'store-a' }) // getManagedStoreIds: primary tenantId of requester
        .mockResolvedValueOnce({ tenantId: 'store-b' }); // targetUser: primary is store-b (not store-a)
      mockPrisma.userStoreAccess.findMany.mockResolvedValue([]); // getManagedStoreIds access records
      mockPrisma.userStoreAccess.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.revokeStoreAccess('store-a', 'u-bob', 'co-1', 'STORE_ADMIN', 'user-1');

      expect(mockPrisma.userStoreAccess.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u-bob', tenantId: 'store-a' },
        data: { isActive: false },
      });
      expect(result).toEqual({ count: 1 });
    });
  });
});
