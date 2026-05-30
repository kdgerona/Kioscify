import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { CreateStoreUserDto, UpdateStoreUserDto, CreateCompanyUserDto } from './dto/user.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
  ) {}

  // ─── Store users ──────────────────────────────────────────────────────────

  async getStoreUsers(storeId: string, requestingTenantId: string) {
    if (storeId !== requestingTenantId) {
      throw new ForbiddenException('Access denied');
    }
    return this.prisma.user.findMany({
      where: { tenantId: storeId },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        isActive: true,
        isFirstLogin: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createStoreUser(
    storeId: string,
    requestingTenantId: string,
    dto: CreateStoreUserDto,
    requestingUserId: string,
  ) {
    if (storeId !== requestingTenantId) {
      throw new ForbiddenException('Access denied');
    }

    // Can't create another STORE_ADMIN without checking limits (allow for now)
    const existing = await this.prisma.user.findFirst({
      where: {
        tenantId: storeId,
        OR: [{ username: dto.username }, { email: dto.email }],
      },
    });
    if (existing) throw new ConflictException('Username or email already exists in this store');

    const store = await this.prisma.tenant.findUnique({
      where: { id: storeId },
      select: { brandId: true, companyId: true },
    });
    if (!store) throw new NotFoundException('Store not found');

    const password = this.authService.generateSecurePassword();
    const hashed = await bcrypt.hash(password, 12);

    const user = await this.prisma.user.create({
      data: {
        tenantId: storeId,
        brandId: store.brandId,
        companyId: store.companyId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        username: dto.username,
        email: dto.email,
        password: hashed,
        role: dto.role,
        isFirstLogin: true,
        isActive: true,
      },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        isFirstLogin: true,
      },
    });

    return {
      user,
      temporaryPassword: password,
      note: 'Share this password via a secure channel. User will be required to change it on first login.',
    };
  }

  async updateStoreUser(
    storeId: string,
    userId: string,
    requestingTenantId: string,
    requestingUserId: string,
    dto: UpdateStoreUserDto,
  ) {
    if (storeId !== requestingTenantId) throw new ForbiddenException('Access denied');
    await this.assertStoreUserExists(userId, storeId);

    // Prevent self-role change
    if (dto.role && userId === requestingUserId) {
      throw new ForbiddenException('Cannot change your own role');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: dto,
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        isActive: true,
      },
    });
  }

  async deleteStoreUser(storeId: string, userId: string, requestingTenantId: string, requestingUserId: string) {
    if (storeId !== requestingTenantId) throw new ForbiddenException('Access denied');
    if (userId === requestingUserId) throw new ForbiddenException('Cannot delete your own account');
    await this.assertStoreUserExists(userId, storeId);

    return this.prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
    });
  }

  // ─── Company users ────────────────────────────────────────────────────────

  async getCompanyUsers(companyId: string, requestingCompanyId: string) {
    if (companyId !== requestingCompanyId) throw new ForbiddenException('Access denied');
    return this.prisma.user.findMany({
      where: { companyId, role: 'COMPANY_ADMIN', tenantId: null },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        isActive: true,
        isFirstLogin: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createCompanyUser(companyId: string, requestingCompanyId: string, dto: CreateCompanyUserDto) {
    if (companyId !== requestingCompanyId) throw new ForbiddenException('Access denied');

    const existing = await this.prisma.user.findFirst({
      where: { companyId, username: dto.username, tenantId: null },
    });
    if (existing) throw new ConflictException('Username already exists in this company');

    const password = this.authService.generateSecurePassword();
    const hashed = await bcrypt.hash(password, 12);

    const user = await this.prisma.user.create({
      data: {
        companyId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        username: dto.username,
        email: dto.email,
        password: hashed,
        role: 'COMPANY_ADMIN',
        isFirstLogin: true,
        isActive: true,
      },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        isFirstLogin: true,
      },
    });

    return {
      user,
      temporaryPassword: password,
      note: 'Share this password via a secure channel. User will be required to change it on first login.',
    };
  }

  // ─── Multi-store assignment (COMPANY_ADMIN / PLATFORM_ADMIN) ─────────────

  async getStoreAccess(userId: string) {
    return this.prisma.userStoreAccess.findMany({
      where: { userId, isActive: true },
      include: {
        tenant: {
          select: { id: true, name: true, slug: true, brandId: true, companyId: true },
        },
      },
    });
  }

  async assignUserToStore(
    storeId: string,
    dto: { username: string; role: 'STORE_ADMIN' | 'CASHIER' },
    requestingCompanyId: string,
    requestingRole: string,
  ) {
    const store = await this.prisma.tenant.findUnique({
      where: { id: storeId },
      select: { id: true, companyId: true },
    });
    if (!store) throw new NotFoundException('Store not found');

    // COMPANY_ADMIN can only manage stores within their company
    if (requestingRole !== 'PLATFORM_ADMIN' && store.companyId !== requestingCompanyId) {
      throw new ForbiddenException('Access denied');
    }

    const user = await this.prisma.user.findFirst({
      where: {
        username: dto.username,
        companyId: store.companyId,
        isActive: true,
      },
    });

    if (!user) {
      throw new NotFoundException(
        `User "${dto.username}" not found in this company`,
      );
    }

    // Check not already assigned
    const existing = await this.prisma.userStoreAccess.findFirst({
      where: { userId: user.id, tenantId: storeId },
    });
    if (existing) {
      if (existing.isActive) {
        throw new ConflictException('User already has access to this store');
      }
      // Reactivate if previously deactivated
      return this.prisma.userStoreAccess.update({
        where: { id: existing.id },
        data: { isActive: true, role: dto.role as any },
      });
    }

    return this.prisma.userStoreAccess.create({
      data: {
        userId: user.id,
        tenantId: storeId,
        role: dto.role as any,
      },
    });
  }

  async revokeStoreAccess(storeId: string, userId: string, requestingCompanyId: string, requestingRole: string) {
    const store = await this.prisma.tenant.findUnique({
      where: { id: storeId },
      select: { companyId: true },
    });
    if (!store) throw new NotFoundException('Store not found');

    if (requestingRole !== 'PLATFORM_ADMIN' && store.companyId !== requestingCompanyId) {
      throw new ForbiddenException('Access denied');
    }

    return this.prisma.userStoreAccess.updateMany({
      where: { userId, tenantId: storeId },
      data: { isActive: false },
    });
  }

  async searchUsersInCompany(companyId: string, query: string) {
    const users = await this.prisma.user.findMany({
      where: {
        companyId,
        isActive: true,
        role: { in: ['STORE_ADMIN', 'CASHIER', 'ADMIN'] },
        OR: query
          ? [
              { username: { contains: query } },
              { email: { contains: query } },
              { firstName: { contains: query } },
              { lastName: { contains: query } },
            ]
          : undefined,
      },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        tenantId: true,
        tenant: { select: { id: true, name: true, slug: true } },
        storeAccess: {
          where: { isActive: true },
          select: { tenantId: true, tenant: { select: { id: true, name: true, slug: true } } },
        },
      },
      take: 20,
    });

    // Build a unified "all stores" list per user: primary tenantId + storeAccess records
    return users.map(u => {
      const allStores: { id: string; name: string; slug: string }[] = [];
      if (u.tenant) allStores.push(u.tenant);
      for (const a of u.storeAccess) {
        if (a.tenant && !allStores.find(s => s.id === a.tenantId)) {
          allStores.push(a.tenant);
        }
      }
      return { ...u, allStores };
    });
  }

  private async assertStoreUserExists(userId: string, storeId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, tenantId: storeId } });
    if (!user) throw new NotFoundException(`User ${userId} not found in this store`);
    return user;
  }
}
