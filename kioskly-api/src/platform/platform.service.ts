import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { UpdateMaintenanceStatusDto } from './dto/update-maintenance-status.dto';
import { CreatePlatformAdminDto } from './dto/create-platform-admin.dto';
import * as bcrypt from 'bcrypt';
import { getZonedMonthBounds } from '../common/utils/timezone';
import { tombstoneUser } from '../common/utils/soft-delete-user';

@Injectable()
export class PlatformService {
  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
  ) {}

  async getStats() {
    const now = new Date();
    const startOfMonth = getZonedMonthBounds(now).start;

    const [totalCompanies, totalBrands, totalStores, activeCompanies, newStoresThisMonth, newCompaniesThisMonth] =
      await Promise.all([
        this.prisma.company.count(),
        this.prisma.brand.count(),
        this.prisma.tenant.count(),
        this.prisma.company.count({ where: { isActive: true } }),
        this.prisma.tenant.count({ where: { createdAt: { gte: startOfMonth } } }),
        this.prisma.company.count({ where: { createdAt: { gte: startOfMonth } } }),
      ]);

    // Monthly active stores = stores with at least 1 transaction this month
    const activeStoreIds = await this.prisma.transaction.findMany({
      where: { timestamp: { gte: startOfMonth } },
      select: { tenantId: true },
      distinct: ['tenantId'],
    });

    return {
      totalCompanies,
      activeCompanies,
      totalBrands,
      totalStores,
      monthlyActiveStores: activeStoreIds.length,
      newStoresThisMonth,
      newCompaniesThisMonth,
    };
  }

  async getCompanies(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [companies, total] = await Promise.all([
      this.prisma.company.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { brands: true, stores: true } },
        },
      }),
      this.prisma.company.count(),
    ]);

    return {
      data: companies,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getMaintenanceStatus() {
    return this.prisma.platformConfig.upsert({
      where: { key: 'global' },
      update: {},
      create: {
        storePortalMaintenance: false,
        companyPortalMaintenance: false,
        mobileAppMaintenance: false,
      },
    });
  }

  async updateMaintenanceStatus(dto: UpdateMaintenanceStatusDto) {
    return this.prisma.platformConfig.upsert({
      where: { key: 'global' },
      update: dto,
      create: {
        storePortalMaintenance: dto.storePortalMaintenance ?? false,
        companyPortalMaintenance: dto.companyPortalMaintenance ?? false,
        mobileAppMaintenance: dto.mobileAppMaintenance ?? false,
      },
    });
  }

  async getActivity() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [recentCompanies, recentStores] = await Promise.all([
      this.prisma.company.findMany({
        where: { createdAt: { gte: thirtyDaysAgo } },
        select: { id: true, name: true, slug: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.tenant.findMany({
        where: { createdAt: { gte: thirtyDaysAgo } },
        select: {
          id: true,
          name: true,
          slug: true,
          createdAt: true,
          company: { select: { name: true } },
          brand: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    return { recentCompanies, recentStores };
  }

  // ─── Platform admin CRUD ──────────────────────────────────────────────────

  async getPlatformAdmins() {
    return this.prisma.user.findMany({
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
  }

  async createPlatformAdmin(dto: CreatePlatformAdminDto) {
    const existing = await this.prisma.user.findFirst({
      where: {
        role: 'PLATFORM_ADMIN',
        tombstone: { not: 1 },
        OR: [{ username: dto.username }, { email: dto.email }],
      },
    });
    if (existing) throw new ConflictException('Username or email already exists');

    const password = this.authService.generateSecurePassword();
    const hashed = await bcrypt.hash(password, 12);

    const user = await this.prisma.user.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        username: dto.username,
        password: hashed,
        role: 'PLATFORM_ADMIN',
        isFirstLogin: true,
        isActive: true,
        tenantId: null,
        companyId: null,
      },
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
    });

    return {
      user,
      temporaryPassword: password,
      note: 'Share this password via a secure channel. User will be required to change it on first login.',
    };
  }

  async updatePlatformAdmin(
    requestingUserId: string,
    targetId: string,
    dto: { isActive: boolean },
  ) {
    if (requestingUserId === targetId) {
      throw new ForbiddenException('Cannot modify your own account');
    }
    const user = await this.prisma.user.findFirst({
      where: { id: targetId, role: 'PLATFORM_ADMIN', tombstone: { not: 1 } },
    });
    if (!user) throw new NotFoundException('Platform admin not found');

    return this.prisma.user.update({
      where: { id: targetId },
      data: { isActive: dto.isActive },
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
    });
  }

  async resetPlatformAdminPassword(targetId: string) {
    const existing = await this.prisma.user.findFirst({
      where: { id: targetId, role: 'PLATFORM_ADMIN', tombstone: { not: 1 } },
    });
    if (!existing) throw new NotFoundException('Platform admin not found');

    const password = this.authService.generateSecurePassword();
    const hashed = await bcrypt.hash(password, 12);
    const user = await this.prisma.user.update({
      where: { id: targetId },
      data: { password: hashed, isFirstLogin: true },
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
    });

    return {
      user,
      temporaryPassword: password,
      note: 'Share this password via a secure channel. User will be required to change it on first login.',
    };
  }

  async deletePlatformAdmin(requestingUserId: string, targetId: string) {
    if (requestingUserId === targetId) {
      throw new ForbiddenException('Cannot delete your own account');
    }
    const user = await this.prisma.user.findFirst({
      where: { id: targetId, role: 'PLATFORM_ADMIN', tombstone: { not: 1 } },
    });
    if (!user) throw new NotFoundException('Platform admin not found');

    await tombstoneUser(this.prisma, targetId);
    return { message: 'Platform admin deleted' };
  }
}
