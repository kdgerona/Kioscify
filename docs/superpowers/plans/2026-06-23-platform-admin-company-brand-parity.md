# Platform Admin: Company & Brand Management Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give PLATFORM_ADMIN the same depth of company/brand management as COMPANY_ADMIN has in the Company Portal — full catalog management per brand, cross-brand analytics, and company-admin privilege management — scoped to any company via drill-in navigation.

**Architecture:** Port `kioscify-company`'s brand-detail page (10 tabs), analytics widgets, and privilege-grid components into `kioscify-platform` as adapted duplicates (no shared package). One backend change: extend `AnalyticsController` to accept `PLATFORM_ADMIN`.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, NestJS + Prisma/MongoDB, axios.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-23-platform-admin-company-brand-parity-design.md` — read it before starting.
- No test framework exists in `kioscify-platform` or `kioscify-company` (no Jest/RTL, only `lint`/`build` scripts). No controller-level Jest tests exist in `kioskly-api` for any of the ~10 controllers with identical role/query-param patterns (only 6 service-level `.spec.ts` files exist total). Verification for every task in this plan is therefore: TypeScript build + lint, then a manual exercise via the running app (matches the codebase's actual existing practice — do not invent a new controller-test convention for this work).
- `kioscify-platform` has **no Radix UI dependency** and no `components/ui` directory — it uses plain native `<select>`/Tailwind. Do not introduce `@radix-ui/react-select`; convert any ported Radix `<Select>` usage to native `<select>`.
- `kioscify-platform` has no `--company-primary` CSS variable theming — the ported page must use a static accent color. Use `#4f46e5` (Tailwind `indigo-600`), matching the existing `/companies/[id]/page.tsx` convention (`bg-indigo-600`, `text-indigo-600`, `border-indigo-200`).
- PLATFORM_ADMIN's JWT has no `companyId`/`brandId`/`companyPrivileges` claims. Every ported API call must pass `brandId`/`companyId` explicitly via query param or route param — never rely on JWT fallback.
- Run `npm run lint` and `npm run build` from inside `kioscify-platform/` (and `kioskly-api/` for the backend task) after each task. Both must pass with zero new errors before moving on.
- Commit after each task with a focused commit message. Do not bundle multiple tasks into one commit.

---

## Task 1: Backend — Analytics controller accepts PLATFORM_ADMIN

**Files:**
- Modify: `kioskly-api/src/analytics/analytics.controller.ts`

**Interfaces:**
- Produces: all 5 endpoints under `/analytics/company/*` now resolve `companyId` from either the JWT (`COMPANY_ADMIN`) or a `?companyId=` query param (`PLATFORM_ADMIN`), mirroring the existing pattern in `kioskly-api/src/brands/brands.controller.ts:50-59` (`findAll`).

- [ ] **Step 1: Read the current file**

Confirm current state matches what's documented in the spec (`@Roles('COMPANY_ADMIN')` at controller level, `@CompanyId() companyId` only, on all 5 handlers).

- [ ] **Step 2: Edit the controller**

Replace the full contents of `kioskly-api/src/analytics/analytics.controller.ts` with:

```ts
// kioskly-api/src/analytics/analytics.controller.ts
import { Controller, Get, Query, Request, UseGuards, UnauthorizedException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { AnalyticsQueryDto, TopProductsQueryDto } from './dto/analytics-query.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PrivilegeGuard } from '../common/guards/privilege.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequirePrivilege } from '../common/decorators/require-privilege.decorator';
import { CompanyId } from '../common/decorators/tenant.decorator';

@ApiTags('analytics')
@Controller('analytics/company')
@UseGuards(JwtAuthGuard, RolesGuard, PrivilegeGuard)
@Roles('COMPANY_ADMIN', 'PLATFORM_ADMIN')
@RequirePrivilege('analytics', 'read')
@ApiBearerAuth()
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  private resolveCompanyId(req, jwtCompanyId: string, queryCompanyId: string): string {
    const companyId = req.user.role === 'PLATFORM_ADMIN' ? queryCompanyId : jwtCompanyId;
    if (!companyId) throw new UnauthorizedException('Invalid company token');
    return companyId;
  }

  @Get('overview')
  @ApiOperation({ summary: 'KPI overview: total brands, stores, active stores' })
  @ApiQuery({ name: 'companyId', required: false, description: 'Required for PLATFORM_ADMIN' })
  overview(
    @CompanyId() jwtCompanyId: string,
    @Query('companyId') queryCompanyId: string,
    @Query() query: AnalyticsQueryDto,
    @Request() req,
  ) {
    const companyId = this.resolveCompanyId(req, jwtCompanyId, queryCompanyId);
    return this.analyticsService.getOverview(
      companyId,
      new Date(query.startDate),
      new Date(query.endDate),
    );
  }

  @Get('top-brands')
  @ApiOperation({ summary: 'Brands ranked by aggregate revenue in period' })
  @ApiQuery({ name: 'companyId', required: false, description: 'Required for PLATFORM_ADMIN' })
  topBrands(
    @CompanyId() jwtCompanyId: string,
    @Query('companyId') queryCompanyId: string,
    @Query() query: AnalyticsQueryDto,
    @Request() req,
  ) {
    const companyId = this.resolveCompanyId(req, jwtCompanyId, queryCompanyId);
    return this.analyticsService.getTopBrands(
      companyId,
      new Date(query.startDate),
      new Date(query.endDate),
    );
  }

  @Get('top-products')
  @ApiOperation({ summary: 'Top 10 products by units sold within a brand' })
  @ApiQuery({ name: 'companyId', required: false, description: 'Required for PLATFORM_ADMIN' })
  topProducts(
    @CompanyId() jwtCompanyId: string,
    @Query('companyId') queryCompanyId: string,
    @Query() query: TopProductsQueryDto,
    @Request() req,
  ) {
    const companyId = this.resolveCompanyId(req, jwtCompanyId, queryCompanyId);
    return this.analyticsService.getTopProducts(
      companyId,
      query.brandId,
      new Date(query.startDate),
      new Date(query.endDate),
    );
  }

  @Get('top-stores')
  @ApiOperation({ summary: 'Stores ranked by aggregate revenue in period' })
  @ApiQuery({ name: 'companyId', required: false, description: 'Required for PLATFORM_ADMIN' })
  topStores(
    @CompanyId() jwtCompanyId: string,
    @Query('companyId') queryCompanyId: string,
    @Query() query: AnalyticsQueryDto,
    @Request() req,
  ) {
    const companyId = this.resolveCompanyId(req, jwtCompanyId, queryCompanyId);
    return this.analyticsService.getTopStores(
      companyId,
      new Date(query.startDate),
      new Date(query.endDate),
    );
  }

  @Get('growth')
  @ApiOperation({ summary: 'Cumulative store and brand count time series' })
  @ApiQuery({ name: 'companyId', required: false, description: 'Required for PLATFORM_ADMIN' })
  growth(
    @CompanyId() jwtCompanyId: string,
    @Query('companyId') queryCompanyId: string,
    @Query() query: AnalyticsQueryDto,
    @Request() req,
  ) {
    const companyId = this.resolveCompanyId(req, jwtCompanyId, queryCompanyId);
    return this.analyticsService.getNetworkGrowth(
      companyId,
      new Date(query.startDate),
      new Date(query.endDate),
    );
  }
}
```

`PrivilegeGuard` already short-circuits (passes) for any role other than `COMPANY_ADMIN` (confirmed in spec's Current State section), so `PLATFORM_ADMIN` is unaffected by `@RequirePrivilege('analytics', 'read')`. `AnalyticsService` is unchanged.

- [ ] **Step 3: Build**

Run: `cd kioskly-api && npm run build`
Expected: no TypeScript errors.

- [ ] **Step 4: Manual verification**

Run: `cd kioskly-api && npm run start:dev`
In a separate terminal, log in as a PLATFORM_ADMIN via `POST /api/v1/auth/platform-login`, grab the `accessToken`, then:

```bash
curl -s "http://localhost:3000/api/v1/analytics/company/overview?companyId=<a real companyId>&startDate=2026-06-01T00:00:00.000Z&endDate=2026-06-30T23:59:59.999Z" \
  -H "Authorization: Bearer <accessToken>"
```

Expected: `200` with `{ totalBrands, totalStores, activeStores }`, not a 403/401. Repeat for `top-brands`, `top-stores`, `growth` (and `top-products` with an extra `&brandId=`).

Also confirm COMPANY_ADMIN behavior is unchanged: log in as a COMPANY_ADMIN and call the same endpoints **without** `companyId` in the query string — should still 200 using the JWT claim.

- [ ] **Step 5: Commit**

```bash
git add kioskly-api/src/analytics/analytics.controller.ts
git commit -m "$(cat <<'EOF'
feat(api): allow PLATFORM_ADMIN to read company analytics

Mirrors the existing brands.controller.ts query-param fallback pattern
so platform admin can view any company's analytics by passing
?companyId= explicitly, since its JWT carries no companyId claim.
EOF
)"
```

---

## Task 2: Frontend — catalog types and API client methods

**Files:**
- Modify: `kioscify-platform/types/index.ts`
- Modify: `kioscify-platform/lib/api.ts`

**Interfaces:**
- Produces: `Category`, `Product`, `Size`, `Addon`, `Preference`, `InventoryBrandTemplate`, `PriceTier`, `ProductPriceTier`, `SizePriceTier`, `AddonPriceTier` types; extended `Brand` and `Store` types; `api.getCategories/createCategory/updateCategory/deleteCategory`, `api.getProducts/createProduct/updateProduct/uploadProductImage/removeProductImage/deleteProduct`, `api.getSizes/createSize/updateSize/deleteSize`, `api.getAddons/createAddon/updateAddon/deleteAddon`, `api.getPreferences/createPreference/updatePreference/deletePreference`, `api.getInventoryBrandTemplates/createInventoryBrandTemplate/updateInventoryBrandTemplate/deleteInventoryBrandTemplate`, `api.getPriceTiers/createPriceTier/updatePriceTier/deletePriceTier`. Consumed by Tasks 3-9.
- Consumes: existing `api.getStoresByBrand(brandId)` (`kioscify-platform/lib/api.ts:246-251`) — reused as-is, do not duplicate.

- [ ] **Step 1: Add catalog types**

In `kioscify-platform/types/index.ts`, add these new interfaces (append at end of file):

```ts
export interface PriceTier {
  id: string;
  name: string;
  isDefault: boolean;
  brandId: string;
}

export interface ProductPriceTier {
  tierId: string;
  price: number;
  foodpandaPrice?: number | null;
  grabPrice?: number | null;
}

export interface SizePriceTier {
  tierId: string;
  priceModifier: number;
  foodpandaPrice?: number | null;
  grabPrice?: number | null;
}

export interface AddonPriceTier {
  tierId: string;
  price: number;
  foodpandaPrice?: number | null;
  grabPrice?: number | null;
}

export interface Category {
  id: string;
  name: string;
  type: 'PRODUCT' | 'INVENTORY';
  description?: string;
  sequenceNo?: number;
  brandId?: string;
  tenantId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  foodpandaPrice?: number | null;
  grabPrice?: number | null;
  categoryId: string;
  category?: Category;
  image?: string;
  sizes?: Size[];
  addons?: Addon[];
  preferences?: Preference[];
  priceTiers?: ProductPriceTier[];
  brandId?: string;
  tenantId?: string;
  isAvailable: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Size {
  id: string;
  name: string;
  priceModifier: number;
  foodpandaPrice?: number | null;
  grabPrice?: number | null;
  priceTiers?: SizePriceTier[];
  brandId?: string;
  tenantId?: string;
  sequenceNo?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Addon {
  id: string;
  name: string;
  price: number;
  foodpandaPrice?: number | null;
  grabPrice?: number | null;
  priceTiers?: AddonPriceTier[];
  brandId?: string;
  tenantId?: string;
  sequenceNo?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Preference {
  id: string;
  name: string;
  isDefault?: boolean;
  brandId?: string;
  tenantId?: string;
  sequenceNo?: number;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryBrandTemplate {
  id: string;
  name: string;
  unit: string;
  category?: string;
  description?: string;
  minStockLevel?: number;
  requiresExpirationDate?: boolean;
  expirationWarningDays?: number;
  brandId: string;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 2: Extend `Brand` and `Store` types**

In `kioscify-platform/types/index.ts`, find the existing `Brand` interface and replace it:

```ts
export interface Brand {
  id: string;
  name: string;
  slug: string;
  description?: string;
  logoUrl?: string;
  themeColors?: ThemeColors;
  companyId: string;
  company?: {
    slug: string;
    canOnboardStores: boolean;
  };
  enabledDeliveryPlatforms?: string[];
  preferenceLabel?: string;
  isActive: boolean;
  storeCount?: number;
  productCount?: number;
  inventoryItemCount?: number;
  createdAt: string;
  updatedAt: string;
}
```

Find the existing `Store` interface and replace it:

```ts
export interface Store {
  id: string;
  name: string;
  slug: string;
  brandId: string;
  companyId: string;
  isActive: boolean;
  enabledDeliveryPlatforms?: string[];
  priceTier?: PriceTier;
  createdAt: string;
  updatedAt: string;
  brand?: { id: string; name: string; slug: string };
}
```

(`PriceTier` is defined earlier in the same file from Step 1, above `Store` — if `Store` appears before `PriceTier` in the file, move the `PriceTier`/`ProductPriceTier`/`SizePriceTier`/`AddonPriceTier` block from Step 1 to the top of the file instead of the end, so it's declared before use. TypeScript interfaces in the same file don't actually require declaration order, but keep it tidy.)

- [ ] **Step 3: Add API client imports**

In `kioscify-platform/lib/api.ts`, update the type import at the top of the file:

```ts
import type {
  AuthResponse,
  Company,
  Brand,
  ThemeColors,
  Store,
  PlatformStats,
  MaintenanceStatus,
  User,
  OnboardAdminPayload,
  OnboardStorePayload,
  AppRelease,
  Category,
  Product,
  Size,
  Addon,
  Preference,
  InventoryBrandTemplate,
  PriceTier,
  ProductPriceTier,
  SizePriceTier,
  AddonPriceTier,
} from '@/types';
```

- [ ] **Step 4: Add catalog API methods**

In `kioscify-platform/lib/api.ts`, add a new section right after the existing `// ─── Brands ───...` block (after `uploadBrandLogo`, before `// ─── Stores ───`):

```ts
  // ─── Categories ───────────────────────────────────────────────────────────

  async getCategories(brandId: string, type?: 'PRODUCT' | 'INVENTORY'): Promise<Category[]> {
    const { data } = await this.client.get<Category[]>('/categories', {
      params: { brandId, ...(type ? { type } : {}) },
    });
    return data;
  }

  async createCategory(payload: { name: string; description?: string; brandId: string; type?: 'PRODUCT' | 'INVENTORY' }): Promise<Category> {
    const { brandId, ...body } = payload;
    const { data } = await this.client.post<Category>('/categories', body, { params: { brandId } });
    return data;
  }

  async updateCategory(id: string, payload: { name?: string; description?: string; sequenceNo?: number }): Promise<Category> {
    const { data } = await this.client.patch<Category>(`/categories/${id}`, payload);
    return data;
  }

  async deleteCategory(id: string): Promise<void> {
    await this.client.delete(`/categories/${id}`);
  }

  // ─── Products ─────────────────────────────────────────────────────────────

  async getProducts(brandId: string): Promise<Product[]> {
    const { data } = await this.client.get<Product[]>('/products', { params: { brandId } });
    return data;
  }

  async createProduct(payload: {
    name: string;
    price: number;
    foodpandaPrice?: number | null;
    grabPrice?: number | null;
    categoryId?: string;
    brandId: string;
    sizeIds?: string[];
    addonIds?: string[];
    preferenceIds?: string[];
    priceTiers?: ProductPriceTier[];
  }): Promise<Product> {
    const { brandId, ...body } = payload;
    const { data } = await this.client.post<Product>('/products', body, { params: { brandId } });
    return data;
  }

  async updateProduct(
    id: string,
    payload: Partial<{ name: string; price: number; foodpandaPrice: number | null; grabPrice: number | null; categoryId: string; sizeIds: string[]; addonIds: string[]; preferenceIds: string[]; priceTiers: ProductPriceTier[] }>
  ): Promise<Product> {
    const { data } = await this.client.patch<Product>(`/products/${id}`, payload);
    return data;
  }

  async uploadProductImage(id: string, brandId: string, file: File): Promise<Product> {
    const formData = new FormData();
    formData.append('image', file);
    const { data } = await this.client.post<Product>(`/products/${id}/image`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      params: { brandId },
    });
    return data;
  }

  async removeProductImage(id: string, brandId: string): Promise<Product> {
    const { data } = await this.client.delete<Product>(`/products/${id}/image`, { params: { brandId } });
    return data;
  }

  async deleteProduct(id: string): Promise<void> {
    await this.client.delete(`/products/${id}`);
  }

  // ─── Sizes ────────────────────────────────────────────────────────────────

  async getSizes(brandId: string): Promise<Size[]> {
    const { data } = await this.client.get<Size[]>('/sizes', { params: { brandId } });
    return data;
  }

  async createSize(payload: {
    name: string;
    priceModifier: number;
    foodpandaPrice?: number | null;
    grabPrice?: number | null;
    brandId: string;
    priceTiers?: SizePriceTier[];
  }): Promise<Size> {
    const { brandId, ...body } = payload;
    const { data } = await this.client.post<Size>('/sizes', body, { params: { brandId } });
    return data;
  }

  async updateSize(id: string, payload: Partial<{ name: string; priceModifier: number; foodpandaPrice: number | null; grabPrice: number | null; sequenceNo: number; priceTiers: SizePriceTier[] }>): Promise<Size> {
    const { data } = await this.client.patch<Size>(`/sizes/${id}`, payload);
    return data;
  }

  async deleteSize(id: string): Promise<void> {
    await this.client.delete(`/sizes/${id}`);
  }

  // ─── Addons ───────────────────────────────────────────────────────────────

  async getAddons(brandId: string): Promise<Addon[]> {
    const { data } = await this.client.get<Addon[]>('/addons', { params: { brandId } });
    return data;
  }

  async createAddon(payload: {
    name: string;
    price: number;
    foodpandaPrice?: number | null;
    grabPrice?: number | null;
    brandId: string;
    priceTiers?: AddonPriceTier[];
  }): Promise<Addon> {
    const { brandId, ...body } = payload;
    const { data } = await this.client.post<Addon>('/addons', body, { params: { brandId } });
    return data;
  }

  async updateAddon(id: string, payload: Partial<{ name: string; price: number; foodpandaPrice: number | null; grabPrice: number | null; sequenceNo: number; priceTiers: AddonPriceTier[] }>): Promise<Addon> {
    const { data } = await this.client.patch<Addon>(`/addons/${id}`, payload);
    return data;
  }

  async deleteAddon(id: string): Promise<void> {
    await this.client.delete(`/addons/${id}`);
  }

  // ─── Preferences ──────────────────────────────────────────────────────────

  async getPreferences(brandId: string): Promise<Preference[]> {
    const { data } = await this.client.get<Preference[]>('/preferences', { params: { brandId } });
    return data;
  }

  async createPreference(payload: { name: string; brandId: string }): Promise<Preference> {
    const { brandId, ...body } = payload;
    const { data } = await this.client.post<Preference>('/preferences', body, { params: { brandId } });
    return data;
  }

  async updatePreference(id: string, payload: Partial<{ name: string; sequenceNo: number; isDefault: boolean }>): Promise<Preference> {
    const { data } = await this.client.patch<Preference>(`/preferences/${id}`, payload);
    return data;
  }

  async deletePreference(id: string): Promise<void> {
    await this.client.delete(`/preferences/${id}`);
  }

  // ─── Inventory brand templates ────────────────────────────────────────────

  async getInventoryBrandTemplates(brandId: string): Promise<InventoryBrandTemplate[]> {
    const { data } = await this.client.get<InventoryBrandTemplate[]>('/inventory/brand-templates', { params: { brandId } });
    return data;
  }

  async createInventoryBrandTemplate(payload: {
    name: string;
    unit: string;
    category?: string;
    minStockLevel?: number;
    expirationWarningDays?: number;
    brandId: string;
  }): Promise<InventoryBrandTemplate> {
    const { brandId, ...body } = payload;
    const { data } = await this.client.post<InventoryBrandTemplate>('/inventory/brand-templates', body, { params: { brandId } });
    return data;
  }

  async updateInventoryBrandTemplate(
    id: string,
    payload: Partial<{ name: string; unit: string; category: string; minStockLevel: number; expirationWarningDays: number }>
  ): Promise<InventoryBrandTemplate> {
    const { data } = await this.client.patch<InventoryBrandTemplate>(`/inventory/brand-templates/${id}`, payload);
    return data;
  }

  async deleteInventoryBrandTemplate(id: string): Promise<void> {
    await this.client.delete(`/inventory/brand-templates/${id}`);
  }

  // ─── Price Tiers ──────────────────────────────────────────────────────────

  async getPriceTiers(brandId: string): Promise<PriceTier[]> {
    const { data } = await this.client.get<PriceTier[]>(`/brands/${brandId}/price-tiers`);
    return data;
  }

  async createPriceTier(brandId: string, payload: { name: string; isDefault?: boolean }): Promise<PriceTier> {
    const { data } = await this.client.post<PriceTier>(`/brands/${brandId}/price-tiers`, payload);
    return data;
  }

  async updatePriceTier(brandId: string, tierId: string, payload: { name?: string; isDefault?: boolean }): Promise<PriceTier> {
    const { data } = await this.client.patch<PriceTier>(`/brands/${brandId}/price-tiers/${tierId}`, payload);
    return data;
  }

  async deletePriceTier(brandId: string, tierId: string): Promise<void> {
    await this.client.delete(`/brands/${brandId}/price-tiers/${tierId}`);
  }
```

- [ ] **Step 5: Extend `updateStore` to support delivery platforms and price tier**

In `kioscify-platform/lib/api.ts`, find the existing `updateStore` method:

```ts
  async updateStore(
    id: string,
    payload: Partial<{ name: string; isActive: boolean }>
  ): Promise<Store> {
    const { data } = await this.client.patch<Store>(`/stores/${id}`, payload);
    return data;
  }
```

Replace it with:

```ts
  async updateStore(
    id: string,
    payload: Partial<{ name: string; isActive: boolean; enabledDeliveryPlatforms: string[]; priceTierId: string | null }>
  ): Promise<Store> {
    const { data } = await this.client.patch<Store>(`/stores/${id}`, payload);
    return data;
  }
```

- [ ] **Step 6: Build and lint**

Run: `cd kioscify-platform && npm run build && npm run lint`
Expected: both pass with zero errors. There will be no callers of the new methods yet, so no "unused" warnings should appear for exported class methods (TypeScript doesn't flag unused public methods).

- [ ] **Step 7: Commit**

```bash
git add kioscify-platform/types/index.ts kioscify-platform/lib/api.ts
git commit -m "$(cat <<'EOF'
feat(platform): add catalog types and API client methods

Ports Category/Product/Size/Addon/Preference/InventoryBrandTemplate/
PriceTier types and their CRUD methods from kioscify-company's API
client, plus extends Brand/Store with the fields the brand-detail
page needs. No UI consumes these yet — laid down for the upcoming
brand drill-in page.
EOF
)"
```

---

## Task 3: Brand detail page — scaffold, shell, header, Overview tab

This task creates the new route file with the full page shell (imports, helper components, main component state/effects/handlers, header/breadcrumb, tab navigation, Overview tab) and **placeholders** for the other 9 tabs. Tasks 4-9 replace each placeholder with real content.

The source file to port from is `kioscify-company/app/(main)/brands/[brandId]/page.tsx` (2688 lines). Its exact structure (verified by reading the file directly, not assumed):

```
1-19     imports + type defs
20       type Tab = 'overview' | 'products' | 'categories' | 'sizes' | 'addons' | 'preferences' | 'inventory' | 'stores' | 'price-tiers' | 'settings'
22-33    TABS array
37-75    function CRUDRow({...})
76-144   function CategoryRow({...})
145-225  function ReorderRow({...})
226-233  function resolveUrl(...)
234-285  function ProductRow({...})
286-314  function Modal({...})
315-1557 export default function BrandDetailPage() { ... }
  319-320  canWrite/canDelete (hasPrivilege calls — STRIP, see Step 3)
  322-381  state hooks
  386-401  useEffect — load brand + price tiers
  404-423  reorderItem helper
  425-448  handleSaveSettings
  450-474  handleLogoUpload
  477-523  loadTab (useCallback)
  525-527  useEffect — load tab data on tab switch
  529-642  store/delivery/price-tier handlers (startEditingStore, handleSaveStoreRow, openDeliveryModal, copyStoreLink, handleSaveDelivery, handleCreateTier, handleRenameTier, handleSetDefaultTier, handleDeleteTier)
  644-660  loading/error early returns
  662-693  header + tab nav JSX
  696-1421 tab content JSX (Overview 704-712, Categories 713-777, Products 778-805, Sizes 806-838, Addons 839-871, Preferences 872-909, Stores 910-1095, Settings 1096-1279, Price Tiers 1280-1392, Inventory 1393-1419)
  1423-1551 modal wiring (CategoryModal/ProductModal/SizeModal/AddonModal/PreferenceModal/InventoryModal/StoreQRModal instantiation)
1558-1566 function StatCard({...})
1567-1595 function TabSection({...})
1596-1603 function EmptyState({...})
1604-1681 function CategoryModal({...})
1682-2061 function ProductModal({...})
2062-2282 function SizeModal({...})
2283-2498 function AddonModal({...})
2499-2562 function PreferenceModal({...})
2563-2688 function InventoryModal({...})
```

Known adaptation points (all confirmed by exhaustive grep across the whole source file — there are no others):
- `hasPrivilege('brands', 'write'/'all')` only at lines 319-320 — everywhere else in the file just reads the resulting `canWrite`/`canDelete` booleans.
- The literal string `var(--company-primary, #ea580c)` appears 44 times, always with that exact fallback hex, always as a CSS accent color — never as brand-data being edited. Global find/replace to `#4f46e5`.
- 3 blocks use the Radix `<Select>` wrapper from `@/components/ui/select` (Stores tab price-tier dropdown ~952-965, `ProductModal` category dropdown ~1973-1981, `InventoryModal` category dropdown ~2636-2644) — convert each to a native `<select>`.
- `Link href="/brands"` (line 666) — company portal's top-level brands list. Change to link back to `/companies/${companyId}`.
- `api.getStores(brandId)` (line 515) — kioscify-platform's client method is named `getStoresByBrand`, not `getStores`. Rename the call site.
- `useParams()` currently only destructures `brandId` (line 316-317) — the new route also has a `[id]` (companyId) segment.
- `api.getBrandById(brandId)` (line 387) — kioscify-platform's existing `getBrandById` signature is `getBrandById(id: string, companyId: string)` (it already requires `companyId` as a query param, since COMPANY_ADMIN's version doesn't need it but PLATFORM_ADMIN's does) — pass `companyId` through.

**Files:**
- Create: `kioscify-platform/app/(main)/companies/[id]/brands/[brandId]/page.tsx`

**Interfaces:**
- Consumes: `api.getBrandById(id, companyId)`, `api.getPriceTiers(brandId)`, `api.updateBrand(id, payload)`, `api.uploadBrandLogo(id, file)`, `api.getStoresByBrand(brandId)`, `api.updateStore(id, payload)`, `api.createPriceTier/updatePriceTier/deletePriceTier(brandId, ...)` — all already exist (Task 2 / pre-existing). Also `StoreQRModal` from `kioscify-platform/components/StoreQRModal.tsx` (already exists, identical prop signature to the company-portal version — confirmed by diffing both files).
- Produces: default export `BrandDetailPage`. Helper components `CRUDRow`, `CategoryRow`, `ReorderRow`, `resolveUrl`, `ProductRow`, `Modal`, `StatCard`, `TabSection`, `EmptyState` — consumed by Tasks 4-9 in the same file.

- [ ] **Step 1: Create the directory and copy the source file verbatim**

```bash
mkdir -p "kioscify-platform/app/(main)/companies/[id]/brands/[brandId]"
cp "kioscify-company/app/(main)/brands/[brandId]/page.tsx" "kioscify-platform/app/(main)/companies/[id]/brands/[brandId]/page.tsx"
```

- [ ] **Step 2: Fix imports**

At the top of the new file, replace:

```ts
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import type { Brand, Store, Category, Product, Size, Addon, Preference, InventoryBrandTemplate, PriceTier, ProductPriceTier, SizePriceTier, AddonPriceTier } from '@/types';
import { Plus, Pencil, Trash2, X, ChevronLeft, Upload, Save, QrCode, ChevronUp, ChevronDown, Truck, Star, Copy } from 'lucide-react';
import { toast } from 'sonner';
import StoreQRModal from '@/components/StoreQRModal';
import { hasPrivilege } from '@/lib/privileges';
```

with:

```ts
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import type { Brand, Store, Category, Product, Size, Addon, Preference, InventoryBrandTemplate, PriceTier, ProductPriceTier, SizePriceTier, AddonPriceTier } from '@/types';
import { Plus, Pencil, Trash2, X, ChevronLeft, Upload, Save, QrCode, ChevronUp, ChevronDown, Truck, Star, Copy } from 'lucide-react';
import { toast } from 'sonner';
import StoreQRModal from '@/components/StoreQRModal';
```

(only the `hasPrivilege` import line is removed — check first whether `kioscify-platform` has a toast library; if `sonner` isn't installed there, see Step 2a below).

- [ ] **Step 2a: Confirm `sonner` is available**

Run: `grep '"sonner"' kioscify-platform/package.json`

If absent, run `cd kioscify-platform && npm install sonner` and check whether `app/(main)/layout.tsx` already renders a `<Toaster />` (kioscify-company's root layout does, for the `toast.success`/`toast.error` calls to display). If `kioscify-platform`'s layout has no `<Toaster />`, add one: open `kioscify-platform/app/(main)/layout.tsx`, import `{ Toaster } from 'sonner'`, and render `<Toaster />` once near the root of the layout's JSX (same pattern as `kioscify-company/app/(main)/layout.tsx` — check that file for exact placement).

- [ ] **Step 3: Fix route params and strip privilege gating**

Replace:

```ts
export default function BrandDetailPage() {
  const params = useParams();
  const brandId = params.brandId as string;

  const canWrite = hasPrivilege('brands', 'write');
  const canDelete = hasPrivilege('brands', 'all');
```

with:

```ts
export default function BrandDetailPage() {
  const params = useParams();
  const brandId = params.brandId as string;
  const companyId = params.id as string;

  // PLATFORM_ADMIN always has full access — no company-admin-style privilege gating applies here.
  const canWrite = true;
  const canDelete = true;
```

- [ ] **Step 4: Fix the brand-load effect to pass `companyId`**

Replace:

```ts
  useEffect(() => {
    Promise.all([api.getBrandById(brandId), api.getPriceTiers(brandId)])
```

with:

```ts
  useEffect(() => {
    Promise.all([api.getBrandById(brandId, companyId), api.getPriceTiers(brandId)])
```

And update its dependency array a few lines below from `}, [brandId]);` to `}, [brandId, companyId]);` (this is the effect ending around original line 401).

- [ ] **Step 5: Rename the stores client call**

In the `loadTab` function, replace:

```ts
        if (tab === 'stores') setStores(await api.getStores(brandId));
```

with:

```ts
        if (tab === 'stores') setStores(await api.getStoresByBrand(brandId));
```

- [ ] **Step 6: Global find/replace the CSS variable**

Across the entire file, replace every occurrence of the literal string:

```
var(--company-primary, #ea580c)
```

with:

```
#4f46e5
```

This is a single mechanical find/replace — all 44 occurrences are this exact string (verified by grep), used only as inline style color values (`style={{ color: 'var(--company-primary, #ea580c)' }}`, `style={{ backgroundColor: '...' }}`, `style={{ '--tw-ring-color': '...' } as React.CSSProperties}`, and one `borderBottomColor`). The replacement value is dropped into the same quotes, e.g. `style={{ color: '#4f46e5' }}`.

- [ ] **Step 7: Fix the header/breadcrumb**

Replace:

```tsx
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/brands" className="text-gray-400 hover:text-gray-600">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{brand.name}</h1>
          <p className="text-sm text-gray-500">{brand.slug}</p>
        </div>
      </div>
```

with:

```tsx
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/companies/${companyId}`} className="text-gray-400 hover:text-gray-600">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div>
          <p className="text-xs text-gray-400">
            <Link href={`/companies/${companyId}`} className="hover:text-indigo-600">
              {brand.company?.slug ?? 'Company'}
            </Link>
            <span className="mx-1.5 text-gray-300">/</span>
            {brand.name}
          </p>
          <h1 className="text-2xl font-bold text-gray-900">{brand.name}</h1>
          <p className="text-sm text-gray-500">{brand.slug}</p>
        </div>
      </div>
```

(`brand.company.slug` comes from the `BrandsService.findOne` Prisma query, which already includes `company: { select: { slug, canOnboardStores } }` — no backend change needed, just the `Brand` type extension from Task 2.)

- [ ] **Step 8: Note the 3 Radix `<Select>` conversions needed later**

The source file has 3 blocks using the Radix `<Select>` wrapper from `@/components/ui/select`, which doesn't exist in `kioscify-platform`. None of them are in the Overview tab or the parts of the shell kept by this task, so there is nothing to edit in *this* task — but note where each one will need converting to a native `<select>` when its tab is ported:

- **Stores tab** price-tier dropdown (source lines ~952-965) — converted in Task 7.
- **`ProductModal`** category dropdown (source lines ~1973-1981) — converted in Task 4.
- **`InventoryModal`** category dropdown (source lines ~2636-2644) — converted in Task 6.

Do not introduce `@radix-ui/react-select` to `kioscify-platform` — every occurrence becomes a plain `<select>` with the same Tailwind treatment used elsewhere in this file (`border border-gray-300 rounded-md ... focus:ring-indigo-500`).

- [ ] **Step 9: Replace the 9 not-yet-ported tabs with placeholders**

The Categories/Products/Sizes/Addons/Preferences/Stores/Settings/Price-Tiers/Inventory tab JSX blocks (and their delivery-platform modal, and the bottom modal-wiring block for `CategoryModal`/`ProductModal`/`SizeModal`/`AddonModal`/`PreferenceModal`/`InventoryModal`) get ported in Tasks 4-9. For this task, delete those JSX blocks and the 6 modal *function definitions* (keep `StatCard`, `TabSection`, `EmptyState` — they're shared helpers used once Overview/Categories land) and replace with placeholders so the page builds and the tab bar is clickable end-to-end right now.

Concretely:
- Delete the JSX between `{/* Categories */}` (original line 713) through the end of the Inventory tab JSX (original line 1419), i.e. everything for Categories, Products, Sizes, Addons, Preferences, Stores (+ its delivery-platform modal), Settings, Price Tiers, Inventory.
- Replace it with:

```tsx
        {activeTab !== 'overview' && (
          <div className="bg-white rounded-lg border py-16 text-center text-gray-400 text-sm">
            {TABS.find(t => t.id === activeTab)?.label} — coming soon
          </div>
        )}
```

- Delete the modal-wiring block at the bottom (original lines 1423-1541, the `{modal.type === 'categories' && (...)}` through `{modal.type === 'inventory' && (...)}` blocks) but **keep** the `{qrStore && (<StoreQRModal .../>)}` block right after it (original lines 1543-1551) — the Stores tab in Task 7 will need it, and the `qrStore` state already exists.
- Delete the `CategoryModal`, `ProductModal`, `SizeModal`, `AddonModal`, `PreferenceModal`, `InventoryModal` function definitions (original lines 1604-2688) — Tasks 4-6 re-add them one at a time.
- Keep `StatCard` (1558-1566), `TabSection` (1567-1595), `EmptyState` (1596-1603) — unused for now, but `next lint`'s `no-unused-vars` only flags unused *variables*, not unused exported/top-level functions, so this won't fail lint. Verify in Step 10 below. `TabSection` contains one occurrence of `var(--company-primary, #ea580c)` (source line 1585, the "Add" button's background color) — this is covered by this task's Step 6 global replace since `TabSection` is kept (not deleted), so no separate action needed here; just confirm after Step 6 that this occurrence was caught too.

- [ ] **Step 10: Build and lint**

Run: `cd kioscify-platform && npm run build`

Fix any TypeScript errors — expected likely issues: unused imports (`X` icon if only used in a deleted modal — check and remove from the import line if so), unused state setters now that some handlers were deleted (do NOT delete state/handlers per Step 3-6 of the structure table above — only the JSX blocks and modal functions were deleted in Step 9; all handlers like `handleSaveStoreRow`, `handleCreateTier` etc. stay, since Tasks 4-9 will wire them back up; an unused-handler is just a dead `const` until then, which Next's ESLint config typically doesn't fail the build on — but if `npm run build` fails on it, that's expected and resolves itself once the corresponding tab JSX is restored in the next task, so it's fine for this intermediate state. If it's a hard build failure (not just a lint warning), prefix the unused handler names with `_` temporarily, e.g. `_handleSaveStoreRow`, and rename back when Task 7 wires them in — note in the task whether you had to do this so Task 7 knows to undo it.)

Run: `cd kioscify-platform && npm run lint`

- [ ] **Step 11: Add the route entry point and manual smoke test**

Run: `cd kioscify-platform && npm run dev`

Log in as PLATFORM_ADMIN, navigate to `/companies/<a real company id>`, click into a brand (the brand row currently still opens the old edit modal — that's fixed in Task 10 — for this task, navigate directly by typing the URL `/companies/<companyId>/brands/<brandId>` in the browser).

Expected: page loads, shows the brand name/slug, breadcrumb back-link works, all 10 tabs are clickable, Overview renders, every other tab shows the "coming soon" placeholder with no console errors.

- [ ] **Step 12: Commit**

```bash
git add "kioscify-platform/app/(main)/companies/[id]/brands/[brandId]/page.tsx" kioscify-platform/package.json kioscify-platform/package-lock.json "kioscify-platform/app/(main)/layout.tsx"
git commit -m "$(cat <<'EOF'
feat(platform): scaffold brand detail drill-in page

Ports the page shell from kioscify-company's brand-detail page:
routing, header/breadcrumb back to the owning company, tab navigation,
and the Overview tab. Strips company-admin privilege gating (platform
admin always has full access) and the company-portal CSS variable
theming in favor of platform's static indigo accent. The other 9 tabs
are placeholders, ported one at a time in subsequent commits.
EOF
)"
```

---

## Task 4: Categories and Products tabs

**Files:**
- Modify: `kioscify-platform/app/(main)/companies/[id]/brands/[brandId]/page.tsx`

**Interfaces:**
- Consumes: `api.getCategories/createCategory/updateCategory/deleteCategory`, `api.getProducts/createProduct/updateProduct/uploadProductImage/removeProductImage/deleteProduct` (Task 2). `CRUDRow`, `CategoryRow`, `ProductRow`, `resolveUrl`, `Modal`, `TabSection`, `EmptyState` (Task 3, already in the file).
- Produces: `CategoryModal`, `ProductModal` functions in the same file, consumed by the modal-wiring block added in this task.

- [ ] **Step 1: Narrow the placeholder and add the two tabs' JSX**

In the new page file, replace:

```tsx
        {activeTab !== 'overview' && (
          <div className="bg-white rounded-lg border py-16 text-center text-gray-400 text-sm">
            {TABS.find(t => t.id === activeTab)?.label} — coming soon
          </div>
        )}
```

with the Categories and Products tab content, copied verbatim from `kioscify-company/app/(main)/brands/[brandId]/page.tsx` lines 713-805 (the `{activeTab === 'categories' && !tabLoading && (...)}` block through the `{activeTab === 'products' && !tabLoading && (...)}` block — copy both blocks exactly as they appear, no changes needed; they only reference `canWrite`/`canDelete`/`productCategories`/`invCategories`/`products`/`api.*`/`reorderItem`, all of which already exist in the scaffolded file from Task 3), followed by the narrowed placeholder:

```tsx
        {!['overview', 'categories', 'products'].includes(activeTab) && (
          <div className="bg-white rounded-lg border py-16 text-center text-gray-400 text-sm">
            {TABS.find(t => t.id === activeTab)?.label} — coming soon
          </div>
        )}
```

- [ ] **Step 2: Re-add `CategoryModal`**

Copy `kioscify-company/.../page.tsx` lines 1604-1681 (`function CategoryModal({...}) {...}`) verbatim into the new file (e.g. right before the closing of the file, where `StatCard`/`TabSection`/`EmptyState` already live from Task 3 — add it directly after `EmptyState`). It has no `hasPrivilege` or `Select` usage, but it does contain 3 occurrences of `var(--company-primary, #ea580c)` (source lines 1658, 1668, 1673) — replace each with `#4f46e5` while pasting, same as Task 3 Step 6.

- [ ] **Step 3: Re-add `ProductModal` with the native-select conversion**

Copy `kioscify-company/.../page.tsx` lines 1682-2061 (`function ProductModal({...}) {...}`) verbatim into the file, directly after `CategoryModal`. This block has 8 occurrences of `var(--company-primary, #ea580c)` (source lines 1834, 1858, 1885, 1928, 1996, 2021, 2042, 2053) — replace each with `#4f46e5` while pasting. Then apply two more fixes within the copied block:

**3a — category dropdown.** Replace:

```tsx
          <Select value={categoryId || 'none'} onValueChange={v => setCategoryId(v === 'none' ? '' : v)}>
            <SelectTrigger>
              <SelectValue placeholder="— None —" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— None —</SelectItem>
              {categories.map(cat => (
                <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
```

with:

```tsx
          <select
            value={categoryId || 'none'}
            onChange={e => setCategoryId(e.target.value === 'none' ? '' : e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="none">— None —</option>
            {categories.map(cat => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
```

**3b — remove the now-unused Select import.** Check the top of the file for an import like:

```ts
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
```

This import does not exist in the scaffolded file yet (it wasn't part of the Task 3 import block) — `ProductModal`'s source used it via a module-level import in `kioscify-company`'s file, but since we copied only the function body, double check whether the import line was accidentally included when you copied lines 1682-2061. It shouldn't be (imports are at lines 1-18 of the source, outside the copied range) — just confirm no stray `Select`-related import was introduced, and that `categories.map` resolves against the `Category[]` prop already typed via Task 2.

- [ ] **Step 4: Wire the modals**

Find the `{qrStore && (` block near the end of the component's JSX (kept from Task 3) and insert directly before it:

```tsx
      {modal.type === 'categories' && (
        <CategoryModal
          mode={modal.mode}
          item={modal.mode === 'edit' ? modal.item as Category : undefined}
          catType={(modal.item as any)?._catType ?? (modal.mode === 'edit' ? (modal.item as Category)?.type : 'PRODUCT')}
          brandId={brandId}
          onClose={closeModal}
          onSave={cat => {
            if (modal.mode === 'create') {
              if (cat.type === 'INVENTORY') {
                setInvCategories(prev => [...prev, cat]);
              } else {
                setProductCategories(prev => [...prev, cat]);
              }
            } else {
              setProductCategories(prev => prev.map(c => (c.id === cat.id ? cat : c)));
              setInvCategories(prev => prev.map(c => (c.id === cat.id ? cat : c)));
            }
            closeModal();
          }}
        />
      )}

      {modal.type === 'products' && (
        <ProductModal
          mode={modal.mode}
          item={modal.item as Product | undefined}
          brandId={brandId}
          brand={brand}
          priceTiers={priceTiers}
          categories={productCategories}
          sizes={sizes}
          addons={addons}
          preferences={preferences}
          onClose={closeModal}
          onSave={prod => {
            if (modal.mode === 'create') {
              setProducts(prev => [...prev, prod]);
            } else {
              setProducts(prev => prev.map(p => (p.id === prod.id ? prod : p)));
            }
            closeModal();
          }}
        />
      )}
```

(this is copied verbatim from source lines 1424-1468 — no changes needed.)

- [ ] **Step 5: Build, lint, manual test**

Run: `cd kioscify-platform && npm run build && npm run lint`. Fix any type errors (likely candidates: `Category`/`Product` import already present from Task 3's type import line; if not, add them).

Run: `npm run dev`, navigate to a brand's detail page, open the Categories tab: create a product category, create an inventory category, reorder one with the up/down arrows, edit it, delete it. Open the Products tab: create a product with a category/size/addon/preference selection and an image upload, edit it, delete it. Confirm against the same brand in `kioscify-company` (as a COMPANY_ADMIN) that the data now shows up identically there too (proves the write actually persisted server-side, not just local state).

- [ ] **Step 6: Commit**

```bash
git add "kioscify-platform/app/(main)/companies/[id]/brands/[brandId]/page.tsx"
git commit -m "$(cat <<'EOF'
feat(platform): add Categories and Products tabs to brand detail page

Ports CategoryModal and ProductModal verbatim from kioscify-company,
converting ProductModal's Radix category Select to a native <select>
to match kioscify-platform's existing convention (no Radix dependency
there).
EOF
)"
```

---

## Task 5: Sizes, Add-ons, and Preferences tabs

**Files:**
- Modify: `kioscify-platform/app/(main)/companies/[id]/brands/[brandId]/page.tsx`

**Interfaces:**
- Consumes: `api.getSizes/createSize/updateSize/deleteSize`, `api.getAddons/createAddon/updateAddon/deleteAddon`, `api.getPreferences/createPreference/updatePreference/deletePreference` (Task 2). `ReorderRow`, `TabSection`, `EmptyState`, `Modal` (Task 3).
- Produces: `SizeModal`, `AddonModal`, `PreferenceModal` functions, consumed by the modal-wiring block added in this task.

- [ ] **Step 1: Narrow the placeholder and add the three tabs' JSX**

Replace:

```tsx
        {!['overview', 'categories', 'products'].includes(activeTab) && (
          <div className="bg-white rounded-lg border py-16 text-center text-gray-400 text-sm">
            {TABS.find(t => t.id === activeTab)?.label} — coming soon
          </div>
        )}
```

with the Sizes, Add-ons, and Preferences tab content, copied verbatim from `kioscify-company/.../page.tsx` lines 806-909 (the `{activeTab === 'sizes' && ...}`, `{activeTab === 'addons' && ...}`, and `{activeTab === 'preferences' && ...}` blocks, in that order, unchanged), followed by:

```tsx
        {!['overview', 'categories', 'products', 'sizes', 'addons', 'preferences'].includes(activeTab) && (
          <div className="bg-white rounded-lg border py-16 text-center text-gray-400 text-sm">
            {TABS.find(t => t.id === activeTab)?.label} — coming soon
          </div>
        )}
```

- [ ] **Step 2: Re-add `SizeModal`, `AddonModal`, `PreferenceModal`**

Copy `kioscify-company/.../page.tsx` lines 2062-2282 (`SizeModal`), 2283-2498 (`AddonModal`), 2499-2562 (`PreferenceModal`) verbatim, in that order, appending after `ProductModal` in the file. None of these three reference `hasPrivilege` or `Select` — but each has `var(--company-primary, #ea580c)` occurrences to replace with `#4f46e5` while pasting: `SizeModal` has 4 (source lines 2167, 2192, 2235, 2274), `AddonModal` has 4 (source lines 2377, 2402, 2445, 2490), `PreferenceModal` has 2 (source lines 2549, 2554).

- [ ] **Step 3: Wire the modals**

Insert before the `{qrStore && (` block (after the Categories/Products wiring added in Task 4):

```tsx
      {modal.type === 'sizes' && (
        <SizeModal
          mode={modal.mode}
          item={modal.item as Size | undefined}
          brandId={brandId}
          brand={brand}
          priceTiers={priceTiers}
          onClose={closeModal}
          onSave={size => {
            if (modal.mode === 'create') {
              setSizes(prev => [...prev, size]);
            } else {
              setSizes(prev => prev.map(s => (s.id === size.id ? size : s)));
            }
            closeModal();
          }}
        />
      )}

      {modal.type === 'addons' && (
        <AddonModal
          mode={modal.mode}
          item={modal.item as Addon | undefined}
          brandId={brandId}
          brand={brand}
          priceTiers={priceTiers}
          onClose={closeModal}
          onSave={addon => {
            if (modal.mode === 'create') {
              setAddons(prev => [...prev, addon]);
            } else {
              setAddons(prev => prev.map(a => (a.id === addon.id ? addon : a)));
            }
            closeModal();
          }}
        />
      )}

      {modal.type === 'preferences' && (
        <PreferenceModal
          mode={modal.mode}
          item={modal.item as Preference | undefined}
          brandId={brandId}
          onClose={closeModal}
          onSave={pref => {
            if (modal.mode === 'create') {
              setPreferences(prev => [...prev, pref]);
            } else {
              setPreferences(prev => prev.map(p => (p.id === pref.id ? pref : p)));
            }
            closeModal();
          }}
        />
      )}
```

(copied verbatim from source lines 1470-1523.)

- [ ] **Step 4: Build, lint, manual test**

Run: `cd kioscify-platform && npm run build && npm run lint`.

Run: `npm run dev`. On the Sizes tab: create a size with a price modifier and platform pricing, reorder it, edit it, delete it. On the Add-ons tab: same CRUD + reorder. On the Preferences tab: create two preferences, mark one as default (star icon), confirm only one stays default, reorder, edit, delete. Cross-check in `kioscify-company` as COMPANY_ADMIN that the same brand shows identical data.

- [ ] **Step 5: Commit**

```bash
git add "kioscify-platform/app/(main)/companies/[id]/brands/[brandId]/page.tsx"
git commit -m "$(cat <<'EOF'
feat(platform): add Sizes, Add-ons, and Preferences tabs

Ports SizeModal, AddonModal, and PreferenceModal verbatim from
kioscify-company — no adaptation needed, none of the three reference
privilege gating, CSS-var theming, or Radix Select.
EOF
)"
```

---

## Task 6: Inventory Items tab

**Files:**
- Modify: `kioscify-platform/app/(main)/companies/[id]/brands/[brandId]/page.tsx`

**Interfaces:**
- Consumes: `api.getInventoryBrandTemplates/createInventoryBrandTemplate/updateInventoryBrandTemplate/deleteInventoryBrandTemplate` (Task 2). `CRUDRow`, `TabSection`, `EmptyState` (Task 3).
- Produces: `InventoryModal` function, consumed by the modal-wiring block added in this task.

- [ ] **Step 1: Narrow the placeholder and add the Inventory tab JSX**

Replace:

```tsx
        {!['overview', 'categories', 'products', 'sizes', 'addons', 'preferences'].includes(activeTab) && (
          <div className="bg-white rounded-lg border py-16 text-center text-gray-400 text-sm">
            {TABS.find(t => t.id === activeTab)?.label} — coming soon
          </div>
        )}
```

with the Inventory tab content, copied verbatim from `kioscify-company/.../page.tsx` lines 1393-1419 (the `{activeTab === 'inventory' && !tabLoading && (...)}` block), followed by:

```tsx
        {!['overview', 'categories', 'products', 'sizes', 'addons', 'preferences', 'inventory'].includes(activeTab) && (
          <div className="bg-white rounded-lg border py-16 text-center text-gray-400 text-sm">
            {TABS.find(t => t.id === activeTab)?.label} — coming soon
          </div>
        )}
```

(Stores, Settings, and Price Tiers tabs remain placeholders until Tasks 7-9.)

- [ ] **Step 2: Re-add `InventoryModal` with the native-select conversion**

Copy `kioscify-company/.../page.tsx` lines 2563-2688 (`function InventoryModal({...}) {...}`) verbatim, appending after `PreferenceModal`. This block has 6 occurrences of `var(--company-primary, #ea580c)` (source lines 2625, 2632, 2652, 2660, 2672, 2681) — replace each with `#4f46e5` while pasting. Then apply the same Select→native conversion as Task 4 Step 3a, this time for the inventory category dropdown. Replace:

```tsx
          <Select value={category || 'none'} onValueChange={v => setCategory(v === 'none' ? '' : v)}>
            <SelectTrigger>
              <SelectValue placeholder="— None —" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— None —</SelectItem>
              {categories.map(c => (
                <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
```

with:

```tsx
          <select
            value={category || 'none'}
            onChange={e => setCategory(e.target.value === 'none' ? '' : e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="none">— None —</option>
            {categories.map(c => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>
```

- [ ] **Step 3: Wire the modal**

Insert before the `{qrStore && (` block:

```tsx
      {modal.type === 'inventory' && (
        <InventoryModal
          mode={modal.mode}
          item={modal.item as InventoryBrandTemplate | undefined}
          brandId={brandId}
          categories={invCategories}
          onClose={closeModal}
          onSave={item => {
            if (modal.mode === 'create') {
              setInvItems(prev => [...prev, item]);
            } else {
              setInvItems(prev => prev.map(i => (i.id === item.id ? item : i)));
            }
            closeModal();
          }}
        />
      )}
```

(copied verbatim from source lines 1525-1541.)

- [ ] **Step 4: Build, lint, manual test**

Run: `cd kioscify-platform && npm run build && npm run lint`.

Run: `npm run dev`. On the Inventory Items tab: create a template with a unit and category, edit it, delete it. Confirm it appears identically for the same brand in `kioscify-company`. Also confirm (per `BrandsService.fanOutInventoryToStore`, `kioskly-api/src/brands/brands.service.ts:134-162`, unrelated to this task but worth a sanity check) that an existing store under this brand already has a matching item on its own inventory page in `kioskly-admin` if this template existed before the store was created, or fans out correctly when a *new* store is onboarded after creating the template — this confirms the platform-admin-created template behaves identically to a company-admin-created one.

- [ ] **Step 5: Commit**

```bash
git add "kioscify-platform/app/(main)/companies/[id]/brands/[brandId]/page.tsx"
git commit -m "$(cat <<'EOF'
feat(platform): add Inventory Items tab to brand detail page

Ports InventoryModal from kioscify-company, converting its category
Select to a native <select>.
EOF
)"
```

---

## Task 7: Stores tab

**Files:**
- Modify: `kioscify-platform/app/(main)/companies/[id]/brands/[brandId]/page.tsx`

**Interfaces:**
- Consumes: `api.getStoresByBrand`, `api.updateStore` (Task 2, already rewired in Task 3 Step 5), `StoreQRModal` (already imported, `qrStore` state + its render block already present from Task 3). Handlers `startEditingStore`, `handleSaveStoreRow`, `openDeliveryModal`, `copyStoreLink`, `handleSaveDelivery` already exist in the file from Task 3 (kept, just unused in JSX until now).

- [ ] **Step 1: Narrow the placeholder and add the Stores tab JSX + delivery modal**

Replace:

```tsx
        {!['overview', 'categories', 'products', 'sizes', 'addons', 'preferences', 'inventory'].includes(activeTab) && (
          <div className="bg-white rounded-lg border py-16 text-center text-gray-400 text-sm">
            {TABS.find(t => t.id === activeTab)?.label} — coming soon
          </div>
        )}
```

with the Stores tab table and its Delivery Platforms modal, copied from `kioscify-company/.../page.tsx` lines 910-1093 (the `{activeTab === 'stores' && !tabLoading && (...)}` block through the `{/* Delivery Platforms Modal */}` block), followed by:

```tsx
        {!['overview', 'categories', 'products', 'sizes', 'addons', 'preferences', 'inventory', 'stores'].includes(activeTab) && (
          <div className="bg-white rounded-lg border py-16 text-center text-gray-400 text-sm">
            {TABS.find(t => t.id === activeTab)?.label} — coming soon
          </div>
        )}
```

While copying, replace every `var(--company-primary, #ea580c)` in the pasted block with `#4f46e5` — there are exactly 3 occurrences in this range (source lines 942, 1018, 1086): the store-name edit input's `--tw-ring-color`, the row "Save" button's `color`, and the Delivery Platforms modal's "Save" button `backgroundColor`. (Task 3's Step 6 global replace ran on the file *before* Step 9 deleted this block, so these specific lines were never retained in the platform file — this is the first time they land there.)

- [ ] **Step 2: Convert the price-tier dropdown to a native `<select>`**

Within the block you just pasted, replace:

```tsx
                          <Select
                            value={editingStorePriceTierValue ?? 'none'}
                            onValueChange={v => setEditingStorePriceTierValue(v === 'none' ? null : v)}
                          >
                            <SelectTrigger className="w-36 h-8 text-xs">
                              <SelectValue placeholder="— None —" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">— None —</SelectItem>
                              {priceTiers.map(t => (
                                <SelectItem key={t.id} value={t.id}>{t.name}{t.isDefault ? ' (Default)' : ''}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
```

with:

```tsx
                          <select
                            value={editingStorePriceTierValue ?? 'none'}
                            onChange={e => setEditingStorePriceTierValue(e.target.value === 'none' ? null : e.target.value)}
                            className="w-36 h-8 text-xs border border-gray-300 rounded-md px-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          >
                            <option value="none">— None —</option>
                            {priceTiers.map(t => (
                              <option key={t.id} value={t.id}>{t.name}{t.isDefault ? ' (Default)' : ''}</option>
                            ))}
                          </select>
```

- [ ] **Step 3: Build, lint, manual test**

Run: `cd kioscify-platform && npm run build && npm run lint`.

Run: `npm run dev`. On the Stores tab (you'll need at least one store under this brand and at least one price tier created via the Price Tiers tab — that tab is still a placeholder until Task 8, so for now create a price tier directly via `kioscify-company` as a COMPANY_ADMIN on the same brand, or via `curl -X POST .../brands/<id>/price-tiers`, to have something to assign):
- Rename a store inline (Enter to save, Escape to cancel).
- Assign a price tier to a store via the dropdown, confirm it persists after a page refresh.
- Click the delivery-platforms (truck) icon, toggle FoodPanda/Grab, save, confirm the toggle state persists. If the brand has no `enabledDeliveryPlatforms` yet, the modal should show "No delivery platforms configured for this brand. Enable them in Brand Settings first." — confirm that message appears (Settings tab lands in Task 9; for now this is expected since `enabledDeliveryPlatforms` defaults empty).
- Click the QR icon, confirm the QR modal renders.
- Click the copy-link icon, confirm a toast appears and the clipboard contains a URL shaped like `<NEXT_PUBLIC_STORE_PORTAL_BASE_URL>/<companySlug>/<brandSlug>/<storeSlug>`.

- [ ] **Step 4: Commit**

```bash
git add "kioscify-platform/app/(main)/companies/[id]/brands/[brandId]/page.tsx"
git commit -m "$(cat <<'EOF'
feat(platform): add Stores tab to brand detail page

Ports per-store rename, delivery-platform toggle, price-tier
assignment, QR code, and copy-link from kioscify-company, converting
the price-tier Radix Select to a native <select>.
EOF
)"
```

---

## Task 8: Price Tiers tab

**Files:**
- Modify: `kioscify-platform/app/(main)/companies/[id]/brands/[brandId]/page.tsx`

**Interfaces:**
- Consumes: `api.createPriceTier/updatePriceTier/deletePriceTier` (Task 2). Handlers `handleCreateTier`, `handleRenameTier`, `handleSetDefaultTier`, `handleDeleteTier` already exist in the file from Task 3.

- [ ] **Step 1: Narrow the placeholder and add the Price Tiers tab JSX**

Replace:

```tsx
        {!['overview', 'categories', 'products', 'sizes', 'addons', 'preferences', 'inventory', 'stores'].includes(activeTab) && (
          <div className="bg-white rounded-lg border py-16 text-center text-gray-400 text-sm">
            {TABS.find(t => t.id === activeTab)?.label} — coming soon
          </div>
        )}
```

with the Price Tiers tab content, copied from `kioscify-company/.../page.tsx` lines 1280-1392 (the `{activeTab === 'price-tiers' && (...)}` block), followed by:

```tsx
        {!['overview', 'categories', 'products', 'sizes', 'addons', 'preferences', 'inventory', 'stores', 'price-tiers'].includes(activeTab) && (
          <div className="bg-white rounded-lg border py-16 text-center text-gray-400 text-sm">
            {TABS.find(t => t.id === activeTab)?.label} — coming soon
          </div>
        )}
```

(Settings is the only remaining placeholder, finished in Task 9.) This block has no `Select` usage — replace its 4 occurrences of `var(--company-primary, #ea580c)` (source lines 1304, 1321, 1374, 1380) with `#4f46e5` while pasting, same as every other tab.

- [ ] **Step 2: Build, lint, manual test**

Run: `cd kioscify-platform && npm run build && npm run lint`.

Run: `npm run dev`. On the Price Tiers tab: create a tier named "Airport", rename it inline, star it as default, confirm the previous default (if any) loses its star, delete a non-default tier. Then go back to the Stores tab and confirm the new tier now appears in the per-store price-tier dropdown.

- [ ] **Step 3: Commit**

```bash
git add "kioscify-platform/app/(main)/companies/[id]/brands/[brandId]/page.tsx"
git commit -m "$(cat <<'EOF'
feat(platform): add Price Tiers tab to brand detail page

Ports tier create/rename/set-default/delete from kioscify-company —
no Select or privilege-gating adaptation needed for this tab.
EOF
)"
```

---

## Task 9: Settings tab

**Files:**
- Modify: `kioscify-platform/app/(main)/companies/[id]/brands/[brandId]/page.tsx`

**Interfaces:**
- Consumes: `api.updateBrand`, `api.uploadBrandLogo` (already existed pre-Task-2; `updateBrand`'s payload type in `kioscify-platform/lib/api.ts` currently only allows `{ name, description, themeColors, isActive }` — **must be extended** in this task to also accept `enabledDeliveryPlatforms` and `preferenceLabel`, matching kioscify-company's `updateBrand` signature). Handlers `handleSaveSettings`, `handleLogoUpload` already exist in the file from Task 3.

- [ ] **Step 1: Extend `updateBrand`'s payload type**

In `kioscify-platform/lib/api.ts`, find:

```ts
  async updateBrand(
    id: string,
    payload: Partial<{ name: string; description: string; themeColors: ThemeColors; isActive: boolean }>
  ): Promise<Brand> {
    const { data } = await this.client.patch<Brand>(`/brands/${id}`, payload);
    return data;
  }
```

Replace with:

```ts
  async updateBrand(
    id: string,
    payload: Partial<{
      name: string;
      description: string;
      themeColors: ThemeColors;
      isActive: boolean;
      enabledDeliveryPlatforms: string[];
      preferenceLabel: string;
    }>
  ): Promise<Brand> {
    const { data } = await this.client.patch<Brand>(`/brands/${id}`, payload);
    return data;
  }
```

(no backend change needed — `UpdateBrandDto` on the API side already accepts these fields, since `kioscify-company`'s identical call already relies on it.)

- [ ] **Step 2: Narrow the placeholder (now removing it entirely) and add the Settings tab JSX**

Replace:

```tsx
        {!['overview', 'categories', 'products', 'sizes', 'addons', 'preferences', 'inventory', 'stores', 'price-tiers'].includes(activeTab) && (
          <div className="bg-white rounded-lg border py-16 text-center text-gray-400 text-sm">
            {TABS.find(t => t.id === activeTab)?.label} — coming soon
          </div>
        )}
```

with the Settings tab content, copied from `kioscify-company/.../page.tsx` lines 1096-1279 (the `{activeTab === 'settings' && (...)}` block) — no placeholder needed afterward, since this is the last (10th) tab. Replace its 6 occurrences of `var(--company-primary, #ea580c)` (source lines 1122, 1161, 1172, 1210, 1260, 1268) with `#4f46e5` while pasting, same as every other tab. No `Select` usage in this block.

- [ ] **Step 3: Build, lint, manual test**

Run: `cd kioscify-platform && npm run build && npm run lint`.

Run: `npm run dev`. On the Settings tab:
- Upload a brand logo, confirm it appears and persists after refresh.
- Edit the brand name/description, save, confirm "Settings saved" banner and persisted change.
- Change theme colors via both the color picker and the hex text input, save, confirm persisted.
- Enable FoodPanda and/or Grab delivery platforms, save. Go back to the Stores tab's delivery-platform modal for a store under this brand and confirm the platform(s) you just enabled now appear as selectable (this closes the loop with Task 7's "no delivery platforms configured" message).
- Set a custom Preference Label (e.g. "Sugar Level"), save, confirm persisted.
- Cross-check in `kioscify-company` as COMPANY_ADMIN that all of the above show up identically for this brand.

- [ ] **Step 4: Commit**

```bash
git add "kioscify-platform/app/(main)/companies/[id]/brands/[brandId]/page.tsx" kioscify-platform/lib/api.ts
git commit -m "$(cat <<'EOF'
feat(platform): add Settings tab to brand detail page

Completes the 10-tab brand drill-in page. Extends updateBrand's
payload type to cover enabledDeliveryPlatforms and preferenceLabel,
which the API already accepted but the platform client didn't expose.
EOF
)"
```

---

## Task 10: Wire Brands tab navigation to the new drill-in page

This is the task that actually connects M1 to the rest of the app — until now the new page was only reachable by typing the URL directly.

**Files:**
- Modify: `kioscify-platform/app/(main)/companies/[id]/page.tsx`

**Interfaces:**
- Consumes: nothing new — `companyId` (`params.id as string`, already defined at line 191) and `brands` state (already defined) are both already in scope.

- [ ] **Step 1: Delete the edit-brand state and handlers**

`companyId` is already derived at line 191 (`const companyId = params.id as string;`) — confirmed present, no change needed there.

Delete lines 280-345 of `kioscify-platform/app/(main)/companies/[id]/page.tsx` in full — this is the self-contained block:

```ts
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [editBrandName, setEditBrandName] = useState('');
  const [editBrandDescription, setEditBrandDescription] = useState('');
  const [editBrandTheme, setEditBrandTheme] = useState<ThemeColors>({});
  const [editBrandThemeHex, setEditBrandThemeHex] = useState<Record<string, string>>({});
  const [editBrandLoading, setEditBrandLoading] = useState(false);
  const [editBrandError, setEditBrandError] = useState<string | null>(null);
  const [editBrandLogoUploading, setEditBrandLogoUploading] = useState(false);
  const [editBrandLogoUploadError, setEditBrandLogoUploadError] = useState<string | null>(null);

  const openEditBrand = (brand: Brand) => {
    setEditingBrand(brand);
    setEditBrandName(brand.name);
    setEditBrandDescription(brand.description || '');
    setEditBrandTheme(brand.themeColors || {});
    setEditBrandThemeHex({ ...(brand.themeColors || {}) });
    setEditBrandError(null);
  };

  const handleSaveBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBrand) return;
    setEditBrandError(null);
    setEditBrandLoading(true);
    try {
      const updated = await api.updateBrand(editingBrand.id, {
        name: editBrandName,
        description: editBrandDescription || undefined,
        themeColors: Object.keys(editBrandTheme).length ? editBrandTheme : undefined,
      });
      setBrands(prev => prev.map(b => b.id === updated.id ? { ...b, ...updated } : b));
      setEditingBrand(null);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setEditBrandError(axiosErr?.response?.data?.message || 'Failed to update brand');
    } finally {
      setEditBrandLoading(false);
    }
  };

  const handleBrandLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingBrand) return;
    if (!UPLOAD_ALLOWED_TYPES.includes(file.type)) {
      setEditBrandLogoUploadError('Only JPEG, PNG, WebP, or GIF images are allowed.');
      e.target.value = '';
      return;
    }
    if (file.size > UPLOAD_MAX_SIZE) {
      setEditBrandLogoUploadError('File too large. Maximum size is 5 MB.');
      e.target.value = '';
      return;
    }
    setEditBrandLogoUploadError(null);
    setEditBrandLogoUploading(true);
    try {
      const updated = await api.uploadBrandLogo(editingBrand.id, file);
      setEditingBrand(prev => prev ? { ...prev, logoUrl: updated.logoUrl } : prev);
      setBrands(prev => prev.map(b => b.id === updated.id ? { ...b, logoUrl: updated.logoUrl } : b));
    } catch {
      // no-op
    } finally {
      setEditBrandLogoUploading(false);
      e.target.value = '';
    }
  };
```

Check whether `UPLOAD_ALLOWED_TYPES`/`UPLOAD_MAX_SIZE` constants are still used elsewhere in the file (the company logo upload and store logo upload flows likely also use them) — if so, leave their `const` declarations in place; only the block above is deleted.

- [ ] **Step 2: Delete the Edit Brand modal JSX**

Delete the JSX block immediately following the Brands tab content and preceding `{/* Create brand modal */}`:

```tsx
      {editingBrand && (
        <Modal title={`Edit Brand — ${editingBrand.name}`} onClose={() => setEditingBrand(null)}>
```

through its matching closing:

```tsx
        </Modal>
      )}
```

(this is the full block — read the file first to copy the exact full content as your `old_string` for the Edit tool, since it's ~118 lines; the point is to delete the *entire* `{editingBrand && (...)}` block, nothing more, nothing less — the very next line after it must be the `{/* Create brand modal */}` comment.)

- [ ] **Step 3: Replace the row's "Edit" button with a link to the drill-in page**

In the Brands tab JSX, replace:

```tsx
                      <button
                        onClick={() => openEditBrand(brand)}
                        className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-indigo-700 font-medium border border-gray-200 rounded px-2.5 py-1.5"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit
                      </button>
```

with:

```tsx
                      <Link
                        href={`/companies/${companyId}/brands/${brand.id}`}
                        className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-indigo-700 font-medium border border-gray-200 rounded px-2.5 py-1.5"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Manage
                      </Link>
```

Confirm `Link` from `next/link` is already imported at the top of the file (the file already uses `Link` elsewhere per the broader codebase convention — if not, add `import Link from 'next/link';`).

- [ ] **Step 4: Build, lint, manual test**

Run: `cd kioscify-platform && npm run build && npm run lint`. Fix any now-unused-import warnings (e.g. if `ThemeColors` was only used by the deleted edit-brand state, check whether it's still used by the company-settings branding form elsewhere in the same file before removing the import).

Run: `npm run dev`. Go to a company's detail page, Brands tab, click "Manage" on a brand row — confirm it navigates to `/companies/<id>/brands/<brandId>` and lands on the fully working 10-tab page from Tasks 3-9. Confirm "New Brand" (create) still works unchanged.

- [ ] **Step 5: Commit**

```bash
git add "kioscify-platform/app/(main)/companies/[id]/page.tsx"
git commit -m "$(cat <<'EOF'
feat(platform): link Brands tab to the new brand detail page

Replaces the small edit-brand modal (name/description/logo/theme
only) with navigation to the full 10-tab drill-in page, which now
supersedes it.
EOF
)"
```

---

## Task 11: Analytics types and API client methods

**Files:**
- Modify: `kioscify-platform/types/index.ts`
- Modify: `kioscify-platform/lib/api.ts`

**Interfaces:**
- Produces: `AnalyticsOverview`, `TopBrandItem`, `TopProductItem`, `TopStoreItem`, `GrowthDataPoint` types; `api.getAnalyticsOverview(companyId, startDate, endDate)`, `api.getTopBrands(companyId, startDate, endDate)`, `api.getTopProducts(companyId, brandId, startDate, endDate)`, `api.getTopStores(companyId, startDate, endDate)`, `api.getNetworkGrowth(companyId, startDate, endDate)` — note the extra leading `companyId` param vs. kioscify-company's versions, since Task 1's backend change reads it from a query param for PLATFORM_ADMIN rather than the JWT.

- [ ] **Step 1: Add analytics types**

Append to `kioscify-platform/types/index.ts`:

```ts
export interface AnalyticsOverview {
  totalBrands: number;
  totalStores: number;
  activeStores: number;
}

export interface TopBrandItem {
  brandId: string;
  brandName: string;
  primaryColor?: string;
  storeCount: number;
  unitsSold: number;
}

export interface TopProductItem {
  productId: string;
  productName: string;
  unitsSold: number;
  totalRevenue: number;
}

export interface TopStoreItem {
  storeId: string;
  storeName: string;
  brandId: string;
  brandName: string;
  totalRevenue: number;
  transactionCount: number;
}

export interface GrowthDataPoint {
  date: string;
  storeCount: number;
  brandCount: number;
}
```

- [ ] **Step 2: Add analytics API methods**

In `kioscify-platform/lib/api.ts`, add the new types to the existing import block from Task 2 (append `AnalyticsOverview, TopBrandItem, TopProductItem, TopStoreItem, GrowthDataPoint,` to the `import type { ... } from '@/types';` list), then add a new section at the end of the class, right before the closing `}`:

```ts
  // ─── Analytics ────────────────────────────────────────────────────────────

  async getAnalyticsOverview(companyId: string, startDate: string, endDate: string): Promise<AnalyticsOverview> {
    const { data } = await this.client.get<AnalyticsOverview>('/analytics/company/overview', {
      params: { companyId, startDate, endDate },
    });
    return data;
  }

  async getTopBrands(companyId: string, startDate: string, endDate: string): Promise<TopBrandItem[]> {
    const { data } = await this.client.get<TopBrandItem[]>('/analytics/company/top-brands', {
      params: { companyId, startDate, endDate },
    });
    return data;
  }

  async getTopProducts(companyId: string, brandId: string, startDate: string, endDate: string): Promise<TopProductItem[]> {
    const { data } = await this.client.get<TopProductItem[]>('/analytics/company/top-products', {
      params: { companyId, brandId, startDate, endDate },
    });
    return data;
  }

  async getTopStores(companyId: string, startDate: string, endDate: string): Promise<TopStoreItem[]> {
    const { data } = await this.client.get<TopStoreItem[]>('/analytics/company/top-stores', {
      params: { companyId, startDate, endDate },
    });
    return data;
  }

  async getNetworkGrowth(companyId: string, startDate: string, endDate: string): Promise<GrowthDataPoint[]> {
    const { data } = await this.client.get<GrowthDataPoint[]>('/analytics/company/growth', {
      params: { companyId, startDate, endDate },
    });
    return data;
  }
```

- [ ] **Step 3: Build and lint**

Run: `cd kioscify-platform && npm run build && npm run lint`.

- [ ] **Step 4: Commit**

```bash
git add kioscify-platform/types/index.ts kioscify-platform/lib/api.ts
git commit -m "$(cat <<'EOF'
feat(platform): add analytics types and API client methods

Mirrors kioscify-company's analytics client, with an added leading
companyId param on every method since platform admin must pass it
explicitly via query string (no companyId JWT claim).
EOF
)"
```

---

## Task 12: Port the 6 analytics widget components

Each widget gains a `companyId: string` prop (threaded into its API call) and loses its Radix `Select`/CSS-var dependencies. Source: `kioscify-company/app/(main)/analytics/components/*.tsx` (6 files, 53-155 lines each — all already read in full while preparing this plan).

**Files:**
- Create: `kioscify-platform/app/(main)/companies/[id]/analytics/components/DateRangePicker.tsx`
- Create: `kioscify-platform/app/(main)/companies/[id]/analytics/components/OverviewCards.tsx`
- Create: `kioscify-platform/app/(main)/companies/[id]/analytics/components/TopBrandsWidget.tsx`
- Create: `kioscify-platform/app/(main)/companies/[id]/analytics/components/TopProductsWidget.tsx`
- Create: `kioscify-platform/app/(main)/companies/[id]/analytics/components/TopStoresWidget.tsx`
- Create: `kioscify-platform/app/(main)/companies/[id]/analytics/components/NetworkGrowthChart.tsx`

**Interfaces:**
- Consumes: `api.getAnalyticsOverview/getTopBrands/getTopProducts/getTopStores/getNetworkGrowth` (Task 11), `api.getBrandsByCompany(companyId)` (pre-existing, `kioscify-platform/lib/api.ts:196-201`) — **not** `api.getBrands()`, which doesn't exist in this client (company-portal's JWT-scoped equivalent is named differently here).
- Produces: `DateRangePicker`, `OverviewCards`, `TopBrandsWidget`, `TopProductsWidget`, `TopStoresWidget`, `NetworkGrowthChart` components, each exported by name, consumed by Task 13.

- [ ] **Step 1: `DateRangePicker.tsx`**

No `companyId` needed (purely emits date ranges via `onChange`). Create with this exact content — identical to the source except the Radix `Select` is replaced with a native `<select>` and the import line is dropped:

```tsx
'use client';
import { useState, useEffect } from 'react';
import {
  startOfDay, endOfDay, subDays,
  startOfWeek, endOfWeek,
  startOfMonth, endOfMonth, subMonths,
  startOfYear, endOfYear,
  parseISO, differenceInDays, format, isValid,
} from 'date-fns';
import { Calendar } from 'lucide-react';

export type DatePreset =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'this_month'
  | 'last_3_months'
  | 'this_year'
  | 'custom';

interface Props {
  initialPreset?: DatePreset;
  onChange: (startDate: string, endDate: string) => void;
}

function getPresetRange(preset: Exclude<DatePreset, 'custom'>): { start: Date; end: Date } {
  const now = new Date();
  switch (preset) {
    case 'today':
      return { start: startOfDay(now), end: endOfDay(now) };
    case 'yesterday': {
      const y = subDays(now, 1);
      return { start: startOfDay(y), end: endOfDay(y) };
    }
    case 'this_week':
      return {
        start: startOfWeek(now, { weekStartsOn: 1 }),
        end: endOfWeek(now, { weekStartsOn: 1 }),
      };
    case 'this_month':
      return { start: startOfMonth(now), end: endOfMonth(now) };
    case 'last_3_months':
      return { start: startOfMonth(subMonths(now, 2)), end: endOfMonth(now) };
    case 'this_year':
      return { start: startOfYear(now), end: endOfYear(now) };
  }
}

const PRESETS: { value: DatePreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_week', label: 'This Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_3_months', label: 'Last 3 Months' },
  { value: 'this_year', label: 'This Year' },
  { value: 'custom', label: 'Custom Range' },
];

export function DateRangePicker({ initialPreset = 'this_month', onChange }: Props) {
  const [preset, setPreset] = useState<DatePreset>(initialPreset);
  const [customStart, setCustomStart] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [customEnd, setCustomEnd] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [customError, setCustomError] = useState<string | null>(null);

  useEffect(() => {
    if (initialPreset !== 'custom') {
      const { start, end } = getPresetRange(initialPreset);
      onChange(start.toISOString(), end.toISOString());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handlePresetChange(value: DatePreset) {
    setPreset(value);
    setCustomError(null);
    if (value !== 'custom') {
      const { start, end } = getPresetRange(value);
      onChange(start.toISOString(), end.toISOString());
    }
  }

  function handleCustomApply() {
    const start = startOfDay(parseISO(customStart));
    const end = endOfDay(parseISO(customEnd));
    if (!isValid(start) || !isValid(end)) {
      setCustomError('Please enter valid start and end dates');
      return;
    }
    const diff = differenceInDays(end, start);
    if (diff < 0) {
      setCustomError('Start date must be before end date');
      return;
    }
    if (diff > 730) {
      setCustomError('Date range cannot exceed 2 years');
      return;
    }
    setCustomError(null);
    onChange(start.toISOString(), end.toISOString());
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <Calendar className="w-4 h-4 text-gray-500" />
        <select
          value={preset}
          onChange={(e) => handlePresetChange(e.target.value as DatePreset)}
          className="w-40 h-9 border border-gray-300 rounded-md px-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {PRESETS.map(p => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </div>
      {preset === 'custom' && (
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="date"
            value={customStart}
            onChange={e => setCustomStart(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 outline-none transition focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <span className="text-gray-400 text-sm">to</span>
          <input
            type="date"
            value={customEnd}
            onChange={e => setCustomEnd(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 outline-none transition focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <button
            type="button"
            onClick={handleCustomApply}
            className="text-sm text-white px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 transition-colors"
          >
            Apply
          </button>
          {customError && <span className="text-xs text-red-600">{customError}</span>}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: `OverviewCards.tsx`**

Adds a `companyId` prop, passed into `api.getAnalyticsOverview`, and swaps the CSS-var icon styling for static indigo classes:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { AnalyticsOverview } from '@/types';
import { BookOpen, Store, Activity } from 'lucide-react';

interface Props {
  companyId: string;
  startDate: string;
  endDate: string;
}

export function OverviewCards({ companyId, startDate, endDate }: Props) {
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .getAnalyticsOverview(companyId, startDate, endDate)
      .then(setData)
      .catch((err: { response?: { data?: { message?: string } } }) =>
        setError(err?.response?.data?.message || 'Failed to load overview'),
      )
      .finally(() => setLoading(false));
  }, [companyId, startDate, endDate]);

  const cards = [
    {
      label: 'Total Brands',
      subtitle: 'Brands operating under this company',
      value: data?.totalBrands ?? 0,
      icon: BookOpen,
    },
    {
      label: 'Total Stores',
      subtitle: 'All stores across all brands',
      value: data?.totalStores ?? 0,
      icon: Store,
    },
    {
      label: 'Active Stores',
      subtitle: 'Stores with at least one transaction in the selected period',
      value: data?.activeStores ?? 0,
      icon: Activity,
    },
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[0, 1, 2].map(i => (
          <div key={i} className="bg-white rounded-lg border p-5 h-28 animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-sm">
        {error}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {cards.map(({ label, subtitle, value, icon: Icon }) => (
        <div key={label} className="bg-white rounded-lg border p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-500">{label}</span>
            <div className="p-2 rounded-lg bg-indigo-50">
              <Icon className="w-4 h-4 text-indigo-600" />
            </div>
          </div>
          <p className="text-3xl font-bold text-gray-900">{value}</p>
          <p className="text-xs text-gray-400 mt-1.5">{subtitle}</p>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: `TopBrandsWidget.tsx`**

Adds `companyId`, switches `api.getBrands()` → `api.getBrandsByCompany(companyId)`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { api } from '@/lib/api';
import type { TopBrandItem, Brand } from '@/types';

interface Props {
  companyId: string;
  startDate: string;
  endDate: string;
}

export function TopBrandsWidget({ companyId, startDate, endDate }: Props) {
  const [data, setData] = useState<TopBrandItem[]>([]);
  const [colorMap, setColorMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getBrandsByCompany(companyId)
      .then((brands: Brand[]) => {
        const map: Record<string, string> = {};
        for (const b of brands) map[b.id] = b.themeColors?.primary ?? '#4f46e5';
        setColorMap(map);
      })
      .catch(() => {});
  }, [companyId]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .getTopBrands(companyId, startDate, endDate)
      .then(setData)
      .catch((err: { response?: { data?: { message?: string } } }) =>
        setError(err?.response?.data?.message || 'Failed to load brands'),
      )
      .finally(() => setLoading(false));
  }, [companyId, startDate, endDate]);

  return (
    <div className="bg-white rounded-lg border p-6">
      <div className="mb-4">
        <h2 className="font-semibold text-gray-900">Top Brands</h2>
        <p className="text-xs text-gray-400 mt-0.5">Total units sold across all stores per brand</p>
      </div>
      {loading ? (
        <div className="h-48 bg-gray-100 rounded animate-pulse" />
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : data.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No data for this period</p>
      ) : (
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ left: 0, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="brandName" width={90} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => [`${v} units`, 'Units Sold']} />
                <Bar dataKey="unitsSold" name="Units Sold" radius={[0, 4, 4, 0]}>
                  {data.map(brand => (
                    <Cell key={brand.brandId} fill={colorMap[brand.brandId] ?? '#4f46e5'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2 pr-2">#</th>
                  <th className="pb-2 pr-4">Brand</th>
                  <th className="pb-2 text-right pr-2">Units Sold</th>
                  <th className="pb-2 text-right pr-2">Stores</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.map((brand, i) => (
                  <tr key={brand.brandId} className="hover:bg-gray-50">
                    <td className="py-2 pr-2 text-gray-400">{i + 1}</td>
                    <td className="py-2 pr-4 font-medium text-gray-900">{brand.brandName}</td>
                    <td className="py-2 pr-2 text-right text-gray-700">{brand.unitsSold.toLocaleString()}</td>
                    <td className="py-2 pr-2 text-right text-gray-700">{brand.storeCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: `TopProductsWidget.tsx`**

Adds `companyId`, switches `api.getBrands()` → `api.getBrandsByCompany(companyId)`, converts the brand-filter `Select` to a native `<select>`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { TopProductItem, Brand } from '@/types';

interface Props {
  companyId: string;
  startDate: string;
  endDate: string;
}

export function TopProductsWidget({ companyId, startDate, endDate }: Props) {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrandId, setSelectedBrandId] = useState<string>('');
  const [data, setData] = useState<TopProductItem[]>([]);
  const [loadingBrands, setLoadingBrands] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getBrandsByCompany(companyId)
      .then(b => {
        setBrands(b);
        if (b.length > 0) setSelectedBrandId(b[0].id);
      })
      .catch(() => setError('Failed to load brands'))
      .finally(() => setLoadingBrands(false));
  }, [companyId]);

  useEffect(() => {
    if (!selectedBrandId) return;
    setLoading(true);
    setError(null);
    api
      .getTopProducts(companyId, selectedBrandId, startDate, endDate)
      .then(setData)
      .catch((err: { response?: { data?: { message?: string } } }) =>
        setError(err?.response?.data?.message || 'Failed to load products'),
      )
      .finally(() => setLoading(false));
  }, [companyId, selectedBrandId, startDate, endDate]);

  return (
    <div className="bg-white rounded-lg border p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="font-semibold text-gray-900">Top Products</h2>
          <p className="text-xs text-gray-400 mt-0.5">Best-selling products by units sold for the selected brand</p>
        </div>
        {!loadingBrands && brands.length > 0 && (
          <select
            value={selectedBrandId}
            onChange={(e) => setSelectedBrandId(e.target.value)}
            className="w-36 h-8 text-xs border border-gray-300 rounded-md px-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {brands.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        )}
      </div>
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : data.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No data for this period</p>
      ) : (
        <div>
          {data.map((product, i) => (
            <div key={product.productId} className="flex items-center justify-between py-2.5 border-b last:border-0">
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-gray-400 w-5">{i + 1}</span>
                <p className="text-sm font-medium text-gray-900">{product.productName}</p>
              </div>
              <span className="text-sm font-semibold text-gray-500">
                {product.unitsSold.toLocaleString()} sold
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: `TopStoresWidget.tsx`**

Adds `companyId`, switches `api.getBrands()` → `api.getBrandsByCompany(companyId)`, converts the brand-filter `Select` to a native `<select>`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { TopStoreItem, Brand } from '@/types';

interface Props {
  companyId: string;
  startDate: string;
  endDate: string;
}

export function TopStoresWidget({ companyId, startDate, endDate }: Props) {
  const [allData, setAllData] = useState<TopStoreItem[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrandId, setSelectedBrandId] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getBrandsByCompany(companyId).then(setBrands).catch(() => {});
  }, [companyId]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .getTopStores(companyId, startDate, endDate)
      .then(setAllData)
      .catch((err: { response?: { data?: { message?: string } } }) =>
        setError(err?.response?.data?.message || 'Failed to load stores'),
      )
      .finally(() => setLoading(false));
  }, [companyId, startDate, endDate]);

  const data =
    selectedBrandId === 'all'
      ? allData
      : allData.filter(s => s.brandId === selectedBrandId);

  return (
    <div className="bg-white rounded-lg border p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="font-semibold text-gray-900">Top Stores</h2>
          <p className="text-xs text-gray-400 mt-0.5">Stores ranked by transaction volume in the selected period</p>
        </div>
        {brands.length > 0 && (
          <select
            value={selectedBrandId}
            onChange={(e) => setSelectedBrandId(e.target.value)}
            className="w-36 h-8 text-xs border border-gray-300 rounded-md px-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All Brands</option>
            {brands.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        )}
      </div>
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : data.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No data for this period</p>
      ) : (
        <div>
          {data.map((store, i) => (
            <div key={store.storeId} className="flex items-center justify-between py-2.5 border-b last:border-0">
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-gray-400 w-5">{i + 1}</span>
                <div>
                  <p className="text-sm font-medium text-gray-900">{store.storeName}</p>
                  <p className="text-xs text-gray-400">{store.brandName}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: `NetworkGrowthChart.tsx`**

Adds `companyId` only — no Select, no CSS var:

```tsx
'use client';
import { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { format, parseISO, differenceInDays } from 'date-fns';
import { api } from '@/lib/api';
import type { GrowthDataPoint } from '@/types';

interface Props {
  companyId: string;
  startDate: string;
  endDate: string;
}

export function NetworkGrowthChart({ companyId, startDate, endDate }: Props) {
  const [data, setData] = useState<GrowthDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .getNetworkGrowth(companyId, startDate, endDate)
      .then(setData)
      .catch((err: { response?: { data?: { message?: string } } }) =>
        setError(err?.response?.data?.message || 'Failed to load growth data'),
      )
      .finally(() => setLoading(false));
  }, [companyId, startDate, endDate]);

  const diffDays = differenceInDays(parseISO(endDate), parseISO(startDate));
  const dateFormat =
    diffDays <= 1 ? 'HH:mm' : diffDays <= 31 ? 'MMM d' : diffDays <= 90 ? 'MMM d' : 'MMM yyyy';

  const chartData = data.map(d => ({
    ...d,
    label: format(parseISO(d.date), dateFormat),
  }));

  return (
    <div className="bg-white rounded-lg border p-6">
      <div className="mb-4">
        <h2 className="font-semibold text-gray-900">Network Growth</h2>
        <p className="text-xs text-gray-400 mt-0.5">Cumulative number of stores and brands added over time</p>
      </div>
      {loading ? (
        <div className="h-52 bg-gray-100 rounded animate-pulse" />
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : data.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No data for this period</p>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="storeCount" name="Stores" stroke="#3b82f6" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="brandCount" name="Brands" stroke="#10b981" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Build and lint**

Run: `cd kioscify-platform && npm run build && npm run lint`. These components have no consumer yet (Task 13 adds one) — confirm the build doesn't fail on that (unused-file warnings aren't a thing in Next's build; only unused *imports within* a file are flagged, and there are none here).

- [ ] **Step 8: Commit**

```bash
git add "kioscify-platform/app/(main)/companies/[id]/analytics/components"
git commit -m "$(cat <<'EOF'
feat(platform): port analytics widget components

Adapts all 6 widgets from kioscify-company to take an explicit
companyId prop, replacing the company-portal's JWT-scoped calls.
Converts the 3 Radix Select usages (date preset, top-products brand
filter, top-stores brand filter) to native <select>, and the
CSS-variable accent color to static indigo.
EOF
)"
```

---

## Task 13: Wire the Analytics tab into the company detail page

**Files:**
- Modify: `kioscify-platform/app/(main)/companies/[id]/page.tsx`

**Interfaces:**
- Consumes: `DateRangePicker`, `OverviewCards`, `TopBrandsWidget`, `TopProductsWidget`, `TopStoresWidget`, `NetworkGrowthChart` (Task 12).

- [ ] **Step 1: Add the date-fns import**

At the top of the file, add (alongside the existing imports, e.g. right after the `sonner`/`StoreQRModal` import lines):

```ts
import { startOfMonth, endOfMonth } from 'date-fns';
import { DateRangePicker } from './analytics/components/DateRangePicker';
import { OverviewCards } from './analytics/components/OverviewCards';
import { TopBrandsWidget } from './analytics/components/TopBrandsWidget';
import { TopProductsWidget } from './analytics/components/TopProductsWidget';
import { TopStoresWidget } from './analytics/components/TopStoresWidget';
import { NetworkGrowthChart } from './analytics/components/NetworkGrowthChart';
```

- [ ] **Step 2: Extend the `Tab` type and tab list**

Find:

```ts
type Tab = 'settings' | 'brands' | 'stores' | 'users';
```

Replace with:

```ts
type Tab = 'settings' | 'brands' | 'stores' | 'analytics' | 'users';
```

Find:

```tsx
          {(['settings', 'brands', 'stores', 'users'] as Tab[]).map(tab => (
```

Replace with:

```tsx
          {(['settings', 'brands', 'stores', 'analytics', 'users'] as Tab[]).map(tab => (
```

- [ ] **Step 3: Add date-range state**

In the component body, alongside the other `useState` declarations near the top of `CompanyDetailPage`, add:

```ts
  const [analyticsStartDate, setAnalyticsStartDate] = useState(startOfMonth(new Date()).toISOString());
  const [analyticsEndDate, setAnalyticsEndDate] = useState(endOfMonth(new Date()).toISOString());
```

- [ ] **Step 4: Add the Analytics tab content**

Immediately after the closing of the Settings tab block (right before `{/* Brands tab */}` — find that exact comment in the file to anchor the insertion) or anywhere among the other `{activeTab === '...' && (...)}` blocks, insert:

```tsx
      {/* Analytics tab */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Analytics</h2>
              <p className="text-sm text-gray-500 mt-1">Cross-brand performance overview for this company</p>
            </div>
            <DateRangePicker
              initialPreset="this_month"
              onChange={(start, end) => {
                setAnalyticsStartDate(start);
                setAnalyticsEndDate(end);
              }}
            />
          </div>

          <OverviewCards companyId={companyId} startDate={analyticsStartDate} endDate={analyticsEndDate} />

          <TopBrandsWidget companyId={companyId} startDate={analyticsStartDate} endDate={analyticsEndDate} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TopProductsWidget companyId={companyId} startDate={analyticsStartDate} endDate={analyticsEndDate} />
            <TopStoresWidget companyId={companyId} startDate={analyticsStartDate} endDate={analyticsEndDate} />
          </div>

          <NetworkGrowthChart companyId={companyId} startDate={analyticsStartDate} endDate={analyticsEndDate} />
        </div>
      )}
```

- [ ] **Step 5: Build, lint, manual test**

Run: `cd kioscify-platform && npm run build && npm run lint`.

Run: `npm run dev`. Go to a company with at least one brand, store, and some transactions (use an existing seeded/demo company if available). Click the new "Analytics" tab. Confirm:
- Overview cards show non-zero numbers if the company has data in the default "This Month" range.
- Top Brands chart + table render.
- Top Products widget's brand dropdown switches data when changed.
- Top Stores widget's "All Brands"/per-brand filter works.
- Network Growth chart renders.
- Switching the date range (try "Last 3 Months" and a custom range) refetches all widgets.
- Cross-check: log into `kioscify-company` as that company's COMPANY_ADMIN and confirm the same date range produces the same numbers on their own Analytics page.

- [ ] **Step 6: Commit**

```bash
git add "kioscify-platform/app/(main)/companies/[id]/page.tsx"
git commit -m "$(cat <<'EOF'
feat(platform): add Analytics tab to company detail page

Wires the ported analytics widgets into a new tab, completing
per-company analytics parity with the Company Portal.
EOF
)"
```

---

## Task 14: Privilege types, API client, and grid components

No backend change in this task — confirmed in the spec's Current State section: `hasPrivilege(null, ...)` always returns `true` (`kioskly-api/src/common/utils/privileges.ts:17`), and PLATFORM_ADMIN's JWT has no `companyPrivileges` claim, so `req.user.companyPrivileges ?? null` already satisfies the owner-bypass check in `users.service.ts` `createCompanyUser`/`updateCompanyUser`. This task is frontend-only.

**Files:**
- Modify: `kioscify-platform/types/index.ts`
- Modify: `kioscify-platform/lib/api.ts`
- Create: `kioscify-platform/components/PrivilegesGrid.tsx`
- Create: `kioscify-platform/components/EditPrivilegesModal.tsx`

**Interfaces:**
- Produces: `PrivilegeLevel`, `PrivilegeSection`, `CompanyPrivileges` types; extended `User` type with `companyPrivileges`; `api.updateCompanyUserPrivileges(companyId, userId, companyPrivileges)`, `api.createCompanyUser(companyId, payload)` (a new method distinct from the existing `onboardCompanyAdmin`); `PrivilegesGrid`, `EditPrivilegesModal` components — consumed by Task 15.

- [ ] **Step 1: Add privilege types and extend `User`**

In `kioscify-platform/types/index.ts`, add:

```ts
export type PrivilegeLevel = 'no_access' | 'read' | 'write' | 'all';
export type PrivilegeSection = 'brands' | 'analytics' | 'users' | 'settings';

export interface CompanyPrivileges {
  brands: PrivilegeLevel;
  analytics: PrivilegeLevel;
  users: PrivilegeLevel;
  settings: PrivilegeLevel;
}
```

Find the existing `User` interface and add one field to it:

```ts
export interface User {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
  isFirstLogin: boolean;
  mustChangePassword: boolean;
  companyId?: string;
  createdAt: string;
  updatedAt: string;
  companyPrivileges?: CompanyPrivileges | null;
}
```

(only the trailing `companyPrivileges?: CompanyPrivileges | null;` line is new.)

- [ ] **Step 2: Add API client methods**

In `kioscify-platform/lib/api.ts`, add `CompanyPrivileges` to the type import block, then add two methods in the `// ─── Users ───...` area (near `updateCompanyUser`):

```ts
  async createCompanyUser(
    companyId: string,
    payload: { firstName: string; lastName: string; email: string; username: string; companyPrivileges?: CompanyPrivileges | null }
  ): Promise<{ user: User; temporaryPassword: string }> {
    const { data } = await this.client.post(`/users/companies/${companyId}`, payload);
    return data;
  }

  async updateCompanyUserPrivileges(
    companyId: string,
    userId: string,
    companyPrivileges: CompanyPrivileges | null,
  ): Promise<User> {
    const { data } = await this.client.patch<User>(
      `/users/companies/${companyId}/${userId}`,
      { companyPrivileges },
    );
    return data;
  }
```

Note: `createCompanyUser` (`POST /users/companies/:companyId`) is distinct from the existing `onboardCompanyAdmin` (`POST /companies/:id/onboard-admin`) already in this file — the latter is for a brand-new company's first/owner admin (implicit `companyPrivileges: null`), the former is for adding additional admins with explicit, restrictable privileges. Both stay; Task 15 decides which to call based on whether the company already has an admin.

- [ ] **Step 3: `PrivilegesGrid.tsx`**

Identical to the kioscify-company source, with the active-state color swapped from orange to indigo to match kioscify-platform's convention:

```tsx
'use client';

import type { PrivilegeLevel } from '@/types';

type Section = 'brands' | 'analytics' | 'users' | 'settings';

type Privileges = Record<Section, PrivilegeLevel>;

interface Props {
  value: Privileges;
  onChange: (updated: Privileges) => void;
  disabled?: boolean;
}

const SECTIONS: { key: Section; label: string }[] = [
  { key: 'brands', label: 'Brands' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'users', label: 'Users' },
  { key: 'settings', label: 'Settings' },
];

const LEVELS: { value: PrivilegeLevel; label: string }[] = [
  { value: 'no_access', label: 'No Access' },
  { value: 'read', label: 'Read' },
  { value: 'write', label: 'Write' },
  { value: 'all', label: 'All' },
];

export function PrivilegesGrid({ value, onChange, disabled }: Props) {
  const handleChange = (section: Section, level: PrivilegeLevel) => {
    if (disabled) return;
    onChange({ ...value, [section]: level });
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[120px_1fr] gap-2 text-xs font-medium text-gray-400 pb-1 border-b border-gray-100">
        <span>Section</span>
        <div className="grid grid-cols-4 gap-1">
          {LEVELS.map((l) => (
            <span key={l.value} className="text-center">
              {l.label}
            </span>
          ))}
        </div>
      </div>

      {SECTIONS.map(({ key, label }) => (
        <div key={key} className="grid grid-cols-[120px_1fr] gap-2 items-center">
          <span className="text-sm text-gray-700 font-medium">{label}</span>
          <div className="grid grid-cols-4 gap-1">
            {LEVELS.map(({ value: level, label: levelLabel }) => {
              const isActive = value[key] === level;
              return (
                <button
                  key={level}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleChange(key, level)}
                  className={[
                    'text-xs py-1.5 px-1 rounded transition-colors text-center',
                    isActive
                      ? 'bg-indigo-600 text-white font-medium'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
                    disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
                  ].join(' ')}
                >
                  {levelLabel}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: `EditPrivilegesModal.tsx`**

Identical to the kioscify-company source, with the orange accent swapped to indigo:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { X, Shield } from 'lucide-react';
import { PrivilegesGrid } from './PrivilegesGrid';
import { api } from '@/lib/api';
import type { User, CompanyPrivileges } from '@/types';

const DEFAULT_FULL: CompanyPrivileges = {
  brands: 'all',
  analytics: 'all',
  users: 'all',
  settings: 'all',
};

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (updatedUser: User) => void;
  companyId: string;
  user: User;
}

export function EditPrivilegesModal({ open, onClose, onSave, companyId, user }: Props) {
  const [privileges, setPrivileges] = useState<CompanyPrivileges>(
    (user.companyPrivileges as CompanyPrivileges | null) ?? DEFAULT_FULL
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPrivileges((user.companyPrivileges as CompanyPrivileges | null) ?? DEFAULT_FULL);
      setError(null);
    }
  }, [open, user]);

  if (!open) return null;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateCompanyUserPrivileges(companyId, user.id, privileges);
      onSave(updated);
      onClose();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr?.response?.data?.message || 'Failed to update privileges');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black bg-opacity-40" onClick={onClose} />

      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-gray-900">Edit Privileges</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          Editing permissions for{' '}
          <span className="font-medium text-gray-900">
            {user.firstName} {user.lastName}
          </span>
        </p>

        <PrivilegesGrid value={privileges} onChange={setPrivileges} disabled={saving} />

        {error && (
          <p className="mt-3 text-sm text-red-600">{error}</p>
        )}

        <div className="flex justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 font-medium"
          >
            {saving ? 'Saving...' : 'Save Privileges'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Build and lint**

Run: `cd kioscify-platform && npm run build && npm run lint`.

- [ ] **Step 6: Commit**

```bash
git add kioscify-platform/types/index.ts kioscify-platform/lib/api.ts kioscify-platform/components/PrivilegesGrid.tsx kioscify-platform/components/EditPrivilegesModal.tsx
git commit -m "$(cat <<'EOF'
feat(platform): port privilege grid and edit-privileges modal

Frontend-only — the API already grants PLATFORM_ADMIN an owner-level
bypass on companyPrivileges via the null-privileges convention. Swaps
kioscify-company's orange accent for platform's indigo.
EOF
)"
```

---

## Task 15: Wire privilege editing into the Users tab

This closes the loop: platform admin can now view/edit any company admin's section-level privileges, and additional admins (beyond the first/owner) get created with explicit, restrictable privileges instead of always becoming unrestricted owners.

**Files:**
- Modify: `kioscify-platform/app/(main)/companies/[id]/page.tsx`

**Interfaces:**
- Consumes: `PrivilegesGrid`, `EditPrivilegesModal` (Task 14), `api.createCompanyUser`, `api.updateCompanyUserPrivileges` (Task 14), `api.onboardCompanyAdmin` (pre-existing, unchanged for the first-admin path).

- [ ] **Step 1: Import the new pieces and add a default-privileges constant**

Add to the imports:

```ts
import { PrivilegesGrid } from '@/components/PrivilegesGrid';
import { EditPrivilegesModal } from '@/components/EditPrivilegesModal';
import type { CompanyPrivileges } from '@/types';
```

(merge `CompanyPrivileges` into the existing `import type { Company, Brand, ThemeColors, Store, OnboardAdminPayload, User } from '@/types';` line rather than adding a second `import type` line.)

Near the top of the file, after the existing imports, add:

```ts
const DEFAULT_PRIVILEGES: CompanyPrivileges = {
  brands: 'read',
  analytics: 'read',
  users: 'read',
  settings: 'read',
};
```

- [ ] **Step 2: Add state for the privileges grid and the edit-privileges modal**

Near the existing `adminFirstName`/`adminLastName`/etc. state (around line 258-263), add:

```ts
  const [adminPrivileges, setAdminPrivileges] = useState<CompanyPrivileges>(DEFAULT_PRIVILEGES);
  const [editingPrivilegesUser, setEditingPrivilegesUser] = useState<User | null>(null);
```

- [ ] **Step 3: Branch `handleOnboardAdmin` on whether this is the first admin**

Replace:

```ts
  const handleOnboardAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError(null);
    setAdminLoading(true);
    try {
      const payload: OnboardAdminPayload = {
        firstName: adminFirstName,
        lastName: adminLastName,
        email: adminEmail,
        username: adminUsername,
      };
      const result = await api.onboardCompanyAdmin(companyId, payload);
      setAdminPassword(result.temporaryPassword);
      setAdminFirstName('');
      setAdminLastName('');
      setAdminEmail('');
      setAdminUsername('');
      setShowOnboardAdmin(false);
      await loadUsers();
```

with:

```ts
  const handleOnboardAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError(null);
    setAdminLoading(true);
    try {
      const payload = {
        firstName: adminFirstName,
        lastName: adminLastName,
        email: adminEmail,
        username: adminUsername,
      };
      // The very first admin becomes the unrestricted owner (companyPrivileges stays null
      // server-side), matching how a brand-new company is set up. Every admin added after
      // that gets explicit, restrictable privileges — same as a company-admin owner adding
      // a teammate via their own Users page.
      const result = companyAdmins.length === 0
        ? await api.onboardCompanyAdmin(companyId, payload as OnboardAdminPayload)
        : await api.createCompanyUser(companyId, { ...payload, companyPrivileges: adminPrivileges });
      setAdminPassword(result.temporaryPassword);
      setAdminFirstName('');
      setAdminLastName('');
      setAdminEmail('');
      setAdminUsername('');
      setAdminPrivileges(DEFAULT_PRIVILEGES);
      setShowOnboardAdmin(false);
      await loadUsers();
```

(leave the `catch`/`finally` below this untouched.)

- [ ] **Step 4: Reset the privileges grid whenever the modal opens**

Find:

```tsx
                    onClick={() => { setAdminError(null); setShowOnboardAdmin(true); }}
```

Replace with:

```tsx
                    onClick={() => { setAdminError(null); setAdminPrivileges(DEFAULT_PRIVILEGES); setShowOnboardAdmin(true); }}
```

(there is exactly one occurrence — the "Add Admin" button in the Users tab. The other place `showOnboardAdmin` is set, the dashboard quick-action button, doesn't need this since `adminPrivileges` already defaults correctly on mount; reset it there too for consistency if you find a second call site.)

- [ ] **Step 5: Show the privileges grid in the modal, only for non-first admins**

Find the Onboard admin modal body:

```tsx
          <form onSubmit={handleOnboardAdmin} className="space-y-4">
            {adminError && <p className="text-red-600 text-sm">{adminError}</p>}
            <AdminFields
              firstName={adminFirstName}
              lastName={adminLastName}
              email={adminEmail}
              username={adminUsername}
              setFirstName={setAdminFirstName}
              setLastName={setAdminLastName}
              setEmail={setAdminEmail}
              setUsername={setAdminUsername}
            />
            <div className="flex gap-3 pt-2">
```

Replace with:

```tsx
          <form onSubmit={handleOnboardAdmin} className="space-y-4">
            {adminError && <p className="text-red-600 text-sm">{adminError}</p>}
            <AdminFields
              firstName={adminFirstName}
              lastName={adminLastName}
              email={adminEmail}
              username={adminUsername}
              setFirstName={setAdminFirstName}
              setLastName={setAdminLastName}
              setEmail={setAdminEmail}
              setUsername={setAdminUsername}
            />
            {companyAdmins.length > 0 && (
              <div className="pt-2 border-t">
                <p className="text-sm font-medium text-gray-700 mb-2">Permissions</p>
                <PrivilegesGrid value={adminPrivileges} onChange={setAdminPrivileges} disabled={adminLoading} />
              </div>
            )}
            <div className="flex gap-3 pt-2">
```

- [ ] **Step 6: Add the shield button to company-admin rows in `UserRow`**

Find the `UserRow` function signature:

```tsx
function UserRow({
  user,
  isAssigned,
  onReset,
  resetting,
  onRemove,
  onToggle,
  currentUserId,
}: {
  user: User;
  isAssigned?: boolean;
  onReset: (user: User) => void;
  resetting: boolean;
  onRemove: (user: User) => void;
  onToggle: (user: User) => void;
  currentUserId: string | null;
}) {
```

Replace with:

```tsx
function UserRow({
  user,
  isAssigned,
  onReset,
  resetting,
  onRemove,
  onToggle,
  onEditPrivileges,
  currentUserId,
}: {
  user: User;
  isAssigned?: boolean;
  onReset: (user: User) => void;
  resetting: boolean;
  onRemove: (user: User) => void;
  onToggle: (user: User) => void;
  onEditPrivileges?: (user: User) => void;
  currentUserId: string | null;
}) {
```

Then, inside the row's actions section, find:

```tsx
        {!isSelf && user.isActive && (
          <button
            onClick={() => onReset(user)}
            disabled={resetting}
            title="Reset password"
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-amber-600 border border-gray-200 hover:border-amber-300 rounded px-2.5 py-1.5 transition-colors disabled:opacity-50"
          >
            <KeyRound className="w-3.5 h-3.5" />
            {resetting ? 'Resetting...' : 'Reset Password'}
          </button>
        )}
      </div>
    </div>
  );
}
```

Replace with:

```tsx
        {!isSelf && user.isActive && (
          <button
            onClick={() => onReset(user)}
            disabled={resetting}
            title="Reset password"
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-amber-600 border border-gray-200 hover:border-amber-300 rounded px-2.5 py-1.5 transition-colors disabled:opacity-50"
          >
            <KeyRound className="w-3.5 h-3.5" />
            {resetting ? 'Resetting...' : 'Reset Password'}
          </button>
        )}
        {onEditPrivileges && user.role === 'COMPANY_ADMIN' && (
          <button
            onClick={() => onEditPrivileges(user)}
            title="Edit privileges"
            className="p-1.5 text-gray-400 hover:text-indigo-600 rounded transition-colors"
          >
            <Shield className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
```

Add `Shield` to the `lucide-react` import at the top of the file if it isn't already imported there.

- [ ] **Step 7: Pass `onEditPrivileges` only on the company-admins row mapping**

Find (the Company Admins section, not the per-store staff section below it):

```tsx
                    {companyAdmins.map(user => (
                      <UserRow key={user.id} user={user} onReset={handleResetPassword} resetting={resetingUserId === user.id} onRemove={handleRemoveUser} onToggle={handleToggleUser} currentUserId={currentUserId} />
                    ))}
```

Replace with:

```tsx
                    {companyAdmins.map(user => (
                      <UserRow key={user.id} user={user} onReset={handleResetPassword} resetting={resetingUserId === user.id} onRemove={handleRemoveUser} onToggle={handleToggleUser} onEditPrivileges={setEditingPrivilegesUser} currentUserId={currentUserId} />
                    ))}
```

Do **not** add `onEditPrivileges` to the per-store staff `UserRow` call (`STORE_ADMIN`/`CASHIER` users don't have `companyPrivileges`).

- [ ] **Step 8: Render the `EditPrivilegesModal`**

Add near the other modals at the bottom of the component's JSX (e.g. right after the closing of the Onboard admin modal block):

```tsx
      {editingPrivilegesUser && (
        <EditPrivilegesModal
          open={!!editingPrivilegesUser}
          onClose={() => setEditingPrivilegesUser(null)}
          onSave={(updated) => {
            setCompanyAdmins(prev => prev.map(u => u.id === updated.id ? { ...u, ...updated } : u));
            setEditingPrivilegesUser(null);
          }}
          companyId={companyId}
          user={editingPrivilegesUser}
        />
      )}
```

Confirm `setCompanyAdmins` is the actual setter name for the `companyAdmins` state (declared at line 239, `const [companyAdmins, setCompanyAdmins] = useState<User[]>([]);` — confirmed by reading the file).

- [ ] **Step 9: Build, lint, manual test**

Run: `cd kioscify-platform && npm run build && npm run lint`.

Run: `npm run dev`. On a company with at least one existing admin:
- Click "Add Admin" — confirm the Permissions grid now appears (since `companyAdmins.length > 0`), defaulting to "Read" on every section. Change a couple of levels, create the admin, confirm the temp-password banner still appears as before.
- Click the new shield icon on that admin's row — confirm `EditPrivilegesModal` opens pre-filled with what you just set, change a level, save, confirm it persists (reopen the modal to verify).
- Log into `kioscify-company` as that restricted admin (using the temp password, completing first-login password change) and confirm the sections you set to `no_access` are hidden/redirect to `/dashboard`, matching `kioscify-company/lib/privileges.ts`'s enforcement.
- On a brand-new company with zero admins: click "Add Admin" — confirm the Permissions grid does **not** appear (first admin becomes the unrestricted owner, matching existing behavior), and that admin has full access in `kioscify-company`.
- Confirm the shield icon never appears on STORE_ADMIN/CASHIER rows in the per-store staff sections.

- [ ] **Step 10: Commit**

```bash
git add "kioscify-platform/app/(main)/companies/[id]/page.tsx"
git commit -m "$(cat <<'EOF'
feat(platform): wire company-admin privilege editing into Users tab

Adds a shield icon on each company-admin row to edit their
brands/analytics/users/settings privilege levels, and an optional
Permissions grid on the Add Admin modal for every admin after the
first (who remains an unrestricted owner, matching company setup
behavior). Completes platform-admin/company-portal capability parity.
EOF
)"
```

---

## Final verification (after all 15 tasks)

Re-run the full Verification Plan from the spec end-to-end as a single pass:

- [ ] As PLATFORM_ADMIN, drill into a company → into a brand → exercise every tab in order: Overview, Products (create/edit/delete with image), Categories (create/reorder/delete, both Product and Inventory types), Sizes (create with platform pricing/reorder/delete), Add-ons (create/reorder/delete), Preferences (create/set-default/reorder/delete), Inventory Items (create/edit/delete), Stores (rename/assign price tier/toggle delivery platforms/QR/copy-link), Price Tiers (create/rename/set-default/delete), Settings (logo/name/description/theme/delivery platforms/preference label).
- [ ] For every write above, confirm the same data appears identically when viewed as that company's COMPANY_ADMIN in `kioscify-company`.
- [ ] Confirm the Analytics tab on the company detail page renders real, non-zero numbers for a company with existing transactions, and that changing the date range refetches all 5 widgets.
- [ ] Confirm privilege-grid edits actually gate the target COMPANY_ADMIN's own Company Portal session (set a section to `no_access`, log in as that admin, confirm it's hidden).
- [ ] Confirm the original owner admin (`companyPrivileges: null`) remains fully unrestricted throughout.
- [ ] Run `cd kioskly-api && npm run build && npm run lint` and `cd kioscify-platform && npm run build && npm run lint` one final time — both must be clean.
- [ ] Run `cd kioskly-api && npm run test` to confirm the existing 6 unit-test files still pass (this plan didn't touch any of the files they cover, but it's a cheap final sanity check).
