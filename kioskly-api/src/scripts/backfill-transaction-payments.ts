/**
 * One-time migration: backfill payments=[] on Transaction documents that
 * predate the split-payment feature.
 *
 * MongoDB is schemaless — adding a field to the Prisma schema does NOT
 * retroactively add it to existing documents. This field is never filtered on
 * (no `where: { payments: ... }` anywhere in the codebase), so the missing
 * field shouldn't break anything the way `User.tombstone` did — but that
 * "shouldn't" is exactly the assumption that failed last time (incident
 * 2026-07-06, see CLAUDE.md). Backfilling closes the gap for good instead of
 * relying on every future query staying non-filtering forever.
 *
 * Safe to run multiple times (idempotent — only touches documents missing the
 * field). MUST be run against any environment (staging/production) as part of
 * deploying the split-payment commit — before or atomically with cutover.
 *
 * Usage:
 *   npm run migrate:transaction-payments-backfill               # live run
 *   npm run migrate:transaction-payments-backfill -- --dry-run  # preview only
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const DRY_RUN = process.argv.includes('--dry-run');
const prisma = new PrismaClient();

async function main() {
  console.log(`Starting Transaction.payments backfill${DRY_RUN ? ' (DRY RUN)' : ''}...`);

  const missing: any = await prisma.$runCommandRaw({
    count: 'transactions',
    query: { payments: { $exists: false } },
  });
  console.log(`Transactions missing payments field: ${missing.n}`);

  if (missing.n === 0) {
    console.log('Nothing to do.');
    return;
  }

  if (DRY_RUN) {
    console.log('(DRY RUN — no writes made)');
    return;
  }

  const result: any = await prisma.$runCommandRaw({
    update: 'transactions',
    updates: [{ q: { payments: { $exists: false } }, u: { $set: { payments: [] } }, multi: true }],
  });
  console.log(`Backfilled ${result.nModified} transaction document(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
