import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BillingRemindersService, dueOffsets, reminderCopy } from './billing-reminders.service';
import { BillingConfigService } from './billing-config.service';
import { BillingAuditService } from './billing-audit.service';
import { REMINDER_CHANNELS } from './reminders/reminder-channel.interface';
import { PrismaService } from '../prisma/prisma.service';

const m = (y: number, mo: number, d: number) => new Date(Date.UTC(y, mo - 1, d) - 8 * 60 * 60 * 1000);
const p2002 = () => new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' });

const invoice = { id: 'inv-1', tenantId: 't-1', subscriptionId: 'sub-1', dueAt: m(2026, 11, 16), status: 'OPEN' };

const mockPrisma = {
  billingInvoice: { findMany: jest.fn() },
  billingReminder: { create: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() },
  tenant: { findMany: jest.fn() },
};
const mockConfig = { get: jest.fn(async () => ({ billingEnabled: true, reminderOffsets: [0, 3, 7] })) };
const mockAudit = { log: jest.fn() };
const channel = { name: 'in_app', deliver: jest.fn() };

describe('dueOffsets', () => {
  it('dueOffsets picks offsets whose Manila day has arrived', () => {
    expect(dueOffsets(m(2026, 11, 16), [0, 3, 7], new Date(m(2026, 11, 16).getTime() - 1))).toEqual([]);
    expect(dueOffsets(m(2026, 11, 16), [0, 3, 7], m(2026, 11, 16))).toEqual([0]);
    expect(dueOffsets(m(2026, 11, 16), [7, 0, 3], m(2026, 11, 20))).toEqual([0, 3]);
    expect(dueOffsets(m(2026, 11, 16), [0, 3, 7], m(2026, 11, 30))).toEqual([0, 3, 7]);
  });
});

describe('reminderCopy', () => {
  it('day 0, later days and the last day', () => {
    expect(reminderCopy(0, 7, true).title).toBe('Your subscription is due today');
    expect(reminderCopy(3, 4, true).title).toBe('Reminder: subscription due — 4 days left');
    expect(reminderCopy(7, 0, true).title).toBe('Last day before your store is locked');
    expect(reminderCopy(7, 0, false).title).toBe('Your subscription is overdue');
  });
});

describe('BillingRemindersService', () => {
  let service: BillingRemindersService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.billingInvoice.findMany.mockResolvedValue([invoice]);
    mockPrisma.tenant.findMany.mockResolvedValue([{ id: 't-1', isActive: true, tombstone: 0 }]);
    mockPrisma.billingReminder.create.mockImplementation(async ({ data }: any) => ({ id: `rem-${data.offsetDays}`, ...data }));
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingRemindersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: BillingConfigService, useValue: mockConfig },
        { provide: BillingAuditService, useValue: mockAudit },
        { provide: REMINDER_CHANNELS, useValue: [channel] },
      ],
    }).compile();
    service = module.get(BillingRemindersService);
  });

  it('a failed delivery removes the reminder row so the next run retries it', async () => {
    channel.deliver.mockRejectedValueOnce(new Error('smtp down'));
    await expect(service.sendDue(m(2026, 11, 16))).resolves.toBe(0);
    expect(mockPrisma.billingReminder.delete).toHaveBeenCalledWith({ where: { id: 'rem-0' } });
  });

  it.each([
    ['deactivated', { isActive: false, tombstone: 0 }],
    ['deleted', { isActive: true, tombstone: 1 }],
  ])('sendDue skips %s stores', async (_label, tenant) => {
    mockPrisma.tenant.findMany.mockResolvedValue([{ id: 't-1', ...tenant }]);
    await expect(service.sendDue(m(2026, 11, 16))).resolves.toBe(0);
    expect(mockPrisma.billingReminder.create).not.toHaveBeenCalled();
  });

  it('sendDue creates only the latest due offset per invoice and delivers it', async () => {
    await expect(service.sendDue(m(2026, 11, 20))).resolves.toBe(1);
    expect(mockPrisma.billingInvoice.findMany).toHaveBeenCalledWith({
      where: { status: 'OPEN', dueAt: { lte: m(2026, 11, 20) }, subscription: { is: { billingEnabled: true } } },
      select: { id: true, tenantId: true, dueAt: true },
    });
    expect(mockPrisma.billingReminder.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.billingReminder.create).toHaveBeenCalledWith({
      data: { invoiceId: 'inv-1', tenantId: 't-1', offsetDays: 3, channel: 'in_app' },
    });
    expect(channel.deliver).toHaveBeenCalledWith(expect.objectContaining({ offsetDays: 3 }), expect.objectContaining({ id: 'inv-1' }));
  });

  it('sendDue is idempotent on P2002 (never sends the same reminder twice)', async () => {
    mockPrisma.billingReminder.create.mockRejectedValue(p2002());
    await expect(service.sendDue(m(2026, 11, 20))).resolves.toBe(0);
    expect(channel.deliver).not.toHaveBeenCalled();
  });

  it('nothing due yet → no reminder', async () => {
    await expect(service.sendDue(new Date(m(2026, 11, 16).getTime() - 1))).resolves.toBe(0);
    expect(mockPrisma.billingReminder.create).not.toHaveBeenCalled();
  });

  it('ack adds the user once', async () => {
    mockPrisma.billingReminder.findUnique.mockResolvedValue({ id: 'rem-3', tenantId: 't-1', acknowledgedByUserIds: ['u-1'] });
    await service.ack('t-1', 'rem-3', 'u-1');
    expect(mockPrisma.billingReminder.update).not.toHaveBeenCalled();
    await service.ack('t-1', 'rem-3', 'u-2');
    expect(mockPrisma.billingReminder.update).toHaveBeenCalledWith({
      where: { id: 'rem-3' },
      data: { acknowledgedByUserIds: { push: 'u-2' } },
    });
  });

  it('ack 404s for another tenant', async () => {
    mockPrisma.billingReminder.findUnique.mockResolvedValue({ id: 'rem-3', tenantId: 't-2', acknowledgedByUserIds: [] });
    await expect(service.ack('t-1', 'rem-3', 'u-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('resend clears acknowledgements on the newest reminder', async () => {
    mockPrisma.billingReminder.findFirst.mockResolvedValue({ id: 'rem-3', tenantId: 't-1' });
    await service.resend('inv-1', 'admin-1');
    expect(mockPrisma.billingReminder.findFirst).toHaveBeenCalledWith({ where: { invoiceId: 'inv-1' }, orderBy: { sentAt: 'desc' } });
    expect(mockPrisma.billingReminder.update).toHaveBeenCalledWith({ where: { id: 'rem-3' }, data: { acknowledgedByUserIds: [] } });
    expect(mockAudit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'reminder.resend', tenantId: 't-1' }));
  });

  it('resend 404s when no reminder was sent yet', async () => {
    mockPrisma.billingReminder.findFirst.mockResolvedValue(null);
    await expect(service.resend('inv-1', 'admin-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('pendingFor returns the newest unacknowledged reminder, or null', async () => {
    mockPrisma.billingReminder.findFirst.mockResolvedValueOnce({ id: 'rem-3', offsetDays: 3, acknowledgedByUserIds: [] });
    await expect(service.pendingFor('inv-1', 'u-1')).resolves.toMatchObject({ id: 'rem-3', offsetDays: 3 });
    expect(mockPrisma.billingReminder.findFirst).toHaveBeenCalledWith({ where: { invoiceId: 'inv-1' }, orderBy: { sentAt: 'desc' } });
    mockPrisma.billingReminder.findFirst.mockResolvedValueOnce({ id: 'rem-3', offsetDays: 3, acknowledgedByUserIds: ['u-1'] });
    await expect(service.pendingFor('inv-1', 'u-1')).resolves.toBeNull();
  });
});
