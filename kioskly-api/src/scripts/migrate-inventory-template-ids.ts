/**
 * One-time migration: backfill templateId on store inventory copies that predate the fan-out system.
 *
 * Matches store copies to brand templates via the brand's tenants + name (not brandId on the copy,
 * which may be null for legacy items). Safe to run multiple times (idempotent).
 *
 * Deliberately matches against templates REGARDLESS of tombstone status. tombstone marks "no longer
 * offered in the active brand catalog" — a display/picker concern for live app code — not "this
 * template is no longer a valid identity to resolve history against". Verified against real
 * production data (2026-07-10): a brand can tombstone a template (e.g. discontinuing an item) while
 * a store still has an active, never-tombstoned copy of it with real InventoryRecord history. Only
 * matching non-tombstoned templates left that copy unlinked, which forced
 * migrate-inventory-to-setups.ts's orphan path to mint a brand-new duplicate InventoryItem instead of
 * resolving to the original template it actually corresponds to. Confirmed safe to match across all
 * tombstone states: no brand in production (or in this repo's test fixtures) has two templates
 * sharing the same name, so there is no ambiguity between an active and a tombstoned template.
 *
 * Usage:
 *   npm run migrate:inventory-templates              # live run
 *   npm run migrate:inventory-templates -- --dry-run # preview only
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const DRY_RUN = process.argv.includes('--dry-run');
const prisma = new PrismaClient();

async function main() {
  console.log(`Starting inventory template migration${DRY_RUN ? ' (DRY RUN)' : ''}...`);

  const templates = await prisma.inventoryItem.findMany({
    where: { isTemplate: true },
  });

  console.log(`Found ${templates.length} brand templates (including tombstoned — see header comment).`);

  let linked = 0;
  let skipped = 0;

  for (const template of templates) {
    if (!template.brandId) {
      skipped++;
      continue;
    }

    const stores = await prisma.tenant.findMany({
      where: { brandId: template.brandId },
      select: { id: true },
    });
    const tenantIds = stores.map((s) => s.id);
    if (tenantIds.length === 0) continue;

    // Filter templateId in JS — MongoDB's $eq:null doesn't reliably match missing fields
    const candidates = await prisma.inventoryItem.findMany({
      where: {
        tenantId: { in: tenantIds },
        isTemplate: false,
        tombstone: { not: 1 },
        name: template.name,
      },
    });
    const unlinkedCopies = candidates.filter((c) => !c.templateId);

    if (unlinkedCopies.length === 0) continue;

    console.log(
      `  Template "${template.name}" (${template.id}): linking ${unlinkedCopies.length} store cop${unlinkedCopies.length === 1 ? 'y' : 'ies'}`,
    );

    for (const copy of unlinkedCopies) {
      if (!DRY_RUN) {
        await prisma.inventoryItem.update({
          where: { id: copy.id },
          data: { templateId: template.id, brandId: template.brandId },
        });
      }
      linked++;
    }
  }

  console.log(`\nDone. Linked: ${linked}, Skipped (no brandId): ${skipped}${DRY_RUN ? ' (DRY RUN — no writes made)' : ''}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
