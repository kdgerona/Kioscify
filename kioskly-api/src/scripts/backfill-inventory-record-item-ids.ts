/**
 * One-time migration: rewrite InventoryRecord.inventoryItemId off the old
 * per-store copy id onto the resolved shared master InventoryItem id.
 *
 * Historically, InventoryRecord.inventoryItemId pointed at a store's own
 * `isTemplate: false` copy, not the brand template. Now that InventoryItem
 * is the shared master list (see migrate-inventory-to-setups.ts), history
 * needs to be consolidated onto that shared id so it stays resolvable
 * regardless of which InventorySetup a store is currently assigned to.
 *
 * PREREQUISITE: run `npm run migrate:inventory-to-setups` first — this
 * script relies on every store copy's `templateId` already being resolved
 * (either linked to a real brand template, or to a synthetic master created
 * for an orphan) by that migration.
 *
 * Grouped by distinct inventoryItemId (not per-record) for efficiency — many
 * records typically share the same item.
 *
 * Safe to run multiple times — idempotent: only rewrites records whose
 * current inventoryItemId still points at a non-master (isTemplate: false)
 * item with a resolved templateId different from itself.
 *
 * Usage:
 *   npm run migrate:inventory-record-item-ids               # live run
 *   npm run migrate:inventory-record-item-ids -- --dry-run  # preview only
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const DRY_RUN = process.argv.includes('--dry-run');
const prisma = new PrismaClient();

const stats = {
  distinctItemsSeen: 0,
  itemsAlreadyMaster: 0,
  itemsRewritten: 0,
  recordsRewritten: 0,
  itemsMissing: 0,
  itemsUnresolvedOrphan: 0,
  recordsSkippedUnresolved: 0,
};

function log(msg: string) {
  console.log(`[migrate:inventory-record-item-ids] ${msg}`);
}

async function main() {
  console.log(`Starting InventoryRecord.inventoryItemId backfill${DRY_RUN ? ' (DRY RUN)' : ''}...`);
  console.log('Make sure you have already run `npm run migrate:inventory-to-setups`.');

  const distinctItemIds = await prisma.inventoryRecord.findMany({
    distinct: ['inventoryItemId'],
    select: { inventoryItemId: true },
  });
  log(`Found ${distinctItemIds.length} distinct inventoryItemId(s) referenced by InventoryRecord.`);

  for (const { inventoryItemId } of distinctItemIds) {
    stats.distinctItemsSeen++;

    const item = await prisma.inventoryItem.findUnique({
      where: { id: inventoryItemId },
      select: { id: true, isTemplate: true, templateId: true, name: true },
    });

    if (!item) {
      stats.itemsMissing++;
      log(`  WARNING: InventoryRecord(s) reference inventoryItemId=${inventoryItemId}, but that InventoryItem no longer exists. Skipped — needs manual review.`);
      continue;
    }

    // Already points at a master (a real brand template, or a synthetic
    // master with no further templateId of its own) — nothing to rewrite.
    if (item.isTemplate || !item.templateId || item.templateId === item.id) {
      stats.itemsAlreadyMaster++;
      continue;
    }

    const masterId = item.templateId;
    const masterExists = await prisma.inventoryItem.findUnique({ where: { id: masterId }, select: { id: true } });
    if (!masterExists) {
      stats.itemsUnresolvedOrphan++;
      const count = await prisma.inventoryRecord.count({ where: { inventoryItemId } });
      stats.recordsSkippedUnresolved += count;
      log(`  WARNING: item "${item.name}" (${inventoryItemId}) has templateId=${masterId}, but that master doesn't exist. Skipped ${count} record(s) — needs manual review.`);
      continue;
    }

    const count = await prisma.inventoryRecord.count({ where: { inventoryItemId } });
    if (!DRY_RUN) {
      await prisma.inventoryRecord.updateMany({
        where: { inventoryItemId },
        data: { inventoryItemId: masterId },
      });
    }
    stats.itemsRewritten++;
    stats.recordsRewritten += count;
    log(`  Rewriting ${count} record(s) for "${item.name}": ${inventoryItemId} -> ${masterId}`);
  }

  console.log(`\n${DRY_RUN ? '(DRY RUN — no writes made)\n' : ''}Summary:`, stats);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
