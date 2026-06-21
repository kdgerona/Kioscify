/**
 * One-time migration: backfill templateId on store inventory copies that predate the fan-out system.
 *
 * Matches store copies to brand templates via the brand's tenants + name (not brandId on the copy,
 * which may be null for legacy items). Safe to run multiple times (idempotent).
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
    where: { isTemplate: true, tombstone: { not: 1 } },
  });

  console.log(`Found ${templates.length} brand templates.`);

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

    const unlinkedCopies = await prisma.inventoryItem.findMany({
      where: {
        tenantId: { in: tenantIds },
        isTemplate: false,
        tombstone: { not: 1 },
        templateId: null,
        name: template.name,
      },
    });

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
