import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { UserShiftReportsService } from './user-shift-reports.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  userShiftReport: {
    findFirst: jest.fn(),
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

describe('UserShiftReportsService', () => {
  let service: UserShiftReportsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [UserShiftReportsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<UserShiftReportsService>(UserShiftReportsService);
  });

  describe('create', () => {
    it('throws ConflictException when clientId already synced for this tenant', async () => {
      mockPrisma.userShiftReport.findFirst.mockResolvedValue({ id: 'shift-existing' });

      await expect(
        service.create({ ...sampleDto, clientId: 'client-1' }, 'user-1', 'tenant-1'),
      ).rejects.toThrow(ConflictException);

      expect(mockPrisma.userShiftReport.create).not.toHaveBeenCalled();
    });

    it('does not dedupe when clientId is not provided', async () => {
      mockPrisma.userShiftReport.create.mockResolvedValue({ id: 'shift-1' });

      await service.create(sampleDto, 'user-1', 'tenant-1');

      expect(mockPrisma.userShiftReport.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.userShiftReport.create).toHaveBeenCalled();
    });
  });
});
