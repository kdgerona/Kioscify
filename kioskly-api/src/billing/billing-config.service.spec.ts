import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BillingConfigService } from './billing-config.service';
import { BillingAuditService } from './billing-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { Prisma } from '@prisma/client';

const storedConfig = {
  id: 'cfg-1',
  key: 'global',
  billingEnabled: false,
  enforcementEnabled: false,
  defaultTrialDays: 15,
  defaultGraceDays: 7,
  reminderOffsets: [0, 3, 7],
  invoiceLeadDays: 0,
  paymongoMonthlyLimitCentavos: 1000000,
  limitWarnPercent: 80,
  overduePollSeconds: 30,
  claimLockHoldDays: 3,
  minKioskVersionCode: null,
  fallbackQrImageUrl: null,
  fallbackQrAccountName: null,
  fallbackQrInstructions: null,
  updatedAt: new Date(),
};

const mockPrisma = {
  billingConfig: { upsert: jest.fn(), update: jest.fn(), findUniqueOrThrow: jest.fn() },
  storeSubscription: { findMany: jest.fn(), update: jest.fn() },
  billingInvoice: { findMany: jest.fn() },
};

// Manila midnight for a calendar date.
const m = (y: number, mo: number, d: number) => new Date(Date.UTC(y, mo - 1, d) - 8 * 60 * 60 * 1000);
const mockAudit = { log: jest.fn() };
const mockStorage = { upload: jest.fn(async (folder: string, name: string) => `http://cdn/${folder}/${name}`), delete: jest.fn() };
const env: Record<string, string | undefined> = {};
const mockConfig = { get: jest.fn((k: string) => env[k]) };

describe('BillingConfigService', () => {
  let service: BillingConfigService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.keys(env).forEach(k => delete env[k]);
    mockPrisma.billingConfig.upsert.mockResolvedValue({ ...storedConfig });
    mockPrisma.billingConfig.update.mockImplementation(async ({ data }) => ({ ...storedConfig, ...data }));
    mockPrisma.storeSubscription.findMany.mockResolvedValue([]);
    mockPrisma.billingInvoice.findMany.mockResolvedValue([]);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingConfigService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: BillingAuditService, useValue: mockAudit },
        { provide: ConfigService, useValue: mockConfig },
        { provide: StorageService, useValue: mockStorage },
      ],
    }).compile();
    service = module.get(BillingConfigService);
  });

  it('get upserts defaults and caches within 30s', async () => {
    await service.get();
    await service.get();
    expect(mockPrisma.billingConfig.upsert).toHaveBeenCalledTimes(1);
    expect(mockPrisma.billingConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: 'global' }, update: {} }),
    );
  });

  it('get re-reads when a concurrent first upsert wins the insert (P2002)', async () => {
    mockPrisma.billingConfig.upsert.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
    );
    mockPrisma.billingConfig.findUniqueOrThrow.mockResolvedValueOnce({ ...storedConfig });
    await expect(service.get()).resolves.toEqual(storedConfig);
    expect(mockPrisma.billingConfig.findUniqueOrThrow).toHaveBeenCalledWith({ where: { key: 'global' } });
  });

  it('update invalidates cache and audits before/after', async () => {
    await service.get();
    await service.update({ defaultGraceDays: 10 }, 'admin-1');
    await service.get();
    expect(mockPrisma.billingConfig.upsert).toHaveBeenCalledTimes(2); // initial + after invalidation
    expect(mockAudit.log).toHaveBeenCalledWith({
      tenantId: null,
      actorUserId: 'admin-1',
      action: 'config.update',
      before: { defaultGraceDays: 7 },
      after: { defaultGraceDays: 10 },
    });
  });

  it('enabling enforcement without minKioskVersionCode is rejected', async () => {
    await expect(service.update({ enforcementEnabled: true, confirmEnforcement: true }, 'admin-1')).rejects.toThrow(
      new BadRequestException('Set the minimum kiosk version before enabling enforcement'),
    );
  });

  it('enabling enforcement without confirmEnforcement is rejected', async () => {
    await expect(service.update({ enforcementEnabled: true, minKioskVersionCode: 7 }, 'admin-1')).rejects.toThrow(
      new BadRequestException('Confirm enforcement to continue'),
    );
  });

  it('enabling enforcement with both succeeds and does not persist confirmEnforcement', async () => {
    await service.update({ enforcementEnabled: true, minKioskVersionCode: 7, confirmEnforcement: true }, 'admin-1');
    expect(mockPrisma.billingConfig.update).toHaveBeenCalledWith({
      where: { key: 'global' },
      data: { enforcementEnabled: true, minKioskVersionCode: 7 },
    });
  });

  it('reminderOffsets are de-duplicated and sorted ascending', async () => {
    await service.update({ reminderOffsets: [7, 0, 3, 3] }, 'admin-1');
    expect(mockPrisma.billingConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { reminderOffsets: [0, 3, 7] } }),
    );
  });

  it('the config response never contains key material', async () => {
    env.PAYMONGO_SECRET_KEY = 'sk_test_supersecret';
    env.PAYMONGO_PUBLIC_KEY = 'pk_test_public';
    env.PAYMONGO_WEBHOOK_SECRET = 'whsk_secret';
    const res = await service.getForAdmin();
    expect(res.paymongoMode).toBe('test');
    expect(res.webhookConfigured).toBe(true);
    expect(JSON.stringify(res)).not.toMatch(/sk_|pk_|whsk_/);
  });

  it('toStatusConfig maps the status-relevant fields', () => {
    expect(service.toStatusConfig(storedConfig as any)).toEqual({
      billingEnabled: false,
      enforcementEnabled: false,
      defaultTrialDays: 15,
      defaultGraceDays: 7,
      claimLockHoldDays: 3,
      reminderLeadDays: 0,
    });
  });

  describe('turning global billing on (no retroactive charges)', () => {
    beforeEach(() => jest.useFakeTimers().setSystemTime(m(2027, 2, 1)));
    afterEach(() => jest.useRealTimers());

    it('rolls stale nextBillingAt forward to the next billing day on or after today, keeping the anchor', async () => {
      mockPrisma.storeSubscription.findMany.mockResolvedValue([
        { id: 'sub-1', tenantId: 't-1', nextBillingAt: m(2026, 11, 16), anchorDay: 16 },
        { id: 'sub-2', tenantId: 't-2', nextBillingAt: m(2026, 12, 31), anchorDay: 31 },
      ]);
      await service.update({ billingEnabled: true }, 'admin-1');
      expect(mockPrisma.storeSubscription.findMany).toHaveBeenCalledWith({
        where: { billingEnabled: true, nextBillingAt: { lt: m(2027, 2, 1) } },
        select: { id: true, tenantId: true, nextBillingAt: true, anchorDay: true },
      });
      expect(mockPrisma.storeSubscription.update).toHaveBeenCalledWith({ where: { id: 'sub-1' }, data: { nextBillingAt: m(2027, 2, 16) } });
      expect(mockPrisma.storeSubscription.update).toHaveBeenCalledWith({ where: { id: 'sub-2' }, data: { nextBillingAt: m(2027, 2, 28) } });
      expect(mockAudit.log).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 't-1', action: 'schedule.rollforward' }));
    });

    it('leaves stores that already have invoices alone', async () => {
      mockPrisma.storeSubscription.findMany.mockResolvedValue([{ id: 'sub-1', tenantId: 't-1', nextBillingAt: m(2026, 11, 16), anchorDay: 16 }]);
      mockPrisma.billingInvoice.findMany.mockResolvedValue([{ subscriptionId: 'sub-1' }]);
      await service.update({ billingEnabled: true }, 'admin-1');
      expect(mockPrisma.storeSubscription.update).not.toHaveBeenCalled();
    });

    it('does nothing when billing was already on or is being turned off', async () => {
      await service.update({ defaultGraceDays: 5 }, 'admin-1');
      await service.update({ billingEnabled: false }, 'admin-1');
      expect(mockPrisma.storeSubscription.findMany).not.toHaveBeenCalled();
    });
  });

  describe('fallback QR image', () => {
    it('uploads to billing/, stores the url, deletes the previous image and audits', async () => {
      mockPrisma.billingConfig.upsert.mockResolvedValue({ ...storedConfig, fallbackQrImageUrl: 'http://cdn/billing/old.png' });
      await service.setFallbackQrImage({ buffer: Buffer.from('png'), mimetype: 'image/png' }, 'admin-1');
      expect(mockStorage.upload).toHaveBeenCalledWith('billing', expect.stringMatching(/^fallback-qr-\d+\.png$/), Buffer.from('png'), 'image/png');
      expect(mockPrisma.billingConfig.update).toHaveBeenCalledWith({
        where: { key: 'global' },
        data: { fallbackQrImageUrl: expect.stringMatching(/^http:\/\/cdn\/billing\/fallback-qr-/) },
      });
      expect(mockStorage.delete).toHaveBeenCalledWith('http://cdn/billing/old.png');
      expect(mockAudit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'config.fallback_qr' }));
    });

    it('clearing removes the image', async () => {
      mockPrisma.billingConfig.upsert.mockResolvedValue({ ...storedConfig, fallbackQrImageUrl: 'http://cdn/billing/old.png' });
      await service.setFallbackQrImage(null, 'admin-1');
      expect(mockPrisma.billingConfig.update).toHaveBeenCalledWith({ where: { key: 'global' }, data: { fallbackQrImageUrl: null } });
      expect(mockStorage.delete).toHaveBeenCalledWith('http://cdn/billing/old.png');
    });
  });
});
