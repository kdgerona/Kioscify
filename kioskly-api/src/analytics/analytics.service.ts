// kioskly-api/src/analytics/analytics.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getOverview(companyId: string, startDate: Date, endDate: Date) {
    const [totalBrands, allStores] = await Promise.all([
      this.prisma.brand.count({ where: { companyId, tombstone: { not: 1 } } }),
      this.prisma.tenant.findMany({
        where: { companyId, tombstone: { not: 1 } },
        select: { id: true },
      }),
    ]);
    const storeIds = allStores.map(s => s.id);

    const activeGroups = await this.prisma.transaction.groupBy({
      by: ['tenantId'],
      where: {
        tenantId: { in: storeIds },
        voidStatus: { not: 'APPROVED' as const },
        timestamp: { gte: startDate, lte: endDate },
      },
    });

    return {
      totalBrands,
      totalStores: storeIds.length,
      activeStores: activeGroups.length,
    };
  }

  async getTopBrands(companyId: string, startDate: Date, endDate: Date) {
    const brands = await this.prisma.brand.findMany({
      where: { companyId, tombstone: { not: 1 } },
      select: {
        id: true,
        name: true,
        themeColors: true,
        stores: {
          where: { tombstone: { not: 1 } },
          select: { id: true },
        },
      },
    });

    const results = await Promise.all(
      brands.map(async brand => {
        const storeIds = brand.stores.map(s => s.id);
        if (storeIds.length === 0) {
          return {
            brandId: brand.id,
            brandName: brand.name,
            primaryColor: (brand.themeColors as any)?.primary ?? '#ea580c',
            storeCount: 0,
            unitsSold: 0,
          };
        }
        const filter = {
          tenantId: { in: storeIds },
          voidStatus: { not: 'APPROVED' as const },
          timestamp: { gte: startDate, lte: endDate },
        };
        const transactions = await this.prisma.transaction.findMany({ where: filter, select: { id: true } });
        const txIds = transactions.map(t => t.id);
        const itemAgg = await this.prisma.transactionItem.aggregate({
          where: { transactionId: { in: txIds } },
          _sum: { quantity: true },
        });
        return {
          brandId: brand.id,
          brandName: brand.name,
          primaryColor: (brand.themeColors as any)?.primary ?? '#ea580c',
          storeCount: storeIds.length,
          unitsSold: itemAgg._sum.quantity ?? 0,
        };
      }),
    );

    return results.sort((a, b) => b.unitsSold - a.unitsSold);
  }

  async getTopProducts(
    companyId: string,
    brandId: string,
    startDate: Date,
    endDate: Date,
  ) {
    const stores = await this.prisma.tenant.findMany({
      where: { companyId, brandId, tombstone: { not: 1 } },
      select: { id: true },
    });
    const storeIds = stores.map(s => s.id);
    if (storeIds.length === 0) return [];

    const transactions = await this.prisma.transaction.findMany({
      where: {
        tenantId: { in: storeIds },
        voidStatus: { not: 'APPROVED' as const },
        timestamp: { gte: startDate, lte: endDate },
      },
      select: { id: true },
    });
    const txIds = transactions.map(t => t.id);
    if (txIds.length === 0) return [];

    // NOTE: Large txIds arrays (>5000) may slow the $in query on MongoDB.
    // Acceptable at typical franchise scale. For high-volume brands, aggregate via pipeline.
    const grouped = await this.prisma.transactionItem.groupBy({
      by: ['productId'],
      where: { transactionId: { in: txIds } },
      _sum: { quantity: true, subtotal: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 10,
    });

    const products = await this.prisma.product.findMany({
      where: { id: { in: grouped.map(g => g.productId) } },
      select: { id: true, name: true },
    });
    const productMap = new Map(products.map(p => [p.id, p.name]));

    return grouped.map(g => ({
      productId: g.productId,
      productName: productMap.get(g.productId) ?? 'Unknown',
      unitsSold: g._sum.quantity ?? 0,
      totalRevenue: g._sum.subtotal ?? 0,
    }));
  }

  async getTopStores(companyId: string, startDate: Date, endDate: Date) {
    const stores = await this.prisma.tenant.findMany({
      where: { companyId, tombstone: { not: 1 } },
      select: {
        id: true,
        name: true,
        brandId: true,
        brand: { select: { name: true } },
      },
    });

    // TODO: Replace with a single transaction.groupBy aggregation for companies with many stores.
    // Acceptable at typical franchise scale (<50 stores).
    const results = await Promise.all(
      stores.map(async store => {
        const filter = {
          tenantId: store.id,
          voidStatus: { not: 'APPROVED' as const },
          timestamp: { gte: startDate, lte: endDate },
        };
        const [agg, transactionCount] = await Promise.all([
          this.prisma.transaction.aggregate({ where: filter, _sum: { total: true } }),
          this.prisma.transaction.count({ where: filter }),
        ]);
        return {
          storeId: store.id,
          storeName: store.name,
          brandId: store.brandId,
          brandName: store.brand?.name ?? '—',
          totalRevenue: agg._sum.total ?? 0,
          transactionCount,
        };
      }),
    );

    return results.sort((a, b) => b.transactionCount - a.transactionCount).slice(0, 10);
  }

  async getNetworkGrowth(companyId: string, startDate: Date, endDate: Date) {
    const [allBrands, allStores] = await Promise.all([
      this.prisma.brand.findMany({
        where: { companyId, createdAt: { lte: endDate } },
        select: { createdAt: true },
      }),
      this.prisma.tenant.findMany({
        where: { companyId, createdAt: { lte: endDate } },
        select: { createdAt: true },
      }),
    ]);

    const diffDays = Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    const bucketMs =
      diffDays <= 1
        ? 60 * 60 * 1000
        : diffDays <= 31
        ? 24 * 60 * 60 * 1000
        : diffDays <= 90
        ? 7 * 24 * 60 * 60 * 1000
        : 30 * 24 * 60 * 60 * 1000;

    const buckets: { date: string; storeCount: number; brandCount: number }[] = [];
    let cursor = startDate.getTime();
    while (cursor <= endDate.getTime()) {
      const bucketEnd = new Date(cursor);
      buckets.push({
        date: bucketEnd.toISOString(),
        brandCount: allBrands.filter(b => b.createdAt <= bucketEnd).length,
        storeCount: allStores.filter(s => s.createdAt <= bucketEnd).length,
      });
      cursor += bucketMs;
    }
    return buckets;
  }
}
