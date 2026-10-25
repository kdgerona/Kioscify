import { BillingInvoice, BillingReminder } from '@prisma/client';

/**
 * Delivery for a recorded reminder. Today only in-app (the reminder row is
 * read by billing/me and shown once per store admin); email/SMS/push can be
 * added as further channels without touching scheduling or dedupe.
 */
export interface ReminderChannel {
  readonly name: string;
  deliver(reminder: BillingReminder, invoice: Pick<BillingInvoice, 'id' | 'tenantId' | 'dueAt'>): Promise<void>;
}

export const REMINDER_CHANNELS = Symbol('REMINDER_CHANNELS');
