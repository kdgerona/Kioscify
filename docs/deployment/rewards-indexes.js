// Creates the indexes for the reward system's three new collections, and nothing else.
//
//   reward_programs        { companyId, brandId }      company Rewards list
//   reward_programs        { tenantId }                store-owned programs
//   reward_program_stores  { programId, tenantId } (unique)  store enrollment
//   reward_program_stores  { tenantId }                kiosk GET /rewards/active
//   reward_events          { tenantId, occurredAt }    store Activity list / summary
//   reward_events          { programId, occurredAt }   company Activity per program
//   reward_events          { transactionId }           transaction detail + void
//
// The collections are new, so these build instantly on empty collections. The
// unique index matters for correctness: it stops a store being enrolled twice.
//
// Run with mongosh against each environment's database:
//   mongosh "<DATABASE_URL>" docs/deployment/rewards-indexes.js
//
// Re-running is a no-op. Index names match what `prisma db push` creates for
// kioskly-api/prisma/schema.prisma, so a later db push sees them as in sync.

const indexes = [
  ['reward_programs', { companyId: 1, brandId: 1 }, 'reward_programs_companyId_brandId_idx', {}],
  ['reward_programs', { tenantId: 1 }, 'reward_programs_tenantId_idx', {}],
  ['reward_program_stores', { programId: 1, tenantId: 1 }, 'reward_program_stores_programId_tenantId_key', { unique: true }],
  ['reward_program_stores', { tenantId: 1 }, 'reward_program_stores_tenantId_idx', {}],
  ['reward_events', { tenantId: 1, occurredAt: 1 }, 'reward_events_tenantId_occurredAt_idx', {}],
  ['reward_events', { programId: 1, occurredAt: 1 }, 'reward_events_programId_occurredAt_idx', {}],
  ['reward_events', { transactionId: 1 }, 'reward_events_transactionId_idx', {}],
];

for (const [collection, key, name, opts] of indexes) {
  db.getCollection(collection).createIndex(key, Object.assign({ name: name }, opts));
  print(`ok  ${collection}.${name}`);
}
print(`Done: ${indexes.length} indexes in place.`);
