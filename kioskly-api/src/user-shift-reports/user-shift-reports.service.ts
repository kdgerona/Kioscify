import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSubmittedReportDto } from '../submitted-reports/dto/create-submitted-report.dto';
import { UserShiftReportFiltersDto } from './dto/user-shift-report-filters.dto';
import { getZonedDateString, getZonedMonthBounds } from '../common/utils/timezone';

@Injectable()
export class UserShiftReportsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateSubmittedReportDto, userId: string, tenantId: string) {
    // Offline deduplication — see schema.prisma's UserShiftInventoryReport comment for why.
    if (dto.clientId) {
      const existing = await this.prisma.userShiftReport.findFirst({
        where: { tenantId, clientId: dto.clientId },
      });
      if (existing) {
        throw new ConflictException({
          message: 'Shift report already synced',
          id: existing.id,
        });
      }
    }

    return this.prisma.userShiftReport.create({
      data: {
        tenantId,
        userId,
        reportDate: dto.reportDate,
        periodStart: new Date(dto.periodStart),
        periodEnd: new Date(dto.periodEnd),
        salesSnapshot: dto.salesSnapshot as any,
        expensesSnapshot: dto.expensesSnapshot as any,
        summarySnapshot: dto.summarySnapshot as any,
        transactionIds: dto.transactionIds,
        expenseIds: dto.expenseIds,
        notes: dto.notes,
        clientId: dto.clientId,
        ...(dto.submittedAt && { submittedAt: new Date(dto.submittedAt) }),
      },
      include: {
        user: {
          select: { id: true, username: true, firstName: true, lastName: true, email: true, role: true },
        },
      },
    });
  }

  async findAll(
    tenantId: string,
    requestingUserId: string,
    requestingUserRole: string,
    filters: UserShiftReportFiltersDto,
  ) {
    const where: any = { tenantId };

    // CASHIER can only see their own reports
    if (requestingUserRole === 'CASHIER') {
      where.userId = requestingUserId;
    } else if (filters.userId) {
      where.userId = filters.userId;
    }

    if (filters.reportDate) {
      where.reportDate = filters.reportDate;
    }

    if (filters.startDate || filters.endDate) {
      where.submittedAt = {};
      if (filters.startDate) where.submittedAt.gte = new Date(filters.startDate);
      if (filters.endDate) where.submittedAt.lte = new Date(filters.endDate);
    }

    return this.prisma.userShiftReport.findMany({
      where,
      include: {
        user: {
          select: { id: true, username: true, firstName: true, lastName: true, email: true, role: true },
        },
      },
      orderBy: { submittedAt: 'desc' },
    });
  }

  async findOne(id: string, tenantId: string, requestingUserId: string, requestingUserRole: string) {
    const report = await this.prisma.userShiftReport.findFirst({
      where: { id, tenantId },
      include: {
        user: {
          select: { id: true, username: true, firstName: true, lastName: true, email: true, role: true },
        },
      },
    });

    if (!report) throw new NotFoundException('Shift report not found');

    if (requestingUserRole === 'CASHIER' && report.userId !== requestingUserId) {
      throw new ForbiddenException('Access denied');
    }

    const [transactions, expenses] = await Promise.all([
      this.prisma.transaction.findMany({
        where: { id: { in: report.transactionIds }, tenantId },
        include: {
          items: {
            include: {
              product: true,
              size: true,
              addons: { include: { addon: true } },
            },
          },
          user: { select: { id: true, username: true, email: true } },
        },
        orderBy: { timestamp: 'desc' },
      }),
      this.prisma.expense.findMany({
        where: { id: { in: report.expenseIds }, tenantId },
        include: { user: { select: { id: true, username: true, email: true } } },
        orderBy: { date: 'desc' },
      }),
    ]);

    const voidedTransactionIds = transactions.filter((t: any) => t.voidStatus === 'APPROVED').map((t) => t.id);
    const voidedExpenseIds = expenses.filter((e: any) => e.voidStatus === 'APPROVED').map((e) => e.id);

    return {
      ...report,
      transactions,
      expenses,
      hasVoidedTransactions: voidedTransactionIds.length > 0,
      voidedTransactionIds,
      hasVoidedExpenses: voidedExpenseIds.length > 0,
      voidedExpenseIds,
    };
  }

  async getStats(userId: string, tenantId: string) {
    const [totalReports, reportsThisMonth, lastReport] = await Promise.all([
      this.prisma.userShiftReport.count({ where: { tenantId, userId } }),
      this.prisma.userShiftReport.count({
        where: {
          tenantId,
          userId,
          submittedAt: { gte: getZonedMonthBounds(new Date()).start },
        },
      }),
      this.prisma.userShiftReport.findFirst({
        where: { tenantId, userId },
        orderBy: { submittedAt: 'desc' },
        select: { submittedAt: true, reportDate: true },
      }),
    ]);

    return {
      totalReports,
      reportsThisMonth,
      lastSubmission: lastReport
        ? { date: lastReport.reportDate, submittedAt: lastReport.submittedAt }
        : null,
    };
  }

  async getTodayCount(userId: string, tenantId: string) {
    const today = getZonedDateString(new Date());
    return this.prisma.userShiftReport.count({
      where: { tenantId, userId, reportDate: today },
    });
  }
}
