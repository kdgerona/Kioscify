/**
 * One-time migration: rewrite the embedded `inventoryItemId` inside
 * SubmittedInventoryReport.inventorySnapshot.items[] and
 * UserShiftInventoryReport.inventorySnapshot.items[] off the old per-store
 * InventoryItem copy id onto the resolved shared master InventoryItem id.
 *
 * Same problem as backfill-inventory-record-item-ids.ts, but for these two
 * report-snapshot collections instead of InventoryRecord. inventorySnapshot
 * is a denormalized JSON blob captured client-side at submission time — it
 * is NOT a Prisma relation, so migrate-inventory-to-setups.ts had no way to
 * touch it. After that migration runs, InventoryService.getLatestInventory()
 * looks up each *currently active* item's id in a map built from the
 * *latest report's* snapshot ids. For any report submitted before the
 * migration, those ids still point at the old per-store copy, which no
 * longer matches any active item id — so `latestQuantity` resolves to null
 * for every item and the store's inventory page renders "-" across the
 * board, even though the report data (and thus the real historical counts)
 * is still fully intact. Confirmed against a restored production copy
 * (2026-07-11): a store with real, populated submitted_inventory_reports
 * showed 0/27 snapshot items matching a current active item id post-migration.
 *
 * PREREQUISITE: run `npm run migrate:inventory-to-setups` first — this
 * script relies on every old per-store copy's `templateId` already being
 * resolved by that migration (either to a real brand template, or to a
 * synthetic master created for an orphan).
 *
 * Resolution + caching mirrors backfill-inventory-record-item-ids.ts: a
 * resolved-id cache is shared across ALL documents in both collections,
 * since the same handful of InventoryItem ids repeat across many reports.
 *
 * Safe to run multiple times — idempotent: a report is only rewritten if at
 * least one of its snapshot items resolves to a different id than it
 * currently has; already-resolved reports are left untouched (and on a
 * second run, "already master" short-circuits every resolution instantly).
 *
 * Usage:
 *   npm run migrate:inventory-snapshot-item-ids               # live run
 *   npm run migrate:inventory-snapshot-item-ids -- --dry-run  # preview only
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const DRY_RUN = process.argv.includes('--dry-run');
const prisma = new PrismaClient();

const stats = {
  reportsScanned: 0,
  reportsRewritten: 0,
  snapshotItemsRewritten: 0,
  itemsMissing: 0,
  itemsUnresolvedOrphan: 0,
};

// resolved-id cache shared across both collections: old id -> master id, or
// null if the id couldn't be resolved (missing item, or missing master) and
// should be left as-is (logged once, needs manual review).
const resolvedIdCache = new Map<string, string | null>();

function log(msg: string) {
  console.log(`[migrate:inventory-snapshot-item-ids] ${msg}`);
}

async function resolveMasterId(inventoryItemId: string): Promise<string | null> {
  if (resolvedIdCache.has(inventoryItemId)) return resolvedIdCache.get(inventoryItemId)!;

  const item = await prisma.inventoryItem.findUnique({
    where: { id: inventoryItemId },
    select: { id: true, isTemplate: true, templateId: true, name: true },
  });

  if (!item) {
    stats.itemsMissing++;
    log(`  WARNING: snapshot references inventoryItemId=${inventoryItemId}, but that InventoryItem no longer exists. Left as-is — needs manual review.`);
    resolvedIdCache.set(inventoryItemId, null);
    return null;
  }

  // Already a master (a real brand template, or a synthetic master with no
  // further templateId of its own) — nothing to rewrite.
  if (item.isTemplate || !item.templateId || item.templateId === item.id) {
    resolvedIdCache.set(inventoryItemId, item.id);
    return item.id;
  }

  const master = await prisma.inventoryItem.findUnique({ where: { id: item.templateId }, select: { id: true } });
  if (!master) {
    stats.itemsUnresolvedOrphan++;
    log(`  WARNING: item "${item.name}" (${inventoryItemId}) has templateId=${item.templateId}, but that master doesn't exist. Left as-is — needs manual review.`);
    resolvedIdCache.set(inventoryItemId, null);
    return null;
  }

  resolvedIdCache.set(inventoryItemId, master.id);
  return master.id;
}

async function processCollection(
  label: string,
  findMany: () => Promise<Array<{ id: string; inventorySnapshot: any }>>,
  updateOne: (id: string, inventorySnapshot: any) => Promise<unknown>,
) {
  const reports = await findMany();
  log(`${label}: found ${reports.length} report(s).`);

  for (const report of reports) {
    stats.reportsScanned++;
    const snapshot = report.inventorySnapshot;
    const items = snapshot?.items ?? [];
    if (items.length === 0) continue;

    let changed = false;
    const newItems: any[] = [];
    for (const item of items) {
      const masterId = await resolveMasterId(String(item.inventoryItemId));
      if (masterId && masterId !== item.inventoryItemId) {
        newItems.push({ ...item, inventoryItemId: masterId });
        changed = true;
        stats.snapshotItemsRewritten++;
      } else {
        newItems.push(item);
      }
    }

    if (changed) {
      log(`  ${label} ${report.id}: rewriting ${newItems.filter((_, i) => newItems[i].inventoryItemId !== items[i].inventoryItemId).length} snapshot item id(s)`);
      if (!DRY_RUN) {
        await updateOne(report.id, { ...snapshot, items: newItems });
      }
      stats.reportsRewritten++;
    }
  }
}

async function main() {
  console.log(`Starting inventory snapshot item-id backfill${DRY_RUN ? ' (DRY RUN)' : ''}...`);
  console.log('Make sure you have already run `npm run migrate:inventory-to-setups`.');

  await processCollection(
    'submitted_inventory_reports',
    () => prisma.submittedInventoryReport.findMany({ select: { id: true, inventorySnapshot: true } }),
    (id, inventorySnapshot) => prisma.submittedInventoryReport.update({ where: { id }, data: { inventorySnapshot } }),
  );

  await processCollection(
    'user_shift_inventory_reports',
    () => prisma.userShiftInventoryReport.findMany({ select: { id: true, inventorySnapshot: true } }),
    (id, inventorySnapshot) => prisma.userShiftInventoryReport.update({ where: { id }, data: { inventorySnapshot } }),
  );

  console.log(`\n${DRY_RUN ? '(DRY RUN — no writes made)\n' : ''}Summary:`, stats);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
