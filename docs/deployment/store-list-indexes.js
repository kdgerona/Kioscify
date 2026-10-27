// Creates the indexes behind the paginated store-portal lists, and nothing else.
//
//   transactions { tenantId, timestamp }  Transactions list (sorted by timestamp desc)
//   expenses     { tenantId, date }       Expenses list (sorted by date desc)
//
// Without them, every page forces Mongo to scan and in-memory sort all of a
// store's rows. The report lists already have { tenantId, submittedAt }.
//
// Run with mongosh against each environment's database:
//   mongosh "<DATABASE_URL>" docs/deployment/store-list-indexes.js
//
// Safe while users are online: on MongoDB 4.2+ the build only takes an
// exclusive lock briefly at the start and end, so reads/writes keep flowing.
// It does scan each collection, so prefer a quiet hour on production.
// Re-running is a no-op.
//
// Index names match what `prisma db push` creates for
// kioskly-api/prisma/schema.prisma, so a later db push sees them as in sync.

const indexes = [
  ['transactions', { tenantId: 1, timestamp: 1 }, 'transactions_tenantId_timestamp_idx'],
  ['expenses', { tenantId: 1, date: 1 }, 'expenses_tenantId_date_idx'],
];

for (const [collection, key, name] of indexes) {
  db.getCollection(collection).createIndex(key, { name });
  print(`ok  ${collection}.${name}`);
}
print(`Done: ${indexes.length} indexes in place.`);
