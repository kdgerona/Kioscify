import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserShiftInventoryReportFiltersDto } from './dto/user-shift-inventory-report-filters.dto';
import { CreateSubmittedInventoryReportDto } from '../submitted-inventory-reports/dto/create-submitted-inventory-report.dto';

@Injectable()
export class UserShiftInventoryReportsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateSubmittedInventoryReportDto, userId: string, tenantId: string) {
    const shiftReport = await this.prisma.userShiftInventoryReport.create({
      data: {
        tenantId,
        userId,
        reportDate: dto.reportDate,
        inventorySnapshot: dto.inventorySnapshot as any,
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

    // Mirror to SubmittedInventoryReport so Latest Counts, Progression, and Alerts reflect shift data.
    // Uses a derived clientId so it never collides with the @@unique([tenantId, clientId]) constraint.
    // Wrapped in try/catch so a mirror failure never rejects the primary shift report response.
    try {
      await this.prisma.submittedInventoryReport.create({
        data: {
          tenantId,
          userId,
          reportDate: dto.reportDate,
          inventorySnapshot: dto.inventorySnapshot as any,
          notes: dto.notes,
          clientId: dto.clientId ? `${dto.clientId}-inv` : undefined,
          isShiftMirror: true,
          ...(dto.submittedAt && { submittedAt: new Date(dto.submittedAt) }),
        },
      });
    } catch (e) {
      console.error('[UserShiftInventoryReport] mirror to SubmittedInventoryReport failed:', e);
    }

    return shiftReport;
  }

  async findAll(
    tenantId: string,
    requestingUserId: string,
    requestingUserRole: string,
    filters: UserShiftInventoryReportFiltersDto,
  ) {
    const where: any = { tenantId };

    if (requestingUserRole === 'CASHIER') {
      where.userId = requestingUserId;
    } else if (filters.userId) {
      where.userId = filters.userId;
    }

    if (filters.reportDate) where.reportDate = filters.reportDate;

    if (filters.startDate || filters.endDate) {
      where.submittedAt = {};
      if (filters.startDate) where.submittedAt.gte = new Date(filters.startDate);
      if (filters.endDate) where.submittedAt.lte = new Date(filters.endDate);
    }

    return this.prisma.userShiftInventoryReport.findMany({
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
    const report = await this.prisma.userShiftInventoryReport.findFirst({
      where: { id, tenantId },
      include: {
        user: {
          select: { id: true, username: true, firstName: true, lastName: true, email: true, role: true },
        },
      },
    });

    if (!report) throw new NotFoundException('Shift inventory report not found');

    if (requestingUserRole === 'CASHIER' && report.userId !== requestingUserId) {
      throw new ForbiddenException('Access denied');
    }

    return report;
  }

  async getStats(userId: string, tenantId: string) {
    const [totalReports, reportsThisMonth, lastReport] = await Promise.all([
      this.prisma.userShiftInventoryReport.count({ where: { tenantId, userId } }),
      this.prisma.userShiftInventoryReport.count({
        where: {
          tenantId,
          userId,
          submittedAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
        },
      }),
      this.prisma.userShiftInventoryReport.findFirst({
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
}
