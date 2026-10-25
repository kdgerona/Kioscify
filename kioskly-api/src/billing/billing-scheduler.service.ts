import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { BillingConfigService } from './billing-config.service';
import { BillingInvoicesService } from './billing-invoices.service';
import { BillingReconcileService } from './billing-reconcile.service';
import { BillingRemindersService } from './billing-reminders.service';
import { withJobLock } from '../common/utils/job-lock.util';

const LOCK_TTL_MS = 10 * 60_000;

/**
 * Scheduled jobs only create invoices and poll for missed payments — status
 * (and locking) is derived on read, so nothing depends on these having run.
 */
@Injectable()
export class BillingSchedulerService {
  private readonly logger = new Logger(BillingSchedulerService.name);

  constructor(
    private prisma: PrismaService,
    private billingConfig: BillingConfigService,
    private invoices: BillingInvoicesService,
    private reconcileService: BillingReconcileService,
    private reminders: BillingRemindersService,
  ) {}

  private async run(name: string, job: () => Promise<number>): Promise<void> {
    try {
      const config = await this.billingConfig.get();
      if (!config.billingEnabled) return;
      await withJobLock(this.prisma, name, LOCK_TTL_MS, async () => {
        const count = await job();
        if (count > 0) this.logger.log(`${name}: ${count}`);
      });
    } catch (e) {
      this.logger.error(`${name} failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  @Cron('5 * * * *', { name: 'billing.generateInvoices', timeZone: 'Asia/Manila' })
  generateInvoices(): Promise<void> {
    return this.run('billing.generateInvoices', () => this.invoices.generateDue(new Date()));
  }

  @Cron('*/15 * * * *', { name: 'billing.reconcile', timeZone: 'Asia/Manila' })
  reconcile(): Promise<void> {
    return this.run('billing.reconcile', () => this.reconcileService.reconcileRecent(new Date()));
  }

  @Cron('10 * * * *', { name: 'billing.sendReminders', timeZone: 'Asia/Manila' })
  sendReminders(): Promise<void> {
    return this.run('billing.sendReminders', () => this.reminders.sendDue(new Date()));
  }
}
