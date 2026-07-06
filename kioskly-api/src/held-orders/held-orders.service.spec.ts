import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { HeldOrdersService } from './held-orders.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  heldOrder: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
};

const sampleDto = {
  customerLabel: 'Customer A',
  orderType: 'regular' as const,
  subtotal: 100,
  total: 100,
  itemCount: 2,
  items: [
    {
      localId: 'item-1',
      productId: 'prod-1',
      productName: 'Calamansi Lemonade',
      productPrice: 50,
      quantity: 2,
      addons: [],
    },
  ],
};

describe('HeldOrdersService', () => {
  let service: HeldOrdersService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.heldOrder.deleteMany.mockResolvedValue({ count: 0 });
    const module: TestingModule = await Test.createTestingModule({
      providers: [HeldOrdersService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<HeldOrdersService>(HeldOrdersService);
  });

  describe('create', () => {
    it('creates a held order scoped to the tenant and holder', async () => {
      mockPrisma.heldOrder.create.mockResolvedValue({ id: 'held-1', ...sampleDto });

      const result = await service.create(sampleDto, 'user-1', 'tenant-1');

      expect(mockPrisma.heldOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tenantId: 'tenant-1', heldByUserId: 'user-1' }),
        }),
      );
      expect(result).toEqual({ id: 'held-1', ...sampleDto });
    });

    it('throws ConflictException when clientId already synced for this tenant', async () => {
      mockPrisma.heldOrder.findFirst.mockResolvedValue({ id: 'held-existing' });

      await expect(
        service.create({ ...sampleDto, clientId: 'client-1' }, 'user-1', 'tenant-1'),
      ).rejects.toThrow(ConflictException);

      expect(mockPrisma.heldOrder.create).not.toHaveBeenCalled();
    });

    it('does not dedupe when clientId is not provided', async () => {
      mockPrisma.heldOrder.create.mockResolvedValue({ id: 'held-2', ...sampleDto });

      await service.create(sampleDto, 'user-1', 'tenant-1');

      expect(mockPrisma.heldOrder.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.heldOrder.create).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('scopes by tenantId and orders oldest first', async () => {
      mockPrisma.heldOrder.findMany.mockResolvedValue([]);

      await service.findAll('tenant-1');

      expect(mockPrisma.heldOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 'tenant-1' },
          orderBy: { createdAt: 'asc' },
        }),
      );
    });

    it('purges carts left over from a previous business day before listing', async () => {
      mockPrisma.heldOrder.findMany.mockResolvedValue([]);

      await service.findAll('tenant-1');

      expect(mockPrisma.heldOrder.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 'tenant-1', createdAt: { lt: expect.any(Date) } },
        }),
      );
      // purge must run before the list is fetched, not after
      const purgeOrder = mockPrisma.heldOrder.deleteMany.mock.invocationCallOrder[0];
      const findOrder = mockPrisma.heldOrder.findMany.mock.invocationCallOrder[0];
      expect(purgeOrder).toBeLessThan(findOrder);
    });
  });

  describe('findOne', () => {
    it('returns the held order when found within the tenant', async () => {
      mockPrisma.heldOrder.findFirst.mockResolvedValue({ id: 'held-1', tenantId: 'tenant-1' });

      const result = await service.findOne('held-1', 'tenant-1');

      expect(result).toEqual({ id: 'held-1', tenantId: 'tenant-1' });
    });

    it('throws NotFoundException when not found for this tenant (cross-tenant isolation)', async () => {
      mockPrisma.heldOrder.findFirst.mockResolvedValue(null);

      await expect(service.findOne('held-1', 'tenant-other')).rejects.toThrow(NotFoundException);
    });

    it('purges carts left over from a previous business day before looking it up (covers resume/discard too, since both call findOne)', async () => {
      mockPrisma.heldOrder.findFirst.mockResolvedValue({ id: 'held-1', tenantId: 'tenant-1' });

      await service.findOne('held-1', 'tenant-1');

      expect(mockPrisma.heldOrder.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 'tenant-1', createdAt: { lt: expect.any(Date) } },
        }),
      );
    });
  });

  describe('resume', () => {
    it('fetches and deletes the held order, returning its data', async () => {
      mockPrisma.heldOrder.findFirst.mockResolvedValue({ id: 'held-1', tenantId: 'tenant-1' });
      mockPrisma.heldOrder.delete.mockResolvedValue({ id: 'held-1' });

      const result = await service.resume('held-1', 'tenant-1');

      expect(mockPrisma.heldOrder.delete).toHaveBeenCalledWith({ where: { id: 'held-1' } });
      expect(result).toEqual({ id: 'held-1', tenantId: 'tenant-1' });
    });

    it('throws NotFoundException when the held order does not exist', async () => {
      mockPrisma.heldOrder.findFirst.mockResolvedValue(null);

      await expect(service.resume('missing', 'tenant-1')).rejects.toThrow(NotFoundException);
      expect(mockPrisma.heldOrder.delete).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when a concurrent resume already deleted the row', async () => {
      mockPrisma.heldOrder.findFirst.mockResolvedValue({ id: 'held-1', tenantId: 'tenant-1' });
      mockPrisma.heldOrder.delete.mockRejectedValue(new Error('Record to delete does not exist.'));

      await expect(service.resume('held-1', 'tenant-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('discard', () => {
    it('deletes the held order', async () => {
      mockPrisma.heldOrder.findFirst.mockResolvedValue({ id: 'held-1', tenantId: 'tenant-1' });
      mockPrisma.heldOrder.delete.mockResolvedValue({ id: 'held-1' });

      const result = await service.discard('held-1', 'tenant-1');

      expect(mockPrisma.heldOrder.delete).toHaveBeenCalledWith({ where: { id: 'held-1' } });
      expect(result).toEqual({ success: true });
    });

    it('throws NotFoundException when the held order does not exist', async () => {
      mockPrisma.heldOrder.findFirst.mockResolvedValue(null);

      await expect(service.discard('missing', 'tenant-1')).rejects.toThrow(NotFoundException);
    });
  });
});
