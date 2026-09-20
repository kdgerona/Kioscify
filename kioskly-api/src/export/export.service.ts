import { Injectable, NotFoundException } from '@nestjs/common';
import archiver from 'archiver';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import {
  toCsv,
  toKeyValueCsv,
  flattenTransactions,
  flattenSubmittedReports,
  flattenSubmittedInventoryReports,
} from './export-csv.util';
import {
  buildIdNameMap,
  buildUserDisplayNameMap,
  enrichCatalogRow,
  enrichProduct,
  enrichTransactions,
  enrichExpenses,
  enrichInventoryRecords,
  enrichInventoryItems,
  enrichSubmittedReports,
  enrichSubmittedInventoryReportsTop,
  enrichStaffTimeLogs,
  filterActive,
} from './export-enrichment.util';

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT — streams a data backup ZIP directly to the HTTP response (no temp
// file on disk). Two independent exports, kept in one shared service since
// they both need the same archiver-streaming plumbing, but their data-
// gathering halves are fully separate:
//
//   Company export → catalog only (Company + per-Brand Menu-scoped catalog:
//   Category/Product/Size/Addon/Preference). MUST NEVER touch Transaction,
//   Expense, InventoryItem, InventoryRecord, SubmittedReport or
//   SubmittedInventoryReport — those are Store data, not Company data (see
//   CLAUDE.md Global Constraints / task-4 brief).
//
//   Store export → operational history only (Transaction/Expense/
//   InventoryItem/InventoryRecord/SubmittedReport/SubmittedInventoryReport),
//   all scoped by tenantId.
//
// getCompanyExportData()/getStoreExportData() are exported separately from
// the streaming methods so unit tests can assert on the plain data shape
// without dealing with zip/stream plumbing.
// ─────────────────────────────────────────────────────────────────────────────

export interface CompanyExportBrandData {
  brand: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    logoUrl: string | null;
    isActive: boolean;
    enabledDeliveryPlatforms: string[];
    preferenceLabel: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  menus: Array<{ id: string; name: string }>;
  categories: unknown[];
  products: unknown[];
  sizes: unknown[];
  addons: unknown[];
  preferences: unknown[];
}

export interface CompanyExportData {
  companyInfo: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    logoUrl: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    address: string | null;
    isActive: boolean;
    canCreateBrands: boolean;
    canOnboardStores: boolean;
    createdAt: Date;
    updatedAt: Date;
  };
  brands: CompanyExportBrandData[];
}

export interface StoreExportData {
  transactions: unknown[];
  expenses: unknown[];
  inventoryItems: unknown[];
  inventoryRecords: unknown[];
  submittedReports: unknown[];
  submittedInventoryReports: unknown[];
  staffTimeLogs: unknown[];
}

@Injectable()
export class ExportService {
  constructor(private prisma: PrismaService) {}

  // ─── Company export (catalog only — never Store-scoped models) ───────────

  async getCompanyExportData(companyId: string): Promise<CompanyExportData> {
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, tombstone: { not: 1 } },
    });
    if (!company) throw new NotFoundException(`Company ${companyId} not found`);

    const brands = await this.prisma.brand.findMany({
      where: { companyId, tombstone: { not: 1 } },
      orderBy: { name: 'asc' },
    });

    const brandData = await Promise.all(
      brands.map((brand) => this.getBrandCatalogData(brand)),
    );

    return {
      companyInfo: {
        id: company.id,
        name: company.name,
        slug: company.slug,
        description: company.description,
        logoUrl: company.logoUrl,
        contactEmail: company.contactEmail,
        contactPhone: company.contactPhone,
        address: company.address,
        isActive: company.isActive,
        canCreateBrands: company.canCreateBrands,
        canOnboardStores: company.canOnboardStores,
        createdAt: company.createdAt,
        updatedAt: company.updatedAt,
      },
      brands: brandData,
    };
  }

  // Menu is the only Brand-scoped catalog container (see schema.prisma) —
  // Category(type=PRODUCT)/Size/Addon/Preference/Product are each directly
  // owned by a Menu via menuId, so every Menu under this Brand is resolved
  // first and the catalog models are fetched by menuId (never brandId —
  // that field was dropped from these models by the catalog-to-menus
  // migration). Category(type=INVENTORY, inventorySetupId-scoped) is
  // deliberately excluded — it belongs to InventorySetup/InventoryItem,
  // which is Store-adjacent inventory data, not part of this export.
  private async getBrandCatalogData(brand: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    logoUrl: string | null;
    isActive: boolean;
    enabledDeliveryPlatforms: string[];
    preferenceLabel: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): Promise<CompanyExportBrandData> {
    const menus = await this.prisma.menu.findMany({
      where: { brandId: brand.id, tombstone: { not: 1 } },
    });
    const menuIds = menus.map((m) => m.id);

    const [categories, products, sizes, addons, preferences] = menuIds.length
      ? await Promise.all([
          this.prisma.category.findMany({
            where: { menuId: { in: menuIds }, type: 'PRODUCT', tombstone: { not: 1 } },
          }),
          this.prisma.product.findMany({
            where: { menuId: { in: menuIds }, tombstone: { not: 1 } },
          }),
          this.prisma.size.findMany({
            where: { menuId: { in: menuIds }, tombstone: { not: 1 } },
          }),
          this.prisma.addon.findMany({
            where: { menuId: { in: menuIds }, tombstone: { not: 1 } },
          }),
          this.prisma.preference.findMany({
            where: { menuId: { in: menuIds }, tombstone: { not: 1 } },
          }),
        ])
      : [[], [], [], [], []];

    return {
      brand: {
        id: brand.id,
        name: brand.name,
        slug: brand.slug,
        description: brand.description,
        logoUrl: brand.logoUrl,
        isActive: brand.isActive,
        enabledDeliveryPlatforms: brand.enabledDeliveryPlatforms,
        preferenceLabel: brand.preferenceLabel,
        createdAt: brand.createdAt,
        updatedAt: brand.updatedAt,
      },
      // Just the id/name pairs already fetched above — used to resolve
      // menuId -> a readable name in the CSV export, not exported as its
      // own file.
      menus: menus.map((m) => ({ id: m.id, name: m.name })),
      categories,
      products,
      sizes,
      addons,
      preferences,
    };
  }

  async streamCompanyExport(companyId: string, res: Response): Promise<void> {
    const data = await this.getCompanyExportData(companyId);

    const archive = archiver('zip', { zlib: { level: 9 } });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="company-${companyId}-export.zip"`,
    );
    // The export reflects live data — never let the browser (or an
    // intermediate proxy) serve a cached copy from an earlier export.
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');

    const done = new Promise<void>((resolve, reject) => {
      archive.on('error', reject);
      res.on('error', reject);
      res.on('finish', resolve);
    });

    archive.pipe(res);

    archive.append(toKeyValueCsv(data.companyInfo), {
      name: 'company-info.csv',
    });
    for (const b of data.brands) {
      const folder = `brands/${b.brand.slug || b.brand.id}`;
      const menuNames = buildIdNameMap(b.menus);
      const categoryNames = buildIdNameMap(
        b.categories as Array<{ id: string; name: string }>,
      );

      archive.append(toKeyValueCsv(b.brand), {
        name: `${folder}/brand-info.csv`,
      });
      archive.append(
        toCsv(
          (b.categories as Array<{ menuId?: string }>).map((c) =>
            enrichCatalogRow(c, menuNames),
          ),
        ),
        { name: `${folder}/categories.csv` },
      );
      archive.append(
        toCsv(
          (b.products as Array<{ menuId?: string; categoryId?: string }>).map(
            (p) => enrichProduct(p, menuNames, categoryNames),
          ),
        ),
        { name: `${folder}/products.csv` },
      );
      archive.append(
        toCsv(
          (b.sizes as Array<{ menuId?: string }>).map((s) =>
            enrichCatalogRow(s, menuNames),
          ),
        ),
        { name: `${folder}/sizes.csv` },
      );
      archive.append(
        toCsv(
          (b.addons as Array<{ menuId?: string }>).map((a) =>
            enrichCatalogRow(a, menuNames),
          ),
        ),
        { name: `${folder}/addons.csv` },
      );
      archive.append(
        toCsv(
          (b.preferences as Array<{ menuId?: string }>).map((p) =>
            enrichCatalogRow(p, menuNames),
          ),
        ),
        { name: `${folder}/preferences.csv` },
      );
    }

    await archive.finalize();
    await done;
  }

  // ─── Store export (operational history only, tenantId-scoped) ────────────

  async getStoreExportData(tenantId: string): Promise<StoreExportData> {
    const store = await this.prisma.tenant.findFirst({
      where: { id: tenantId, tombstone: { not: 1 } },
    });
    if (!store) throw new NotFoundException(`Store ${tenantId} not found`);

    const [
      transactions,
      expenses,
      inventoryRecords,
      submittedReports,
      submittedInventoryReports,
      staffTimeLogs,
    ] = await Promise.all([
      this.prisma.transaction.findMany({
        where: { tenantId },
        include: { items: { include: { addons: true } } },
      }),
      this.prisma.expense.findMany({ where: { tenantId } }),
      this.prisma.inventoryRecord.findMany({ where: { tenantId } }),
      this.prisma.submittedReport.findMany({ where: { tenantId } }),
      this.prisma.submittedInventoryReport.findMany({ where: { tenantId } }),
      // photoUrl is deliberately not selected — this is a data export, the
      // clock-in/out verification selfie never leaves the DB.
      this.prisma.staffTimeLog.findMany({
        where: { tenantId },
        select: {
          id: true,
          userId: true,
          eventType: true,
          latitude: true,
          longitude: true,
          createdAt: true,
        },
      }),
    ]);

    // InventoryItem has no tenantId field at all (it's owned by a Brand-level
    // InventorySetup, shared across every store assigned to that setup — see
    // schema.prisma). "Scoped to that store" is resolved the same way
    // InventoryService.findAllItems() does for the store-facing item list:
    // items under the store's currently-assigned InventorySetup, unioned
    // with any item this store has InventoryRecord history for (covers items
    // since tombstoned out of active use, or from a setup this store was
    // previously assigned to before a reassignment — the
    // reassignment-preservation guarantee documented on InventoryRecord).
    const recordItemIds = new Set(
      inventoryRecords.map((r) => r.inventoryItemId),
    );
    let setupItemIds: string[] = [];
    if (store.inventorySetupId) {
      const setupItems = await this.prisma.inventoryItem.findMany({
        where: { inventorySetupId: store.inventorySetupId },
        select: { id: true },
      });
      setupItemIds = setupItems.map((i) => i.id);
    }
    const allItemIds = [...new Set([...setupItemIds, ...recordItemIds])];
    const inventoryItems = allItemIds.length
      ? await this.prisma.inventoryItem.findMany({
          where: { id: { in: allItemIds } },
        })
      : [];

    return {
      transactions,
      expenses,
      inventoryItems,
      inventoryRecords,
      submittedReports,
      submittedInventoryReports,
      staffTimeLogs,
    };
  }

  async streamStoreExport(tenantId: string, res: Response): Promise<void> {
    const data = await this.getStoreExportData(tenantId);
    const lookups = await this.getStoreExportNameLookups(data);

    const archive = archiver('zip', { zlib: { level: 9 } });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="store-${tenantId}-export.zip"`,
    );
    // The export reflects live data — never let the browser (or an
    // intermediate proxy) serve a cached copy from an earlier export.
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');

    const done = new Promise<void>((resolve, reject) => {
      archive.on('error', reject);
      res.on('error', reject);
      res.on('finish', resolve);
    });

    archive.pipe(res);

    const enrichedTransactions = enrichTransactions(
      data.transactions as Parameters<typeof enrichTransactions>[0],
      lookups.userNames,
      lookups.productNames,
      lookups.sizeNames,
      lookups.preferenceNames,
      lookups.addonNames,
    );
    const { transactionsCsv, itemsCsv: transactionItemsCsv } = flattenTransactions(
      enrichedTransactions as unknown as Parameters<typeof flattenTransactions>[0],
    );
    archive.append(transactionsCsv, { name: 'transactions.csv' });
    archive.append(transactionItemsCsv, { name: 'transaction-items.csv' });

    archive.append(
      toCsv(
        enrichExpenses(
          data.expenses as Parameters<typeof enrichExpenses>[0],
          lookups.userNames,
        ),
      ),
      { name: 'expenses.csv' },
    );
    // `data.inventoryItems` deliberately still includes tombstoned
    // (deprecated) items — inventoryItemNames (built from this same array
    // in getStoreExportNameLookups) needs them so a historical
    // inventory-records.csv row for a since-deprecated item still resolves
    // to a real itemName instead of falling back to a raw id. filterActive
    // only excludes them here, right before they'd become their own row in
    // the current-catalog inventory-items.csv listing.
    archive.append(
      toCsv(
        enrichInventoryItems(
          filterActive(
            data.inventoryItems as Parameters<typeof enrichInventoryItems>[0],
          ),
          lookups.categoryNames,
          lookups.inventorySetupNames,
        ),
      ),
      { name: 'inventory-items.csv' },
    );
    archive.append(
      toCsv(
        enrichInventoryRecords(
          data.inventoryRecords as Parameters<typeof enrichInventoryRecords>[0],
          lookups.userNames,
          lookups.inventoryItemNames,
        ),
      ),
      { name: 'inventory-records.csv' },
    );
    archive.append(
      flattenSubmittedReports(
        enrichSubmittedReports(
          data.submittedReports as Parameters<typeof enrichSubmittedReports>[0],
          lookups.userNames,
          lookups.transactionRefNames,
          lookups.expenseRefNames,
        ) as unknown as Parameters<typeof flattenSubmittedReports>[0],
      ),
      { name: 'submitted-reports.csv' },
    );

    const { reportsCsv, itemsCsv: inventoryReportItemsCsv } = flattenSubmittedInventoryReports(
      enrichSubmittedInventoryReportsTop(
        data.submittedInventoryReports as Parameters<
          typeof enrichSubmittedInventoryReportsTop
        >[0],
        lookups.userNames,
      ) as unknown as Parameters<typeof flattenSubmittedInventoryReports>[0],
    );
    archive.append(reportsCsv, { name: 'submitted-inventory-reports.csv' });
    archive.append(inventoryReportItemsCsv, {
      name: 'submitted-inventory-report-items.csv',
    });

    archive.append(
      toCsv(
        enrichStaffTimeLogs(
          data.staffTimeLogs as Parameters<typeof enrichStaffTimeLogs>[0],
          lookups.userNames,
        ),
      ),
      { name: 'attendance.csv' },
    );

    await archive.finalize();
    await done;
  }

  // Batch-resolves every id referenced across a store export's rows (Users,
  // Products, Sizes, Preferences, Addons referenced by transaction items,
  // Categories + InventorySetups referenced by inventory items) into
  // id->name maps — one query per referenced model, not N+1 per row.
  // transactionRefNames/expenseRefNames need no query at all — they're
  // built from this same store's already-fetched transactions/expenses.
  private async getStoreExportNameLookups(data: StoreExportData) {
    const transactions = data.transactions as Array<{
      id: string;
      transactionId: string;
      userId: string;
      voidRequestedBy?: string | null;
      voidReviewedBy?: string | null;
      items?: Array<{
        productId: string;
        sizeId?: string | null;
        preferenceId?: string | null;
        addons?: Array<{ addonId: string }>;
      }>;
    }>;
    const expenses = data.expenses as Array<{
      id: string;
      description: string;
      userId: string;
      voidRequestedBy?: string | null;
      voidReviewedBy?: string | null;
    }>;
    const inventoryRecords = data.inventoryRecords as Array<{
      userId: string;
      inventoryItemId: string;
    }>;
    const submittedReports = data.submittedReports as Array<{ userId: string }>;
    const submittedInventoryReports = data.submittedInventoryReports as Array<{
      userId: string;
    }>;
    const staffTimeLogs = data.staffTimeLogs as Array<{ userId: string }>;
    const inventoryItems = data.inventoryItems as Array<{
      categoryId?: string | null;
      inventorySetupId?: string | null;
    }>;

    const userIds = new Set<string>();
    const productIds = new Set<string>();
    const sizeIds = new Set<string>();
    const preferenceIds = new Set<string>();
    const addonIds = new Set<string>();
    const categoryIds = new Set<string>();
    const inventorySetupIds = new Set<string>();

    for (const t of transactions) {
      userIds.add(t.userId);
      if (t.voidRequestedBy) userIds.add(t.voidRequestedBy);
      if (t.voidReviewedBy) userIds.add(t.voidReviewedBy);
      for (const item of t.items ?? []) {
        productIds.add(item.productId);
        if (item.sizeId) sizeIds.add(item.sizeId);
        if (item.preferenceId) preferenceIds.add(item.preferenceId);
        for (const a of item.addons ?? []) addonIds.add(a.addonId);
      }
    }
    for (const e of expenses) {
      userIds.add(e.userId);
      if (e.voidRequestedBy) userIds.add(e.voidRequestedBy);
      if (e.voidReviewedBy) userIds.add(e.voidReviewedBy);
    }
    for (const r of inventoryRecords) userIds.add(r.userId);
    for (const r of submittedReports) userIds.add(r.userId);
    for (const r of submittedInventoryReports) userIds.add(r.userId);
    for (const l of staffTimeLogs) userIds.add(l.userId);
    for (const i of inventoryItems) {
      if (i.categoryId) categoryIds.add(i.categoryId);
      if (i.inventorySetupId) inventorySetupIds.add(i.inventorySetupId);
    }

    const [users, products, sizes, preferences, addons, categories, inventorySetups] =
      await Promise.all([
        userIds.size
          ? this.prisma.user.findMany({
              where: { id: { in: [...userIds] } },
              select: { id: true, username: true, firstName: true, lastName: true },
            })
          : [],
        productIds.size
          ? this.prisma.product.findMany({
              where: { id: { in: [...productIds] } },
              select: { id: true, name: true },
            })
          : [],
        sizeIds.size
          ? this.prisma.size.findMany({
              where: { id: { in: [...sizeIds] } },
              select: { id: true, name: true },
            })
          : [],
        preferenceIds.size
          ? this.prisma.preference.findMany({
              where: { id: { in: [...preferenceIds] } },
              select: { id: true, name: true },
            })
          : [],
        addonIds.size
          ? this.prisma.addon.findMany({
              where: { id: { in: [...addonIds] } },
              select: { id: true, name: true },
            })
          : [],
        categoryIds.size
          ? this.prisma.category.findMany({
              where: { id: { in: [...categoryIds] } },
              select: { id: true, name: true },
            })
          : [],
        inventorySetupIds.size
          ? this.prisma.inventorySetup.findMany({
              where: { id: { in: [...inventorySetupIds] } },
              select: { id: true, name: true },
            })
          : [],
      ]);

    return {
      userNames: buildUserDisplayNameMap(users),
      productNames: buildIdNameMap(products),
      sizeNames: buildIdNameMap(sizes),
      preferenceNames: buildIdNameMap(preferences),
      addonNames: buildIdNameMap(addons),
      categoryNames: buildIdNameMap(categories),
      inventorySetupNames: buildIdNameMap(inventorySetups),
      inventoryItemNames: buildIdNameMap(
        (data.inventoryItems as Array<{ id: string; name: string }>) ?? [],
      ),
      transactionRefNames: buildIdNameMap(
        transactions.map((t) => ({ id: t.id, name: t.transactionId })),
      ),
      expenseRefNames: buildIdNameMap(
        expenses.map((e) => ({ id: e.id, name: e.description })),
      ),
    };
  }
}
