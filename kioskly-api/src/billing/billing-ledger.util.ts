import { Prisma } from '@prisma/client';
import { getZonedMonthBounds } from '../common/utils/timezone';

type LedgerClient = {
  subscriptionPayment: {
    findUnique(args: Prisma.SubscriptionPaymentFindUniqueArgs): Promise<{ note: string | null } | null>;
    upsert(args: Prisma.SubscriptionPaymentUpsertArgs): Promise<unknown>;
  };
};

/**
 * Mark the legacy month checklist row for `date`'s store-local month paid,
 * appending `note` to any note an admin already wrote — so the existing
 * Platform Admin checklist stays accurate for billed stores.
 */
export async function markLedgerMonthPaid(
  client: LedgerClient,
  subscriptionId: string,
  date: Date,
  paidAt: Date,
  note: string,
): Promise<void> {
  const month = getZonedMonthBounds(date).start;
  const existing = await client.subscriptionPayment.findUnique({
    where: { subscriptionId_month: { subscriptionId, month } },
  });
  const merged = existing?.note ? `${existing.note} · ${note}` : note;
  await client.subscriptionPayment.upsert({
    where: { subscriptionId_month: { subscriptionId, month } },
    update: { paid: true, paidAt, note: merged },
    create: { subscriptionId, month, paid: true, paidAt, note: merged },
  });
}
