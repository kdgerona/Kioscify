// kioskly-api/src/platform/platform.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { PlatformService } from './platform.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';

const mockPrisma = {
  user: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  userStoreAccess: { updateMany: jest.fn() },
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
        where: { role: 'PLATFORM_ADMIN', tombstone: { not: 1 } },
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

  describe('createPlatformAdmin', () => {
    const dto = {
      firstName: 'Bob',
      lastName: 'Jones',
      email: 'bob@kioscify.com',
      username: 'bobjones',
    };

    it('throws ConflictException if username already exists', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockAdmin);
      await expect(service.createPlatformAdmin(dto)).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException if email already exists', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ ...mockAdmin, username: 'different', email: dto.email });
      await expect(service.createPlatformAdmin(dto)).rejects.toThrow(ConflictException);
    });

    it('creates a new PLATFORM_ADMIN and returns user + temporaryPassword', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      const created = { id: 'admin-2', ...dto, role: 'PLATFORM_ADMIN', isActive: true, isFirstLogin: true };
      mockPrisma.user.create.mockResolvedValue(created);

      const result = await service.createPlatformAdmin(dto);

      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            username: dto.username,
            email: dto.email,
            role: 'PLATFORM_ADMIN',
            isFirstLogin: true,
            tenantId: null,
            companyId: null,
          }),
        }),
      );
      expect(result.temporaryPassword).toBe('TempPass@123');
      expect(result.user).toEqual(created);
    });
  });

  describe('updatePlatformAdmin', () => {
    it('throws ForbiddenException if admin tries to update themselves', async () => {
      await expect(
        service.updatePlatformAdmin('admin-1', 'admin-1', { isActive: false }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException if target user not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      await expect(
        service.updatePlatformAdmin('admin-1', 'admin-2', { isActive: false }),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates isActive and returns updated user', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockAdmin);
      const updated = { ...mockAdmin, isActive: false };
      mockPrisma.user.update.mockResolvedValue(updated);

      const result = await service.updatePlatformAdmin('admin-1', 'admin-2', { isActive: false });

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'admin-2' },
        data: { isActive: false },
        select: expect.any(Object),
      });
      expect(result.isActive).toBe(false);
    });
  });

  describe('resetPlatformAdminPassword', () => {
    it('throws NotFoundException if target user not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      await expect(service.resetPlatformAdminPassword('admin-99')).rejects.toThrow(NotFoundException);
    });

    it('resets password and returns updated user with isFirstLogin: true', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockAdmin);
      const updated = { ...mockAdmin, isFirstLogin: true };
      mockPrisma.user.update.mockResolvedValue(updated);

      const result = await service.resetPlatformAdminPassword('admin-1');

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'admin-1' },
          data: expect.objectContaining({ isFirstLogin: true }),
          select: expect.any(Object),
        }),
      );
      expect(result.temporaryPassword).toBe('TempPass@123');
      expect(result.user.isFirstLogin).toBe(true);
    });
  });

  describe('deletePlatformAdmin', () => {
    it('throws ForbiddenException if admin tries to delete themselves', async () => {
      await expect(
        service.deletePlatformAdmin('admin-1', 'admin-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException if target user not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      await expect(
        service.deletePlatformAdmin('admin-1', 'admin-99'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException if the target account is still active', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockAdmin); // isActive: true
      mockPrisma.user.findUnique.mockResolvedValue(mockAdmin);

      await expect(
        service.deletePlatformAdmin('admin-1', 'admin-2'),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.user.delete).not.toHaveBeenCalled();
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('soft-deletes (tombstones) a disabled target user without calling prisma.user.delete', async () => {
      const disabledAdmin = { ...mockAdmin, isActive: false };
      mockPrisma.user.findFirst.mockResolvedValue(disabledAdmin);
      mockPrisma.user.findUnique.mockResolvedValue(disabledAdmin);
      mockPrisma.user.update.mockResolvedValue({ ...disabledAdmin, tombstone: 1 });
      mockPrisma.userStoreAccess.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.deletePlatformAdmin('admin-1', 'admin-2');

      expect(mockPrisma.user.delete).not.toHaveBeenCalled();
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'admin-2' },
          data: expect.objectContaining({
            tombstone: 1,
            username: expect.stringContaining(disabledAdmin.username),
            email: expect.stringContaining(disabledAdmin.email),
          }),
        }),
      );
      expect(mockPrisma.userStoreAccess.updateMany).toHaveBeenCalledWith({
        where: { userId: 'admin-2' },
        data: { isActive: false },
      });
      expect(result).toEqual({ message: 'Platform admin deleted' });
    });
  });
});
