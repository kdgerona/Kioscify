import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { SubmittedInventoryReportsService } from './submitted-inventory-reports.service';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';

const mockPrisma = {
  submittedInventoryReport: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
};

const mockInventoryService = {
  findAllItems: jest.fn(),
};

const sampleDto = {
  reportDate: '2026-07-10',
  inventorySnapshot: {} as any,
};

describe('SubmittedInventoryReportsService', () => {
  let service: SubmittedInventoryReportsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubmittedInventoryReportsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: InventoryService, useValue: mockInventoryService },
      ],
    }).compile();
    service = module.get<SubmittedInventoryReportsService>(SubmittedInventoryReportsService);
  });

  describe('create', () => {
    it('persists clientId when provided', async () => {
      mockPrisma.submittedInventoryReport.create.mockResolvedValue({ id: 'report-1' });

      await service.create({ ...sampleDto, clientId: 'client-1' }, 'user-1', 'tenant-1');

      expect(mockPrisma.submittedInventoryReport.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ clientId: 'client-1' }),
        }),
      );
    });

    it('throws ConflictException when clientId already synced for this tenant', async () => {
      mockPrisma.submittedInventoryReport.findFirst.mockResolvedValue({ id: 'report-existing' });

      await expect(
        service.create({ ...sampleDto, clientId: 'client-1' }, 'user-1', 'tenant-1'),
      ).rejects.toThrow(ConflictException);

      expect(mockPrisma.submittedInventoryReport.create).not.toHaveBeenCalled();
    });

    it('does not dedupe when clientId is not provided', async () => {
      mockPrisma.submittedInventoryReport.create.mockResolvedValue({ id: 'report-2' });

      await service.create(sampleDto, 'user-1', 'tenant-1');

      expect(mockPrisma.submittedInventoryReport.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.submittedInventoryReport.create).toHaveBeenCalled();
    });
  });
});
