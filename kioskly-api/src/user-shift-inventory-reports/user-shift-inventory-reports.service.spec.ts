import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { UserShiftInventoryReportsService } from './user-shift-inventory-reports.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  userShiftInventoryReport: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  submittedInventoryReport: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
};

const sampleDto = {
  reportDate: '2026-07-10',
  inventorySnapshot: {} as any,
};

describe('UserShiftInventoryReportsService', () => {
  let service: UserShiftInventoryReportsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.userShiftInventoryReport.create.mockResolvedValue({ id: 'shift-1' });
    mockPrisma.submittedInventoryReport.create.mockResolvedValue({ id: 'mirror-1' });
    const module: TestingModule = await Test.createTestingModule({
      providers: [UserShiftInventoryReportsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<UserShiftInventoryReportsService>(UserShiftInventoryReportsService);
  });

  describe('create', () => {
    it('throws ConflictException when clientId already synced for this tenant', async () => {
      mockPrisma.userShiftInventoryReport.findFirst.mockResolvedValue({ id: 'shift-existing' });

      await expect(
        service.create({ ...sampleDto, clientId: 'client-1' }, 'user-1', 'tenant-1'),
      ).rejects.toThrow(ConflictException);

      expect(mockPrisma.userShiftInventoryReport.create).not.toHaveBeenCalled();
    });

    it('does not dedupe when clientId is not provided', async () => {
      await service.create(sampleDto, 'user-1', 'tenant-1');

      expect(mockPrisma.userShiftInventoryReport.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.userShiftInventoryReport.create).toHaveBeenCalled();
    });

    it('skips the mirror create when a mirror with the derived clientId already exists', async () => {
      mockPrisma.userShiftInventoryReport.findFirst.mockResolvedValue(null);
      mockPrisma.submittedInventoryReport.findFirst.mockResolvedValue({ id: 'mirror-existing' });

      await service.create({ ...sampleDto, clientId: 'client-1' }, 'user-1', 'tenant-1');

      expect(mockPrisma.submittedInventoryReport.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: 'tenant-1', clientId: 'client-1-inv' } }),
      );
      expect(mockPrisma.submittedInventoryReport.create).not.toHaveBeenCalled();
    });

    it('still returns the primary shift report even if the mirror create throws', async () => {
      mockPrisma.userShiftInventoryReport.findFirst.mockResolvedValue(null);
      mockPrisma.submittedInventoryReport.findFirst.mockResolvedValue(null);
      mockPrisma.submittedInventoryReport.create.mockRejectedValue(new Error('boom'));

      const result = await service.create(sampleDto, 'user-1', 'tenant-1');

      expect(result).toEqual({ id: 'shift-1' });
    });
  });
});
