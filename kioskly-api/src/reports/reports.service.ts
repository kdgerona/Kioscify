import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TimePeriod } from './dto/analytics-query.dto';
import {
  getZonedHour,
  getZonedDateString,
  getZonedDayBounds,
  getZonedWeekBounds,
  getZonedMonthBounds,
  getZonedYearBounds,
} from '../common/utils/timezone';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  // Shared by all three payment-method breakdowns below (daily/shift/analytics) so
  // the SPLIT-attribution logic can't drift out of sync between them. A SPLIT
  // transaction's `payments` legs are attributed to their own method bucket
  // instead of the whole transaction total landing under one key; legs sum to
  // the transaction total by construction (enforced in CreateTransactionDto),
  // so this never double-counts sales for the period.
  private buildPaymentMethodBreakdown(
    transactions: { paymentMethod: string; total: number; payments?: unknown }[],
  ): Record<string, { total: number; count: number }> {
    const breakdown: Record<string, { total: number; count: number }> = {};
    for (const t of transactions) {
      const splits = (t as any).payments as { method: string; amount: number }[] | undefined;
      if (t.paymentMethod === 'SPLIT' && splits && splits.length > 0) {
        for (const split of splits) {
          if (!breakdown[split.method]) breakdown[split.method] = { total: 0, count: 0 };
          breakdown[split.method].total += split.amount;
          breakdown[split.method].count += 1;
        }
        continue;
      }
      if (!breakdown[t.paymentMethod]) breakdown[t.paymentMethod] = { total: 0, count: 0 };
      breakdown[t.paymentMethod].total += t.total;
      breakdown[t.paymentMethod].count += 1;
    }
    return breakdown;
  }

  /**
   * Calculate date range based on period type
   */
  private calculateDateRange(
    period: TimePeriod,
    startDate?: string,
    endDate?: string,
  ): { start: Date; end: Date } {
    // Frontend always sends client-local ISO strings for every period.
    // Trust them directly — do NOT re-apply setHours() which would shift
    // the boundary to server local time and break cross-timezone deployments.
    if (startDate && endDate) {
      return { start: new Date(startDate), end: new Date(endDate) };
    }

    // Server-side fallback (reached only when no dates are provided) — all
    // boundaries are computed in the store's local timezone (Asia/Manila),
    // not the server process's timezone.
    const now = new Date();

    switch (period) {
      case TimePeriod.DAILY:
        return getZonedDayBounds(now);

      case TimePeriod.YESTERDAY:
        return getZonedDayBounds(new Date(now.getTime() - 24 * 60 * 60 * 1000));

      case TimePeriod.WEEKLY:
        return getZonedWeekBounds(now);

      case TimePeriod.MONTHLY:
        return getZonedMonthBounds(now);

      case TimePeriod.YEARLY:
        return getZonedYearBounds(now);

      case TimePeriod.CUSTOM:
        throw new Error('Start and end dates are required for custom period');

      default:
        return getZonedMonthBounds(now);
    }
  }

  /**
   * Generate a comprehensive daily report for today
   * Includes sales, expenses, and calculated metrics
   */
  async getDailyReport(tenantId: string, date?: Date) {
    const targetDate = date || new Date();
    const { start: startOfDay, end: endOfDay } = getZonedDayBounds(targetDate);

    // Fetch transactions for the day
    const transactions = await this.prisma.transaction.findMany({
      where: {
        tenantId,
        timestamp: {
          gte: startOfDay,
          lte: endOfDay,
        },
        // Exclude APPROVED void transactions (includes NONE, PENDING, REJECTED)
        voidStatus: {
          not: 'APPROVED',
        } as any,
      },
      include: {
        items: {
          include: { product: true, size: true },
        },
      },
    });

    // Fetch expenses for the day (excluding approved void expenses)
    const expenses = await this.prisma.expense.findMany({
      where: {
        tenantId,
        date: {
          gte: startOfDay,
          lte: endOfDay,
        },
        // Exclude APPROVED void expenses
        voidStatus: {
          not: 'APPROVED',
        } as any,
      },
    });

    // Calculate sales metrics
    const totalSales = transactions.reduce((sum, t) => sum + t.total, 0);
    const transactionCount = transactions.length;
    const averageTransaction =
      transactionCount > 0 ? totalSales / transactionCount : 0;

    // Payment method breakdown
    const paymentMethodBreakdown = this.buildPaymentMethodBreakdown(transactions);

    // Total items sold
    const totalItemsSold = transactions.reduce(
      (sum, t) =>
        sum + t.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
      0,
    );

    // Sales by product+size breakdown
    const productMap: Record<string, { productName: string; sizeName?: string; quantity: number; amount: number }> = {};
    for (const t of transactions) {
      for (const item of t.items) {
        const key = `${item.productId}|${item.sizeId ?? ''}`;
        if (!productMap[key]) {
          productMap[key] = {
            productName: (item as any).product?.name ?? item.productId,
            sizeName: (item as any).size?.name,
            quantity: 0,
            amount: 0,
          };
        }
        productMap[key].quantity += item.quantity;
        productMap[key].amount += item.subtotal - ((item as any).discountAmount ?? 0);
      }
    }
    const salesByProduct = Object.values(productMap).sort((a, b) => b.amount - a.amount);

    // Calculate expense metrics
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    const expenseCount = expenses.length;
    const averageExpense = expenseCount > 0 ? totalExpenses / expenseCount : 0;

    // Expense category breakdown
    const expenseCategoryBreakdown = expenses.reduce(
      (acc, e) => {
        const category = e.category;
        if (!acc[category]) {
          acc[category] = { total: 0, count: 0 };
        }
        acc[category].total += e.amount;
        acc[category].count += 1;
        return acc;
      },
      {} as Record<string, { total: number; count: number }>,
    );

    // Calculate derived metrics
    const grossProfit = totalSales - totalExpenses;
    const profitMargin = totalSales > 0 ? (grossProfit / totalSales) * 100 : 0;

    return {
      date: getZonedDateString(targetDate),
      period: {
        start: startOfDay.toISOString(),
        end: endOfDay.toISOString(),
      },
      sales: {
        totalAmount: totalSales,
        transactionCount,
        averageTransaction,
        totalItemsSold,
        paymentMethodBreakdown,
        salesByProduct,
      },
      expenses: {
        totalAmount: totalExpenses,
        expenseCount,
        averageExpense,
        categoryBreakdown: expenseCategoryBreakdown,
      },
      summary: {
        grossProfit,
        profitMargin: Number(profitMargin.toFixed(2)),
        netRevenue: grossProfit, // Same as gross profit for now
      },
    };
  }

  async getUserShiftReport(userId: string, tenantId: string, date?: string) {
    const targetDate = date ? new Date(date) : new Date();
    const { start: startOfDay, end: endOfDay } = getZonedDayBounds(targetDate);

    const [transactions, expenses] = await Promise.all([
      this.prisma.transaction.findMany({
        where: {
          tenantId,
          userId,
          timestamp: { gte: startOfDay, lte: endOfDay },
          voidStatus: { not: 'APPROVED' } as any,
        },
        include: { items: { include: { product: true, size: true } } },
      }),
      this.prisma.expense.findMany({
        where: {
          tenantId,
          userId,
          date: { gte: startOfDay, lte: endOfDay },
          voidStatus: { not: 'APPROVED' } as any,
        },
      }),
    ]);

    const totalSales = transactions.reduce((sum, t) => sum + t.total, 0);
    const transactionCount = transactions.length;
    const averageTransaction = transactionCount > 0 ? totalSales / transactionCount : 0;

    const paymentMethodBreakdown = this.buildPaymentMethodBreakdown(transactions);

    const totalItemsSold = transactions.reduce(
      (sum, t) => sum + t.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
      0,
    );

    // Sales by product+size breakdown
    const shiftProductMap: Record<string, { productName: string; sizeName?: string; quantity: number; amount: number }> = {};
    for (const t of transactions) {
      for (const item of t.items) {
        const key = `${item.productId}|${item.sizeId ?? ''}`;
        if (!shiftProductMap[key]) {
          shiftProductMap[key] = {
            productName: (item as any).product?.name ?? item.productId,
            sizeName: (item as any).size?.name,
            quantity: 0,
            amount: 0,
          };
        }
        shiftProductMap[key].quantity += item.quantity;
        shiftProductMap[key].amount += item.subtotal - ((item as any).discountAmount ?? 0);
      }
    }
    const shiftSalesByProduct = Object.values(shiftProductMap).sort((a, b) => b.amount - a.amount);

    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    const expenseCount = expenses.length;
    const averageExpense = expenseCount > 0 ? totalExpenses / expenseCount : 0;

    const expenseCategoryBreakdown = expenses.reduce(
      (acc, e) => {
        const category = e.category;
        if (!acc[category]) acc[category] = { total: 0, count: 0 };
        acc[category].total += e.amount;
        acc[category].count += 1;
        return acc;
      },
      {} as Record<string, { total: number; count: number }>,
    );

    const grossProfit = totalSales - totalExpenses;
    const profitMargin = totalSales > 0 ? (grossProfit / totalSales) * 100 : 0;

    return {
      date: getZonedDateString(targetDate),
      period: {
        start: startOfDay.toISOString(),
        end: endOfDay.toISOString(),
      },
      sales: {
        totalAmount: totalSales,
        transactionCount,
        averageTransaction,
        totalItemsSold,
        paymentMethodBreakdown,
        salesByProduct: shiftSalesByProduct,
      },
      expenses: {
        totalAmount: totalExpenses,
        expenseCount,
        averageExpense,
        categoryBreakdown: expenseCategoryBreakdown,
      },
      summary: {
        grossProfit,
        profitMargin: Number(profitMargin.toFixed(2)),
        netRevenue: grossProfit,
      },
    };
  }

  /**
   * Generate comprehensive analytics report for a given period
   */
  async getAnalytics(
    tenantId: string,
    period: TimePeriod = TimePeriod.MONTHLY,
    startDate?: string,
    endDate?: string,
  ) {
    const { start, end } = this.calculateDateRange(period, startDate, endDate);

    // Fetch transactions for the period
    const transactions = await this.prisma.transaction.findMany({
      where: {
        tenantId,
        timestamp: {
          gte: start,
          lte: end,
        },
        // Exclude APPROVED void transactions (includes NONE, PENDING, REJECTED)
        voidStatus: {
          not: 'APPROVED',
        } as any,
      } as any,
      include: {
        items: {
          include: {
            product: {
              include: {
                category: true,
              },
            },
            size: true,
          },
        },
      },
      orderBy: {
        timestamp: 'asc',
      },
    });

    // Fetch expenses for the period (excluding approved void expenses)
    const expenses = await this.prisma.expense.findMany({
      where: {
        tenantId,
        date: {
          gte: start,
          lte: end,
        },
        // Exclude APPROVED void expenses
        voidStatus: {
          not: 'APPROVED',
        } as any,
      },
      orderBy: {
        date: 'asc',
      },
    });

    // Calculate sales metrics
    const totalSales = transactions.reduce((sum, t) => sum + t.total, 0);
    const transactionCount = transactions.length;
    const averageTransaction =
      transactionCount > 0 ? totalSales / transactionCount : 0;

    // Payment method breakdown
    const paymentMethodBreakdown = this.buildPaymentMethodBreakdown(transactions);

    // Total items sold
    const totalItemsSold = transactions.reduce(
      (sum, t) =>
        sum + t.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
      0,
    );

    // Top selling products
    const productSales = transactions.reduce(
      (acc, t) => {
        t.items.forEach((item) => {
          const productId = item.productId;
          if (!acc[productId]) {
            acc[productId] = {
              productId,
              productName: item.product.name,
              categoryName: item.product.category?.name,
              quantity: 0,
              revenue: 0,
            };
          }
          acc[productId].quantity += item.quantity;
          acc[productId].revenue += item.subtotal - ((item as any).discountAmount ?? 0);
        });
        return acc;
      },
      {} as Record<
        string,
        {
          productId: string;
          productName: string;
          categoryName?: string;
          quantity: number;
          revenue: number;
        }
      >,
    );

    const topProducts = Object.values(productSales).sort(
      (a, b) => b.revenue - a.revenue,
    );

    // Sales by size
    const sizeMap = new Map<string, { name: string; quantity: number; revenue: number }>();
    for (const transaction of transactions) {
      for (const item of transaction.items) {
        const key = item.sizeId ?? '__no_size__';
        const name = item.size?.name ?? 'No Size';
        const entry = sizeMap.get(key) ?? { name, quantity: 0, revenue: 0 };
        entry.quantity += item.quantity;
        entry.revenue += item.subtotal - ((item as any).discountAmount ?? 0);
        sizeMap.set(key, entry);
      }
    }

    const salesBySize = Array.from(sizeMap.entries())
      .map(([key, s]) => ({
        sizeId: key === '__no_size__' ? null : key,
        name: s.name,
        quantity: s.quantity,
        revenue: s.revenue,
        percentage: totalSales > 0 ? (s.revenue / totalSales) * 100 : 0,
      }))
      .sort((a, b) => {
        if (a.sizeId === null) return 1;
        if (b.sizeId === null) return -1;
        return b.quantity - a.quantity;
      });

    // Calculate expense metrics
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    const expenseCount = expenses.length;
    const averageExpense = expenseCount > 0 ? totalExpenses / expenseCount : 0;

    // Expense category breakdown
    const expenseCategoryBreakdown = expenses.reduce(
      (acc, e) => {
        const category = e.category;
        if (!acc[category]) {
          acc[category] = { total: 0, count: 0 };
        }
        acc[category].total += e.amount;
        acc[category].count += 1;
        return acc;
      },
      {} as Record<string, { total: number; count: number }>,
    );

    // Sales by day (for charts)
    const salesByDay = transactions.reduce(
      (acc, t) => {
        const date = getZonedDateString(t.timestamp);
        if (!acc[date]) {
          acc[date] = { date, total: 0, count: 0 };
        }
        acc[date].total += t.total;
        acc[date].count += 1;
        return acc;
      },
      {} as Record<string, { date: string; total: number; count: number }>,
    );

    // Calculate derived metrics
    const grossProfit = totalSales - totalExpenses;
    const profitMargin = totalSales > 0 ? (grossProfit / totalSales) * 100 : 0;

    // Calculate growth (comparing to previous period)
    const periodLength = end.getTime() - start.getTime();
    const prevStart = new Date(start.getTime() - periodLength);
    const prevEnd = new Date(start.getTime() - 1);

    const prevTransactions = await this.prisma.transaction.findMany({
      where: {
        tenantId,
        timestamp: {
          gte: prevStart,
          lte: prevEnd,
        },
        // Exclude APPROVED void transactions (includes NONE, PENDING, REJECTED)
        voidStatus: {
          not: 'APPROVED',
        } as any,
      } as any,
    });

    const prevSales = prevTransactions.reduce((sum, t) => sum + t.total, 0);
    const salesGrowth =
      prevSales > 0 ? ((totalSales - prevSales) / prevSales) * 100 : 0;

    return {
      period: {
        type: period,
        start: start.toISOString(),
        end: end.toISOString(),
      },
      sales: {
        totalAmount: totalSales,
        transactionCount,
        averageTransaction,
        totalItemsSold,
        paymentMethodBreakdown,
        growth: Number(salesGrowth.toFixed(2)),
      },
      expenses: {
        totalAmount: totalExpenses,
        expenseCount,
        averageExpense,
        categoryBreakdown: expenseCategoryBreakdown,
      },
      summary: {
        grossProfit,
        profitMargin: Number(profitMargin.toFixed(2)),
        netRevenue: grossProfit,
      },
      topProducts,
      salesBySize,
      salesByDay: Object.values(salesByDay).sort((a, b) =>
        a.date.localeCompare(b.date),
      ),
    };
  }

  // ─── Time of Day Trends ────────────────────────────────────────────────────

  async getTimeOfDayTrends(tenantId: string, startDate: Date, endDate: Date) {
    // Enforce 2-year max range
    const TWO_YEARS_MS = 2 * 365 * 24 * 60 * 60 * 1000;
    if (endDate.getTime() - startDate.getTime() > TWO_YEARS_MS) {
      const { BadRequestException } = await import('@nestjs/common');
      throw new BadRequestException('Date range cannot exceed 2 years');
    }

    const transactions = await this.prisma.transaction.findMany({
      where: {
        tenantId,
        timestamp: { gte: startDate, lte: endDate },
        voidStatus: { not: 'APPROVED' } as any,
      },
      select: { timestamp: true, total: true },
    });

    // Aggregate by hour (0-23)
    const hourlyData: Record<number, { hour: number; count: number; totalRevenue: number }> = {};
    for (let h = 0; h < 24; h++) {
      hourlyData[h] = { hour: h, count: 0, totalRevenue: 0 };
    }

    for (const tx of transactions) {
      const hour = getZonedHour(tx.timestamp);
      hourlyData[hour].count += 1;
      hourlyData[hour].totalRevenue += tx.total;
    }

    return {
      period: { start: startDate.toISOString(), end: endDate.toISOString() },
      hourlyBreakdown: Object.values(hourlyData),
    };
  }

  // ─── 2-year limit enforcement ──────────────────────────────────────────────

  validateDateRange(startDate?: Date, endDate?: Date) {
    if (!startDate || !endDate) return;
    const TWO_YEARS_MS = 2 * 365 * 24 * 60 * 60 * 1000;
    if (endDate.getTime() - startDate.getTime() > TWO_YEARS_MS) {
      const { BadRequestException } = require('@nestjs/common');
      throw new BadRequestException('Date range cannot exceed 2 years');
    }
  }
}
