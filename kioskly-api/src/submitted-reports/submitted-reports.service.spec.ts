import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { SubmittedReportsService } from './submitted-reports.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  submittedReport: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
  },
};

const sampleDto = {
  reportDate: '2026-07-10',
  periodStart: '2026-07-10T00:00:00.000Z',
  periodEnd: '2026-07-10T23:59:59.999Z',
  salesSnapshot: {} as any,
  expensesSnapshot: {} as any,
  summarySnapshot: {} as any,
  transactionIds: [],
  expenseIds: [],
};

describe('SubmittedReportsService', () => {
  let service: SubmittedReportsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [SubmittedReportsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<SubmittedReportsService>(SubmittedReportsService);
  });

  describe('create', () => {
    it('persists clientId when provided', async () => {
      mockPrisma.submittedReport.create.mockResolvedValue({ id: 'report-1' });

      await service.create({ ...sampleDto, clientId: 'client-1' }, 'user-1', 'tenant-1');

      expect(mockPrisma.submittedReport.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ clientId: 'client-1' }),
        }),
      );
    });

    it('throws ConflictException when clientId already synced for this tenant', async () => {
      mockPrisma.submittedReport.findFirst.mockResolvedValue({ id: 'report-existing' });

      await expect(
        service.create({ ...sampleDto, clientId: 'client-1' }, 'user-1', 'tenant-1'),
      ).rejects.toThrow(ConflictException);

      expect(mockPrisma.submittedReport.create).not.toHaveBeenCalled();
    });

    it('does not dedupe when clientId is not provided', async () => {
      mockPrisma.submittedReport.create.mockResolvedValue({ id: 'report-2' });

      await service.create(sampleDto, 'user-1', 'tenant-1');

      expect(mockPrisma.submittedReport.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.submittedReport.create).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('returns a plain array when no page is requested (mobile app still reads the full list)', async () => {
      mockPrisma.submittedReport.findMany.mockResolvedValue([{ id: 'report-1' }]);

      const result = await service.findAll('tenant-1', {});

      expect(result).toEqual([{ id: 'report-1' }]);
      const args = mockPrisma.submittedReport.findMany.mock.calls[0][0];
      expect(args.skip).toBeUndefined();
      expect(args.take).toBeUndefined();
      expect(mockPrisma.submittedReport.count).not.toHaveBeenCalled();
    });

    it('pages with the same filters for the rows and the count', async () => {
      mockPrisma.submittedReport.findMany.mockResolvedValue([{ id: 'report-1' }]);
      mockPrisma.submittedReport.count.mockResolvedValue(25);

      const result: any = await service.findAll('tenant-1', {
        userId: 'user-1',
        page: 2,
        limit: 10,
      });

      const args = mockPrisma.submittedReport.findMany.mock.calls[0][0];
      expect(args.skip).toBe(10);
      expect(args.take).toBe(10);
      expect(mockPrisma.submittedReport.count).toHaveBeenCalledWith({ where: args.where });
      expect(result.pagination).toEqual({ page: 2, limit: 10, total: 25, totalPages: 3 });
    });
  });
});
