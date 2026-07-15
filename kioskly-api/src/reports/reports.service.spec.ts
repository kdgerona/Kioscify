import { Test, TestingModule } from '@nestjs/testing';
import { ReportsService } from './reports.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  transaction: {
    findMany: jest.fn(),
  },
  expense: {
    findMany: jest.fn(),
  },
};

describe('ReportsService — payment method breakdown', () => {
  let service: ReportsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.expense.findMany.mockResolvedValue([]);
    const module: TestingModule = await Test.createTestingModule({
      providers: [ReportsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<ReportsService>(ReportsService);
  });

  it('attributes a SPLIT transaction\'s legs to their own payment method buckets', async () => {
    mockPrisma.transaction.findMany.mockResolvedValue([
      { paymentMethod: 'CASH', total: 100, items: [] },
      {
        paymentMethod: 'SPLIT',
        total: 100,
        items: [],
        payments: [
          { method: 'CASH', amount: 60 },
          { method: 'GCASH', amount: 40 },
        ],
      },
    ]);

    const report = await service.getDailyReport('tenant-1');

    expect(report.sales.paymentMethodBreakdown).toEqual({
      CASH: { total: 160, count: 2 },
      GCASH: { total: 40, count: 1 },
    });
    // Total sales must still equal the sum of the raw transaction totals —
    // splitting the breakdown must never double-count or lose money.
    expect(report.sales.totalAmount).toBe(200);
  });

  it('does not attribute a SPLIT-labeled row with no payments array (defensive fallback)', async () => {
    mockPrisma.transaction.findMany.mockResolvedValue([
      { paymentMethod: 'SPLIT', total: 100, items: [], payments: [] },
    ]);

    const report = await service.getDailyReport('tenant-1');

    // Falls back to bucketing the whole transaction under the literal "SPLIT"
    // key rather than silently dropping it from the breakdown entirely.
    expect(report.sales.paymentMethodBreakdown).toEqual({
      SPLIT: { total: 100, count: 1 },
    });
  });

  it('leaves single-method breakdowns unchanged (regression check)', async () => {
    mockPrisma.transaction.findMany.mockResolvedValue([
      { paymentMethod: 'CASH', total: 50, items: [] },
      { paymentMethod: 'GCASH', total: 75, items: [] },
    ]);

    const report = await service.getDailyReport('tenant-1');

    expect(report.sales.paymentMethodBreakdown).toEqual({
      CASH: { total: 50, count: 1 },
      GCASH: { total: 75, count: 1 },
    });
  });
});
