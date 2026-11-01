import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';
import { RewardsService } from '../rewards/rewards.service';

const mockPrisma: any = {
  transaction: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  rewardEvent: {
    createMany: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
  // Interactive transactions run the callback against the same mock client.
  $transaction: jest.fn((cb: any) => cb(mockPrisma)),
};

const mockRewards = {
  prepareTransactionRewards: jest.fn(),
  markTransactionVoided: jest.fn(),
};

const baseItems = [{ productId: 'prod-1', quantity: 2, subtotal: 100 }];

describe('TransactionsService', () => {
  let service: TransactionsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRewards.prepareTransactionRewards.mockResolvedValue([]);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RewardsService, useValue: mockRewards },
      ],
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

  describe('findAll', () => {
    it('returns a plain array with no skip/take or count when no pagination is given', async () => {
      mockPrisma.transaction.findMany.mockResolvedValue([{ id: 'txn-1', items: [] }]);

      const result = await service.findAll('tenant-1');

      expect(Array.isArray(result)).toBe(true);
      const args = mockPrisma.transaction.findMany.mock.calls[0][0];
      expect(args.skip).toBeUndefined();
      expect(args.take).toBeUndefined();
      expect(mockPrisma.transaction.count).not.toHaveBeenCalled();
    });

    it('applies skip/take and returns a paged envelope when pagination is given', async () => {
      mockPrisma.transaction.findMany.mockResolvedValue([{ id: 'txn-1', items: [] }]);
      mockPrisma.transaction.count.mockResolvedValue(120);

      const result: any = await service.findAll(
        'tenant-1',
        { paymentMethod: 'CASH' },
        { page: 3, limit: 50 },
      );

      const args = mockPrisma.transaction.findMany.mock.calls[0][0];
      expect(args.skip).toBe(100);
      expect(args.take).toBe(50);
      // count must use the same filters as the page query, or totals drift
      expect(mockPrisma.transaction.count).toHaveBeenCalledWith({ where: args.where });
      expect(result.data).toHaveLength(1);
      expect(result.pagination).toEqual({ page: 3, limit: 50, total: 120, totalPages: 3 });
    });

    it('reports at least one page when there are no matches', async () => {
      mockPrisma.transaction.findMany.mockResolvedValue([]);
      mockPrisma.transaction.count.mockResolvedValue(0);

      const result: any = await service.findAll('tenant-1', {}, { page: 1, limit: 50 });

      expect(result.pagination.totalPages).toBe(1);
    });
  });

  describe('rewards integration', () => {
    const occurredAt = new Date('2026-10-31T02:00:00.000Z');
    const draft = (over: any = {}) => ({
      programId: 'prog-1',
      programType: 'LOYALTY_CARD',
      programName: 'Blue Bear Cloud Club',
      tenantId: 'tenant-1',
      companyId: 'co-1',
      brandId: 'brand-1',
      userId: 'user-1',
      occurredAt,
      type: 'STAMP_ADDED',
      slotKey: 'r1c1',
      slotLabel: '₱49+',
      itemIndex: 0,
      productName: 'Cloud Latte',
      discountAmount: null,
      ...over,
    });
    const dto: any = {
      transactionId: 'TXN-R',
      subtotal: 100,
      total: 100,
      paymentMethod: 'CASH',
      items: baseItems,
      clientId: 'client-r',
      rewards: [{ programId: 'prog-1', type: 'STAMP_ADDED', slotKey: 'r1c1', itemIndex: 0 }],
    };

    it('creates the transaction and its reward events inside one prisma.$transaction', async () => {
      mockPrisma.transaction.findFirst.mockResolvedValue(null);
      mockRewards.prepareTransactionRewards.mockResolvedValue([draft(), draft({ type: 'CARD_ISSUED', slotKey: null, slotLabel: null, itemIndex: null, productName: null })]);
      mockPrisma.transaction.create.mockResolvedValue({ id: 'txn-r', items: [] });
      mockPrisma.rewardEvent.findMany.mockResolvedValue([
        { id: 'ev-1', ...draft(), transactionId: 'txn-r', isVoided: false, createdAt: new Date(1) },
      ]);

      const result: any = await service.create(dto, 'user-1', 'tenant-1');

      expect(mockRewards.prepareTransactionRewards).toHaveBeenCalledWith('tenant-1', 'user-1', dto);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      const created = mockPrisma.rewardEvent.createMany.mock.calls[0][0].data;
      expect(created).toHaveLength(2);
      expect(created.every((e: any) => e.transactionId === 'txn-r')).toBe(true);
      // `rewards` is not a Transaction column and must not reach prisma.transaction.create
      expect(mockPrisma.transaction.create.mock.calls[0][0].data.rewards).toBeUndefined();
      expect(result.rewards).toEqual([
        expect.objectContaining({ id: 'ev-1', type: 'STAMP_ADDED', slotKey: 'r1c1', slotLabel: '₱49+', isVoided: false }),
      ]);
    });

    it('saves a sale whose program changed since the sale (e.g. store unenrolled) and returns the flagged event', async () => {
      const warning = 'store is not enrolled in this program';
      mockPrisma.transaction.findFirst.mockResolvedValue(null);
      mockRewards.prepareTransactionRewards.mockResolvedValue([draft({ validationWarnings: [warning] })]);
      mockPrisma.transaction.create.mockResolvedValue({ id: 'txn-w', items: [] });
      mockPrisma.rewardEvent.findMany.mockResolvedValue([
        { id: 'ev-w', ...draft(), validationWarnings: [warning], transactionId: 'txn-w', isVoided: false, createdAt: new Date(1) },
      ]);

      const result: any = await service.create(dto, 'user-1', 'tenant-1');

      expect(mockPrisma.transaction.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.rewardEvent.createMany.mock.calls[0][0].data[0].validationWarnings).toEqual([warning]);
      expect(result.rewards[0].validationWarnings).toEqual([warning]);
    });

    it('skips prisma.$transaction when the sale carries no rewards and returns rewards: []', async () => {
      mockPrisma.transaction.findFirst.mockResolvedValue(null);
      mockPrisma.transaction.create.mockResolvedValue({ id: 'txn-p', items: [] });

      const result: any = await service.create({ ...dto, rewards: undefined }, 'user-1', 'tenant-1');

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockPrisma.rewardEvent.createMany).not.toHaveBeenCalled();
      expect(result.rewards).toEqual([]);
    });

    it('returns 409 for an already-synced clientId without validating or writing reward events', async () => {
      mockPrisma.transaction.findFirst.mockResolvedValue({ id: 'existing' });

      await expect(service.create(dto, 'user-1', 'tenant-1')).rejects.toThrow(ConflictException);

      expect(mockRewards.prepareTransactionRewards).not.toHaveBeenCalled();
      expect(mockPrisma.rewardEvent.createMany).not.toHaveBeenCalled();
    });

    it('maps a concurrent duplicate (P2002 on clientId) to 409 — the rolled-back tx leaves no events', async () => {
      mockPrisma.transaction.findFirst
        .mockResolvedValueOnce(null) // pre-check passes
        .mockResolvedValueOnce({ id: 'winner' }); // lookup after the unique-index violation
      mockRewards.prepareTransactionRewards.mockResolvedValue([draft()]);
      mockPrisma.$transaction.mockImplementationOnce(async () => {
        throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        });
      });

      await expect(service.create(dto, 'user-1', 'tenant-1')).rejects.toMatchObject({
        response: { message: 'Transaction already synced', id: 'winner' },
      });
    });

    it('does not create the transaction when reward validation fails', async () => {
      mockPrisma.transaction.findFirst.mockResolvedValue(null);
      mockRewards.prepareTransactionRewards.mockRejectedValue(new BadRequestException(['bad']));

      await expect(service.create(dto, 'user-1', 'tenant-1')).rejects.toThrow(BadRequestException);
      expect(mockPrisma.transaction.create).not.toHaveBeenCalled();
    });

    it('an admin void (direct approval) marks reward events voided in the same transaction', async () => {
      mockPrisma.transaction.findFirst.mockResolvedValue({ id: 'txn-1', voidStatus: 'NONE' });
      mockPrisma.transaction.update.mockResolvedValue({ id: 'txn-1', voidStatus: 'APPROVED', items: [], rewardEvents: [] });

      await service.requestVoid('txn-1', 'tenant-1', 'admin-1', 'Wrong order entered by cashier', 'STORE_ADMIN');

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockRewards.markTransactionVoided).toHaveBeenCalledWith('txn-1', mockPrisma);
    });

    it('a cashier void request (PENDING) leaves reward events untouched', async () => {
      mockPrisma.transaction.findFirst.mockResolvedValue({ id: 'txn-1', voidStatus: 'NONE' });
      mockPrisma.transaction.update.mockResolvedValue({ id: 'txn-1', voidStatus: 'PENDING', items: [] });

      await service.requestVoid('txn-1', 'tenant-1', 'cashier-1', 'Customer changed their mind', 'CASHIER');

      expect(mockRewards.markTransactionVoided).not.toHaveBeenCalled();
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('approveVoid marks reward events voided', async () => {
      mockPrisma.transaction.findFirst.mockResolvedValue({ id: 'txn-1', voidStatus: 'PENDING' });
      mockPrisma.transaction.update.mockResolvedValue({
        id: 'txn-1',
        voidStatus: 'APPROVED',
        items: [],
        rewardEvents: [{ id: 'ev-1', ...draft(), isVoided: true, createdAt: new Date(1) }],
      });

      const result: any = await service.approveVoid('txn-1', 'tenant-1', 'admin-1');

      expect(mockRewards.markTransactionVoided).toHaveBeenCalledWith('txn-1', mockPrisma);
      expect(result.rewards[0].isVoided).toBe(true);
    });
  });
});
