import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  transaction: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
  },
};

const baseItems = [{ productId: 'prod-1', quantity: 2, subtotal: 100 }];

describe('TransactionsService', () => {
  let service: TransactionsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [TransactionsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<TransactionsService>(TransactionsService);
  });

  describe('create', () => {
    it('passes a SPLIT transaction\'s payments array through to prisma untouched', async () => {
      const dto: any = {
        transactionId: 'TXN-1',
        subtotal: 100,
        total: 100,
        paymentMethod: 'SPLIT',
        payments: [
          { method: 'CASH', amount: 60, cashReceived: 60, change: 0 },
          { method: 'GCASH', amount: 40, referenceNumber: 'REF-1' },
        ],
        items: baseItems,
      };
      mockPrisma.transaction.create.mockResolvedValue({ id: 'txn-1', ...dto, items: [] });

      const result = await service.create(dto, 'user-1', 'tenant-1');

      expect(mockPrisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            paymentMethod: 'SPLIT',
            payments: dto.payments,
            tenantId: 'tenant-1',
            userId: 'user-1',
          }),
        }),
      );
      // formatTransaction must surface `payments` — it's easy to add a new field
      // to the Prisma model and forget the hand-written response formatter.
      expect(result.payments).toEqual(dto.payments);
    });

    it('still creates a plain single-method transaction with no payments field', async () => {
      const dto: any = {
        transactionId: 'TXN-2',
        subtotal: 100,
        total: 100,
        paymentMethod: 'CASH',
        cashReceived: 100,
        change: 0,
        items: baseItems,
      };
      mockPrisma.transaction.create.mockResolvedValue({ id: 'txn-2', ...dto });

      await service.create(dto, 'user-1', 'tenant-1');

      const callArgs = mockPrisma.transaction.create.mock.calls[0][0];
      expect(callArgs.data.paymentMethod).toBe('CASH');
      expect(callArgs.data.payments).toBeUndefined();
    });

    it('still dedupes on clientId regardless of payment shape', async () => {
      mockPrisma.transaction.findFirst.mockResolvedValue({ id: 'existing' });

      await expect(
        service.create(
          {
            transactionId: 'TXN-3',
            subtotal: 100,
            total: 100,
            paymentMethod: 'SPLIT',
            payments: [
              { method: 'CASH', amount: 50, cashReceived: 50 },
              { method: 'GCASH', amount: 50, referenceNumber: 'REF-1' },
            ],
            items: baseItems,
            clientId: 'client-1',
          } as any,
          'user-1',
          'tenant-1',
        ),
      ).rejects.toThrow(ConflictException);

      expect(mockPrisma.transaction.create).not.toHaveBeenCalled();
    });
  });
});
