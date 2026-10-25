import { Test, TestingModule } from '@nestjs/testing';
import { BillingSchedulerService } from './billing-scheduler.service';
import { BillingConfigService } from './billing-config.service';
import { BillingInvoicesService } from './billing-invoices.service';
import { BillingReconcileService } from './billing-reconcile.service';
import { BillingRemindersService } from './billing-reminders.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = { jobLock: { updateMany: jest.fn(async () => ({ count: 1 })), create: jest.fn() } };
const mockConfig = { get: jest.fn() };
const mockInvoices = { generateDue: jest.fn(async () => 0) };
const mockReconcile = { reconcileRecent: jest.fn(async () => 0) };
const mockReminders = { sendDue: jest.fn(async () => 0) };

describe('BillingSchedulerService', () => {
  let service: BillingSchedulerService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingSchedulerService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: BillingConfigService, useValue: mockConfig },
        { provide: BillingInvoicesService, useValue: mockInvoices },
        { provide: BillingReconcileService, useValue: mockReconcile },
        { provide: BillingRemindersService, useValue: mockReminders },
      ],
    }).compile();
    service = module.get(BillingSchedulerService);
  });

  it('jobs do nothing when billing is globally off', async () => {
    mockConfig.get.mockResolvedValue({ billingEnabled: false });
    await service.generateInvoices();
    await service.reconcile();
    await service.sendReminders();
    expect(mockPrisma.jobLock.updateMany).not.toHaveBeenCalled();
    expect(mockReminders.sendDue).not.toHaveBeenCalled();
    expect(mockInvoices.generateDue).not.toHaveBeenCalled();
    expect(mockReconcile.reconcileRecent).not.toHaveBeenCalled();
  });

  it('runs the jobs under named locks when billing is on', async () => {
    mockConfig.get.mockResolvedValue({ billingEnabled: true });
    await service.generateInvoices();
    await service.reconcile();
    await service.sendReminders();
    expect(mockReminders.sendDue).toHaveBeenCalledTimes(1);
    expect(mockInvoices.generateDue).toHaveBeenCalledTimes(1);
    expect(mockReconcile.reconcileRecent).toHaveBeenCalledTimes(1);
    const names = mockPrisma.jobLock.updateMany.mock.calls.map((c: any) => c[0].where.name);
    expect(names).toEqual(expect.arrayContaining(['billing.generateInvoices', 'billing.reconcile']));
  });

  it('a job error is logged, not thrown (the scheduler keeps running)', async () => {
    mockConfig.get.mockResolvedValue({ billingEnabled: true });
    mockInvoices.generateDue.mockRejectedValueOnce(new Error('db down'));
    await expect(service.generateInvoices()).resolves.toBeUndefined();
  });
});
