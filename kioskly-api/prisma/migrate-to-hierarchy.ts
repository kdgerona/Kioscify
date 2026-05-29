/**
 * Kioscify Hierarchy Migration Script
 *
 * Migrates existing flat Tenant data into the new 4-level hierarchy:
 *   Kioscify → Company → Brand → Tenant (Store)
 *
 * What this script does:
 *   1. Wraps all existing tenants under a Company + Brand structure
 *   2. Re-scopes catalog (Category, Product, Size, Addon) from tenantId → brandId
 *   3. Re-scopes InventoryItems → brand templates + store copies
 *   4. Updates existing ADMIN users → STORE_ADMIN role
 *   5. Creates the first COMPANY_ADMIN user with an auto-generated password
 *
 * Usage:
 *   npx ts-node prisma/migrate-to-hierarchy.ts              (interactive)
 *   npx ts-node prisma/migrate-to-hierarchy.ts --dry-run    (preview only, no writes)
 *
 * Safety: aborts if any Company records already exist.
 */

import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import * as readline from 'readline';

const prisma = new PrismaClient();
const isDryRun = process.argv.includes('--dry-run');

// ─── Helpers ───────────────────────────────────────────────────────────────

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

function generateSecurePassword(length = 14): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const symbols = '@#$%!';
  const all = upper + lower + digits + symbols;

  const required = [
    upper[crypto.randomInt(upper.length)],
    lower[crypto.randomInt(lower.length)],
    digits[crypto.randomInt(digits.length)],
    symbols[crypto.randomInt(symbols.length)],
  ];

  const rest = Array.from({ length: length - required.length }, () =>
    all[crypto.randomInt(all.length)],
  );

  return [...required, ...rest].sort(() => crypto.randomInt(3) - 1).join('');
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

function log(msg: string) {
  console.log(msg);
}

function dryLog(msg: string) {
  console.log(`[DRY-RUN] ${msg}`);
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  log('');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log(' Kioscify Hierarchy Migration Script');
  if (isDryRun) log(' MODE: DRY RUN — no changes will be written');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log('');

  // ── Safety check ──────────────────────────────────────────────────────────
  const existingCompanies = await prisma.company.count();
  if (existingCompanies > 0) {
    log('✗ ABORT: Company records already exist in the database.');
    log('  This script is for the initial one-time migration only.');
    log('  If you need to re-run, drop all Company/Brand records first.');
    process.exit(1);
  }

  // ── Show existing tenants ─────────────────────────────────────────────────
  const tenants = await prisma.tenant.findMany({
    include: {
      _count: {
        select: {
          categories: true,
          products: true,
          sizes: true,
          addons: true,
          inventoryItems: true,
          transactions: true,
          expenses: true,
          users: true,
        },
      },
    },
  });

  if (tenants.length === 0) {
    log('✗ No tenants found in the database. Nothing to migrate.');
    process.exit(0);
  }

  log('Existing stores to migrate:');
  tenants.forEach((t, i) => {
    log(`  ${i + 1}. ${t.name} (slug: ${t.slug})`);
    log(`     Categories: ${t._count.categories} | Products: ${t._count.products} | Sizes: ${t._count.sizes} | Addons: ${t._count.addons}`);
    log(`     InventoryItems: ${t._count.inventoryItems} | Transactions: ${t._count.transactions} | Expenses: ${t._count.expenses} | Users: ${t._count.users}`);
  });
  log('');

  // ── Collect Company info ──────────────────────────────────────────────────
  log('─── Step 1: Company Information ─────────────────────────────');
  const companyName = await prompt('Company name (e.g., GreatServe Food Corp): ');
  const companySlugSuggestion = slugify(companyName);
  const companySlugInput = await prompt(`Company slug (subdomain, e.g., "${companySlugSuggestion}"): `);
  const companySlug = companySlugInput || companySlugSuggestion;
  const companyEmail = await prompt('Company contact email: ');

  if (!companyName || !companySlug) {
    log('✗ Company name and slug are required.');
    process.exit(1);
  }

  log('');

  // ── If multiple tenants, ask how to organise brands ────────────────────────
  // For simplicity: all tenants go under one brand, OR user creates multiple brands
  // Current implementation: single brand for all tenants
  // (For multi-brand setup, run script again after creating brands manually)

  log('─── Step 2: Brand Information ────────────────────────────────');
  log('Note: All existing stores will be placed under one brand.');
  log('You can create additional brands via the Company Portal after migration.');
  log('');

  const brandName = await prompt('Brand name (e.g., Mr. Lemon Plus): ');
  const brandSlugSuggestion = slugify(brandName);
  const brandSlugInput = await prompt(`Brand slug (e.g., "${brandSlugSuggestion}"): `);
  const brandSlug = brandSlugInput || brandSlugSuggestion;

  if (!brandName || !brandSlug) {
    log('✗ Brand name and slug are required.');
    process.exit(1);
  }

  // Copy theme/logo from first tenant?
  const firstTenant = tenants[0];
  const copyTheme = await prompt(
    `Copy theme colors + logo from "${firstTenant.name}" to the brand? (y/n): `,
  );
  const shouldCopyTheme = copyTheme.toLowerCase() === 'y';

  log('');

  // ── Collect COMPANY_ADMIN user info ──────────────────────────────────────
  log('─── Step 3: Company Admin User ──────────────────────────────');
  log('This user will log into the Company + Brand Portal.');
  log('');
  const adminFirstName = await prompt('Admin first name: ');
  const adminLastName = await prompt('Admin last name: ');
  const adminEmail = await prompt('Admin email: ');
  const adminUsername = await prompt('Admin username: ');

  if (!adminFirstName || !adminLastName || !adminEmail || !adminUsername) {
    log('✗ All admin user fields are required.');
    process.exit(1);
  }

  const generatedPassword = generateSecurePassword();

  // ── Summary preview ───────────────────────────────────────────────────────
  log('');
  log('─── Migration Summary ────────────────────────────────────────');
  log(`Company:     ${companyName} (slug: ${companySlug})`);
  log(`Brand:       ${brandName} (slug: ${brandSlug})`);
  log(`Theme:       ${shouldCopyTheme ? `copied from "${firstTenant.name}"` : 'default (set manually later)'}`);
  log(`Stores:      ${tenants.length} tenant(s) will be linked to this brand`);
  log(`Admin:       ${adminFirstName} ${adminLastName} <${adminEmail}> (username: ${adminUsername})`);
  log('');
  log('Data changes:');

  let totalCategories = 0, totalProducts = 0, totalSizes = 0, totalAddons = 0, totalInvItems = 0, totalUsers = 0;
  for (const t of tenants) {
    totalCategories += t._count.categories;
    totalProducts += t._count.products;
    totalSizes += t._count.sizes;
    totalAddons += t._count.addons;
    totalInvItems += t._count.inventoryItems;
    totalUsers += t._count.users;
  }

  log(`  • ${totalCategories} categories    → re-scoped to brand`);
  log(`  • ${totalProducts} products       → re-scoped to brand`);
  log(`  • ${totalSizes} sizes           → re-scoped to brand`);
  log(`  • ${totalAddons} addons          → re-scoped to brand`);
  log(`  • ${totalInvItems} inventory items → become brand templates; store copies created`);
  log(`  • ${totalUsers} store users     → role ADMIN → STORE_ADMIN`);
  log(`  • 1 COMPANY_ADMIN user created with auto-generated password`);
  log('');
  log('Not changed: Transactions, Expenses, InventoryRecords, Reports (all stay tenant-scoped)');
  log('');

  if (isDryRun) {
    dryLog('Dry run complete — no changes written.');
    log('');
  }

  const confirmPrompt = isDryRun
    ? 'Proceed with the actual migration now? (yes/no): '
    : 'Proceed with migration? (yes/no): ';

  const confirm = await prompt(confirmPrompt);
  if (confirm.toLowerCase() !== 'yes') {
    log('Migration cancelled.');
    rl.close();
    return;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // EXECUTE MIGRATION
  // ─────────────────────────────────────────────────────────────────────────

  log('');
  log('─── Executing Migration ──────────────────────────────────────');

  // Step 4: Create Company
  log('Creating Company...');
  const company = await prisma.company.create({
    data: {
      name: companyName,
      slug: companySlug,
      contactEmail: companyEmail,
      isActive: true,
      canCreateBrands: false,
      canOnboardStores: false,
    },
  });
  log(`  ✓ Company created: ${company.name} (id: ${company.id})`);

  // Step 5: Create Brand
  log('Creating Brand...');
  const brand = await prisma.brand.create({
    data: {
      companyId: company.id,
      name: brandName,
      slug: brandSlug,
      isActive: true,
      themeColors: shouldCopyTheme && firstTenant.themeColors ? firstTenant.themeColors : undefined,
      logoUrl: shouldCopyTheme && firstTenant.logoUrl ? firstTenant.logoUrl : undefined,
    },
  });
  log(`  ✓ Brand created: ${brand.name} (id: ${brand.id})`);

  // Step 6: Update all Tenants → link to brand + company
  log(`Linking ${tenants.length} store(s) to brand + company...`);
  for (const tenant of tenants) {
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { brandId: brand.id, companyId: company.id },
    });
    log(`  ✓ Store linked: ${tenant.name}`);
  }

  // Step 7: Re-scope catalog → brandId (clear tenantId on catalog items)
  for (const tenant of tenants) {
    const tenantId = tenant.id;

    log(`Re-scoping catalog for "${tenant.name}"...`);

    const catResult = await prisma.category.updateMany({
      where: { tenantId },
      data: { brandId: brand.id, tenantId: null },
    });
    log(`  ✓ Categories: ${catResult.count}`);

    const sizeResult = await prisma.size.updateMany({
      where: { tenantId },
      data: { brandId: brand.id, tenantId: null },
    });
    log(`  ✓ Sizes: ${sizeResult.count}`);

    const addonResult = await prisma.addon.updateMany({
      where: { tenantId },
      data: { brandId: brand.id, tenantId: null },
    });
    log(`  ✓ Addons: ${addonResult.count}`);

    const productResult = await prisma.product.updateMany({
      where: { tenantId },
      data: { brandId: brand.id, tenantId: null },
    });
    log(`  ✓ Products: ${productResult.count}`);
  }

  // Step 8 + 9: Re-scope InventoryItems → brand templates + create store copies
  log('Migrating inventory items to brand templates + store copies...');
  for (const tenant of tenants) {
    const tenantId = tenant.id;

    const inventoryItems = await prisma.inventoryItem.findMany({
      where: { tenantId },
    });

    for (const item of inventoryItems) {
      // Convert existing item to brand template
      await prisma.inventoryItem.update({
        where: { id: item.id },
        data: { brandId: brand.id, tenantId: null, isTemplate: true },
      });

      // Create store copy for this tenant
      await prisma.inventoryItem.create({
        data: {
          tenantId,
          brandId: brand.id,
          isTemplate: false,
          name: item.name,
          category: item.category,
          unit: item.unit,
          description: item.description,
          minStockLevel: item.minStockLevel,
          requiresExpirationDate: item.requiresExpirationDate,
          expirationWarningDays: item.expirationWarningDays,
        },
      });
    }
    log(`  ✓ ${inventoryItems.length} inventory item(s) for "${tenant.name}" → template + store copy created`);
  }

  // Step 10: Update existing ADMIN users → STORE_ADMIN
  log('Updating existing user roles (ADMIN → STORE_ADMIN)...');
  const updatedUsers = await (prisma as any).user.updateMany({
    where: { role: 'ADMIN' },
    data: {
      role: 'STORE_ADMIN',
      firstName: 'Store',
      lastName: 'Admin',
      isFirstLogin: false, // existing users don't need forced reset
    },
  });
  log(`  ✓ ${updatedUsers.count} user(s) updated`);

  // Also update company/brandId on existing store users
  for (const tenant of tenants) {
    await (prisma as any).user.updateMany({
      where: { tenantId: tenant.id },
      data: { companyId: company.id, brandId: brand.id },
    });
  }
  log(`  ✓ Company + Brand context set on all store users`);

  // Step 10b: Create UserStoreAccess records for all existing STORE_ADMIN users
  log('Creating UserStoreAccess records for existing store users...');
  for (const tenant of tenants) {
    const storeAdmins = await prisma.user.findMany({
      where: { tenantId: tenant.id, role: 'STORE_ADMIN' },
      select: { id: true },
    });
    for (const admin of storeAdmins) {
      const alreadyExists = await prisma.userStoreAccess.findFirst({
        where: { userId: admin.id, tenantId: tenant.id },
      });
      if (!alreadyExists) {
        await prisma.userStoreAccess.create({
          data: { userId: admin.id, tenantId: tenant.id, role: 'STORE_ADMIN' },
        });
      }
    }
    log(`  ✓ UserStoreAccess records created for "${tenant.name}"`);
  }

  // Step 11: Create COMPANY_ADMIN user
  log('Creating COMPANY_ADMIN user...');
  const hashedPassword = await bcrypt.hash(generatedPassword, 12);
  const companyAdmin = await prisma.user.create({
    data: {
      companyId: company.id,
      firstName: adminFirstName,
      lastName: adminLastName,
      username: adminUsername,
      email: adminEmail,
      password: hashedPassword,
      role: 'COMPANY_ADMIN',
      isFirstLogin: true,
      isActive: true,
    },
  });
  log(`  ✓ COMPANY_ADMIN created: ${companyAdmin.username} (id: ${companyAdmin.id})`);

  // ─────────────────────────────────────────────────────────────────────────
  // FINAL SUMMARY
  // ─────────────────────────────────────────────────────────────────────────

  log('');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log(' ✅ Migration Complete!');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log('');
  log('Company Portal Login Credentials (share via secure channel):');
  log(`  URL:       https://${companySlug}.kioscify.com`);
  log(`  Username:  ${adminUsername}`);
  log(`  Password:  ${generatedPassword}`);
  log('  Note:      User will be prompted to change password on first login.');
  log('');
  log('⚠️  Store this password securely — it will not be shown again.');
  log('');
  log('Next steps:');
  log('  1. Run the API backend (Phase 2) to activate new endpoints');
  log('  2. Deploy Company + Brand Portal (Phase 4)');
  log('  3. Log in with the credentials above and set a new password');
  log('  4. Configure additional brands and stores via the Platform Admin');
  log('');

  rl.close();
}

main()
  .catch((err) => {
    console.error('');
    console.error('✗ Migration failed:', err.message);
    console.error(err);
    rl.close();
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
