import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSubmittedReportDto } from './dto/create-submitted-report.dto';
import { SubmittedReportFiltersDto } from './dto/submitted-report-filters.dto';

@Injectable()
export class SubmittedReportsService {
  constructor(private prisma: PrismaService) {}

  async create(
    createDto: CreateSubmittedReportDto,
    userId: string,
    tenantId: string,
  ) {
    return this.prisma.submittedReport.create({
      data: {
        tenantId,
        userId,
        reportDate: createDto.reportDate,
        periodStart: new Date(createDto.periodStart),
        periodEnd: new Date(createDto.periodEnd),
        salesSnapshot: createDto.salesSnapshot as any,
        expensesSnapshot: createDto.expensesSnapshot as any,
        summarySnapshot: createDto.summarySnapshot as any,
        transactionIds: createDto.transactionIds,
        expenseIds: createDto.expenseIds,
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

  async findAll(tenantId: string, filters: SubmittedReportFiltersDto) {
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

    return this.prisma.submittedReport.findMany({
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
    const report = await this.prisma.submittedReport.findFirst({
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
      throw new NotFoundException('Submitted report not found');
    }

    // Fetch full transaction details
    const transactions = await this.prisma.transaction.findMany({
      where: {
        id: { in: report.transactionIds },
        tenantId,
      },
      include: {
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
        user: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
      },
      orderBy: {
        timestamp: 'desc',
      },
    });

    // Check for voided transactions
    const voidedTransactionIds = transactions
      .filter((t) => (t as any).voidStatus === 'APPROVED')
      .map((t) => t.id);

    // Fetch full expense details
    const expenses = await this.prisma.expense.findMany({
      where: {
        id: { in: report.expenseIds },
        tenantId,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
      },
      orderBy: {
        date: 'desc',
      },
    });

    return {
      ...report,
      transactions,
      expenses,
      // Flag if any transactions were voided after submission
      hasVoidedTransactions: voidedTransactionIds.length > 0,
      voidedTransactionIds,
    };
  }

  async getStats(tenantId: string) {
    const totalReports = await this.prisma.submittedReport.count({
      where: { tenantId },
    });

    const reportsThisMonth = await this.prisma.submittedReport.count({
      where: {
        tenantId,
        submittedAt: {
          gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        },
      },
    });

    const lastReport = await this.prisma.submittedReport.findFirst({
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
