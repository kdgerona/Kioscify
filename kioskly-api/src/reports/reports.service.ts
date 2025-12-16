import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TimePeriod } from './dto/analytics-query.dto';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Calculate date range based on period type
   */
  private calculateDateRange(
    period: TimePeriod,
    startDate?: string,
    endDate?: string,
  ): { start: Date; end: Date } {
    const now = new Date();
    let start: Date;
    let end: Date = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999,
    );

    switch (period) {
      case TimePeriod.DAILY:
        start = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          0,
          0,
          0,
          0,
        );
        break;

      case TimePeriod.WEEKLY: {
        const dayOfWeek = now.getDay();
        const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        start = new Date(now);
        start.setDate(now.getDate() - diffToMonday);
        start.setHours(0, 0, 0, 0);
        break;
      }

      case TimePeriod.MONTHLY:
        start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        break;

      case TimePeriod.YEARLY:
        start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
        break;

      case TimePeriod.OVERALL:
        start = new Date(0);
        break;

      case TimePeriod.CUSTOM:
        if (!startDate || !endDate) {
          throw new Error('Start and end dates are required for custom period');
        }
        start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        break;

      default:
        start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    }

    return { start, end };
  }

  /**
   * Generate a comprehensive daily report for today
   * Includes sales, expenses, and calculated metrics
   */
  async getDailyReport(tenantId: string, date?: Date) {
    const targetDate = date || new Date();
    const startOfDay = new Date(
      targetDate.getFullYear(),
      targetDate.getMonth(),
      targetDate.getDate(),
    );
    const endOfDay = new Date(
      targetDate.getFullYear(),
      targetDate.getMonth(),
      targetDate.getDate(),
      23,
      59,
      59,
      999,
    );

    // Fetch transactions for the day
    const transactions = await this.prisma.transaction.findMany({
      where: {
        tenantId,
        timestamp: {
          gte: startOfDay,
          lte: endOfDay,
        },
        // Exclude APPROVED void transactions (includes null, NONE, PENDING, REJECTED)
        OR: [
          { voidStatus: { not: 'APPROVED' } as any },
          { voidStatus: null as any },
        ],
      } as any,
      include: {
        items: true,
      },
    });

    // Fetch expenses for the day
    const expenses = await this.prisma.expense.findMany({
      where: {
        tenantId,
        date: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    });

    // Calculate sales metrics
    const totalSales = transactions.reduce((sum, t) => sum + t.total, 0);
    const transactionCount = transactions.length;
    const averageTransaction =
      transactionCount > 0 ? totalSales / transactionCount : 0;

    // Payment method breakdown
    const paymentMethodBreakdown = transactions.reduce(
      (acc, t) => {
        const method = t.paymentMethod;
        if (!acc[method]) {
          acc[method] = { total: 0, count: 0 };
        }
        acc[method].total += t.total;
        acc[method].count += 1;
        return acc;
      },
      {} as Record<string, { total: number; count: number }>,
    );

    // Total items sold
    const totalItemsSold = transactions.reduce(
      (sum, t) =>
        sum + t.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
      0,
    );

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
      date: targetDate.toISOString().split('T')[0],
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
        // Exclude APPROVED void transactions (includes null, NONE, PENDING, REJECTED)
        OR: [
          { voidStatus: { not: 'APPROVED' } as any },
          { voidStatus: null as any },
        ],
      } as any,
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
      orderBy: {
        timestamp: 'asc',
      },
    });

    // Fetch expenses for the period
    const expenses = await this.prisma.expense.findMany({
      where: {
        tenantId,
        date: {
          gte: start,
          lte: end,
        },
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
    const paymentMethodBreakdown = transactions.reduce(
      (acc, t) => {
        const method = t.paymentMethod;
        if (!acc[method]) {
          acc[method] = { total: 0, count: 0 };
        }
        acc[method].total += t.total;
        acc[method].count += 1;
        return acc;
      },
      {} as Record<string, { total: number; count: number }>,
    );

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
              quantity: 0,
              revenue: 0,
            };
          }
          acc[productId].quantity += item.quantity;
          acc[productId].revenue += item.subtotal;
        });
        return acc;
      },
      {} as Record<
        string,
        {
          productId: string;
          productName: string;
          quantity: number;
          revenue: number;
        }
      >,
    );

    const topProducts = Object.values(productSales)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

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
        const date = new Date(t.timestamp).toISOString().split('T')[0];
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
        // Exclude APPROVED void transactions (includes null, NONE, PENDING, REJECTED)
        OR: [
          { voidStatus: { not: 'APPROVED' } as any },
          { voidStatus: null as any },
        ],
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
      salesByDay: Object.values(salesByDay).sort((a, b) =>
        a.date.localeCompare(b.date),
      ),
    };
  }
}
