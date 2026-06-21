import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { VoidFiltersDto, VoidStatusFilter } from './dto/void-filters.dto';
import { Prisma } from '@prisma/client';

// Type for transaction with all includes
type TransactionWithIncludes = Prisma.TransactionGetPayload<{
  include: {
    user: {
      select: {
        id: true;
        username: true;
        firstName: true;
        lastName: true;
        email: true;
        role: true;
      };
    };
    items: {
      include: {
        product: true;
        size: true;
        preference: true;
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
    const { items, clientId, timestamp, ...transactionData } =
      createTransactionDto;

    // Offline deduplication: if clientId already exists, return 409
    if (clientId) {
      const existing = await this.prisma.transaction.findFirst({
        where: { tenantId, clientId },
      });
      if (existing) {
        const { ConflictException } = await import('@nestjs/common');
        throw new ConflictException({
          message: 'Transaction already synced',
          id: existing.id,
        });
      }
    }

    const transaction = await this.prisma.transaction.create({
      data: {
        ...transactionData,
        // Preserve the on-device creation time so offline transactions are
        // recorded at the moment of sale, not at sync time.
        ...(timestamp && { timestamp: new Date(timestamp) }),
        userId,
        tenantId,
        clientId,
        items: {
          create: items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            sizeId: item.sizeId,
            preferenceId: item.preferenceId,
            subtotal: item.subtotal,
            discountAmount: item.discountAmount,
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
            firstName: true,
            lastName: true,
            email: true,
            role: true,
          },
        },
        items: {
          include: {
            product: true,
            size: true,
            preference: true,
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
      paymentMethod?: 'CASH' | 'CARD' | 'GCASH' | 'PAYMAYA' | 'ONLINE';
      paymentStatus?: 'COMPLETED' | 'PENDING' | 'FAILED';
      search?: string;
      includeVoided?: boolean;
    },
  ) {
    const where: Prisma.TransactionWhereInput = { tenantId };

    if (filters?.startDate || filters?.endDate) {
      where.timestamp = {};
      if (filters.startDate) where.timestamp.gte = filters.startDate;
      if (filters.endDate) where.timestamp.lte = filters.endDate;
    }

    if (filters?.paymentMethod) {
      where.paymentMethod = filters.paymentMethod as any;
    }

    if (filters?.paymentStatus) {
      (where as any).paymentStatus = filters.paymentStatus;
    }

    if (filters?.search) {
      // Find users whose name or username matches the search term
      const matchingUsers = await this.prisma.user.findMany({
        where: {
          tenantId,
          OR: [
            {
              firstName: { contains: filters.search, mode: 'insensitive' },
            } as any,
            {
              lastName: { contains: filters.search, mode: 'insensitive' },
            } as any,
            {
              username: { contains: filters.search, mode: 'insensitive' },
            } as any,
          ],
        },
        select: { id: true },
      });
      const userIds = matchingUsers.map((u) => u.id);

      (where as any).OR = [
        { transactionId: { contains: filters.search, mode: 'insensitive' } },
        ...(userIds.length ? [{ userId: { in: userIds } }] : []),
      ];
    }

    // Exclude APPROVED void transactions by default (includes NONE, PENDING, REJECTED)
    if (!filters?.includeVoided) {
      (where as any).voidStatus = {
        not: 'APPROVED',
      };
    }

    const transactions = await this.prisma.transaction.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
          },
        },
        items: {
          include: {
            product: true,
            size: true,
            preference: true,
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
            firstName: true,
            lastName: true,
            email: true,
            role: true,
          },
        },
        items: {
          include: {
            product: true,
            size: true,
            preference: true,
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

  async updateRemarks(id: string, tenantId: string, remarks?: string) {
    const transaction = await this.prisma.transaction.findFirst({
      where: { id, tenantId },
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction with ID ${id} not found`);
    }

    const updated = await this.prisma.transaction.update({
      where: { id },
      data: { remarks },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
          },
        },
        items: {
          include: {
            product: true,
            size: true,
            preference: true,
            addons: {
              include: {
                addon: true,
              },
            },
          },
        },
      },
    });

    return this.formatTransaction(updated);
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
          // Exclude APPROVED void transactions (includes NONE, PENDING, REJECTED)
          voidStatus: {
            not: 'APPROVED',
          } as any,
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
      paymentStatus: (transaction as any).paymentStatus || 'COMPLETED',
      cashReceived: transaction.cashReceived,
      change: transaction.change,
      referenceNumber: transaction.referenceNumber,
      remarks: transaction.remarks,
      discountAmount: (transaction as any).discountAmount ?? null,
      timestamp: transaction.timestamp,
      voidStatus: (transaction as any).voidStatus || 'NONE',
      voidReason: (transaction as any).voidReason,
      voidRequestedBy: (transaction as any).voidRequestedBy,
      voidRequestedAt: (transaction as any).voidRequestedAt,
      voidReviewedBy: (transaction as any).voidReviewedBy,
      voidReviewedAt: (transaction as any).voidReviewedAt,
      voidRejectionReason: (transaction as any).voidRejectionReason,
      voidRequester: (transaction as any).voidRequester,
      voidReviewer: (transaction as any).voidReviewer,
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt,
      items: transaction.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        product: item.product,
        quantity: item.quantity,
        sizeId: item.sizeId,
        size: item.size,
        preferenceId: item.preferenceId,
        preference: item.preference ?? null,
        subtotal: item.subtotal,
        discountAmount: item.discountAmount ?? null,
        addons: item.addons?.map((a) => a.addon) || [],
      })),
    };
  }

  /**
   * Request void for a transaction
   * Can be requested by ADMIN or CASHIER
   */
  async requestVoid(
    transactionId: string,
    tenantId: string,
    userId: string,
    reason: string,
    userRole?: string,
  ) {
    // Find transaction
    const transaction = await this.prisma.transaction.findFirst({
      where: { id: transactionId, tenantId },
    });

    if (!transaction) {
      throw new NotFoundException(
        `Transaction with ID ${transactionId} not found`,
      );
    }

    // Validate void status
    if ((transaction as any).voidStatus === 'APPROVED') {
      throw new BadRequestException('Transaction is already voided');
    }

    if ((transaction as any).voidStatus === 'PENDING') {
      throw new BadRequestException('Void request already pending');
    }

    // Admins bypass review — void is approved immediately
    const isAdmin = userRole === 'STORE_ADMIN' || userRole === 'ADMIN';
    const now = new Date();

    // Update transaction with void request
    const updated = await this.prisma.transaction.update({
      where: { id: transactionId },
      data: {
        voidStatus: isAdmin ? 'APPROVED' : 'PENDING',
        voidReason: reason,
        voidRequestedBy: userId,
        voidRequestedAt: now,
        ...(isAdmin && { voidReviewedBy: userId, voidReviewedAt: now }),
      } as any,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
          },
        },
        voidRequester: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
          },
        } as any,
        items: {
          include: {
            product: true,
            size: true,
            preference: true,
            addons: {
              include: {
                addon: true,
              },
            },
          },
        },
      },
    });

    return this.formatTransaction(updated as any);
  }

  /**
   * Get void requests (pending, approved, or rejected)
   * Admin-only endpoint
   */
  async getVoidRequests(tenantId: string, filters: VoidFiltersDto) {
    const where: any = {
      tenantId,
      voidStatus: { not: 'NONE' },
    };

    // Filter by status
    if (filters.status && filters.status !== VoidStatusFilter.ALL) {
      where.voidStatus = filters.status;
    }

    // Date range filter on voidRequestedAt
    if (filters.startDate || filters.endDate) {
      where.voidRequestedAt = {};
      if (filters.startDate) {
        where.voidRequestedAt.gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        where.voidRequestedAt.lte = new Date(filters.endDate);
      }
    }

    const transactions = await this.prisma.transaction.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
          },
        },
        voidRequester: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
          },
        } as any,
        voidReviewer: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
          },
        } as any,
        items: {
          include: {
            product: true,
            size: true,
            preference: true,
            addons: {
              include: {
                addon: true,
              },
            },
          },
        },
      },
      orderBy: { voidRequestedAt: 'desc' } as any,
    });

    return transactions.map((t) => this.formatTransaction(t as any));
  }

  /**
   * Approve void request
   * Admin-only endpoint
   */
  async approveVoid(
    transactionId: string,
    tenantId: string,
    reviewerId: string,
  ) {
    const transaction = await this.prisma.transaction.findFirst({
      where: { id: transactionId, tenantId },
    });

    if (!transaction) {
      throw new NotFoundException(
        `Transaction with ID ${transactionId} not found`,
      );
    }

    if ((transaction as any).voidStatus !== 'PENDING') {
      throw new BadRequestException(
        'Only pending void requests can be approved',
      );
    }

    const updated = await this.prisma.transaction.update({
      where: { id: transactionId },
      data: {
        voidStatus: 'APPROVED',
        voidReviewedBy: reviewerId,
        voidReviewedAt: new Date(),
      } as any,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
          },
        },
        voidRequester: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
          },
        } as any,
        voidReviewer: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
          },
        } as any,
        items: {
          include: {
            product: true,
            size: true,
            preference: true,
            addons: {
              include: {
                addon: true,
              },
            },
          },
        },
      },
    });

    return this.formatTransaction(updated as any);
  }

  /**
   * Reject void request
   * Admin-only endpoint
   */
  async rejectVoid(
    transactionId: string,
    tenantId: string,
    reviewerId: string,
    rejectionReason?: string,
  ) {
    const transaction = await this.prisma.transaction.findFirst({
      where: { id: transactionId, tenantId },
    });

    if (!transaction) {
      throw new NotFoundException(
        `Transaction with ID ${transactionId} not found`,
      );
    }

    if ((transaction as any).voidStatus !== 'PENDING') {
      throw new BadRequestException(
        'Only pending void requests can be rejected',
      );
    }

    const updated = await this.prisma.transaction.update({
      where: { id: transactionId },
      data: {
        voidStatus: 'REJECTED',
        voidReviewedBy: reviewerId,
        voidReviewedAt: new Date(),
        voidRejectionReason: rejectionReason,
      } as any,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
          },
        },
        voidRequester: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
          },
        } as any,
        voidReviewer: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
          },
        } as any,
        items: {
          include: {
            product: true,
            size: true,
            preference: true,
            addons: {
              include: {
                addon: true,
              },
            },
          },
        },
      },
    });

    return this.formatTransaction(updated as any);
  }
}
