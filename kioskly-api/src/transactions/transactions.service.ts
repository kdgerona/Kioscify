import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { VoidFiltersDto, VoidStatusFilter } from './dto/void-filters.dto';
import { Prisma, RewardEvent } from '@prisma/client';
import { RewardsService } from '../rewards/rewards.service';
import { getZonedDayBounds, getZonedMonthBounds } from '../common/utils/timezone';
import {
  PaginationParams,
  pageArgs,
  toPaginated,
  toPagination,
} from '../common/utils/pagination';

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
    rewardEvents: true,
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
  constructor(
    private prisma: PrismaService,
    private rewardsService: RewardsService,
  ) {}

  async create(
    createTransactionDto: CreateTransactionDto,
    userId: string,
    tenantId: string,
  ) {
    // `rewards` is not a Transaction column; it becomes RewardEvent rows below.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { items, clientId, timestamp, rewards, ...transactionData } =
      createTransactionDto;

    // Offline deduplication: if clientId already exists, return 409
    if (clientId) {
      const existing = await this.prisma.transaction.findFirst({
        where: { tenantId, clientId },
      });
      if (existing) {
        throw new ConflictException({
          message: 'Transaction already synced',
          id: existing.id,
        });
      }
    }

    // Validate reward applications before writing anything (400 on malformed).
    const rewardDrafts = await this.rewardsService.prepareTransactionRewards(
      tenantId,
      userId,
      createTransactionDto,
    );

    const createArgs = {
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
        rewardEvents: true,
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
    } satisfies Prisma.TransactionCreateArgs;

    let transaction: TransactionWithIncludes;
    try {
      if (rewardDrafts.length === 0) {
        transaction = await this.prisma.transaction.create(createArgs);
      } else {
        // Transaction + its reward events commit together or not at all.
        transaction = await this.prisma.$transaction(async (tx) => {
          const created = await tx.transaction.create(createArgs);
          await tx.rewardEvent.createMany({
            data: rewardDrafts.map((d) => ({ ...d, transactionId: created.id })),
          });
          const rewardEvents = await tx.rewardEvent.findMany({
            where: { transactionId: created.id },
            orderBy: { createdAt: 'asc' },
          });
          return { ...created, rewardEvents };
        });
      }
    } catch (err) {
      // Concurrent sync of the same offline sale: the unique (tenantId, clientId)
      // index rejects the loser; report it like the pre-check does.
      if (
        clientId &&
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const existing = await this.prisma.transaction.findFirst({
          where: { tenantId, clientId },
        });
        if (existing) {
          throw new ConflictException({
            message: 'Transaction already synced',
            id: existing.id,
          });
        }
      }
      throw err;
    }

    return this.formatTransaction(transaction);
  }

  async findAll(
    tenantId: string,
    filters?: {
      startDate?: Date;
      endDate?: Date;
      paymentMethod?: 'CASH' | 'GCASH' | 'PAYMAYA' | 'ONLINE' | 'FOODPANDA' | 'GRAB' | 'SPLIT';
      paymentStatus?: 'COMPLETED' | 'PENDING' | 'FAILED';
      search?: string;
      includeVoided?: boolean;
    },
    pagination?: PaginationParams,
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

    const [transactions, total] = await Promise.all([
      this.prisma.transaction.findMany({
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
          rewardEvents: true,
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
        ...pageArgs(pagination),
      }),
      pagination ? this.prisma.transaction.count({ where }) : 0,
    ]);

    // Unpaginated callers (dashboard, analytics, mobile reports) still get a
    // plain array; only callers that pass a page get the paged envelope.
    if (!pagination) {
      return transactions.map((t) => this.formatTransaction(t));
    }

    return toPaginated(
      transactions.map((t) => this.formatTransaction(t)),
      total,
      pagination,
    );
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
        rewardEvents: true,
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
        rewardEvents: true,
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
        startDate = getZonedDayBounds(now).start;
        break;
      case 'weekly':
        weekAgo = new Date(now);
        weekAgo.setDate(now.getDate() - 7);
        startDate = weekAgo;
        break;
      case 'monthly':
        startDate = getZonedMonthBounds(now).start;
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

  private formatTransaction(
    transaction: TransactionWithIncludes & { rewardEvents?: RewardEvent[] },
  ) {
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
      payments: (transaction as any).payments ?? undefined,
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
      rewards: (transaction.rewardEvents ?? [])
        .slice()
        .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))
        .map((e) => ({
          id: e.id,
          programId: e.programId,
          programType: e.programType,
          programName: e.programName,
          type: e.type,
          slotKey: e.slotKey ?? null,
          slotLabel: e.slotLabel ?? null,
          itemIndex: e.itemIndex ?? null,
          productName: e.productName ?? null,
          discountAmount: e.discountAmount ?? null,
          isVoided: e.isVoided,
          validationWarnings: e.validationWarnings ?? [],
          occurredAt: e.occurredAt,
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

    // Update transaction with void request. A direct (admin) approval also
    // voids the transaction's reward events, atomically.
    const run = async (client: Prisma.TransactionClient | PrismaService) => {
      if (isAdmin) {
        await this.rewardsService.markTransactionVoided(transactionId, client);
      }
      return client.transaction.update({
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
          rewardEvents: true,
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
    };
    const updated = isAdmin
      ? await this.prisma.$transaction((tx) => run(tx))
      : await run(this.prisma);

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

    const pagination = toPagination(filters.page, filters.limit);
    const [transactions, total] = await Promise.all([
      this.prisma.transaction.findMany({
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
        rewardEvents: true,
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
      ...pageArgs(pagination),
    }),
      pagination ? this.prisma.transaction.count({ where }) : 0,
    ]);

    const formatted = transactions.map((t) => this.formatTransaction(t as any));
    return pagination ? toPaginated(formatted, total, pagination) : formatted;
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

    // Approving the void also voids the transaction's reward events, atomically.
    const updated = await this.prisma.$transaction(async (tx) => {
      await this.rewardsService.markTransactionVoided(transactionId, tx);
      return tx.transaction.update({
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
          rewardEvents: true,
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
        rewardEvents: true,
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
