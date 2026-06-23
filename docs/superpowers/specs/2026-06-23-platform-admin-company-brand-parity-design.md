# Platform Admin: Company & Brand Management Parity

**Date:** 2026-06-23
**Status:** Approved
**Portals:** kioscify-platform (Platform Admin), kioskly-api

## Overview

PLATFORM_ADMIN currently has only a thin slice of company/brand management: company CRUD, a basic brand create/rename modal, store onboarding, and user onboarding. The Company Portal (`kioscify-company`), used by COMPANY_ADMIN, has a much deeper feature set for managing a company's brands (full catalog, price tiers, inventory templates, per-store config), cross-brand analytics, and granular admin privilege management.

Goal: give PLATFORM_ADMIN the same depth of capability as COMPANY_ADMIN, scoped to any company it drills into — full visibility and management, not just oversight.

## UX Model

Drill-in / impersonation style: Platform Admin picks a Company (existing `/companies/[id]` page), then within that company picks a Brand to get a brand-scoped management view equivalent to what a COMPANY_ADMIN sees for their own brand. No new global cross-company list views are introduced.

## Current State (verified by reading source, not assumed)

### Backend — already supports PLATFORM_ADMIN today

All of the following already accept `PLATFORM_ADMIN` and resolve scope via an explicit query/route param when the JWT has no `companyId`/`brandId` claim (PLATFORM_ADMIN's JWT has neither):

- `BrandsController` — GET/POST/PATCH/DELETE/upload-logo. `BrandsService.assertOwnership` treats `companyId` as optional and skips the filter when absent, so PATCH/DELETE/upload-logo (which read `@CompanyId()` only) already work correctly for PLATFORM_ADMIN — there is no real gap here despite the decorator looking JWT-only at first glance.
- `CategoriesController`, `ProductsController`, `SizesController`, `AddonsController`, `PreferencesController` — all use `queryBrandId || jwtBrandId`, roles include `PLATFORM_ADMIN`.
- `InventoryController` brand-templates routes (`/inventory/brand-templates*`) — roles include `PLATFORM_ADMIN`, scoped via required `?brandId=` query param.
- `PriceTiersController` (`/brands/:brandId/price-tiers*`) — roles include `PLATFORM_ADMIN`, scoped via route param, no companyId check at all.
- `StoresController` — GET/PATCH/POST/DELETE all include `PLATFORM_ADMIN`.
- `UsersController` company-user create/update (`/users/companies/:companyId*`) — already includes `PLATFORM_ADMIN`. Crucially, `companyPrivileges` get/set is gated by `hasPrivilege(requestingPrivileges, 'users', 'all')`, and `hasPrivilege(null, ...)` always returns `true` (`common/utils/privileges.ts:17`). PLATFORM_ADMIN's JWT has no `companyPrivileges` claim, so the controller normalizes it to `null` (`req.user.companyPrivileges ?? null`), which passes the owner-bypass check. **No backend change needed for privilege management.**

### Backend — one real gap

- `AnalyticsController` (`/analytics/company/*`) is hardcoded to `@Roles('COMPANY_ADMIN')` and reads `companyId` only from the JWT claim via `@CompanyId()`, throwing `UnauthorizedException` if absent. PLATFORM_ADMIN cannot call any analytics endpoint today.

### Frontend — gaps (all in kioscify-platform)

1. No brand drill-in page. The company-detail "Brands" tab only has a lightweight create/edit-name+logo+theme modal — nothing for products, categories, sizes, add-ons, preferences, inventory templates, or price tiers.
2. The company-detail "Stores" tab is a flat onboarding/admin-assignment list. It has no per-store delivery-platform toggle, price-tier assignment, or inline rename (all present in Company Portal's brand-detail "Stores" tab).
3. No analytics view anywhere in kioscify-platform beyond the platform-wide stats dashboard.
4. No privilege-grid UI — confirmed via grep, zero references to "privilege" anywhere in kioscify-platform. PLATFORM_ADMIN can create/edit COMPANY_ADMIN users but cannot set or view their section-level access (brands/analytics/users/settings × no_access/read/write/all).

## Design

### Architecture decision: duplicate & adapt, no shared package

The two portals are separate Next.js apps in the workspace with no shared UI package today (only `kioskly-api`, `kioskly-admin`, `kioscify-company`, `kioscify-platform` are workspace members). Introducing a shared package is a bigger structural change than this effort calls for, and kioscify-platform already duplicates a smaller version of brand-create logic from kioscify-company. We continue that pattern: port and adapt files rather than extract a shared package.

Both portals already use the same Radix UI + Tailwind + `tailwind-merge`/`clsx` stack, so ported components should match kioscify-platform's existing visual conventions (its own button/modal/table primitives), not necessarily byte-for-byte styling copied from kioscify-company.

### Routing

New route: `kioscify-platform/app/(main)/companies/[id]/brands/[brandId]/page.tsx`, ported from `kioscify-company/app/(main)/brands/[brandId]/page.tsx` (~2700 lines, 10 tabs). Adaptations needed when porting:

- Every API call must pass `companyId`/`brandId` explicitly as a query param — the ported page cannot rely on JWT claims the way the Company Portal version does, since PLATFORM_ADMIN's token carries neither.
- Add a header/breadcrumb showing `Company name > Brand name` with a back link to `/companies/[id]`.
- Tabs ported as-is: Overview, Products, Categories, Sizes, Add-ons, Preferences, Inventory Items, Stores, Price Tiers, Settings.

In the existing company-detail "Brands" tab (`/companies/[id]/page.tsx`), clicking a brand row navigates to the new detail page instead of opening the current edit modal. The "Create Brand" modal stays for creation; the edit modal is removed since the new Settings tab supersedes it.

The existing company-detail "Stores" tab is left as-is (it serves onboarding + admin/staff assignment, which Company Portal doesn't have at all since it's an everyday flow Platform Admin needs). The richer per-store config (rename, delivery-platform toggle, price-tier assignment, QR/copy-link) is added only inside the new brand-detail page's "Stores" sub-tab, matching Company Portal's tab exactly.

### Backend change

`kioskly-api/src/analytics/analytics.controller.ts`: add `PLATFORM_ADMIN` to the controller-level `@Roles(...)`, and on each of the 5 handlers (`overview`, `topBrands`, `topProducts`, `topStores`, `growth`) accept `@Query('companyId') queryCompanyId` and resolve `companyId = req.user.role === 'PLATFORM_ADMIN' ? queryCompanyId : jwtCompanyId` — same pattern already used in `BrandsController.findAll`/`findOne`. `PrivilegeGuard` already short-circuits for non-`COMPANY_ADMIN` roles, so no privilege-decorator change is needed.

### Frontend milestones

**M1 — Brand Detail drill-in (bulk of the work)**
Port the 10-tab page and every sub-component/modal it uses (product/category/size/addon/preference CRUD modals, inventory-template CRUD modal, price-tier inline editor, store config modal, brand settings form, logo upload). Reuse the existing `kioscify-platform/lib/api.ts` client, extending it with the same calls `kioscify-company/lib/api.ts` makes, but with explicit `companyId`/`brandId` params on every request.

**M2 — Company Analytics**
New "Analytics" tab on `/companies/[id]/page.tsx` (5th tab alongside Settings/Brands/Stores/Users). Port `OverviewCards`, `TopBrandsWidget`, `TopProductsWidget`, `TopStoresWidget`, `NetworkGrowthChart`, `DateRangePicker` from `kioscify-company/app/(main)/analytics/components/`. All calls scoped via `?companyId={id}`.

**M3 — Company-admin privilege grid**
Port `PrivilegesGrid` and `EditPrivilegesModal` from `kioscify-company/components/` into kioscify-platform. Wire into the existing company-detail "Users" tab's Company Admins section: a shield icon per row opens the editor (pre-populated, saved via the existing `PATCH /users/companies/:companyId/:userId`), and the "Add Admin" / onboard-admin creation flow gains an optional permissions grid section. Frontend-only — no backend change required (see Current State above).

## Verification Plan

- As PLATFORM_ADMIN: drill into a company → into a brand → exercise every tab (create/edit/delete a product with image, reorder categories, create a size with platform pricing, create/delete an add-on, set a default preference, create an inventory template, assign a price tier to a store, toggle a store's delivery platforms, rename a store, edit brand theme/logo/delivery-platform settings) and confirm each persists and matches what a COMPANY_ADMIN sees for the same brand in Company Portal.
- Confirm the Analytics tab renders real numbers (not zeros/errors) for a company with existing transactions, and that date-range changes refetch correctly.
- Confirm privilege grid edits actually gate the target COMPANY_ADMIN's own portal session — e.g. set `brands: no_access` for a non-owner admin and verify their Company Portal hides brand management after re-login.
- Confirm the old "owner" COMPANY_ADMIN (`companyPrivileges: null`) is unaffected and unrestricted throughout.

## Out of Scope

- Platform-wide (cross-company) analytics dashboard — only per-company drill-in analytics, matching what COMPANY_ADMIN sees for their own company.
- Extracting a shared UI package between kioscify-company and kioscify-platform.
- Store-level operational data (transactions, expenses, inventory records) — Company Portal doesn't expose these either; out of scope for parity.
- Changing STORE_ADMIN/CASHIER capabilities or the mobile app.
