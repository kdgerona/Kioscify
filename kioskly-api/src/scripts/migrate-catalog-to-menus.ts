/**
 * One-time migration: create a "Default Menu" for every Brand and move the
 * brand's existing catalog (Category/Size/Addon/Preference/Product/PriceTier)
 * onto it, then assign every one of the brand's Tenants to that menu.
 *
 * Only Menu (and InventorySetup) are Brand-scoped containers — everything
 * nested under a Menu is directly owned by it via its own menuId field, no
 * shared-master + junction indirection (see schema.prisma). So this
 * migration is a straightforward tag-with-menuId pass across five
 * collections, not a junction-seeding step.
 *
 * Safe because every store under a Brand already sees one identical shared
 * catalog today (tenantId is legacy/unused in practice — see CLAUDE.md) — so
 * there is no existing per-store divergence to lose by consolidating onto one
 * shared Default Menu per brand.
 *
 * Safe to run multiple times — idempotent and RESUMABLE per brand: if a Menu
 * named "Default Menu" already exists (e.g. from a prior partial run, or a
 * run of an older version of this script), it is reused rather than
 * recreated, and every tagging step below still runs against it. Each
 * tagging step is itself idempotent (re-setting menuId to the same value on
 * an already-tagged row is a no-op), so this script is safe to re-run to
 * completion after any interruption or after an incompatible earlier run —
 * it will simply finish whatever wasn't done yet. This resumability is not
 * theoretical: it was needed for real — see the incident note below.
 *
 * INCIDENT (2026-07-09): an earlier version of this script (written before
 * Product/PriceTier became directly Menu-owned — see schema.prisma) had
 * already created a "Default Menu" per brand and tagged Category/Size/Addon/
 * Preference with menuId, but used a since-removed MenuProduct junction for
 * per-product category/price instead of tagging Product.menuId directly.
 * When this script was rewritten for the direct-ownership model, its
 * idempotency guard treated "Default Menu already exists" as "this brand is
 * fully migrated" and skipped it entirely — so Product and PriceTier, which
 * the old script never touched the same way, silently never got their
 * menuId backfilled, even though the schema migration had otherwise
 * succeeded. Products' own name/price/categoryId were never at risk (this
 * script only ever reads and tags them, never overwrites their content) —
 * they were simply invisible from the new Menu-scoped read paths until
 * re-tagged. Fixed by making every step below resumable instead of gated by
 * a single brand-level early return.
 *
 * Prerequisite: run `migrate-inventory-templates` first if you haven't
 * already (unrelated collection, but keeps the rollout order consistent —
 * see CLAUDE.md).
 *
 * Usage:
 *   npm run migrate:catalog-to-menus               # live run
 *   npm run migrate:catalog-to-menus -- --dry-run  # preview only
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const DRY_RUN = process.argv.includes('--dry-run');
const prisma = new PrismaClient();

const stats = {
  brandsProcessed: 0,
  brandsResumed: 0,
  menusCreated: 0,
  categoriesTagged: 0,
  sizesTagged: 0,
  addonsTagged: 0,
  preferencesTagged: 0,
  productsTagged: 0,
  productsSkippedNoCategoryOrPrice: 0,
  priceTiersTagged: 0,
  storesAssigned: 0,
  errors: 0,
};

function log(msg: string) {
  console.log(`[migrate:catalog-to-menus] ${msg}`);
}

async function processBrand(brandId: string, brandName: string) {
  // ── Find-or-create the Default Menu (resumable, not a whole-brand skip) ───
  const existing = await prisma.menu.findFirst({
    where: { brandId, name: 'Default Menu' },
    select: { id: true },
  });

  let menuId: string;
  if (existing) {
    menuId = existing.id;
    log(`  RESUME Brand "${brandName}" (${brandId}) — Default Menu already exists (id=${menuId}), checking for untagged rows`);
    stats.brandsResumed++;
  } else {
    log(`  Processing Brand "${brandName}" (${brandId})`);
    menuId = DRY_RUN
      ? '(dry-run-placeholder)'
      : (
          await prisma.menu.create({
            data: { brandId, name: 'Default Menu', isActive: true },
          })
        ).id;
    stats.menusCreated++;
    if (!DRY_RUN) log(`    Created Menu id=${menuId}`);
  }

  // ── 1. Tag existing brand-scoped catalog rows with menuId ─────────────────
  // `type` predates most Category docs and is stored as genuinely absent (not
  // `null`) on them — Prisma/Mongo's `NOT: { type: 'INVENTORY' }` and even
  // `{ type: null }` do NOT reliably match missing fields (same caveat as
  // `templateId` in migrate-inventory-template-ids.ts). Filter in JS instead.
  const brandCategories = await prisma.category.findMany({
    where: { brandId },
    select: { id: true, type: true },
  });
  const productCategoryIds = brandCategories.filter((c) => c.type !== 'INVENTORY').map((c) => c.id);

  const [sizeCount, addonCount, preferenceCount] = await Promise.all([
    prisma.size.count({ where: { brandId } }),
    prisma.addon.count({ where: { brandId } }),
    prisma.preference.count({ where: { brandId } }),
  ]);

  // Products need a categoryId AND price to be valid under the new
  // direct-ownership model (both are required fields on Product going
  // forward) — skip and warn on rows missing either, they need manual repair.
  const brandProducts = await prisma.product.findMany({
    where: { brandId },
    select: { id: true, categoryId: true, price: true },
  });
  const taggableProductIds = brandProducts.filter((p) => p.categoryId && p.price !== null).map((p) => p.id);
  const skippedProducts = brandProducts.length - taggableProductIds.length;
  stats.productsSkippedNoCategoryOrPrice += skippedProducts;
  if (skippedProducts > 0) {
    log(
      `    WARNING: ${skippedProducts} product(s) in brand "${brandName}" have no categoryId/price — skipped, needs manual repair before they'll appear on the Default Menu`,
    );
  }

  if (!DRY_RUN) {
    const [c, s, a, p] = await Promise.all([
      productCategoryIds.length > 0
        ? prisma.category.updateMany({ where: { id: { in: productCategoryIds } }, data: { menuId } })
        : Promise.resolve({ count: 0 }),
      prisma.size.updateMany({ where: { brandId }, data: { menuId } }),
      prisma.addon.updateMany({ where: { brandId }, data: { menuId } }),
      prisma.preference.updateMany({ where: { brandId }, data: { menuId } }),
      taggableProductIds.length > 0
        ? prisma.product.updateMany({ where: { id: { in: taggableProductIds } }, data: { menuId } })
        : Promise.resolve({ count: 0 }),
    ]);
    stats.categoriesTagged += c.count;
    stats.sizesTagged += s.count;
    stats.addonsTagged += a.count;
    stats.preferencesTagged += p.count;
  } else {
    stats.categoriesTagged += productCategoryIds.length;
    stats.sizesTagged += sizeCount;
    stats.addonsTagged += addonCount;
    stats.preferencesTagged += preferenceCount;
  }
  stats.productsTagged += taggableProductIds.length;
  log(
    `    Catalog tagged with menuId: ${productCategoryIds.length} categor${productCategoryIds.length === 1 ? 'y' : 'ies'} (of ${brandCategories.length} total, ${brandCategories.length - productCategoryIds.length} INVENTORY-typed skipped), ${sizeCount} size(s), ${addonCount} addon(s), ${preferenceCount} preference(s), ${taggableProductIds.length} product(s)`,
  );

  // ── 2. Tag this brand's existing PriceTier rows with menuId ───────────────
  // PriceTier is now Menu-scoped (menuId) — it used to be Brand-scoped
  // (brandId), a field the current Prisma schema no longer declares, so it
  // can't be queried via the typed client. Read the raw Mongo documents by
  // their still-present brandId field instead, then write menuId back
  // through the normal typed client (writing a declared field is fine).
  const rawTierResult = (await prisma.$runCommandRaw({
    find: 'price_tiers',
    filter: { brandId: { $oid: brandId } },
    projection: { _id: 1 },
  })) as { cursor?: { firstBatch?: { _id: { $oid: string } }[] } };
  const legacyTierIds = (rawTierResult.cursor?.firstBatch ?? []).map((doc) => doc._id.$oid);

  if (legacyTierIds.length > 0 && !DRY_RUN) {
    const tierResult = await prisma.priceTier.updateMany({
      where: { id: { in: legacyTierIds } },
      data: { menuId },
    });
    stats.priceTiersTagged += tierResult.count;
    log(`    PriceTier rows tagged with menuId: ${tierResult.count}`);
  } else if (legacyTierIds.length > 0) {
    stats.priceTiersTagged += legacyTierIds.length;
    log(`    Would tag ${legacyTierIds.length} PriceTier row(s) with menuId`);
  }

  // ── 3. Assign every Tenant of this brand to the new Default Menu ──────────
  const tenants = await prisma.tenant.findMany({ where: { brandId }, select: { id: true } });
  if (!DRY_RUN) {
    await prisma.tenant.updateMany({ where: { brandId }, data: { menuId } });
  }
  stats.storesAssigned += tenants.length;
  log(`    Stores assigned to Default Menu: ${tenants.length}`);

  stats.brandsProcessed++;
}

async function main() {
  console.log(`Starting catalog-to-menu migration${DRY_RUN ? ' (DRY RUN)' : ''}...`);

  // JS-filtered rather than `where: { brandId: null }` — Mongo/Prisma doesn't
  // reliably match missing fields via an equality filter (see the type/menuId
  // filtering note below); safer to fetch and check in JS.
  const activeTenants = await prisma.tenant.findMany({
    where: { isActive: true, tombstone: { not: 1 } },
    select: { id: true, brandId: true },
  });
  const noBrandTenants = activeTenants.filter((t) => !t.brandId).length;
  if (noBrandTenants > 0) {
    console.warn(
      `WARNING: ${noBrandTenants} active tenant(s) have no brandId — they will be skipped (no brand to hang a Default Menu off), and will not function correctly on the POS until manually assigned a brand. Fix this before rolling out this feature.`,
    );
  }

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
