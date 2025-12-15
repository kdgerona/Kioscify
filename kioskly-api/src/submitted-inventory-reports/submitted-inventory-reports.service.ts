import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSubmittedInventoryReportDto } from './dto/create-submitted-inventory-report.dto';
import { SubmittedInventoryReportFiltersDto } from './dto/submitted-inventory-report-filters.dto';
import {
  InventoryProgressionQueryDto,
  ViewMode,
} from './dto/inventory-progression-query.dto';

@Injectable()
export class SubmittedInventoryReportsService {
  constructor(private prisma: PrismaService) {}

  async create(
    createDto: CreateSubmittedInventoryReportDto,
    userId: string,
    tenantId: string,
  ) {
    // Check if report for this date already exists
    const existingReport =
      await this.prisma.submittedInventoryReport.findFirst({
        where: {
          tenantId,
          reportDate: createDto.reportDate,
        },
      });

    if (existingReport) {
      // If replaceExisting is true, delete the old report
      if (createDto.replaceExisting) {
        await this.prisma.submittedInventoryReport.delete({
          where: { id: existingReport.id },
        });
      } else {
        throw new BadRequestException(
          `Inventory report for date ${createDto.reportDate} already exists`,
        );
      }
    }

    return this.prisma.submittedInventoryReport.create({
      data: {
        tenantId,
        userId,
        reportDate: createDto.reportDate,
        inventorySnapshot: createDto.inventorySnapshot as any,
        notes: createDto.notes,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            role: true,
          },
        },
      },
    });
  }

  async findAll(
    tenantId: string,
    filters: SubmittedInventoryReportFiltersDto,
  ) {
    const where: any = { tenantId };

    if (filters.reportDate) {
      where.reportDate = filters.reportDate;
    }

    if (filters.startDate || filters.endDate) {
      where.submittedAt = {};
      if (filters.startDate) {
        where.submittedAt.gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        where.submittedAt.lte = new Date(filters.endDate);
      }
    }

    if (filters.userId) {
      where.userId = filters.userId;
    }

    return this.prisma.submittedInventoryReport.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            role: true,
          },
        },
      },
      orderBy: {
        submittedAt: 'desc',
      },
    });
  }

  async findOne(id: string, tenantId: string) {
    const report = await this.prisma.submittedInventoryReport.findFirst({
      where: { id, tenantId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            role: true,
          },
        },
      },
    });

    if (!report) {
      throw new NotFoundException('Submitted inventory report not found');
    }

    return report;
  }

  async getProgression(
    tenantId: string,
    query: InventoryProgressionQueryDto,
  ) {
    // Determine date range based on view mode
    const endDate = query.endDate ? new Date(query.endDate) : new Date();
    let startDate: Date;

    if (query.startDate) {
      startDate = new Date(query.startDate);
    } else {
      // Default ranges
      const daysToLookBack =
        query.viewMode === ViewMode.DAY_OVER_DAY ? 30 : 84; // 30 days or 12 weeks
      startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - daysToLookBack);
    }

    // Fetch reports in date range
    const reports = await this.prisma.submittedInventoryReport.findMany({
      where: {
        tenantId,
        submittedAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: {
        submittedAt: 'desc',
      },
    });

    if (reports.length === 0) {
      return {
        viewMode: query.viewMode,
        period: {
          start: startDate.toISOString().split('T')[0],
          end: endDate.toISOString().split('T')[0],
        },
        items: [],
      };
    }

    // Group items by inventoryItemId
    const itemsMap = new Map<string, any>();

    reports.forEach((report) => {
      const snapshot = report.inventorySnapshot as any;
      snapshot.items.forEach((item: any) => {
        // Apply category filter if specified
        if (query.categoryFilter && item.category !== query.categoryFilter) {
          return;
        }

        if (!itemsMap.has(item.inventoryItemId)) {
          itemsMap.set(item.inventoryItemId, {
            inventoryItemId: item.inventoryItemId,
            itemName: item.itemName,
            category: item.category,
            unit: item.unit,
            dataPoints: [],
          });
        }

        const itemData = itemsMap.get(item.inventoryItemId);
        itemData.dataPoints.push({
          date: report.reportDate,
          submittedAt: report.submittedAt,
          quantity: item.quantity,
          minStockLevel: item.minStockLevel,
        });
      });
    });

    // Calculate progression for each item
    const progressionItems = Array.from(itemsMap.values()).map((item) => {
      // Sort data points by date (most recent first)
      item.dataPoints.sort(
        (a: any, b: any) =>
          new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
      );

      // Calculate changes and consumption
      const processedData = item.dataPoints.map((point: any, index: number) => {
        let change = 0;
        let percentChange = 0;
        let consumption = 0;

        if (index < item.dataPoints.length - 1) {
          const prevPoint = item.dataPoints[index + 1];
          change = point.quantity - prevPoint.quantity;
          percentChange =
            prevPoint.quantity !== 0
              ? (change / prevPoint.quantity) * 100
              : 0;
          consumption = change < 0 ? Math.abs(change) : 0; // Only negative changes are consumption
        }

        return {
          date: point.date,
          quantity: point.quantity,
          change: parseFloat(change.toFixed(2)),
          percentChange: parseFloat(percentChange.toFixed(2)),
          consumption: parseFloat(consumption.toFixed(2)),
        };
      });

      // Calculate average consumption
      const consumptions = processedData
        .map((d) => d.consumption)
        .filter((c) => c > 0);
      const avgConsumption =
        consumptions.length > 0
          ? consumptions.reduce((sum, c) => sum + c, 0) / consumptions.length
          : 0;
      const totalConsumption = consumptions.reduce((sum, c) => sum + c, 0);

      return {
        inventoryItemId: item.inventoryItemId,
        itemName: item.itemName,
        category: item.category,
        unit: item.unit,
        dailyData: processedData,
        totalConsumption: parseFloat(totalConsumption.toFixed(2)),
        avgDailyConsumption: parseFloat(avgConsumption.toFixed(2)),
      };
    });

    return {
      viewMode: query.viewMode,
      period: {
        start: startDate.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0],
      },
      items: progressionItems,
    };
  }

  async getAlerts(tenantId: string) {
    // Fetch last 14 days of reports
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const reports = await this.prisma.submittedInventoryReport.findMany({
      where: {
        tenantId,
        submittedAt: {
          gte: fourteenDaysAgo,
        },
      },
      orderBy: {
        submittedAt: 'desc',
      },
    });

    if (reports.length === 0) {
      return {
        generatedAt: new Date().toISOString(),
        totalAlerts: 0,
        alertsByType: {
          LOW_STOCK: 0,
          USAGE_SPIKE: 0,
          PROJECTED_STOCKOUT: 0,
        },
        alerts: [],
      };
    }

    const alerts: any[] = [];
    const itemsMap = new Map<string, any[]>();

    // Group data points by item
    reports.forEach((report) => {
      const snapshot = report.inventorySnapshot as any;
      snapshot.items.forEach((item: any) => {
        if (!itemsMap.has(item.inventoryItemId)) {
          itemsMap.set(item.inventoryItemId, []);
        }
        itemsMap.get(item.inventoryItemId)!.push({
          date: report.reportDate,
          submittedAt: report.submittedAt,
          quantity: item.quantity,
          itemName: item.itemName,
          category: item.category,
          unit: item.unit,
          minStockLevel: item.minStockLevel,
        });
      });
    });

    // Calculate alerts for each item
    itemsMap.forEach((dataPoints, inventoryItemId) => {
      // Sort by date (most recent first)
      dataPoints.sort(
        (a, b) =>
          new Date(b.submittedAt).getTime() -
          new Date(a.submittedAt).getTime(),
      );

      const latestPoint = dataPoints[0];
      const currentQuantity = latestPoint.quantity;
      const minStockLevel = latestPoint.minStockLevel;

      // Alert 1: Low Stock
      if (minStockLevel && currentQuantity < minStockLevel) {
        const shortfall = minStockLevel - currentQuantity;
        const severity =
          currentQuantity === 0
            ? 'HIGH'
            : currentQuantity < minStockLevel * 0.5
              ? 'MEDIUM'
              : 'LOW';

        alerts.push({
          type: 'LOW_STOCK',
          severity,
          itemId: inventoryItemId,
          itemName: latestPoint.itemName,
          category: latestPoint.category,
          currentQuantity,
          minStockLevel,
          shortfall: parseFloat(shortfall.toFixed(2)),
        });
      }

      // Calculate consumptions for usage spike and stockout alerts
      if (dataPoints.length > 1) {
        const consumptions: number[] = [];
        for (let i = 0; i < dataPoints.length - 1; i++) {
          const consumption = dataPoints[i + 1].quantity - dataPoints[i].quantity;
          if (consumption > 0) {
            // Only consider positive consumption (decrease in stock)
            consumptions.push(consumption);
          }
        }

        if (consumptions.length > 0) {
          const avgConsumption =
            consumptions.reduce((sum, c) => sum + c, 0) / consumptions.length;
          const latestConsumption = consumptions[0];

          // Alert 2: Usage Spike
          if (latestConsumption > avgConsumption * 1.5) {
            const percentageIncrease =
              ((latestConsumption - avgConsumption) / avgConsumption) * 100;
            const severity =
              latestConsumption > avgConsumption * 2 ? 'HIGH' : 'MEDIUM';

            alerts.push({
              type: 'USAGE_SPIKE',
              severity,
              itemId: inventoryItemId,
              itemName: latestPoint.itemName,
              category: latestPoint.category,
              latestConsumption: parseFloat(latestConsumption.toFixed(2)),
              averageConsumption: parseFloat(avgConsumption.toFixed(2)),
              percentageIncrease: parseFloat(percentageIncrease.toFixed(2)),
            });
          }

          // Alert 3: Projected Stockout
          const avgDailyConsumption = avgConsumption; // Since we're looking at daily reports
          if (avgDailyConsumption > 0) {
            const daysUntilStockout = currentQuantity / avgDailyConsumption;

            if (daysUntilStockout < 7 && daysUntilStockout > 0) {
              const estimatedStockoutDate = new Date();
              estimatedStockoutDate.setDate(
                estimatedStockoutDate.getDate() + Math.floor(daysUntilStockout),
              );

              const severity =
                daysUntilStockout < 3
                  ? 'HIGH'
                  : daysUntilStockout < 5
                    ? 'MEDIUM'
                    : 'LOW';

              alerts.push({
                type: 'PROJECTED_STOCKOUT',
                severity,
                itemId: inventoryItemId,
                itemName: latestPoint.itemName,
                category: latestPoint.category,
                currentQuantity,
                avgDailyConsumption: parseFloat(avgDailyConsumption.toFixed(2)),
                daysUntilStockout: Math.floor(daysUntilStockout),
                estimatedStockoutDate: estimatedStockoutDate
                  .toISOString()
                  .split('T')[0],
              });
            }
          }
        }
      }
    });

    // Count alerts by type
    const alertsByType = {
      LOW_STOCK: alerts.filter((a) => a.type === 'LOW_STOCK').length,
      USAGE_SPIKE: alerts.filter((a) => a.type === 'USAGE_SPIKE').length,
      PROJECTED_STOCKOUT: alerts.filter((a) => a.type === 'PROJECTED_STOCKOUT')
        .length,
    };

    return {
      generatedAt: new Date().toISOString(),
      totalAlerts: alerts.length,
      alertsByType,
      alerts,
    };
  }

  async getStats(tenantId: string) {
    const totalReports = await this.prisma.submittedInventoryReport.count({
      where: { tenantId },
    });

    const reportsThisMonth = await this.prisma.submittedInventoryReport.count({
      where: {
        tenantId,
        submittedAt: {
          gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        },
      },
    });

    const lastReport = await this.prisma.submittedInventoryReport.findFirst({
      where: { tenantId },
      orderBy: { submittedAt: 'desc' },
      select: { submittedAt: true, reportDate: true },
    });

    return {
      totalReports,
      reportsThisMonth,
      lastSubmission: lastReport
        ? {
            date: lastReport.reportDate,
            submittedAt: lastReport.submittedAt,
          }
        : null,
    };
  }
}
