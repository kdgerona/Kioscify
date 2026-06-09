import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { UpdateMaintenanceStatusDto } from './dto/update-maintenance-status.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class PlatformService {
  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
  ) {}

  async getStats() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

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
  }
}
