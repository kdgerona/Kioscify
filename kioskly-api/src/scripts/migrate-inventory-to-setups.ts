/**
 * One-time migration: create a "Default Setup" for every Brand, tag the
 * brand's existing InventoryItem templates (isTemplate: true) with
 * inventorySetupId + a resolved Category directly (InventoryItem is
 * InventorySetup-owned directly — no junction, mirrors Product/Menu — see
 * schema.prisma), preserve any per-store customization as
 * TenantInventoryOverride rows, and assign every Tenant of the brand to the
 * new Default Setup.
 *
 * Unlike Menu (one identical shared catalog per brand today), Inventory
 * genuinely has per-store divergence today (`minStockLevelCustomized` /
 * `expirationWarningDaysCustomized`). This migration is still lossless with
 * one shared Default Setup per brand — instead of forking one setup per
 * store, per-store divergence is captured as a TenantInventoryOverride
 * layered on top of the shared item.
 *
 * Orphan store copies (no resolvable brand template, even after re-running
 * migrate-inventory-template-ids.ts) are consolidated by (brandId, name)
 * into a synthetic InventoryItem tagged to the Default Setup but created
 * tombstoned — preserved for history/reactivation, excluded from the active
 * picker and low-stock alerts by default. This is the concrete mechanism for
 * "preserve deprecated items a store might still have stock of," and it
 * applies going forward too, not just at this migration (see schema.prisma's
 * InventorySetup section comment).
 *
 * Category resolution REUSES an existing Category(type=INVENTORY, brandId,
 * name) row when one already exists (mirroring how migrate-catalog-to-menus.ts
 * reuses existing PRODUCT categories rather than creating new ones), instead
 * of unconditionally creating a fresh row. Verified against real production
 * data (2026-07-10): every brand already had a full, brand-admin-curated set
 * of Category(type=INVENTORY) rows — created via the existing category
 * management UI, with real descriptions — whose names exactly matched the
 * free-text legacyCategory values on InventoryItem, but were never linked via
 * categoryId (that FK didn't exist yet). Unconditionally creating new
 * categories here would silently orphan every one of those curated rows
 * (discarding their descriptions) and leave near-duplicate categories behind.
 *
 * PREREQUISITE: run `npm run migrate:inventory-templates` first (existing
 * script) to maximize templateId linkage before this one runs.
 *
 * Safe to run multiple times — idempotent per brand: if an InventorySetup
 * named "Default Setup" already exists for a brand, that brand is skipped
 * entirely. This is coarse-grained (whole-brand, not per-row) idempotency,
 * matching this repo's existing migrate-price-tiers.ts convention: if a run
 * fails partway through a brand, that brand's partial InventorySetup must be
 * deleted manually (along with any Category/orphan InventoryItem rows it
 * created) before re-running, or it will be silently skipped as "already
 * migrated" while actually incomplete.
 *
 * Usage:
 *   npm run migrate:inventory-to-setups               # live run
 *   npm run migrate:inventory-to-setups -- --dry-run  # preview only
 */

import 'dotenv/config';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';

const DRY_RUN = process.argv.includes('--dry-run');
const prisma = new PrismaClient();

const stats = {
  brandsProcessed: 0,
  brandsSkipped: 0,
  setupsCreated: 0,
  categoriesCreated: 0,
  categoriesReused: 0,
  templatesTagged: 0,
  orphanMastersCreated: 0,
  templateIdsBackfilled: 0,
  overridesCreated: 0,
  storesAssigned: 0,
  errors: 0,
};

function log(msg: string) {
  console.log(`[migrate:inventory-to-setups] ${msg}`);
}

async function processBrand(brandId: string, brandName: string) {
  const existing = await prisma.inventorySetup.findFirst({
    where: { brandId, name: 'Default Setup' },
    select: { id: true },
  });
  if (existing) {
    log(`  SKIP Brand "${brandName}" (${brandId}) — Default Setup already exists`);
    stats.brandsSkipped++;
    return;
  }

  log(`  Processing Brand "${brandName}" (${brandId})`);

  const setupId = DRY_RUN
    ? '(dry-run-placeholder)'
    : (
        await prisma.inventorySetup.create({
          data: { brandId, name: 'Default Setup', isActive: true },
        })
      ).id;
  stats.setupsCreated++;

  const allItems = await prisma.inventoryItem.findMany({ where: { brandId } });
  const templates = allItems.filter((i) => i.isTemplate);
  // A real store copy always has a tenantId. Rows with isTemplate:false and no
  // tenantId are synthetic masters this same script already created for an
  // orphan on a previous (possibly partial) run — never store copies. Without
  // this distinction, a re-run would treat them as copies needing threshold
  // overrides (tenantId: null would blow up TenantInventoryOverride.create)
  // and, worse, would fail to recognize them as already-resolved masters and
  // create a duplicate synthetic master every time.
  const copies = allItems.filter((i) => !i.isTemplate && i.tenantId);
  const existingSyntheticMasters = allItems.filter((i) => !i.isTemplate && !i.tenantId);
  log(`    Found ${templates.length} template(s), ${copies.length} store copy/copies, ${existingSyntheticMasters.length} pre-existing synthetic master(s)`);

  // Pre-existing INVENTORY categories for this brand not yet claimed by any
  // InventorySetup — candidates to reuse-by-name instead of recreating.
  // `inventorySetupId` is genuinely absent (not `null`) on rows that predate
  // this field, so filter in JS — a Mongo `{ inventorySetupId: null }` where
  // clause does NOT match a missing field (same class of gotcha documented in
  // CLAUDE.md for tombstone/templateId).
  const brandInventoryCategories = await prisma.category.findMany({
    where: { brandId, type: 'INVENTORY' },
  });
  const reusableCategoryByName = new Map(
    brandInventoryCategories.filter((c) => !c.inventorySetupId).map((c) => [c.name, c]),
  );

  const categoryCache = new Map<string, string>(); // categoryName -> Category.id, scoped to this setup
  async function resolveCategoryId(rawName: string | null): Promise<string> {
    const name = (rawName || 'Uncategorized').trim() || 'Uncategorized';
    const cached = categoryCache.get(name);
    if (cached) return cached;

    const reusable = reusableCategoryByName.get(name);

    if (DRY_RUN) {
      const placeholder = reusable ? reusable.id : `(dry-run-category:${name})`;
      categoryCache.set(name, placeholder);
      if (reusable) stats.categoriesReused++;
      else stats.categoriesCreated++;
      return placeholder;
    }

    if (reusable) {
      await prisma.category.update({ where: { id: reusable.id }, data: { inventorySetupId: setupId } });
      stats.categoriesReused++;
      categoryCache.set(name, reusable.id);
      return reusable.id;
    }

    const created = await prisma.category.create({
      data: { id: randomUUID(), inventorySetupId: setupId, type: 'INVENTORY', name, brandId },
    });
    stats.categoriesCreated++;
    categoryCache.set(name, created.id);
    return created.id;
  }

  // master InventoryItem.id -> already processed this run
  const resolvedMasterIds = new Set<string>();
  // orphan consolidation key (brandId::lowercased name) -> resolved master InventoryItem.id
  // pre-seeded from synthetic masters a previous run already created, so a
  // re-run reuses them instead of creating duplicates.
  const orphanMasterByName = new Map<string, string>(
    existingSyntheticMasters.map((m) => [`${brandId}::${m.name.toLowerCase()}`, m.id]),
  );
  const templateById = new Map(templates.map((t) => [t.id, t]));

  // ── 1. Tag every existing brand template directly with inventorySetupId ───
  for (const t of templates) {
    if (resolvedMasterIds.has(t.id)) continue;
    resolvedMasterIds.add(t.id);
    const categoryId = await resolveCategoryId(t.legacyCategory);
    if (!DRY_RUN) {
      await prisma.inventoryItem.update({
        where: { id: t.id },
        data: { inventorySetupId: setupId, categoryId },
      });
    }
    stats.templatesTagged++;
  }

  // ── 2. Resolve each store copy's master item, backfill templateId,
  //       seed a tombstoned orphan InventoryItem if no template resolves,
  //       and capture per-store divergence as TenantInventoryOverride ──────
  for (const copy of copies) {
    let masterId: string | null = null;

    if (copy.templateId && templateById.has(copy.templateId)) {
      masterId = copy.templateId;
    } else {
      const key = `${brandId}::${copy.name.toLowerCase()}`;
      masterId = orphanMasterByName.get(key) ?? null;
      if (!masterId) {
        const categoryId = await resolveCategoryId(copy.legacyCategory);
        if (DRY_RUN) {
          masterId = `(dry-run-orphan-master:${copy.name})`;
        } else {
          const created = await prisma.inventoryItem.create({
            data: {
              brandId,
              inventorySetupId: setupId,
              categoryId,
              name: copy.name,
              unit: copy.unit,
              description: copy.description,
              minStockLevel: copy.minStockLevel,
              requiresExpirationDate: copy.requiresExpirationDate,
              expirationWarningDays: copy.expirationWarningDays,
              tombstone: 1, // orphan — no active brand template; preserved as legacy, not in the active picker
            },
          });
          masterId = created.id;
        }
        orphanMasterByName.set(key, masterId);
        stats.orphanMastersCreated++;
        log(`    WARNING: orphan item "${copy.name}" (from tenant ${copy.tenantId}) — no resolvable template, consolidated into synthetic master, marked legacy. Review manually.`);
      }
    }

    if (!DRY_RUN && copy.templateId !== masterId) {
      await prisma.inventoryItem.update({ where: { id: copy.id }, data: { templateId: masterId } });
      stats.templateIdsBackfilled++;
    } else if (DRY_RUN && copy.templateId !== masterId) {
      stats.templateIdsBackfilled++;
    }

    if ((copy.minStockLevelCustomized || copy.expirationWarningDaysCustomized) && !DRY_RUN) {
      await prisma.tenantInventoryOverride.create({
        data: {
          tenantId: copy.tenantId!,
          inventoryItemId: masterId!,
          minStockLevel: copy.minStockLevelCustomized ? copy.minStockLevel : undefined,
          expirationWarningDays: copy.expirationWarningDaysCustomized ? copy.expirationWarningDays : undefined,
        },
      });
      stats.overridesCreated++;
    } else if (copy.minStockLevelCustomized || copy.expirationWarningDaysCustomized) {
      stats.overridesCreated++;
    }
  }

  // ── 3. Assign every Tenant of this brand to the new Default Setup ─────────
  const tenants = await prisma.tenant.findMany({ where: { brandId }, select: { id: true } });
  if (!DRY_RUN) {
    await prisma.tenant.updateMany({ where: { brandId }, data: { inventorySetupId: setupId } });
  }
  stats.storesAssigned += tenants.length;
  log(`    Items tagged: ${templates.length} from templates, ${orphanMasterByName.size} orphan master(s) consolidated. Stores assigned: ${tenants.length}`);

  stats.brandsProcessed++;
}

async function main() {
  console.log(`Starting inventory-to-setup migration${DRY_RUN ? ' (DRY RUN)' : ''}...`);
  console.log('Make sure you have already run `npm run migrate:inventory-templates` to maximize templateId linkage.');

  const brands = await prisma.brand.findMany({ select: { id: true, name: true }, orderBy: { createdAt: 'asc' } });
  console.log(`Found ${brands.length} brand(s).`);

  for (const b of brands) {
    try {
      await processBrand(b.id, b.name);
    } catch (err) {
      console.error(`ERROR processing brand "${b.name}" (${b.id}):`, err);
      stats.errors++;
    }
  }

  console.log(`\n${DRY_RUN ? '(DRY RUN — no writes made)\n' : ''}Summary:`, stats);
  if (stats.errors > 0) process.exit(1);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
