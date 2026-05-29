import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PlatformService {
  constructor(private prisma: PrismaService) {}

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
}
