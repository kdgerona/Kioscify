// Creates the indexes for the billing collections, and nothing else.
//
// Run with mongosh against the production database (see
// billing-release.md, step 3). Safe while users are online: every collection
// here is new and empty, so each index builds instantly, and no existing
// collection is touched. Re-running is a no-op.
//
// Index names match what `prisma db push` creates for
// kioskly-api/prisma/schema.prisma, so a later db push sees them as in sync.

const indexes = [
  ['billing_config', { key: 1 }, 'billing_config_key_key', true],
  ['billing_invoices', { number: 1 }, 'billing_invoices_number_key', true],
  ['billing_invoices', { payToken: 1 }, 'billing_invoices_payToken_key', true],
  ['billing_invoices', { subscriptionId: 1, periodStart: 1, revision: 1 }, 'billing_invoices_subscriptionId_periodStart_revision_key', true],
  ['billing_invoices', { status: 1, dueAt: 1 }, 'billing_invoices_status_dueAt_idx', false],
  ['billing_invoices', { tenantId: 1 }, 'billing_invoices_tenantId_idx', false],
  ['billing_payments', { paidAt: 1 }, 'billing_payments_paidAt_idx', false],
  ['billing_payments', { tenantId: 1 }, 'billing_payments_tenantId_idx', false],
  ['billing_payment_attempts', { providerIntentId: 1 }, 'billing_payment_attempts_providerIntentId_key', true],
  ['billing_payment_attempts', { invoiceId: 1, createdAt: 1 }, 'billing_payment_attempts_invoiceId_createdAt_idx', false],
  ['payment_webhook_events', { providerEventId: 1 }, 'payment_webhook_events_providerEventId_key', true],
  ['billing_reminders', { invoiceId: 1, offsetDays: 1, channel: 1 }, 'billing_reminders_invoiceId_offsetDays_channel_key', true],
  ['billing_payment_claims', { status: 1, createdAt: 1 }, 'billing_payment_claims_status_createdAt_idx', false],
  ['billing_payment_claims', { invoiceId: 1 }, 'billing_payment_claims_invoiceId_idx', false],
  ['billing_audit_logs', { tenantId: 1, createdAt: 1 }, 'billing_audit_logs_tenantId_createdAt_idx', false],
  ['job_locks', { name: 1 }, 'job_locks_name_key', true],
];

print(`Database: ${db.getName()}`);
for (const [collection, key, name, unique] of indexes) {
  db.getCollection(collection).createIndex(key, unique ? { name, unique: true } : { name });
  print(`ok  ${collection}.${name}`);
}
print(`Done: ${indexes.length} indexes in place.`);
