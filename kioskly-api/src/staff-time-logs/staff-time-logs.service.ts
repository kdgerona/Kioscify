import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, TimeLogEventType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStaffTimeLogDto } from './dto/create-staff-time-log.dto';
import { QueryStaffTimeLogDto } from './dto/query-staff-time-log.dto';

const USER_SELECT = {
  id: true,
  username: true,
  firstName: true,
  lastName: true,
  role: true,
} as const;

@Injectable()
export class StaffTimeLogsService {
  constructor(private prisma: PrismaService) {}

  async create(
    dto: Pick<CreateStaffTimeLogDto, 'eventType' | 'latitude' | 'longitude'>,
    userId: string,
    tenantId: string,
    photoUrl: string,
  ) {
    const lastLog = await this.prisma.staffTimeLog.findFirst({
      where: { tenantId, userId },
      orderBy: { createdAt: 'desc' },
    });

    if (dto.eventType === TimeLogEventType.TIME_IN && lastLog?.eventType === TimeLogEventType.TIME_IN) {
      throw new BadRequestException('Already timed in — time out before timing in again');
    }

    if (
      dto.eventType === TimeLogEventType.TIME_OUT &&
      (!lastLog || lastLog.eventType === TimeLogEventType.TIME_OUT)
    ) {
      throw new BadRequestException('No open time-in found — time in before timing out');
    }

    return this.prisma.staffTimeLog.create({
      data: {
        tenantId,
        userId,
        eventType: dto.eventType,
        photoUrl,
        latitude: dto.latitude,
        longitude: dto.longitude,
      },
    });
  }

  async findStatus(tenantId: string, userId: string) {
    const lastLog = await this.prisma.staffTimeLog.findFirst({
      where: { tenantId, userId },
      orderBy: { createdAt: 'desc' },
    });

    return { lastEventType: lastLog?.eventType ?? null };
  }

  async findAll(tenantId: string, query: QueryStaffTimeLogDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.StaffTimeLogWhereInput = { tenantId };

    if (query.userId) {
      where.userId = query.userId;
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate);
    }

    const [data, total] = await Promise.all([
      this.prisma.staffTimeLog.findMany({
        where,
        include: { user: { select: USER_SELECT } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.staffTimeLog.count({ where }),
    ]);

    return {
      data,
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }
}
