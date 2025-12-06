import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { Prisma } from '@prisma/client';

// Type for transaction with all includes
type TransactionWithIncludes = Prisma.TransactionGetPayload<{
  include: {
    user: {
      select: {
        id: true;
        username: true;
        email: true;
        role: true;
      };
    };
    items: {
      include: {
        product: true;
        size: true;
        addons: {
          include: {
            addon: true;
          };
        };
      };
    };
  };
}>;

// Type for transaction with items only (for stats)
type TransactionWithItems = Prisma.TransactionGetPayload<{
  include: {
    items: true;
  };
}>;

@Injectable()
export class TransactionsService {
  constructor(private prisma: PrismaService) {}

  async create(
    createTransactionDto: CreateTransactionDto,
    userId: string,
    tenantId: string,
  ) {
    const { items, ...transactionData } = createTransactionDto;

    const transaction = await this.prisma.transaction.create({
      data: {
        ...transactionData,
        userId,
        tenantId,
        items: {
          create: items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            sizeId: item.sizeId,
            subtotal: item.subtotal,
            addons: item.addons
              ? {
                  create: item.addons.map((addon) => ({
                    addonId: addon.addonId,
                  })),
                }
              : undefined,
          })),
        },
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
        items: {
          include: {
            product: true,
            size: true,
            addons: {
              include: {
                addon: true,
              },
            },
          },
        },
      },
    });

    return this.formatTransaction(transaction);
  }

  async findAll(
    tenantId: string,
    filters?: {
      startDate?: Date;
      endDate?: Date;
      paymentMethod?: 'CASH' | 'ONLINE';
    },
  ) {
    const where: Prisma.TransactionWhereInput = { tenantId };

    if (filters?.startDate || filters?.endDate) {
      where.timestamp = {};
      if (filters.startDate) where.timestamp.gte = filters.startDate;
      if (filters.endDate) where.timestamp.lte = filters.endDate;
    }

    if (filters?.paymentMethod) {
      where.paymentMethod = filters.paymentMethod;
    }

    const transactions = await this.prisma.transaction.findMany({
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
        items: {
          include: {
            product: true,
            size: true,
            addons: {
              include: {
                addon: true,
              },
            },
          },
        },
      },
      orderBy: { timestamp: 'desc' },
    });

    return transactions.map((t) => this.formatTransaction(t));
  }

  async findOne(id: string, tenantId: string) {
    const transaction = await this.prisma.transaction.findFirst({
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
        items: {
          include: {
            product: true,
            size: true,
            addons: {
              include: {
                addon: true,
              },
            },
          },
        },
      },
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction with ID ${id} not found`);
    }

    return this.formatTransaction(transaction);
  }

  async getStats(tenantId: string, period: 'daily' | 'weekly' | 'monthly') {
    const now = new Date();
    let startDate: Date;
    let weekAgo: Date;

    switch (period) {
      case 'daily':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'weekly':
        weekAgo = new Date(now);
        weekAgo.setDate(now.getDate() - 7);
        startDate = weekAgo;
        break;
      case 'monthly':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
    }

    const transactions: TransactionWithItems[] =
      await this.prisma.transaction.findMany({
        where: {
          tenantId,
          timestamp: {
            gte: startDate,
          },
        },
        include: {
          items: true,
        },
      });

    const totalSales = transactions.reduce(
      (sum: number, t) => sum + t.total,
      0,
    );
    const totalTransactions = transactions.length;
    const averageTransaction =
      totalTransactions > 0 ? totalSales / totalTransactions : 0;

    const paymentMethodBreakdown = transactions.reduce(
      (acc, t) => {
        if (t.paymentMethod === 'CASH') {
          acc.cash += t.total;
          acc.cashCount += 1;
        } else {
          acc.online += t.total;
          acc.onlineCount += 1;
        }
        return acc;
      },
      { cash: 0, cashCount: 0, online: 0, onlineCount: 0 },
    );

    const totalItems = transactions.reduce(
      (sum: number, t) =>
        sum +
        t.items.reduce((itemSum: number, item) => itemSum + item.quantity, 0),
      0,
    );

    return {
      period,
      startDate,
      endDate: now,
      totalSales,
      totalTransactions,
      averageTransaction,
      totalItems,
      paymentMethodBreakdown,
    };
  }

  private formatTransaction(transaction: TransactionWithIncludes) {
    return {
      id: transaction.id,
      transactionId: transaction.transactionId,
      userId: transaction.userId,
      user: transaction.user,
      subtotal: transaction.subtotal,
      total: transaction.total,
      paymentMethod: transaction.paymentMethod,
      cashReceived: transaction.cashReceived,
      change: transaction.change,
      referenceNumber: transaction.referenceNumber,
      timestamp: transaction.timestamp,
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt,
      items: transaction.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        product: item.product,
        quantity: item.quantity,
        sizeId: item.sizeId,
        size: item.size,
        subtotal: item.subtotal,
        addons: item.addons?.map((a) => a.addon) || [],
      })),
    };
  }
}
