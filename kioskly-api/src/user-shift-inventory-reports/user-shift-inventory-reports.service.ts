import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserShiftInventoryReportFiltersDto } from './dto/user-shift-inventory-report-filters.dto';
import { CreateSubmittedInventoryReportDto } from '../submitted-inventory-reports/dto/create-submitted-inventory-report.dto';
import { getZonedMonthBounds } from '../common/utils/timezone';

@Injectable()
export class UserShiftInventoryReportsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateSubmittedInventoryReportDto, userId: string, tenantId: string) {
    // Offline deduplication — enforced here rather than a DB-level unique
    // index; see schema.prisma's UserShiftInventoryReport comment for why.
    if (dto.clientId) {
      const existing = await this.prisma.userShiftInventoryReport.findFirst({
        where: { tenantId, clientId: dto.clientId },
      });
      if (existing) {
        throw new ConflictException({
          message: 'Shift inventory report already synced',
          id: existing.id,
        });
      }
    }

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
    // Uses a derived clientId, checked for dedup the same way as the primary create above (no
    // DB-level unique index backs this — see schema.prisma's UserShiftInventoryReport comment).
    // Wrapped in try/catch so a mirror failure never rejects the primary shift report response.
    try {
      const mirrorClientId = dto.clientId ? `${dto.clientId}-inv` : undefined;
      const existingMirror = mirrorClientId
        ? await this.prisma.submittedInventoryReport.findFirst({
            where: { tenantId, clientId: mirrorClientId },
          })
        : null;
      if (!existingMirror) {
        await this.prisma.submittedInventoryReport.create({
          data: {
            tenantId,
            userId,
            reportDate: dto.reportDate,
            inventorySnapshot: dto.inventorySnapshot as any,
            notes: dto.notes,
            clientId: mirrorClientId,
            isShiftMirror: true,
            ...(dto.submittedAt && { submittedAt: new Date(dto.submittedAt) }),
          },
        });
      }
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
          submittedAt: { gte: getZonedMonthBounds(new Date()).start },
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
