import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { getLoggerToken } from 'nestjs-pino';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { TokenBlacklistService } from './token-blacklist.service';

jest.mock('bcrypt');
const bcryptCompare = bcrypt.compare as jest.Mock;

const mockPrisma = {
  tenant: { findFirst: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
  user: { findFirst: jest.fn(), findUnique: jest.fn() },
  userStoreAccess: { findFirst: jest.fn() },
  company: { findFirst: jest.fn() },
};
const mockJwt = { sign: jest.fn().mockReturnValue('mock-token') };
const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
const mockTokenBlacklist = { blacklist: jest.fn(), isBlacklisted: jest.fn() };

const mockStore = {
  id: 'store-1',
  slug: 'store-1',
  brandId: 'brand-1',
  companyId: 'company-1',
};
const mockUser = {
  id: 'user-1',
  username: 'john',
  password: '$hashed$',
  role: 'ADMIN',
  isActive: true,
  tenantId: 'store-1',
  isFirstLogin: false,
};
const mockUserWithRelations = {
  ...mockUser,
  tenant: { ...mockStore, name: 'Store One', brand: null, company: null },
  storeAccess: [],
};

describe('AuthService — logging', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: TokenBlacklistService, useValue: mockTokenBlacklist },
        { provide: getLoggerToken(AuthService.name), useValue: mockLogger },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.resetAllMocks();
    mockJwt.sign.mockReturnValue('mock-token');
  });

  describe('loginStore', () => {
    it('logs warn with reason store_not_found when store does not exist', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([]);

      await expect(
        service.loginStore({ storeSlug: 'ghost-store', username: 'john', password: 'x' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ storeSlug: 'ghost-store', reason: 'store_not_found' }),
        expect.any(String),
      );
    });

    it('logs warn with reason ambiguous_store_slug when multiple stores match', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([mockStore, { ...mockStore, id: 'store-2' }]);

      await expect(
        service.loginStore({ storeSlug: 'store-1', username: 'john', password: 'x' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ storeSlug: 'store-1', reason: 'ambiguous_store_slug' }),
        expect.any(String),
      );
    });

    it('logs warn with reason user_not_found when user does not exist', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([mockStore]);
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.userStoreAccess.findFirst.mockResolvedValue(null);

      await expect(
        service.loginStore({ storeSlug: 'store-1', username: 'ghost', password: 'x' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ username: 'ghost', reason: 'user_not_found' }),
        expect.any(String),
      );
    });

    it('logs warn with reason invalid_password on bad password', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([mockStore]);
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      bcryptCompare.mockResolvedValue(false);

      await expect(
        service.loginStore({ storeSlug: 'store-1', username: 'john', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'store-1', username: 'john', reason: 'invalid_password' }),
        expect.any(String),
      );
    });

    it('logs info on successful store login', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([mockStore]);
      mockPrisma.user.findFirst.mockResolvedValue(mockUser);
      bcryptCompare.mockResolvedValue(true);
      mockPrisma.userStoreAccess.findFirst.mockResolvedValue(null);
      mockPrisma.user.findUnique.mockResolvedValue(mockUserWithRelations);

      await service.loginStore({ storeSlug: 'store-1', username: 'john', password: 'correct' });

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'store-1', username: 'john', role: 'STORE_ADMIN' }),
        expect.any(String),
      );
    });
  });

  describe('loginCompany', () => {
    const mockCompany = { id: 'company-1', slug: 'acme' };
    const mockCompanyUser = {
      id: 'user-2',
      username: 'admin',
      password: '$hashed$',
      role: 'COMPANY_ADMIN',
      companyId: 'company-1',
      isActive: true,
      isFirstLogin: false,
      firstName: 'A',
      lastName: 'B',
      email: 'a@b.com',
    };

    it('logs warn when company is not found', async () => {
      mockPrisma.company.findFirst.mockResolvedValue(null);

      await expect(
        service.loginCompany({ companySlug: 'ghost', username: 'admin', password: 'x' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ companySlug: 'ghost', reason: 'company_not_found' }),
        expect.any(String),
      );
    });

    it('logs warn when company user credentials are invalid', async () => {
      mockPrisma.company.findFirst.mockResolvedValue(mockCompany);
      mockPrisma.user.findFirst.mockResolvedValue(mockCompanyUser);
      bcryptCompare.mockResolvedValue(false);

      await expect(
        service.loginCompany({ companySlug: 'acme', username: 'admin', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ companySlug: 'acme', username: 'admin', reason: 'invalid_credentials' }),
        expect.any(String),
      );
    });

    it('logs info on successful company login', async () => {
      mockPrisma.company.findFirst.mockResolvedValue(mockCompany);
      mockPrisma.user.findFirst.mockResolvedValue(mockCompanyUser);
      bcryptCompare.mockResolvedValue(true);

      await service.loginCompany({ companySlug: 'acme', username: 'admin', password: 'correct' });

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ companyId: 'company-1', username: 'admin', role: 'COMPANY_ADMIN' }),
        expect.any(String),
      );
    });
  });

  describe('loginPlatform', () => {
    const mockPlatformUser = {
      id: 'user-3',
      username: 'kevin',
      password: '$hashed$',
      role: 'PLATFORM_ADMIN',
      isActive: true,
      isFirstLogin: false,
      firstName: 'K',
      lastName: 'G',
      email: 'kevin@k.com',
    };

    it('logs warn on invalid platform credentials', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.loginPlatform({ username: 'ghost', password: 'x' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ username: 'ghost', reason: 'invalid_credentials' }),
        expect.any(String),
      );
    });

    it('logs info on successful platform login', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockPlatformUser);
      bcryptCompare.mockResolvedValue(true);

      await service.loginPlatform({ username: 'kevin', password: 'correct' });

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ username: 'kevin', role: 'PLATFORM_ADMIN' }),
        expect.any(String),
      );
    });
  });
});
