import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BillingConfigService } from './billing-config.service';
import { BillingAuditService } from './billing-audit.service';
import { isUniqueViolation } from '../common/utils/job-lock.util';
import { addZonedDays } from '../common/utils/timezone';
import { REMINDER_CHANNELS } from './reminders/reminder-channel.interface';
import type { ReminderChannel } from './reminders/reminder-channel.interface';

/** Offsets (days after the due date, Manila) whose day has arrived, ascending. */
export function dueOffsets(dueAt: Date, offsets: number[], now: Date): number[] {
  return [...new Set(offsets)].sort((a, b) => a - b).filter(o => now >= addZonedDays(dueAt, o));
}

/** Title of the one-time reminder notice; it gets stronger towards the lock. */
export function reminderCopy(offsetDays: number, daysLeft: number, enforcement: boolean): { title: string } {
  if (offsetDays === 0) return { title: 'Your subscription is due today' };
  if (daysLeft <= 0) return { title: enforcement ? 'Last day before access is paused' : 'Your subscription is overdue' };
  return { title: `Reminder: subscription due — ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left${enforcement ? ' before access is paused' : ''}` };
}

@Injectable()
export class BillingRemindersService {
  private readonly logger = new Logger(BillingRemindersService.name);

  constructor(
    private prisma: PrismaService,
    private billingConfig: BillingConfigService,
    private audit: BillingAuditService,
    @Inject(REMINDER_CHANNELS) private channels: ReminderChannel[],
  ) {}

  /**
   * Records the latest due reminder for each open invoice, once per
   * (invoice, offset, channel) — the unique index makes reruns no-ops. If an
   * invoice was created late, only the most recent offset fires, so a store
   * never gets several notices at once.
   */
  async sendDue(now: Date = new Date()): Promise<number> {
    const config = await this.billingConfig.get();
    const invoices = await this.prisma.billingInvoice.findMany({
      where: { status: 'OPEN', dueAt: { lte: now }, subscription: { is: { billingEnabled: true } } },
      select: { id: true, tenantId: true, dueAt: true },
    });
    // Deactivated or deleted stores get no reminders. Checked in code rather
    // than with a negated filter, which would skip documents missing the field.
    const tenants = await this.prisma.tenant.findMany({
      where: { id: { in: [...new Set(invoices.map(i => i.tenantId))] } },
      select: { id: true, isActive: true, tombstone: true },
    });
    const live = new Set(tenants.filter(t => t.isActive !== false && t.tombstone !== 1).map(t => t.id));

    let created = 0;
    for (const invoice of invoices) {
      if (!live.has(invoice.tenantId)) continue;
      const due = dueOffsets(invoice.dueAt, config.reminderOffsets, now);
      if (due.length === 0) continue;
      const offsetDays = due[due.length - 1];
      for (const channel of this.channels) {
        let reminderId: string | null = null;
        try {
          // The row is the dedupe claim; it's removed again if delivery fails,
          // so the next run retries instead of treating it as sent.
          const reminder = await this.prisma.billingReminder.create({
            data: { invoiceId: invoice.id, tenantId: invoice.tenantId, offsetDays, channel: channel.name },
          });
          reminderId = reminder.id;
          await channel.deliver(reminder, invoice);
          created += 1;
        } catch (e) {
          if (isUniqueViolation(e)) continue;
          this.logger.warn(`Reminder for ${invoice.id} via ${channel.name} failed: ${e instanceof Error ? e.message : e}`);
          if (reminderId) {
            try {
              await this.prisma.billingReminder.delete({ where: { id: reminderId } });
            } catch {
              // Left in place: this offset won't be retried for this channel.
            }
          }
        }
      }
    }
    return created;
  }

  /** Newest reminder for the invoice this user hasn't acknowledged yet. */
  async pendingFor(invoiceId: string, userId: string) {
    const reminder = await this.prisma.billingReminder.findFirst({ where: { invoiceId }, orderBy: { sentAt: 'desc' } });
    if (!reminder || reminder.acknowledgedByUserIds.includes(userId)) return null;
    return reminder;
  }

  async ack(tenantId: string, reminderId: string, userId: string): Promise<void> {
    const reminder = await this.prisma.billingReminder.findUnique({ where: { id: reminderId } });
    if (!reminder || reminder.tenantId !== tenantId) throw new NotFoundException(`Reminder ${reminderId} not found`);
    if (reminder.acknowledgedByUserIds.includes(userId)) return;
    await this.prisma.billingReminder.update({
      where: { id: reminderId },
      data: { acknowledgedByUserIds: { push: userId } },
    });
  }

  /** Show the latest reminder again to every store admin. */
  async resend(invoiceId: string, actorUserId: string): Promise<void> {
    const reminder = await this.prisma.billingReminder.findFirst({ where: { invoiceId }, orderBy: { sentAt: 'desc' } });
    if (!reminder) throw new NotFoundException('No reminder has been sent for this invoice yet');
    await this.prisma.billingReminder.update({ where: { id: reminder.id }, data: { acknowledgedByUserIds: [] } });
    await this.audit.log({ tenantId: reminder.tenantId, actorUserId, action: 'reminder.resend', after: { invoiceId } });
  }
}
