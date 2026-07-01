import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { TimeLogEventType } from '@prisma/client';
import { StaffTimeLogsService } from './staff-time-logs.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  staffTimeLog: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
  },
};

describe('StaffTimeLogsService', () => {
  let service: StaffTimeLogsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [StaffTimeLogsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<StaffTimeLogsService>(StaffTimeLogsService);
  });

  describe('create', () => {
    const baseInput = {
      eventType: TimeLogEventType.TIME_IN,
      latitude: 14.5995,
      longitude: 120.9842,
    };

    it('rejects TIME_IN when the most recent record is also TIME_IN', async () => {
      mockPrisma.staffTimeLog.findFirst.mockResolvedValue({
        id: 'log-1',
        eventType: TimeLogEventType.TIME_IN,
      });

      await expect(
        service.create(
          { ...baseInput, eventType: TimeLogEventType.TIME_IN },
          'user-1',
          'tenant-1',
          'https://storage/staff-selfies/photo.jpg',
        ),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.staffTimeLog.create).not.toHaveBeenCalled();
    });

    it('rejects TIME_OUT when there is no most-recent record', async () => {
      mockPrisma.staffTimeLog.findFirst.mockResolvedValue(null);

      await expect(
        service.create(
          { ...baseInput, eventType: TimeLogEventType.TIME_OUT },
          'user-1',
          'tenant-1',
          'https://storage/staff-selfies/photo.jpg',
        ),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.staffTimeLog.create).not.toHaveBeenCalled();
    });

    it('rejects TIME_OUT when the most recent record is already TIME_OUT', async () => {
      mockPrisma.staffTimeLog.findFirst.mockResolvedValue({
        id: 'log-1',
        eventType: TimeLogEventType.TIME_OUT,
      });

      await expect(
        service.create(
          { ...baseInput, eventType: TimeLogEventType.TIME_OUT },
          'user-1',
          'tenant-1',
          'https://storage/staff-selfies/photo.jpg',
        ),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.staffTimeLog.create).not.toHaveBeenCalled();
    });

    it('accepts TIME_IN when there is no most-recent record', async () => {
      mockPrisma.staffTimeLog.findFirst.mockResolvedValue(null);
      const created = { id: 'log-2', eventType: TimeLogEventType.TIME_IN };
      mockPrisma.staffTimeLog.create.mockResolvedValue(created);

      const result = await service.create(
        { ...baseInput, eventType: TimeLogEventType.TIME_IN },
        'user-1',
        'tenant-1',
        'https://storage/staff-selfies/photo.jpg',
      );

      expect(mockPrisma.staffTimeLog.create).toHaveBeenCalledWith({
        data: {
          tenantId: 'tenant-1',
          userId: 'user-1',
          eventType: TimeLogEventType.TIME_IN,
          photoUrl: 'https://storage/staff-selfies/photo.jpg',
          latitude: 14.5995,
          longitude: 120.9842,
        },
      });
      expect(result).toEqual(created);
    });

    it('accepts TIME_OUT when the most recent record is TIME_IN (valid alternating sequence)', async () => {
      mockPrisma.staffTimeLog.findFirst.mockResolvedValue({
        id: 'log-1',
        eventType: TimeLogEventType.TIME_IN,
      });
      const created = { id: 'log-2', eventType: TimeLogEventType.TIME_OUT };
      mockPrisma.staffTimeLog.create.mockResolvedValue(created);

      const result = await service.create(
        { ...baseInput, eventType: TimeLogEventType.TIME_OUT },
        'user-1',
        'tenant-1',
        'https://storage/staff-selfies/photo.jpg',
      );

      expect(mockPrisma.staffTimeLog.create).toHaveBeenCalled();
      expect(result).toEqual(created);
    });

    it('scopes the most-recent lookup to the acting user within the tenant, ordered by createdAt desc', async () => {
      mockPrisma.staffTimeLog.findFirst.mockResolvedValue(null);
      mockPrisma.staffTimeLog.create.mockResolvedValue({});

      await service.create(baseInput, 'user-1', 'tenant-1', 'https://storage/photo.jpg');

      expect(mockPrisma.staffTimeLog.findFirst).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('findStatus', () => {
    it('returns null lastEventType when the user has no time logs yet', async () => {
      mockPrisma.staffTimeLog.findFirst.mockResolvedValue(null);

      const result = await service.findStatus('tenant-1', 'user-1');

      expect(result).toEqual({ lastEventType: null });
    });

    it('returns the most recent event type for the user in the tenant', async () => {
      mockPrisma.staffTimeLog.findFirst.mockResolvedValue({
        id: 'log-1',
        eventType: TimeLogEventType.TIME_IN,
      });

      const result = await service.findStatus('tenant-1', 'user-1');

      expect(result).toEqual({ lastEventType: TimeLogEventType.TIME_IN });
      expect(mockPrisma.staffTimeLog.findFirst).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('findAll', () => {
    it('returns paginated data scoped to the tenant with default page/limit', async () => {
      const rows = [{ id: 'log-1' }, { id: 'log-2' }];
      mockPrisma.staffTimeLog.findMany.mockResolvedValue(rows);
      mockPrisma.staffTimeLog.count.mockResolvedValue(2);

      const result = await service.findAll('tenant-1', {});

      expect(mockPrisma.staffTimeLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 'tenant-1' },
          orderBy: { createdAt: 'desc' },
          skip: 0,
          take: 20,
        }),
      );
      expect(result).toEqual({
        data: rows,
        pagination: { page: 1, limit: 20, total: 2, totalPages: 1 },
      });
    });

    it('applies userId and date range filters', async () => {
      mockPrisma.staffTimeLog.findMany.mockResolvedValue([]);
      mockPrisma.staffTimeLog.count.mockResolvedValue(0);

      await service.findAll('tenant-1', {
        userId: 'user-1',
        startDate: '2026-06-01T00:00:00.000Z',
        endDate: '2026-06-30T23:59:59.000Z',
        page: 2,
        limit: 10,
      });

      expect(mockPrisma.staffTimeLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId: 'tenant-1',
            userId: 'user-1',
            createdAt: {
              gte: new Date('2026-06-01T00:00:00.000Z'),
              lte: new Date('2026-06-30T23:59:59.000Z'),
            },
          },
          skip: 10,
          take: 10,
        }),
      );
    });

    it('includes the user select fields so the portal can display staff names', async () => {
      mockPrisma.staffTimeLog.findMany.mockResolvedValue([]);
      mockPrisma.staffTimeLog.count.mockResolvedValue(0);

      await service.findAll('tenant-1', {});

      expect(mockPrisma.staffTimeLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: {
            user: {
              select: {
                id: true,
                username: true,
                firstName: true,
                lastName: true,
                role: true,
              },
            },
          },
        }),
      );
    });
  });
});
