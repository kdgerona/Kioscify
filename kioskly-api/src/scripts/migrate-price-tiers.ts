/**
 * Migration script: create a "Standard" PriceTier for every Brand and seed
 * ProductPriceTier / SizePriceTier / AddonPriceTier rows from existing prices,
 * then assign that tier to every Tenant (store) of the brand.
 *
 * Safe to run multiple times — idempotent per brand:
 *   If a PriceTier with name "Standard" already exists for a brand, that brand
 *   is skipped entirely.
 *
 * Usage:
 *   npm run migrate:price-tiers
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const stats = {
  brandsProcessed: 0,
  brandsSkipped: 0,
  tiersCreated: 0,
  productPriceTiersCreated: 0,
  sizePriceTiersCreated: 0,
  addonPriceTiersCreated: 0,
  storesAssigned: 0,
  errors: 0,
};

function log(msg: string) {
  console.log(`[migrate:price-tiers] ${msg}`);
}

async function processBrand(brandId: string, brandName: string) {
  // ── Idempotency guard ──────────────────────────────────────────────────────
  const existing = await prisma.priceTier.findFirst({
    where: { brandId, name: 'Standard' },
    select: { id: true },
  });

  if (existing) {
    log(`  SKIP Brand "${brandName}" (${brandId}) — Standard tier already exists`);
    stats.brandsSkipped++;
    return;
  }

  log(`  Processing Brand "${brandName}" (${brandId})`);

  // ── 1. Create Standard PriceTier ───────────────────────────────────────────
  const tier = await prisma.priceTier.create({
    data: {
      brandId,
      name: 'Standard',
      isDefault: true,
    },
  });
  stats.tiersCreated++;
  log(`    Created PriceTier id=${tier.id}`);

  // ── 2. Seed ProductPriceTier ───────────────────────────────────────────────
  const products = await prisma.product.findMany({
    where: { brandId },
    select: { id: true, price: true, foodpandaPrice: true, grabPrice: true },
  });

  if (products.length > 0) {
    const productPriceTierData = products.map((p) => ({
      productId: p.id,
      tierId: tier.id,
      price: p.price,
      foodpandaPrice: p.foodpandaPrice ?? null,
      grabPrice: p.grabPrice ?? null,
    }));

    // Note: MongoDB via Prisma does not support skipDuplicates on createMany.
    // Idempotency is guaranteed at the brand level (we skip the entire brand if
    // its Standard tier already exists), so duplicate inserts cannot occur here.
    const result = await prisma.productPriceTier.createMany({
      data: productPriceTierData,
    });
    stats.productPriceTiersCreated += result.count;
    log(`    Created ${result.count} ProductPriceTier(s) (${products.length} products)`);
  } else {
    log(`    No products for this brand — skipping ProductPriceTier`);
  }

  // ── 3. Seed SizePriceTier ─────────────────────────────────────────────────
  // Sizes are brand-scoped via brandId (direct relation on Brand model)
  const sizes = await prisma.size.findMany({
    where: { brandId },
    select: { id: true, priceModifier: true, foodpandaPrice: true, grabPrice: true },
  });

  if (sizes.length > 0) {
    const sizePriceTierData = sizes.map((s) => ({
      sizeId: s.id,
      tierId: tier.id,
      priceModifier: s.priceModifier,
      foodpandaPrice: s.foodpandaPrice ?? null,
      grabPrice: s.grabPrice ?? null,
    }));

    const result = await prisma.sizePriceTier.createMany({
      data: sizePriceTierData,
    });
    stats.sizePriceTiersCreated += result.count;
    log(`    Created ${result.count} SizePriceTier(s) (${sizes.length} sizes)`);
  } else {
    log(`    No sizes for this brand — skipping SizePriceTier`);
  }

  // ── 4. Seed AddonPriceTier ────────────────────────────────────────────────
  const addons = await prisma.addon.findMany({
    where: { brandId },
    select: { id: true, price: true, foodpandaPrice: true, grabPrice: true },
  });

  if (addons.length > 0) {
    const addonPriceTierData = addons.map((a) => ({
      addonId: a.id,
      tierId: tier.id,
      price: a.price,
      foodpandaPrice: a.foodpandaPrice ?? null,
      grabPrice: a.grabPrice ?? null,
    }));

    const result = await prisma.addonPriceTier.createMany({
      data: addonPriceTierData,
    });
    stats.addonPriceTiersCreated += result.count;
    log(`    Created ${result.count} AddonPriceTier(s) (${addons.length} addons)`);
  } else {
    log(`    No addons for this brand — skipping AddonPriceTier`);
  }

  // ── 5. Assign tier to all Tenants of this brand ───────────────────────────
  const updateResult = await prisma.tenant.updateMany({
    where: { brandId },
    data: { priceTierId: tier.id },
  });
  stats.storesAssigned += updateResult.count;
  log(`    Assigned Standard tier to ${updateResult.count} store(s)`);

  stats.brandsProcessed++;
}

async function main() {
  log('Starting price tier migration...\n');

  const brands = await prisma.brand.findMany({
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' },
  });

  log(`Found ${brands.length} brand(s)\n`);

  for (const brand of brands) {
    try {
      await processBrand(brand.id, brand.name);
    } catch (err) {
      log(`  ERROR processing Brand "${brand.name}" (${brand.id}): ${(err as Error).message}`);
      stats.errors++;
    }
  }

  log('\n── Summary ──────────────────────────────────────────');
  log(`  Brands processed:           ${stats.brandsProcessed}`);
  log(`  Brands skipped (already done): ${stats.brandsSkipped}`);
  log(`  PriceTiers created:         ${stats.tiersCreated}`);
  log(`  ProductPriceTiers created:  ${stats.productPriceTiersCreated}`);
  log(`  SizePriceTiers created:     ${stats.sizePriceTiersCreated}`);
  log(`  AddonPriceTiers created:    ${stats.addonPriceTiersCreated}`);
  log(`  Stores assigned:            ${stats.storesAssigned}`);
  log(`  Errors:                     ${stats.errors}`);

  if (stats.errors > 0) {
    log('\nSome brands failed. Check the errors above and re-run to retry.');
    process.exit(1);
  }

  log('\nMigration complete.');
}

main()
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
