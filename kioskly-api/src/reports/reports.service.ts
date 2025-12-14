import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

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
      },
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
    const averageExpense =
      expenseCount > 0 ? totalExpenses / expenseCount : 0;

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
}
