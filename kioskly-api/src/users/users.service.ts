import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { CreateStoreUserDto, UpdateStoreUserDto, CreateCompanyUserDto, UpdateCompanyUserDto } from './dto/user.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
  ) {}

  // ─── Store users ──────────────────────────────────────────────────────────

  async getStoreUsers(storeId: string, requestingRole: string, requestingUserId: string) {
    if (requestingRole !== 'PLATFORM_ADMIN') {
      const managedIds = await this.getManagedStoreIds(requestingUserId);
      if (!managedIds.includes(storeId)) throw new ForbiddenException('Access denied');
    }

    const userSelect = {
      id: true, username: true, firstName: true, lastName: true,
      email: true, role: true, isActive: true, isFirstLogin: true, createdAt: true,
      tenant: { select: { id: true, name: true, slug: true } },
    };

    const [primaryUsers, accessRecords] = await Promise.all([
      this.prisma.user.findMany({
        where: { tenantId: storeId },
        select: userSelect,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.userStoreAccess.findMany({
        where: { tenantId: storeId, isActive: true },
        include: { user: { select: userSelect } },
      }),
    ]);

    const primaryIds = new Set(primaryUsers.map(u => u.id));

    const assignedUsers = accessRecords
      .filter(a => !primaryIds.has(a.userId))
      .map(a => ({
        ...a.user,
        isAssigned: true as const,
        assignedRole: a.role,
        primaryStore: a.user.tenant,
      }));

    return [
      ...primaryUsers.map(({ tenant: _tenant, ...u }) => ({ ...u, isAssigned: false as const, assignedRole: undefined, primaryStore: undefined })),
      ...assignedUsers,
    ];
  }

  async createStoreUser(
    storeId: string,
    requestingTenantId: string,
    dto: CreateStoreUserDto,
    requestingUserId: string,
    requestingRole?: string,
  ) {
    if (requestingRole !== 'PLATFORM_ADMIN' && storeId !== requestingTenantId) {
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

  async getCompanyUsers(companyId: string, requestingCompanyId: string, requestingRole?: string) {
    if (requestingRole !== 'PLATFORM_ADMIN' && companyId !== requestingCompanyId) throw new ForbiddenException('Access denied');
    return this.prisma.user.findMany({
      where: { companyId, role: 'COMPANY_ADMIN' },
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

  async getAssignablePool(
    storeId: string,
    requestingUserId: string,
    requestingRole: string,
    query: string,
  ) {
    const managedIds = await this.getManagedStoreIds(requestingUserId);

    if (requestingRole !== 'PLATFORM_ADMIN' && !managedIds.includes(storeId)) {
      throw new ForbiddenException('Access denied');
    }

    // Collect all user IDs in the managed pool
    const [primaryInManaged, assignedInManaged] = await Promise.all([
      this.prisma.user.findMany({
        where: { tenantId: { in: managedIds } },
        select: { id: true },
      }),
      this.prisma.userStoreAccess.findMany({
        where: { tenantId: { in: managedIds }, isActive: true },
        select: { userId: true },
      }),
    ]);

    const poolIds = [...new Set([
      ...primaryInManaged.map(u => u.id),
      ...assignedInManaged.map(a => a.userId),
    ])];

    if (poolIds.length === 0) return [];

    // Collect user IDs already in the target store
    const [existingPrimary, existingAssigned] = await Promise.all([
      this.prisma.user.findMany({ where: { tenantId: storeId }, select: { id: true } }),
      this.prisma.userStoreAccess.findMany({ where: { tenantId: storeId, isActive: true }, select: { userId: true } }),
    ]);
    const excludedIds = new Set([
      ...existingPrimary.map(u => u.id),
      ...existingAssigned.map(a => a.userId),
    ]);

    const eligibleIds = poolIds.filter(id => !excludedIds.has(id));
    if (eligibleIds.length === 0) return [];

    const users = await this.prisma.user.findMany({
      where: {
        id: { in: eligibleIds },
        isActive: true,
        ...(query ? {
          OR: [
            { username: { contains: query, mode: 'insensitive' } },
            { firstName: { contains: query, mode: 'insensitive' } },
            { lastName: { contains: query, mode: 'insensitive' } },
          ],
        } : {}),
      },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        role: true,
        tenant: { select: { id: true, name: true, slug: true, brand: { select: { name: true } } } },
      },
      ...(query ? { take: 20 } : {}),
    });

    return users.map(({ tenant, ...u }) => ({
      ...u,
      primaryStore: tenant ? { id: tenant.id, name: tenant.name, slug: tenant.slug } : undefined,
      brandName: tenant?.brand?.name ?? undefined,
    }));
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

  async updateCompanyUser(
    companyId: string,
    userId: string,
    requestingCompanyId: string,
    requestingRole: string,
    requestingUserId: string,
    dto: UpdateCompanyUserDto,
  ) {
    if (requestingRole !== 'PLATFORM_ADMIN' && companyId !== requestingCompanyId) {
      throw new ForbiddenException('Access denied');
    }
    if (requestingUserId === userId) throw new ForbiddenException('Cannot modify your own account');
    const user = await this.prisma.user.findFirst({ where: { id: userId, companyId } });
    if (!user) throw new NotFoundException('User not found in this company');
    return this.prisma.user.update({
      where: { id: userId },
      data: { isActive: dto.isActive },
      select: { id: true, username: true, firstName: true, lastName: true, email: true, role: true, isActive: true, isFirstLogin: true },
    });
  }

  async deleteCompanyUser(
    companyId: string,
    userId: string,
    requestingCompanyId: string,
    requestingRole: string,
    requestingUserId: string,
  ) {
    if (requestingRole !== 'PLATFORM_ADMIN' && companyId !== requestingCompanyId) {
      throw new ForbiddenException('Access denied');
    }
    if (requestingUserId === userId) throw new ForbiddenException('Cannot remove your own account');
    const user = await this.prisma.user.findFirst({ where: { id: userId, companyId } });
    if (!user) throw new NotFoundException('User not found in this company');
    await this.prisma.user.update({ where: { id: userId }, data: { isActive: false } });
    return { message: 'User removed' };
  }

  async resetCompanyUserPassword(
    companyId: string,
    userId: string,
    requestingCompanyId: string,
    requestingRole: string,
    requestingUserId: string,
  ) {
    if (requestingRole !== 'PLATFORM_ADMIN' && companyId !== requestingCompanyId) {
      throw new ForbiddenException('Access denied');
    }
    if (requestingUserId === userId) throw new ForbiddenException('Cannot reset your own password via this endpoint');
    const user = await this.prisma.user.findFirst({
      where: { id: userId, companyId },
      select: { id: true, username: true, firstName: true, lastName: true, email: true, role: true },
    });
    if (!user) throw new NotFoundException('User not found in this company');
    const password = this.authService.generateSecurePassword();
    const hashed = await bcrypt.hash(password, 12);
    await this.prisma.user.update({ where: { id: userId }, data: { password: hashed, isFirstLogin: true } });
    return { user, temporaryPassword: password, note: 'Share this password via a secure channel. User will be required to change it on first login.' };
  }

  async deleteUser(userId: string, requestingUserId: string) {
    if (requestingUserId === userId) throw new ForbiddenException('Cannot remove your own account');
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    await this.prisma.user.update({ where: { id: userId }, data: { isActive: false } });
    return { message: 'User removed' };
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
    requestingUserId?: string,
  ) {
    const store = await this.prisma.tenant.findUnique({
      where: { id: storeId },
      select: { id: true, companyId: true },
    });
    if (!store) throw new NotFoundException('Store not found');

    if (requestingRole === 'STORE_ADMIN') {
      const managedIds = await this.getManagedStoreIds(requestingUserId!);
      if (!managedIds.includes(storeId)) throw new ForbiddenException('Access denied');

      const user = await this.prisma.user.findFirst({
        where: { username: dto.username, companyId: store.companyId, isActive: true },
      });
      if (!user) throw new NotFoundException(`User "${dto.username}" not found`);

      const inPool = managedIds.includes(user.tenantId ?? '') ||
        !!(await this.prisma.userStoreAccess.findFirst({
          where: { userId: user.id, tenantId: { in: managedIds }, isActive: true },
        }));
      if (!inPool) throw new ForbiddenException('User not in your managed stores');

      return this.upsertStoreAccess(user.id, storeId, dto.role);
    }

    // COMPANY_ADMIN / PLATFORM_ADMIN path (unchanged)
    if (requestingRole !== 'PLATFORM_ADMIN' && store.companyId !== requestingCompanyId) {
      throw new ForbiddenException('Access denied');
    }

    const user = await this.prisma.user.findFirst({
      where: { username: dto.username, companyId: store.companyId, isActive: true },
    });
    if (!user) throw new NotFoundException(`User "${dto.username}" not found in this company`);

    return this.upsertStoreAccess(user.id, storeId, dto.role);
  }

  private async upsertStoreAccess(userId: string, storeId: string, role: 'STORE_ADMIN' | 'CASHIER') {
    const existing = await this.prisma.userStoreAccess.findFirst({
      where: { userId, tenantId: storeId },
    });
    if (existing) {
      if (existing.isActive) throw new ConflictException('User already has access to this store');
      return this.prisma.userStoreAccess.update({
        where: { id: existing.id },
        data: { isActive: true, role: role as any },
      });
    }
    return this.prisma.userStoreAccess.create({
      data: { userId, tenantId: storeId, role: role as any },
    });
  }

  async revokeStoreAccess(storeId: string, userId: string, requestingCompanyId: string, requestingRole: string, requestingUserId?: string) {
    const store = await this.prisma.tenant.findUnique({
      where: { id: storeId },
      select: { companyId: true },
    });
    if (!store) throw new NotFoundException('Store not found');

    if (requestingRole === 'STORE_ADMIN') {
      const managedIds = await this.getManagedStoreIds(requestingUserId!);
      if (!managedIds.includes(storeId)) throw new ForbiddenException('Access denied');

      const targetUser = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { tenantId: true },
      });
      if (targetUser?.tenantId === storeId) {
        throw new BadRequestException('Cannot revoke primary store assignment; deactivate the user instead');
      }
    } else if (requestingRole !== 'PLATFORM_ADMIN' && store.companyId !== requestingCompanyId) {
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
        tenant: { select: { id: true, name: true, slug: true, brand: { select: { name: true } } } },
        storeAccess: {
          where: { isActive: true },
          select: { tenantId: true, tenant: { select: { id: true, name: true, slug: true, brand: { select: { name: true } } } } },
        },
      },
      ...(query ? { take: 20 } : {}),
    });

    // Build a unified "all stores" list per user: primary tenantId + storeAccess records
    return users.map(u => {
      const allStores: { id: string; name: string; slug: string; brandName?: string }[] = [];
      if (u.tenant) allStores.push({ id: u.tenant.id, name: u.tenant.name, slug: u.tenant.slug, brandName: u.tenant.brand?.name });
      for (const a of u.storeAccess) {
        if (a.tenant && !allStores.find(s => s.id === a.tenantId)) {
          allStores.push({ id: a.tenant.id, name: a.tenant.name, slug: a.tenant.slug, brandName: a.tenant.brand?.name });
        }
      }
      return { ...u, allStores };
    });
  }

  // ─── Platform: all users for a company ───────────────────────────────────

  async getCompanyAllUsers(companyId: string) {
    const select = {
      id: true,
      username: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      isActive: true,
      isFirstLogin: true,
      createdAt: true,
    };

    const [companyAdmins, storeUsers] = await Promise.all([
      this.prisma.user.findMany({
        where: { companyId, role: 'COMPANY_ADMIN' },
        select,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.findMany({
        where: {
          companyId,
          role: { in: ['STORE_ADMIN', 'ADMIN', 'CASHIER'] },
        },
        select: {
          ...select,
          tenant: { select: { id: true, name: true, slug: true } },
          storeAccess: {
            where: { isActive: true },
            select: {
              tenantId: true,
              role: true,
              tenant: { select: { id: true, name: true, slug: true } },
            },
          },
        },
        orderBy: [{ role: 'asc' }, { createdAt: 'desc' }],
      }),
    ]);

    return { companyAdmins, storeUsers };
  }

  // ─── Platform: reset a user's password ────────────────────────────────────

  async resetPassword(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, firstName: true, lastName: true, email: true, role: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const password = this.authService.generateSecurePassword();
    const hashed = await bcrypt.hash(password, 12);

    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashed, isFirstLogin: true },
    });

    return {
      user,
      temporaryPassword: password,
      note: 'User will be required to change this password on next login.',
    };
  }

  async resetStoreUserPassword(
    storeId: string,
    userId: string,
    requestingUserId: string,
    requestingTenantId: string,
    requestingRole?: string,
  ) {
    if (requestingRole !== 'PLATFORM_ADMIN' && requestingUserId === userId) {
      throw new ForbiddenException('Cannot reset your own password via this endpoint');
    }

    if (requestingRole !== 'PLATFORM_ADMIN' && storeId !== requestingTenantId) {
      throw new ForbiddenException('Access denied');
    }

    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId: storeId },
      select: { id: true, username: true, firstName: true, lastName: true, email: true, role: true, isFirstLogin: true },
    });
    if (!user) throw new NotFoundException(`User not found in this store`);

    const password = this.authService.generateSecurePassword();
    const hashed = await bcrypt.hash(password, 12);

    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashed, isFirstLogin: true },
    });

    return {
      user,
      temporaryPassword: password,
      note: 'Share this password via a secure channel. User will be required to change it on first login.',
    };
  }

  private async assertStoreUserExists(userId: string, storeId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, tenantId: storeId } });
    if (!user) throw new NotFoundException(`User ${userId} not found in this store`);
    return user;
  }

  private async getManagedStoreIds(userId: string): Promise<string[]> {
    const [user, accessRecords] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { tenantId: true } }),
      this.prisma.userStoreAccess.findMany({ where: { userId, isActive: true }, select: { tenantId: true } }),
    ]);
    const ids = accessRecords.map(r => r.tenantId);
    if (user?.tenantId) ids.push(user.tenantId);
    return [...new Set(ids)];
  }
}
