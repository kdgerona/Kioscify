import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { Prisma } from '@prisma/client';

type ExpenseWithUser = Prisma.ExpenseGetPayload<{
  include: {
    user: {
      select: {
        id: true;
        username: true;
        email: true;
        role: true;
      };
    };
  };
}>;

@Injectable()
export class ExpensesService {
  constructor(private prisma: PrismaService) {}

  async create(
    createExpenseDto: CreateExpenseDto,
    userId: string,
    tenantId: string,
  ) {
    const expense = await this.prisma.expense.create({
      data: {
        ...createExpenseDto,
        date: createExpenseDto.date ? new Date(createExpenseDto.date) : new Date(),
        userId,
        tenantId,
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

    return this.formatExpense(expense);
  }

  async findAll(
    tenantId: string,
    filters?: {
      startDate?: Date;
      endDate?: Date;
      category?: string;
      minAmount?: number;
      maxAmount?: number;
    },
  ) {
    const where: Prisma.ExpenseWhereInput = { tenantId };

    if (filters?.startDate || filters?.endDate) {
      where.date = {};
      if (filters.startDate) where.date.gte = filters.startDate;
      if (filters.endDate) where.date.lte = filters.endDate;
    }

    if (filters?.category) {
      where.category = filters.category as any;
    }

    if (filters?.minAmount !== undefined || filters?.maxAmount !== undefined) {
      where.amount = {};
      if (filters.minAmount !== undefined) where.amount.gte = filters.minAmount;
      if (filters.maxAmount !== undefined) where.amount.lte = filters.maxAmount;
    }

    const expenses = await this.prisma.expense.findMany({
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
      orderBy: { date: 'desc' },
    });

    return expenses.map((e) => this.formatExpense(e));
  }

  async findOne(id: string, tenantId: string) {
    const expense = await this.prisma.expense.findFirst({
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

    if (!expense) {
      throw new NotFoundException(`Expense with ID ${id} not found`);
    }

    return this.formatExpense(expense);
  }

  async update(
    id: string,
    tenantId: string,
    updateExpenseDto: UpdateExpenseDto,
  ) {
    const expense = await this.prisma.expense.findFirst({
      where: { id, tenantId },
    });

    if (!expense) {
      throw new NotFoundException(`Expense with ID ${id} not found`);
    }

    const updated = await this.prisma.expense.update({
      where: { id },
      data: {
        ...updateExpenseDto,
        date: updateExpenseDto.date ? new Date(updateExpenseDto.date) : undefined,
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

    return this.formatExpense(updated);
  }

  async remove(id: string, tenantId: string) {
    const expense = await this.prisma.expense.findFirst({
      where: { id, tenantId },
    });

    if (!expense) {
      throw new NotFoundException(`Expense with ID ${id} not found`);
    }

    await this.prisma.expense.delete({
      where: { id },
    });

    return { message: 'Expense deleted successfully' };
  }

  async getStats(tenantId: string, period: 'daily' | 'weekly' | 'monthly') {
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case 'daily':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'weekly':
        const weekAgo = new Date(now);
        weekAgo.setDate(now.getDate() - 7);
        startDate = weekAgo;
        break;
      case 'monthly':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
    }

    const expenses = await this.prisma.expense.findMany({
      where: {
        tenantId,
        date: {
          gte: startDate,
        },
      },
    });

    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    const totalCount = expenses.length;
    const averageExpense = totalCount > 0 ? totalExpenses / totalCount : 0;

    const categoryBreakdown = expenses.reduce(
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

    return {
      period,
      startDate,
      endDate: now,
      totalExpenses,
      totalCount,
      averageExpense,
      categoryBreakdown,
    };
  }

  private formatExpense(expense: ExpenseWithUser) {
    return {
      id: expense.id,
      description: expense.description,
      amount: expense.amount,
      category: expense.category,
      date: expense.date,
      receipt: expense.receipt,
      notes: expense.notes,
      userId: expense.userId,
      user: expense.user,
      createdAt: expense.createdAt,
      updatedAt: expense.updatedAt,
    };
  }
}
