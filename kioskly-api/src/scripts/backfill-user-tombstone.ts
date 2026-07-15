/**
 * One-time migration: backfill tombstone=0 on User documents that predate the
 * soft-delete feature (commit cb92014, "add safe account deletion and per-store
 * access revocation").
 *
 * MongoDB is schemaless — adding a required field to the Prisma schema does NOT
 * retroactively add it to existing documents. Every query in this codebase that
 * filters on `tombstone: { not: 1 }` (login, every user list, etc.) returns
 * nothing for documents missing the field entirely, rather than treating a
 * missing field as "not tombstoned". Incident 2026-07-06: this broke every user
 * list and login in local dev until backfilled. Safe to run multiple times
 * (idempotent — only touches documents missing the field).
 *
 * MUST be run against any environment (staging/production) as part of deploying
 * this commit — before or atomically with cutover — or the same outage will
 * happen there.
 *
 * Usage:
 *   npm run migrate:user-tombstone               # live run
 *   npm run migrate:user-tombstone -- --dry-run  # preview only
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const DRY_RUN = process.argv.includes('--dry-run');
const prisma = new PrismaClient();

async function main() {
  console.log(`Starting User.tombstone backfill${DRY_RUN ? ' (DRY RUN)' : ''}...`);

  const missing: any = await prisma.$runCommandRaw({
    count: 'users',
    query: { tombstone: { $exists: false } },
  });
  console.log(`Users missing tombstone field: ${missing.n}`);

  if (missing.n === 0) {
    console.log('Nothing to do.');
    return;
  }

  if (DRY_RUN) {
    console.log('(DRY RUN — no writes made)');
    return;
  }

  const result: any = await prisma.$runCommandRaw({
    update: 'users',
    updates: [{ q: { tombstone: { $exists: false } }, u: { $set: { tombstone: 0 } }, multi: true }],
  });
  console.log(`Backfilled ${result.nModified} user document(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
