import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BillingConfig } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { BillingAuditService } from './billing-audit.service';
import { BillingConfigInput } from '../common/utils/billing-status.util';
import { UpdateBillingConfigDto } from './dto/update-billing-config.dto';
import { getPaymongoMode, isSecretConfigured, PaymongoMode } from './paymongo-mode.util';
import { isUniqueViolation } from '../common/utils/job-lock.util';
import { addZonedMonthsClamped, startOfZonedDay, zonedDayOfMonth } from '../common/utils/timezone';

const CACHE_TTL_MS = 30_000;

@Injectable()
export class BillingConfigService {
  private cached: { value: BillingConfig; expiresAt: number } | null = null;

  constructor(
    private prisma: PrismaService,
    private audit: BillingAuditService,
    private configService: ConfigService,
    private storage: StorageService,
  ) {}

  /** The global billing singleton. Read on every store request, so cached for 30s. */
  async get(): Promise<BillingConfig> {
    if (this.cached && this.cached.expiresAt > Date.now()) return this.cached.value;
    let value: BillingConfig;
    try {
      value = await this.prisma.billingConfig.upsert({
        where: { key: 'global' },
        update: {},
        create: { key: 'global' },
      });
    } catch (e) {
      // Two first-ever upserts can race on the insert; the loser re-reads.
      if (!isUniqueViolation(e)) throw e;
      value = await this.prisma.billingConfig.findUniqueOrThrow({ where: { key: 'global' } });
    }
    this.cached = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  }

  async getForAdmin(): Promise<BillingConfig & { paymongoMode: PaymongoMode; webhookConfigured: boolean }> {
    const config = await this.get();
    return {
      ...config,
      paymongoMode: getPaymongoMode(this.configService.get<string>('PAYMONGO_SECRET_KEY')),
      webhookConfigured: isSecretConfigured(this.configService.get<string>('PAYMONGO_WEBHOOK_SECRET')),
    };
  }

  async update(dto: UpdateBillingConfigDto, actorUserId: string): Promise<BillingConfig> {
    const current = await this.get();
    const { confirmEnforcement, ...rest } = dto;
    const data: Record<string, unknown> = { ...rest };
    if (rest.reminderOffsets) {
      data.reminderOffsets = [...new Set(rest.reminderOffsets)].sort((a, b) => a - b);
    }

    if (rest.enforcementEnabled === true && !current.enforcementEnabled) {
      const minVersion = rest.minKioskVersionCode !== undefined ? rest.minKioskVersionCode : current.minKioskVersionCode;
      if (!minVersion) {
        throw new BadRequestException('Set the minimum kiosk version before enabling enforcement');
      }
      if (confirmEnforcement !== true) {
        throw new BadRequestException('Confirm enforcement to continue');
      }
    }

    const updated = await this.prisma.billingConfig.update({ where: { key: 'global' }, data });
    this.cached = null;

    const before: Record<string, unknown> = {};
    for (const key of Object.keys(data)) before[key] = (current as Record<string, unknown>)[key];
    await this.audit.log({ tenantId: null, actorUserId, action: 'config.update', before, after: data });

    if (rest.billingEnabled === true && !current.billingEnabled) {
      await this.rollForwardStaleSchedules(actorUserId);
    }
    return updated;
  }

  /**
   * No retroactive charges: stores onboarded or enabled while billing was
   * globally OFF may have a nextBillingAt that is already in the past. When
   * billing is turned on, move each such date (for stores never invoiced)
   * forward to the first billing day on or after today, keeping the anchor.
   */
  private async rollForwardStaleSchedules(actorUserId: string): Promise<number> {
    const today = startOfZonedDay(new Date());
    const stale = await this.prisma.storeSubscription.findMany({
      where: { billingEnabled: true, nextBillingAt: { lt: today } },
      select: { id: true, tenantId: true, nextBillingAt: true, anchorDay: true },
    });
    if (stale.length === 0) return 0;

    const invoiced = await this.prisma.billingInvoice.findMany({
      where: { subscriptionId: { in: stale.map(s => s.id) } },
      select: { subscriptionId: true },
      distinct: ['subscriptionId'],
    });
    const invoicedIds = new Set(invoiced.map(i => i.subscriptionId));

    let moved = 0;
    for (const sub of stale) {
      if (invoicedIds.has(sub.id) || !sub.nextBillingAt) continue;
      const anchor = sub.anchorDay ?? zonedDayOfMonth(sub.nextBillingAt);
      let next = sub.nextBillingAt;
      while (next < today) next = addZonedMonthsClamped(next, 1, anchor);
      await this.prisma.storeSubscription.update({ where: { id: sub.id }, data: { nextBillingAt: next } });
      await this.audit.log({
        tenantId: sub.tenantId,
        actorUserId,
        action: 'schedule.rollforward',
        before: { nextBillingAt: sub.nextBillingAt.toISOString() },
        after: { nextBillingAt: next.toISOString() },
      });
      moved += 1;
    }
    return moved;
  }

  /** The owner's static bank QR, shown instead of PayMongo once the monthly limit is reached. */
  async setFallbackQrImage(file: { buffer: Buffer; mimetype: string } | null, actorUserId: string): Promise<BillingConfig> {
    const current = await this.get();
    let url: string | null = null;
    if (file) {
      const ext = file.mimetype === 'image/jpeg' ? 'jpg' : file.mimetype.split('/')[1];
      url = await this.storage.upload('billing', `fallback-qr-${Date.now()}.${ext}`, file.buffer, file.mimetype);
    }
    const updated = await this.prisma.billingConfig.update({ where: { key: 'global' }, data: { fallbackQrImageUrl: url } });
    this.cached = null;
    if (current.fallbackQrImageUrl) await this.storage.delete(current.fallbackQrImageUrl);
    await this.audit.log({
      tenantId: null,
      actorUserId,
      action: 'config.fallback_qr',
      before: { fallbackQrImageUrl: current.fallbackQrImageUrl },
      after: { fallbackQrImageUrl: url },
    });
    return updated;
  }

  toStatusConfig(c: BillingConfig): BillingConfigInput {
    return {
      billingEnabled: c.billingEnabled,
      enforcementEnabled: c.enforcementEnabled,
      defaultTrialDays: c.defaultTrialDays,
      defaultGraceDays: c.defaultGraceDays,
      claimLockHoldDays: c.claimLockHoldDays,
      reminderLeadDays: c.invoiceLeadDays,
    };
  }
}
