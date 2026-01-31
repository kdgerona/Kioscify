import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { ExpenseVoidStatusFilter } from './dto/expense-void-filters.dto';
import { Prisma, VoidStatus } from '@prisma/client';

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
        voidRequester: {
          select: {
            id: true,
            username: true,
            email: true,
            role: true,
          },
        },
        voidReviewer: {
          select: {
            id: true,
            username: true,
            email: true,
            role: true,
          },
        },
      },
    });

    return this.formatExpenseWithVoid(expense);
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
        voidRequester: {
          select: {
            id: true,
            username: true,
            email: true,
            role: true,
          },
        },
        voidReviewer: {
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

    return expenses.map((e) => this.formatExpenseWithVoid(e));
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
        voidRequester: {
          select: {
            id: true,
            username: true,
            email: true,
            role: true,
          },
        },
        voidReviewer: {
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

    return this.formatExpenseWithVoid(expense);
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
        voidRequester: {
          select: {
            id: true,
            username: true,
            email: true,
            role: true,
          },
        },
        voidReviewer: {
          select: {
            id: true,
            username: true,
            email: true,
            role: true,
          },
        },
      },
    });

    return this.formatExpenseWithVoid(updated);
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

  async requestVoid(
    expenseId: string,
    tenantId: string,
    userId: string,
    reason: string,
  ) {
    const expense = await this.prisma.expense.findFirst({
      where: { id: expenseId, tenantId },
    });

    if (!expense) {
      throw new NotFoundException(`Expense with ID ${expenseId} not found`);
    }

    if (expense.voidStatus === VoidStatus.APPROVED) {
      throw new BadRequestException('This expense is already voided');
    }

    if (expense.voidStatus === VoidStatus.PENDING) {
      throw new BadRequestException(
        'A void request is already pending for this expense',
      );
    }

    const updated = await this.prisma.expense.update({
      where: { id: expenseId },
      data: {
        voidStatus: VoidStatus.PENDING,
        voidReason: reason,
        voidRequestedBy: userId,
        voidRequestedAt: new Date(),
        voidRejectionReason: null,
        voidReviewedBy: null,
        voidReviewedAt: null,
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
        voidRequester: {
          select: {
            id: true,
            username: true,
            email: true,
            role: true,
          },
        },
        voidReviewer: {
          select: {
            id: true,
            username: true,
            email: true,
            role: true,
          },
        },
      },
    });

    return this.formatExpenseWithVoid(updated);
  }

  async getVoidRequests(
    tenantId: string,
    filters?: {
      status?: ExpenseVoidStatusFilter;
      startDate?: string;
      endDate?: string;
    },
  ) {
    const where: Prisma.ExpenseWhereInput = { tenantId };

    if (filters?.status && filters.status !== ExpenseVoidStatusFilter.ALL) {
      where.voidStatus = filters.status as VoidStatus;
    } else if (!filters?.status) {
      where.voidStatus = VoidStatus.PENDING;
    } else {
      where.voidStatus = { not: VoidStatus.NONE };
    }

    if (filters?.startDate || filters?.endDate) {
      where.voidRequestedAt = {};
      if (filters.startDate) {
        where.voidRequestedAt.gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        where.voidRequestedAt.lte = new Date(filters.endDate);
      }
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
        voidRequester: {
          select: {
            id: true,
            username: true,
            email: true,
            role: true,
          },
        },
        voidReviewer: {
          select: {
            id: true,
            username: true,
            email: true,
            role: true,
          },
        },
      },
      orderBy: { voidRequestedAt: 'desc' },
    });

    return expenses.map((e) => this.formatExpenseWithVoid(e));
  }

  async approveVoid(expenseId: string, tenantId: string, reviewerId: string) {
    const expense = await this.prisma.expense.findFirst({
      where: { id: expenseId, tenantId },
    });

    if (!expense) {
      throw new NotFoundException(`Expense with ID ${expenseId} not found`);
    }

    if (expense.voidStatus !== VoidStatus.PENDING) {
      throw new BadRequestException(
        'Can only approve pending void requests',
      );
    }

    const updated = await this.prisma.expense.update({
      where: { id: expenseId },
      data: {
        voidStatus: VoidStatus.APPROVED,
        voidReviewedBy: reviewerId,
        voidReviewedAt: new Date(),
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
        voidRequester: {
          select: {
            id: true,
            username: true,
            email: true,
            role: true,
          },
        },
        voidReviewer: {
          select: {
            id: true,
            username: true,
            email: true,
            role: true,
          },
        },
      },
    });

    return this.formatExpenseWithVoid(updated);
  }

  async rejectVoid(
    expenseId: string,
    tenantId: string,
    reviewerId: string,
    rejectionReason?: string,
  ) {
    const expense = await this.prisma.expense.findFirst({
      where: { id: expenseId, tenantId },
    });

    if (!expense) {
      throw new NotFoundException(`Expense with ID ${expenseId} not found`);
    }

    if (expense.voidStatus !== VoidStatus.PENDING) {
      throw new BadRequestException('Can only reject pending void requests');
    }

    const updated = await this.prisma.expense.update({
      where: { id: expenseId },
      data: {
        voidStatus: VoidStatus.REJECTED,
        voidReviewedBy: reviewerId,
        voidReviewedAt: new Date(),
        voidRejectionReason: rejectionReason || null,
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
        voidRequester: {
          select: {
            id: true,
            username: true,
            email: true,
            role: true,
          },
        },
        voidReviewer: {
          select: {
            id: true,
            username: true,
            email: true,
            role: true,
          },
        },
      },
    });

    return this.formatExpenseWithVoid(updated);
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

  private formatExpenseWithVoid(expense: any) {
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
      voidStatus: expense.voidStatus,
      voidReason: expense.voidReason,
      voidRequestedBy: expense.voidRequestedBy,
      voidRequestedAt: expense.voidRequestedAt,
      voidReviewedBy: expense.voidReviewedBy,
      voidReviewedAt: expense.voidReviewedAt,
      voidRejectionReason: expense.voidRejectionReason,
      voidRequester: expense.voidRequester,
      voidReviewer: expense.voidReviewer,
      createdAt: expense.createdAt,
      updatedAt: expense.updatedAt,
    };
  }
}
