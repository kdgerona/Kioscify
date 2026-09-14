import { Injectable, NotFoundException } from '@nestjs/common';
import archiver from 'archiver';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';

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
      where: { brandId: brand.id },
    });
    const menuIds = menus.map((m) => m.id);

    const [categories, products, sizes, addons, preferences] = menuIds.length
      ? await Promise.all([
          this.prisma.category.findMany({
            where: { menuId: { in: menuIds }, type: 'PRODUCT' },
          }),
          this.prisma.product.findMany({ where: { menuId: { in: menuIds } } }),
          this.prisma.size.findMany({ where: { menuId: { in: menuIds } } }),
          this.prisma.addon.findMany({ where: { menuId: { in: menuIds } } }),
          this.prisma.preference.findMany({
            where: { menuId: { in: menuIds } },
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

    const done = new Promise<void>((resolve, reject) => {
      archive.on('error', reject);
      res.on('error', reject);
      res.on('finish', resolve);
    });

    archive.pipe(res);

    archive.append(JSON.stringify(data.companyInfo, null, 2), {
      name: 'company-info.json',
    });
    for (const b of data.brands) {
      const folder = `brands/${b.brand.slug || b.brand.id}`;
      archive.append(JSON.stringify(b.brand, null, 2), {
        name: `${folder}/brand-info.json`,
      });
      archive.append(JSON.stringify(b.categories, null, 2), {
        name: `${folder}/categories.json`,
      });
      archive.append(JSON.stringify(b.products, null, 2), {
        name: `${folder}/products.json`,
      });
      archive.append(JSON.stringify(b.sizes, null, 2), {
        name: `${folder}/sizes.json`,
      });
      archive.append(JSON.stringify(b.addons, null, 2), {
        name: `${folder}/addons.json`,
      });
      archive.append(JSON.stringify(b.preferences, null, 2), {
        name: `${folder}/preferences.json`,
      });
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
    ] = await Promise.all([
      this.prisma.transaction.findMany({
        where: { tenantId },
        include: { items: { include: { addons: true } } },
      }),
      this.prisma.expense.findMany({ where: { tenantId } }),
      this.prisma.inventoryRecord.findMany({ where: { tenantId } }),
      this.prisma.submittedReport.findMany({ where: { tenantId } }),
      this.prisma.submittedInventoryReport.findMany({ where: { tenantId } }),
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
    };
  }

  async streamStoreExport(tenantId: string, res: Response): Promise<void> {
    const data = await this.getStoreExportData(tenantId);

    const archive = archiver('zip', { zlib: { level: 9 } });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="store-${tenantId}-export.zip"`,
    );

    const done = new Promise<void>((resolve, reject) => {
      archive.on('error', reject);
      res.on('error', reject);
      res.on('finish', resolve);
    });

    archive.pipe(res);

    archive.append(JSON.stringify(data.transactions, null, 2), {
      name: 'transactions.json',
    });
    archive.append(JSON.stringify(data.expenses, null, 2), {
      name: 'expenses.json',
    });
    archive.append(JSON.stringify(data.inventoryItems, null, 2), {
      name: 'inventory-items.json',
    });
    archive.append(JSON.stringify(data.inventoryRecords, null, 2), {
      name: 'inventory-records.json',
    });
    archive.append(JSON.stringify(data.submittedReports, null, 2), {
      name: 'submitted-reports.json',
    });
    archive.append(JSON.stringify(data.submittedInventoryReports, null, 2), {
      name: 'submitted-inventory-reports.json',
    });

    await archive.finalize();
    await done;
  }
}
