# Kioscify Platform — Complete Feature Inventory

> **Generated:** June 9, 2026  
> **Scope:** Full monorepo codebase analysis — API, Platform Portal, Company Portal, Store Portal, Mobile App  
> **Methodology:** Source code traversal — routes, schemas, services, components, context providers, sync engine, and configuration files

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Platform Overview](#platform-overview)
3. [Complete Platform Feature Inventory](#complete-platform-feature-inventory)
4. [Platform Portal Features](#platform-portal-features)
5. [Company Portal Features](#company-portal-features)
6. [Store Portal Features](#store-portal-features)
7. [Kiosk App / Staff App Features](#kiosk-app--staff-app-features)
8. [Permission Matrix](#permission-matrix)
9. [Hidden / Undocumented Features](#hidden--undocumented-features)
10. [Recommendations](#recommendations)

---

## Executive Summary

**Kioscify** is a cloud-based **franchise operations platform** built for multi-brand F&B and retail businesses in the Philippines. It enables a franchisor to onboard and manage any number of brands and store locations under a single umbrella, with staff using a branded mobile POS app and managers monitoring operations through two separate web portals.

The system is composed of **five distinct software surfaces** organized as a Turborepo monorepo:

| Surface | Package | Port | Purpose |
|---------|---------|------|---------|
| REST API | `kioskly-api` | 3000 | NestJS backend, single API for all clients |
| Platform Admin | `kioscify-platform` | 3002 | Kioscify's internal control plane |
| Company Portal | `kioscify-company` | 3001 | Franchise operator management hub |
| Store Portal | `kioskly-admin` | 3000 | Day-to-day store oversight dashboard |
| Mobile POS App | `kioskly-app` | Expo | Field operations app for store staff |

The platform is currently in **active development** — the architecture recently completed a migration from a flat single-tenant model to a full **Platform → Company → Brand → Store** hierarchy, with some legacy references still in code.

---

## Platform Overview

### Core Business Purpose

Kioscify solves the operational complexity of running a multi-location franchise network. It provides:

- A **centralized catalog** (products, sizes, add-ons, preferences) owned at the brand level and shared across all stores in that brand
- A **mobile POS** for cashiers to take orders, record expenses, and count inventory from any device
- A **web oversight layer** for store admins and company owners to review operations, approve void requests, and track performance
- A **platform control plane** for Kioscify's own operators to provision clients

### Business Hierarchy

```
Kioscify (Platform)
  └── Company  (e.g. "Brew & Co")
        └── Brand  (e.g. "SiLog Express")
              └── Store/Tenant  (e.g. "SiLog Makati")
```

### Target Users

| User | Portal/App | What they do |
|------|-----------|-------------|
| Kioscify Operator | Platform Portal | Onboard companies, manage platform |
| Franchise Owner (COMPANY_ADMIN) | Company Portal | Define catalog, monitor brands, view analytics |
| Store Manager (STORE_ADMIN) | Store Portal + Mobile | Oversee daily operations, approve voids |
| Cashier | Mobile App only | Take orders, record expenses, count inventory |

### System Architecture Overview

All portals talk to **one shared NestJS API** via JWT. The API sits in front of a **MongoDB replica set** (Prisma ORM). There is no message broker or event system — all communication is synchronous HTTP.

The mobile app has a **SQLite-backed offline sync engine**: writes are queued locally and pushed to the server when connectivity is restored. The web portals have no offline capability.

```
[Mobile App] ──── offline SQLite queue ──────┐
[Store Portal]  ──────────────────────────────┤──► [NestJS API] ──► [MongoDB]
[Company Portal] ─────────────────────────────┤         │
[Platform Portal] ────────────────────────────┘    [Redis cache]
                                                   (JWT blacklist)
```

### API at a Glance

- **~140 REST endpoints** across 19 modules
- **Base path:** `/api/v1` (configurable)
- **Auth:** JWT Bearer, global guard, Redis blacklist on logout
- **Rate limiting:** 100 req/min global; 20/15min on login endpoints
- **File uploads:** Company/Brand/Store logos (5 MB), Product images (5 MB)
- **Database models:** 22 Prisma models on MongoDB replica set

---

## Complete Platform Feature Inventory

### User Management & Access Control

- **Multi-role user system** — five distinct roles: PLATFORM_ADMIN, COMPANY_ADMIN, STORE_ADMIN, CASHIER, legacy ADMIN
- **Scoped user creation** — each user is scoped to a Platform, Company, Brand, or Store
- **Multi-store access** — a single STORE_ADMIN can be granted access to multiple store locations; switches context via JWT swap
- **Temporary password onboarding** — all new users receive a system-generated secure password shown once
- **Forced first-login password change** — `isFirstLogin` flag forces a password reset before any access
- **Password strength policy** — min 10 characters, uppercase, lowercase, digit, and special character required; bcrypt-12 hashing
- **Account enable/disable** — soft deactivation without deleting records
- **Role display formatting** — legacy ADMIN role gracefully aliased to "Store Admin" throughout UI

### Authentication & Security

- **Three separate login flows** — platform login, company login (with company slug), store login (with store + company slug)
- **JWT authentication** — 7-day tokens; all API endpoints protected by default
- **Token revocation** — logout blacklists the JWT `jti` in Redis; tokens cannot be reused after logout
- **Rate limiting** — global 100 req/min throttle; separate tighter throttle for login endpoints (brute-force protection)
- **CORS configuration** — allowed origins configurable via environment variable with wildcard support
- **Maintenance mode** — platform-controlled per-portal kill switch (store portal, company portal, mobile app each independently toggleable)
- **Store portal subdomain routing** — login via `company.brand.kioscify.com` URL automatically pre-fills brand/company context

### Company & Franchise Management (Platform-level)

- **Company CRUD** — create, read, update, soft-delete (tombstone) companies
- **Company capabilities control** — per-company flags: `canCreateBrands`, `canOnboardStores`
- **Company branding** — logo upload (5 MB, jpeg/png/webp/gif) + 5-color theme palette (primary, secondary, accent, background, text)
- **Company subdomain** — each company gets a unique slug used as `<slug>.kioscify.com`
- **Company admin onboarding** — first admin created with temporary password directly from platform
- **Brand management** — create/edit brands under a company; each brand has its own slug, logo, and theme
- **Delivery platform configuration** — brands and stores can independently enable FoodPanda and Grab
- **Store onboarding** — create stores under a brand; assign new or existing admin with temporary password
- **Store lifecycle** — activate/deactivate stores without deleting data
- **Store QR codes** — generates a QR code (JSON payload `{v:1, company, brand, store}`) for scanning during mobile app setup
- **Company portal link copying** — store portal URL for each store can be copied to clipboard

### Product Catalog (Brand-level)

- **Category management** — PRODUCT and INVENTORY category types; customizable ordering via sequence number
- **Product management** — name, price, optional delivery-platform-specific prices (FoodPanda, Grab), category assignment, image upload
- **Size modifiers** — named sizes with price modifiers; separate FoodPanda/Grab pricing; ordering
- **Add-ons** — named extras with price; separate platform pricing; ordering
- **Preferences** — brand-configurable option sets (e.g. sugar level, ice level) with a customizable label per brand; default preference designation
- **Product image management** — upload/replace/delete product images; served as static files
- **Catalog reordering** — all catalog items support manual sequence number ordering

### Inventory Management

- **Brand-level inventory templates** — define inventory item master list at brand level; automatically fanned-out to all stores in the brand
- **Store-level inventory items** — stores receive brand templates as copies; can override thresholds
- **Per-store threshold customization** — store admins can override `minStockLevel` and `expirationWarningDays` per item (marked with `*` to indicate override)
- **Daily inventory counting** — mobile app records stock counts per item; supports batch quantity entry with expiration dates for perishables
- **Expiration batch tracking** — items flagged with `requiresExpirationDate` support multi-batch count entry (quantity + expiry date per batch)
- **Inventory snapshots** — submitted inventory reports capture a full point-in-time snapshot of all item quantities
- **Inventory progression analytics** — day-over-day and weekly consumption trends from submitted reports
- **Inventory alerts** — five alert types: EXPIRED, EXPIRING_SOON, LOW_STOCK, USAGE_SPIKE, PROJECTED_STOCKOUT; each with severity levels (HIGH/MEDIUM/LOW)
- **Soft-delete items** — inventory items use tombstone pattern; historical data preserved

### Point of Sale (Mobile)

- **Product browsing** — category-filtered product grid with images; falls back to cached catalog when offline
- **Order customization** — per-product selection of size, add-ons, and preferences in a modal
- **Cart management** — quantity adjustment (+/-), swipe-to-delete; running total
- **Delivery order types** — in-store, FoodPanda, or Grab order types; switches between regular and platform-specific pricing
- **Checkout** — modal with payment method selection, optional discount (percentage chips or fixed amount), cash/change calculator, reference number, remarks
- **Payment methods** — CASH, GCash, Maya (PayMaya), Online, FoodPanda, Grab
- **Offline transactions** — transactions created offline queue in SQLite; confirmed without a receipt; synced when online
- **Transaction receipt** — post-checkout summary modal with full item breakdown
- **Discount recording** — discount amount stored on transactions; visible in reports

### Sales & Transaction Management

- **Transaction history** — full list with transaction ID, datetime, cashier, total, payment method, status
- **Transaction detail view** — line items with size/add-on/preference detail, cash received/change, reference number, remarks, discount amount
- **Transaction void workflow** — cashier requests void (requires 10+ char reason); store admin reviews in portal (approve/reject); PENDING → APPROVED/REJECTED
- **Transaction remarks editing** — store admin or cashier can add/update remarks on a transaction
- **CSV export** — transaction history exportable with all filters applied
- **Sales statistics** — daily, weekly, monthly period stats

### Expense Management

- **Expense recording** — description, amount, category (8 built-in: Supplies, Utilities, Rent, Salaries, Marketing, Maintenance, Transportation, Miscellaneous), notes
- **Expense history** — list with date, category, amount, recorder, void status
- **Expense void workflow** — same PENDING → APPROVED/REJECTED flow as transactions
- **Offline expense creation** — queued in SQLite sync engine when offline
- **CSV export** — expense history exportable

### Reporting & Analytics

- **Daily report** — today's sales total, transaction count, expenses, gross profit, margin, net revenue
- **Period analytics** — flexible period selector (today, yesterday, week, month, year, custom range) with growth % vs prior period
- **Charts** — sales trend line chart, payment method pie chart, expense category pie chart, daily composed bar+line chart, hourly time-of-day chart
- **Top products** — ranked by units sold, with revenue, avg price, % of total sales
- **Financial summary** — gross profit, profit margin, net revenue per period
- **Time-of-day analysis** — hourly transaction volume with peak hour highlight
- **Submitted daily reports** — immutable end-of-day snapshots submitted from mobile; stored with full transaction and expense lists embedded
- **Submitted inventory reports** — immutable daily stock snapshots; stored with per-item quantities and expiration batches
- **Cross-brand analytics (company-level)** — brand revenue comparison, top products by brand, top stores by revenue, network growth (cumulative stores and brands over time)
- **CSV export** — full report export (summary, payment breakdown, expenses, top products, daily sales)

### Dashboard Features

- **Platform dashboard** — total companies, brands, stores, monthly active stores
- **Company dashboard** — total brands, total stores; brand list with store counts
- **Store dashboard** — today's KPIs (sales, expenses, net revenue); monthly KPIs (transaction count, avg order value, items sold, MoM growth); top selling products table

### Staff (Employee) Management

- **Store user CRUD** — create, enable/disable, reset password for CASHIER and STORE_ADMIN roles
- **Multi-store user assignment** — assign an existing user from the company pool to an additional store
- **Cross-store access revocation** — revoke a user's access to a specific store without deleting them
- **Assignable user pool** — searchable list of company users not yet assigned to a store
- **Temporary password display** — new or reset passwords shown once in modal (not stored in UI)

### Mobile App Specific Features

- **QR-code store setup** — scan QR to configure which store the device is connected to
- **Manual store setup** — enter company/brand/store slugs manually
- **Store switching from login** — change store within same brand without full re-setup
- **Offline mode banner** — global indicator showing pending sync count and failed item count
- **Sync retry** — manual retry button for failed sync items from banner
- **Overnight date auto-refresh** — transactions/expenses/daily-report screens re-fetch when calendar date changes on app focus

### Settings & Configuration

- **Platform maintenance control** — toggle store portal, company portal, and mobile app maintenance independently
- **Company branding** — logo, 5 theme colors; applied to company portal and login screens
- **Brand branding** — logo, 5 theme colors, delivery platform enablement, custom preference label
- **Platform admin management** — create/enable/disable/delete internal Kioscify admin accounts

---

## Platform Portal Features

> **Package:** `kioscify-platform` | **Port:** 3002 | **Stack:** Next.js 15, React 19, Tailwind CSS

### Purpose

The Platform Portal is Kioscify's **internal control plane**. It is used exclusively by Kioscify's own operators to onboard franchise companies, configure their capabilities, provision brands and stores, manage user accounts, and flip maintenance switches across all customer-facing surfaces.

### User Roles

Only **PLATFORM_ADMIN** can access the portal. Any other role is immediately logged out. The portal creates and manages users of all other roles but does not expose different views based on those roles.

### Navigation

| Nav Item | Path | Purpose |
|----------|------|---------|
| Dashboard | `/dashboard` | Platform KPIs |
| Companies | `/companies` | Company management |
| Users | `/users` | Platform admin accounts |
| Settings | `/settings` | Profile + maintenance controls |

### Features

#### 1. Platform Dashboard
- **Description:** At-a-glance health of the entire platform
- **Data:** Total companies, total brands, total stores, monthly active stores (last 30 days)
- **Key Actions:** View stats; quick links to company management
- **Note (Confirmed Gap):** Marketing copy on login mentions Analytics — no analytics page or charts exist (`recharts` installed but unused)

#### 2. Company Management
- **Description:** Full lifecycle management for franchise companies
- **Key Actions:** Create company (name, slug, email, description); view all companies; navigate to company detail
- **Related Modules:** `/companies` API

#### 3. Company Detail & Configuration
- **Description:** Deep management hub for a single company across four tabs: Settings, Brands, Stores, Users
- **Key Actions:**
  - Edit company name, contact email
  - Toggle `canCreateBrands`, `canOnboardStores`, `isActive`
  - Upload company logo (5 MB max, jpeg/png/webp/gif)
  - Configure 5-color theme palette
  - Onboard first company admin (with temp password)
  - Copy company subdomain URL (`https://{slug}.kioscify.com`)
- **Related Modules:** Companies, Brands, Stores, Users APIs

#### 4. Brand Management
- **Description:** Create and configure brands under a company
- **Key Actions:** Create brand (name, slug, description); edit brand (name, description, logo, theme colors)
- **Note (Confirmed Gap):** Brand `isActive` toggle exists in API but not exposed in UI

#### 5. Store Onboarding
- **Description:** Provision new store locations under a brand
- **Key Actions:** Create store (name, slug); assign new or existing store admin; display one-time temporary password; prompt for QR code generation
- **Related Modules:** Stores API, Users API

#### 6. Store Lifecycle Management
- **Description:** Activate and deactivate existing stores
- **Key Actions:** Activate/Deactivate toggle per store in company detail Stores tab

#### 7. Store QR Code Generation
- **Description:** Device configuration QR for the mobile app
- **QR Payload:** JSON `{ v: 1, company, brand, store }` (slugs)
- **Key Actions:** View, download (PNG), print QR code
- **Component:** `StoreQRModal.tsx` using `react-qr-code`

#### 8. User Management (All Scopes)
- **Description:** Full cross-company user provisioning
- **Key Actions:**
  - Add/reset/enable/disable/delete company admins
  - Add store staff (STORE_ADMIN or CASHIER, new or existing user)
  - Assign existing users to additional stores
  - View all company users grouped by brand → store
- **Self-protection:** Cannot disable or delete own account

#### 9. Platform Admin Management
- **Description:** Internal Kioscify admin account CRUD
- **Key Actions:** Create admin; enable/disable; reset password; delete (not self)
- **Related Modules:** `/platform/admins` API

#### 10. Maintenance Mode Control
- **Description:** Global kill switches for all customer-facing surfaces
- **Key Actions:** Toggle maintenance ON/OFF independently for Store Portal, Company Portal, Mobile App
- **UI Pattern:** Optimistic toggle with rollback on error
- **Related Modules:** `/platform/maintenance-status` API

#### 11. Account Settings
- **Description:** Read-only profile for the logged-in platform admin
- **Data:** Name, username, email, role (loaded from localStorage)

### Page Inventory

| URL | Purpose | Role |
|-----|---------|------|
| `/login` | Platform admin sign-in | Public |
| `/change-password` | Mandatory first-login password change | Authenticated (first-login) |
| `/dashboard` | Platform KPI overview | PLATFORM_ADMIN |
| `/companies` | List and create companies | PLATFORM_ADMIN |
| `/companies/[id]` | Company lifecycle hub (4 tabs) | PLATFORM_ADMIN |
| `/users` | Platform admin account management | PLATFORM_ADMIN |
| `/settings` | Profile + maintenance toggles | PLATFORM_ADMIN |

---

## Company Portal Features

> **Package:** `kioscify-company` | **Port:** 3001 | **Stack:** Next.js 15, React 19, Tailwind CSS, Recharts

### Purpose

The Company Portal is the **franchise operator's management hub**, accessed via `<company-slug>.kioscify.com`. It allows company owners to define and maintain brand product catalogs, monitor cross-brand performance, configure store delivery settings, and manage company-level user accounts.

It is intentionally **not** a store operations tool — day-to-day transactions, expenses, and live inventory are managed in the Store Portal and Mobile App.

### User Roles

Only **COMPANY_ADMIN** can access the authenticated shell. The portal also has middleware-level subdomain validation for brand/company routing.

### Navigation

| Nav Item | Path | Purpose |
|----------|------|---------|
| Dashboard | `/dashboard` | Company overview |
| Brands | `/brands` | Brand list and management |
| Analytics | `/analytics` | Cross-brand performance |
| Users | `/users` | Company admin accounts |
| Settings | `/settings` | Company profile and branding |

### Special Middleware

- **Maintenance mode gate** — checks `GET /platform/maintenance-status`; rewrites all routes to `/maintenance` if enabled
- **Subdomain validation** — validates company slug on non-localhost; invalid/inactive companies redirected to generic login
- **Subdomain-aware login** — valid subdomain injects `x-company-slug` header to pre-fill and brand the login page

### Features

#### 1. Company Dashboard
- **Description:** Company-level summary at a glance
- **Data:** Total brands, total stores (sum across all brands), company name/slug; brand list with per-brand store counts
- **Key Actions:** Navigate to brand detail; create new brand (gated by `canCreateBrands` flag)

#### 2. Brand Management
- **Description:** Brand list and creation
- **Key Actions:** Create brand (name, slug, description); navigate to brand detail
- **Note:** Creation gated by `company.canCreateBrands` platform flag

#### 3. Brand Detail — Overview
- **Data:** Stat cards — store count, product count, inventory item count
- **Key Actions:** Read-only

#### 4. Brand Catalog — Products
- **Description:** Full product CRUD at the brand level (shared across all stores in the brand)
- **Key Actions:** Create, edit, delete products; upload/remove product image; assign category, sizes, add-ons, preferences
- **Form fields:** Name, price (₱), optional FoodPanda/Grab prices, category, multi-select sizes/add-ons/preferences, image upload

#### 5. Brand Catalog — Categories
- **Description:** Manage PRODUCT and INVENTORY category lists separately
- **Key Actions:** Create, edit, delete, reorder (up/down via sequence number) categories

#### 6. Brand Catalog — Sizes
- **Description:** Size modifier library for products
- **Key Actions:** Create, edit, delete, reorder; set price modifier; optional delivery-platform-specific modifiers

#### 7. Brand Catalog — Add-ons
- **Description:** Extra items that can be added to any product
- **Key Actions:** Create, edit, delete, reorder; set price; optional FoodPanda/Grab prices

#### 8. Brand Catalog — Preferences
- **Description:** Brand-configurable option sets (e.g. sugar level, ice level)
- **Key Actions:** Create, edit, delete, reorder; set default preference (star icon)
- **Config:** Custom label set in Brand Settings tab (e.g. "Sugar Level")

#### 9. Brand Inventory Templates
- **Description:** Define the brand's master inventory item list; automatically synced to all stores as copies
- **Key Actions:** Create, edit, delete templates
- **Form fields:** Name, unit, optional category (from inventory categories), min stock level, expiration tracking toggle, expiry warning days

#### 10. Store Management (within Brand)
- **Description:** Light management of stores under a brand
- **Key Actions:**
  - Rename store (inline edit)
  - Toggle FoodPanda/Grab per store (constrained by brand-level platform config)
  - Generate/download/print store QR code
  - Copy store portal link
- **Not available:** Create store, delete store, assign store users, view live sales

#### 11. Brand Settings & Branding
- **Description:** Brand-level configuration and visual identity
- **Key Actions:** Upload brand logo (5 MB max); save name/description; configure 5-color theme; enable/disable delivery platforms; set custom preference label
- **Note (Confirmed Gap):** Brand `isActive` toggle not exposed in UI

#### 12. Company Settings & Branding
- **Description:** Company profile and branding configuration
- **Key Actions:** Edit company name, contact email, description; configure 5-color theme palette; change password

#### 13. Cross-Brand Analytics
- **Description:** Aggregate performance dashboard across all brands and stores
- **Period selector:** Today, Yesterday, This Week, This Month, Last 3 Months, This Year, Custom (up to 2 years)
- **Visualizations:**

| Widget | Type | Data |
|--------|------|------|
| Overview KPIs | Stat cards | Total brands, total stores, active stores |
| Top Brands | Horizontal bar chart + table | Units sold, store count per brand |
| Top Products | Ranked list | Units sold; filterable by brand |
| Top Stores | Ranked list | Transaction volume |
| Network Growth | Line chart | Cumulative stores & brands over time |

#### 14. Company User Management
- **Description:** COMPANY_ADMIN account lifecycle
- **Key Actions:** Create new company admin; enable/disable; reset password (shows one-time temp password); remove pending (first-login) accounts
- **Self-protection:** Cannot action own account

### Page Inventory

| URL | Purpose | Role |
|-----|---------|------|
| `/login` | Company admin sign-in (subdomain-aware) | Public |
| `/change-password` | Mandatory or voluntary password change | Authenticated |
| `/maintenance` | Maintenance page | Public (middleware rewrite) |
| `/invalid-subdomain` | Error page for invalid slugs | Public |
| `/dashboard` | Company overview | COMPANY_ADMIN |
| `/brands` | Brand list and creation | COMPANY_ADMIN |
| `/brands/[brandId]` | Brand command center (9 tabs) | COMPANY_ADMIN |
| `/analytics` | Cross-brand analytics | COMPANY_ADMIN |
| `/users` | Company admin management | COMPANY_ADMIN |
| `/settings` | Company profile and branding | COMPANY_ADMIN |

---

## Store Portal Features

> **Package:** `kioskly-admin` | **Port:** 3000 | **Stack:** Next.js 15, React 19, Tailwind CSS, Recharts

### Purpose

The Store Portal is the **daily operational command center for a single store** (or a set of stores for multi-store admins). It is a monitoring and approval dashboard — sales, expenses, inventory, and reports are all *created* on the mobile app and *reviewed/approved* here.

### User Roles

| Role | Access | Notes |
|------|--------|-------|
| STORE_ADMIN | Full access | Primary intended role |
| ADMIN | Full access | Legacy alias, treated identically to STORE_ADMIN |
| CASHIER | Blocked | Mobile app only |
| COMPANY_ADMIN | Blocked | Uses Company Portal |
| PLATFORM_ADMIN | Blocked | Uses Platform Portal |

### Navigation

| Nav Item | Path |
|----------|------|
| Dashboard | `/dashboard` |
| Transactions | `/transactions` |
| Expenses | `/expenses` |
| Reports | `/reports` |
| Submitted Reports | `/submitted-reports` |
| Inventory | `/inventory` |
| Inventory Reports | `/inventory-reports` |
| Inventory Progression | `/inventory-progression` |
| Inventory Alerts | `/inventory-alerts` |
| Users | `/users` |
| Settings | `/settings` |

### Special Middleware

- **Maintenance mode gate** — checks `GET /platform/maintenance-status`; rewrites all routes to `/maintenance` if enabled
- **Subdomain URL rewriting** — `/{company}/{brand}[/{store}]` paths rewritten internally; users see brand-specific login URL
- **Multi-store login flow** — post-login store picker when user has 2+ stores

### Features

#### 1. Store Dashboard
- **Description:** At-a-glance KPIs for today and the current month
- **Today's data:** Sales total, expenses, net revenue (clickable to drill-down modals)
- **Monthly data:** Total sales, transaction count, avg order value, items sold, MoM growth %
- **Monthly financial:** Expenses, gross profit, profit margin, net revenue
- **Top selling products table:** Rank, name, category, qty sold, revenue, avg price, % of total sales
- **Key Actions:** Click stat cards → open transaction or expense drill-down modal

#### 2. Transaction History & Monitoring
- **Description:** Full history of all sales transactions for the store
- **Filters:** Search (debounced), date range, payment status, payment method
- **Data:** Transaction ID, datetime, cashier, total, payment method, payment status
- **Detail view:** Line items with size/add-on/preference, cash received/change, reference number, remarks, discount, void audit trail
- **Key Actions:** View detail; export filtered list as CSV

#### 3. Transaction Void Approval Workflow
- **Description:** Approve or reject void requests submitted by cashiers from the mobile app
- **Workflow:** Cashier submits void request → PENDING badge appears → Admin approves (confirm dialog) or rejects (optional reason) → APPROVED/REJECTED
- **Audit trail:** Requester, reviewer, timestamps, reason, rejection reason all visible in detail view

#### 4. Expense History & Monitoring
- **Description:** Full history of business expenses recorded on the mobile app
- **Filters:** Search, expense category, date range
- **Data:** Description, date, amount, category, recorded-by, void status
- **Key Actions:** View detail; export as CSV; approve/reject void requests (identical pattern to transactions)

#### 5. Reports & Analytics
- **Description:** Full analytical deep-dive into store performance
- **Period selector:** Today, Yesterday, This Week, This Month, This Year, Custom Range
- **KPI cards:** Total sales (+ growth %), transaction count, avg order value, gross profit (+ margin %)
- **Charts:**

| Chart | Type | Data |
|-------|------|------|
| Sales trend | Line chart | Daily revenue over period |
| Payment methods | Pie chart | Revenue split by method |
| Expense categories | Pie chart | Spend split by category |
| Daily sales | Composed bar + line | Revenue + transaction count |
| Time-of-day | Hourly bar + line | Volume by hour with peak highlight |

- **Additional sections:** Sales by payment method cards; top products table; expense summary; financial summary
- **Key Actions:** Export full report as CSV (summary + payment + expenses + top products + daily sales); drill-down to transaction/expense modals

#### 6. Submitted Daily Reports
- **Description:** Immutable end-of-day snapshots submitted from the mobile app
- **Data:** Report date, submitted at, submitter, total sales, gross profit
- **Detail view:** Period covered, summary (profit/margin/net), full sales snapshot, full expense snapshot, complete transaction and expense lists
- **Filters:** Submission date range
- **Key Actions:** View detail only — no create/edit/approve

#### 7. Inventory Monitoring & Configuration
- **Description:** View current stock levels and configure store-specific alert thresholds
- **Overview tab:** Stats (total items, low stock alerts, needs counting, category count); low stock alerts by category; latest inventory counts; expiration batch display
- **Items tab:** Inventory item list with configurable min stock level and expiration warning days (store overrides marked with `*`)
- **Key Actions:** Edit and save inventory thresholds; view stock status
- **Note:** Inventory counting happens on mobile app only

#### 8. Inventory Reports
- **Description:** History of submitted daily inventory snapshots from mobile app
- **Data:** Date, submitter, item count; detail modal with full per-item snapshot table
- **Key Actions:** View detail; quick navigation to Progression and Alerts pages

#### 9. Inventory Progression
- **Description:** Consumption trend analysis from daily inventory snapshots
- **View modes:** Day-over-Day (30 days), Weekly Trend (12 weeks)
- **Per item data:** Total consumption, avg daily/weekly consumption, days tracked, quantity changes, % change, consumption amounts

#### 10. Inventory Alerts
- **Description:** Proactive stock issue monitoring across all inventory items
- **Alert types:** EXPIRED, EXPIRING_SOON, LOW_STOCK, USAGE_SPIKE, PROJECTED_STOCKOUT
- **Severity:** HIGH / MEDIUM / LOW per alert
- **Type-specific metrics:** Shortfall amounts, spike %, days until stockout, expiration dates
- **Key Actions:** Filter by alert type — no resolve/dismiss actions in portal

#### 11. Store User Management
- **Description:** Staff account lifecycle for the current store
- **Data:** Name, username, email, role, active status, multi-store assignment badge, pending first-login indicator
- **Key Actions (STORE_ADMIN):**
  - Create new user (CASHIER or STORE_ADMIN) → shows one-time temporary password
  - Assign existing user from company pool (cross-store multi-store assignment)
  - Enable/Disable account
  - Reset password → shows one-time temporary password
  - Remove pending (first-login incomplete) user
  - Revoke access for cross-store assigned users
- **Self-protection:** Cannot action own account

#### 12. Multi-Store Switching
- **Description:** For admins with access to multiple stores — switch active store context
- **Key Actions:** Sidebar store switcher → issues new JWT scoped to target store → redirects to dashboard
- **Post-login:** Automatic store picker screen when user has 2+ accessible stores

#### 13. Account Settings
- **Description:** Read-only business info and password management
- **Data:** Store name, slug, created date; account username, email, role badge
- **Key Actions:** Change password (current, new, confirm; min 10 chars)

### Page Inventory

| URL | Purpose | Role |
|-----|---------|------|
| `/login` | Brand-aware staff sign-in | Public |
| `/tenant-setup` | Deprecated — redirects to `/login` | — |
| `/store-picker` | Multi-store selection post-login | Authenticated |
| `/change-password` | Forced/voluntary password change | Authenticated |
| `/maintenance` | Maintenance page | Public |
| `/dashboard` | Store KPI overview | STORE_ADMIN |
| `/transactions` | Transaction history + void approvals | STORE_ADMIN |
| `/expenses` | Expense history + void approvals | STORE_ADMIN |
| `/reports` | Analytics + charts | STORE_ADMIN |
| `/submitted-reports` | Daily snapshot report history | STORE_ADMIN |
| `/inventory` | Stock monitoring + threshold config | STORE_ADMIN |
| `/inventory-reports` | Inventory snapshot history | STORE_ADMIN |
| `/inventory-progression` | Consumption trend analysis | STORE_ADMIN |
| `/inventory-alerts` | Proactive stock issue monitoring | STORE_ADMIN |
| `/users` | Staff management | STORE_ADMIN |
| `/settings` | Account settings | STORE_ADMIN |
| `/products` | Deprecation stub (brand-level now) | STORE_ADMIN |
| `/categories` | Deprecation stub | STORE_ADMIN |
| `/sizes` | Deprecation stub | STORE_ADMIN |
| `/addons` | Deprecation stub | STORE_ADMIN |

---

## Kiosk App / Staff App Features

> **Package:** `kioskly-app` | **Platform:** React Native / Expo SDK 54 | **Routing:** Expo Router

### Purpose

The Kioscify mobile app is the **field operations tool for cashiers and store managers**. It handles all operational writes: orders, expenses, inventory counts, and end-of-day reports. It is **offline-first** — designed to continue operating even when internet connectivity is lost.

### User Roles

| Role | Supported | Notes |
|------|-----------|-------|
| STORE_ADMIN | Yes | Full feature set |
| CASHIER | Yes | Same UI — no role gating in screens |
| ADMIN (legacy) | Yes | Treated as store role |
| COMPANY_ADMIN / PLATFORM_ADMIN | Display-only | Not intended mobile users |

> **Important:** There is no role-based UI access control in the mobile app. Any authenticated store user can use POS, add expenses, submit reports, and request voids.

### Provider Tree

```
GestureHandlerRootView
  └── TenantProvider
        └── AuthProvider
              └── SyncProvider
                    └── OfflineBanner + Stack navigator
```

### Screens

| Screen | Route | Purpose |
|--------|-------|---------|
| Root Layout | `_layout.tsx` | App shell, DB init, maintenance check |
| Store Setup | `/tenant-setup` | First-time company/brand/store binding |
| Login | `/` (index) | Staff authentication |
| Store Picker | `/store-picker` | Multi-store selection |
| Change Password | `/change-password` | Forced or voluntary password change |
| Home (POS) | `/home` | Main point-of-sale interface |
| Transactions | `/transactions` | Today's sales history |
| Expenses | `/expenses` | Expense recording and history |
| Inventory | `/inventory` | Daily stock counting |
| Daily Report | `/daily-report` | End-of-day report view and submission |
| Settings | `/settings` | Account and business info |

### App Launch Flow

```
App Launch
  └─ Maintenance check (GET /platform/maintenance-status)
       ├─ mobileAppMaintenance: true → MaintenanceScreen
       └─ false → initialize SQLite
            └─ Tenant in AsyncStorage?
                 ├─ No → /tenant-setup
                 └─ Yes → /index (Login)
                           └─ Authenticated?
                                ├─ mustChangePassword → /change-password
                                ├─ Multiple stores → /store-picker
                                └─ Single store → /home (POS)
```

### Features

#### 1. Store Setup (QR & Manual)
- **Description:** One-time device binding to a specific store
- **QR scan:** `expo-camera` scans JSON `{ v: 1, company, brand, store }` — validates against API, persists to AsyncStorage
- **Manual entry:** Enter company slug, brand slug, store ID
- **Offline Support:** Requires network to resolve store

#### 2. Authentication & Session Management
- **Description:** Staff login with store branding, multi-store support, forced password change
- **Features:** Branded UI (logo, primary color); change store within same brand; change company/brand (full reset); accessible stores persisted
- **AsyncStorage keys:** `@kioscify:auth_token`, `@kioscify:user`, `@kioscify:accessible_stores`
- **Offline Support:** Login requires network; session survives app restart from storage

#### 3. POS — Product Browsing
- **Description:** Browse the brand's product catalog by category
- **Features:** Category sidebar, product grid with images, delivery order type selector
- **Order types:** In-store, FoodPanda, Grab (shown when delivery platforms enabled for store)
- **Offline Support:** Catalog loaded from AsyncStorage cache (`@kioscify:cache:products`, `:categories`)

#### 4. POS — Order Customization
- **Description:** Per-product customization before adding to cart
- **Features:** Size selection (with price modifier), multi-select add-ons, preferences (brand-labeled, e.g. "Sugar Level")
- **Delivery pricing:** FoodPanda/Grab-specific prices applied when order type selected

#### 5. POS — Cart & Order Management
- **Description:** Manage items in the current order
- **Features:** Quantity adjust (+/-), swipe-to-delete (gesture handler), running total; switching order type with items in cart prompts to clear

#### 6. Checkout & Payment Recording
- **Description:** Complete an order and record the payment
- **Payment methods:** Cash, GCash, Maya (PayMaya), Online, FoodPanda, Grab
- **Discount options:** Percentage chips (5%–50%) or custom fixed amount in ₱
- **Cash calculator:** Quick-amount chips + auto-calculates change
- **Reference number:** Required for non-cash payments
- **Remarks:** Optional free-text notes on order
- **Offline Support:** Transaction created offline → queued in SQLite → confirmation shown without receipt

#### 7. Transaction Receipt
- **Description:** Post-checkout summary for successful online transactions
- **Data:** Full item breakdown (sizes, add-ons, preferences), discount, payment method, cash/change, reference number
- **Key Action:** "Start New Order" clears cart

#### 8. Transaction History & Void Requests
- **Description:** View today's sales and submit void requests
- **Features:**
  - List of today's transactions with pending-sync badges
  - Full detail view (line items, payment, void status)
  - **Edit remarks** on any transaction (`PATCH /transactions/:id`)
  - **Request void** with required reason (min 10 chars)
  - View void status: PENDING / APPROVED / REJECTED with full audit trail
- **Offline Support:** Cached + pending-queue transactions merged in list; void requests and remarks edits require network

#### 9. Expense Recording & Review
- **Description:** Log and review today's business expenses
- **Categories:** Supplies, Utilities, Rent, Salaries, Marketing, Maintenance, Transportation, Miscellaneous
- **Features:** Add expense (description, amount, category, notes); request void on expenses; pending sync badges
- **Offline Support:** Create expense queued offline; list merges cache + pending queue

#### 10. Daily Inventory Counting
- **Description:** Record daily stock counts with expiration batch tracking
- **Features:**
  - Items grouped by category; progress counter ("X / Y counted")
  - Tap item → bottom sheet for quantity entry
  - **Expiration-tracked items:** Enter per-batch quantities + expiry dates; pre-filled from last submitted report
  - Submit full snapshot to server (duplicate-day prompt if report exists)
- **Offline Support:** Items loaded from cache; submission queued offline

#### 11. Daily Report View & Submission
- **Description:** End-of-day aggregated report review and submission to the platform
- **Data:** Gross profit, sales totals, payment breakdown, expense breakdown, full transaction and expense lists
- **Offline fallback:** Computes report locally from cache + pending queue if API unreachable
- **Smart submission:** Syncs all pending items first; resolves pending transaction/expense client IDs to server IDs before submitting report
- **Offline Support:** Full local computation + submission queued offline

#### 12. Settings
- **Description:** Read-only session and business context
- **Data:** Account info (name, username, email, role), business info (company, brand, store, address, contact), app version from `expo-constants`
- **Key Actions:** Navigate to Change Password screen

#### 13. Offline Sync Engine
- **Description:** SQLite-backed write queue for all offline operations
- **Queue item types:** `transaction`, `expense`, `inventory_record`, `submitted_report`, `submitted_inventory_report`
- **Lifecycle:** `pending` → `syncing` → `synced` | `failed` (max 5 retries)
- **Deduplication:** Each item has `clientId` (UUID v4); server `409 Conflict` treated as success
- **Smart behaviors:**
  - Original sale timestamp preserved (not sync time)
  - Display-only fields stripped before API sync
  - HTTP 429 retried without consuming retry budget
  - HTTP 5xx retried with increment
  - HTTP 400 failed items auto-reset for re-attempt
  - Synced items older than 7 days auto-pruned
  - Submitted report IDs resolved from pending client IDs after component items sync
- **Sync triggers:** App launch, network reconnect, app foreground, manual retry from banner, explicit pre-report sync call

#### 14. Theme & Branding Customization
- **Applied from:** Brand theme → store theme → company theme → default orange (`#ea580c`)
- **Themed elements:** Login background/buttons, sidebar, product grid CTAs, logo
- **Dynamic configuration:** `enabledDeliveryPlatforms` controls order type visibility; `preferenceLabel` customizes preference option label

### Offline Capability Summary

| Feature | Offline Behavior |
|---------|-----------------|
| POS catalog browse | Cached categories/products |
| Create transaction | Queued in SQLite; confirmation without receipt |
| Create expense | Queued; shown in list with pending badge |
| View today's transactions/expenses | Cache + pending queue merged |
| Daily report view | Locally computed from cache + pending |
| Submit daily report | Queued with pending ID references |
| Submit inventory report | Queued |
| View inventory items | Cached latest inventory |
| Login / tenant setup | Requires network |
| Void requests | Requires network |
| Edit transaction remarks | Requires network |

---

## Permission Matrix

| Feature | Platform Portal | Company Portal | Store Portal | Mobile App |
|---------|:--------------:|:--------------:|:------------:|:----------:|
| **User & Access Management** | | | | |
| Platform admin CRUD | ✅ | — | — | — |
| Company admin CRUD | ✅ | ✅ (own) | — | — |
| Store staff CRUD | ✅ | — | ✅ | — |
| Multi-store user assignment | ✅ | — | ✅ | — |
| Password reset (any user) | ✅ | ✅ (own co.) | ✅ (own store) | — |
| Self password change | ✅ | ✅ | ✅ | ✅ |
| **Company & Franchise** | | | | |
| Company CRUD | ✅ | Partial (own) | — | — |
| Company capabilities control | ✅ | — | — | — |
| Brand management | ✅ | ✅ | — | — |
| Store onboarding | ✅ | ✅ (if allowed) | — | — |
| Store activation/deactivation | ✅ | — | — | — |
| Store QR generation | ✅ | ✅ | — | QR scan only |
| Maintenance mode toggle | ✅ | — | — | — |
| **Product Catalog** | | | | |
| Product CRUD | ✅ | ✅ | Stub (deprecated) | Read-only |
| Category / Size / Addon CRUD | ✅ | ✅ | Stub (deprecated) | Read-only |
| Preference CRUD | ✅ | ✅ | — | Read-only |
| Product image management | ✅ | ✅ | — | — |
| **Inventory** | | | | |
| Inventory template management | ✅ | ✅ | — | — |
| Inventory threshold configuration | — | — | ✅ | — |
| Daily inventory counting | — | — | — | ✅ |
| Inventory reports (view) | — | — | ✅ | — |
| Inventory alerts | — | — | ✅ | — |
| Inventory progression | — | — | ✅ | — |
| **POS & Transactions** | | | | |
| POS / Order taking | — | — | — | ✅ |
| Checkout / Payment recording | — | — | — | ✅ |
| Transaction history (view) | — | — | ✅ | ✅ (today) |
| Transaction void approval | — | — | ✅ | — |
| Transaction void request | — | — | — | ✅ |
| Transaction remarks edit | — | — | — | ✅ |
| Transaction CSV export | — | — | ✅ | — |
| **Expenses** | | | | |
| Expense recording | — | — | — | ✅ |
| Expense history (view) | — | — | ✅ | ✅ (today) |
| Expense void approval | — | — | ✅ | — |
| Expense void request | — | — | — | ✅ |
| Expense CSV export | — | — | ✅ | — |
| **Reporting & Analytics** | | | | |
| Store dashboard KPIs | — | — | ✅ | — |
| Store analytics / charts | — | — | ✅ | — |
| Submitted daily reports (view) | — | — | ✅ | — |
| Submitted daily report creation | — | — | — | ✅ |
| Submitted inventory reports (view) | — | — | ✅ | — |
| Submitted inventory report creation | — | — | — | ✅ |
| Daily report local computation | — | — | — | ✅ |
| Cross-brand analytics | — | ✅ | — | — |
| Platform dashboard KPIs | ✅ | — | — | — |
| **Offline** | | | | |
| Offline operation | — | — | — | ✅ |
| SQLite sync queue | — | — | — | ✅ |

---

## Hidden / Undocumented Features

The following capabilities exist in code but are not fully exposed in any UI, are undocumented, or represent hidden infrastructure.

### 1. Activity Feed API — Confirmed: backend only
`GET /platform/activity` returns companies and stores created in the last 30 days. Fully implemented in `PlatformService` but **never called** by any portal — no activity feed UI exists.

### 2. Paginated Companies Endpoint — Confirmed: orphaned
`GET /platform/companies?page=&limit=` provides paginated company listing. The Platform Portal uses the unpaginated `GET /companies` instead. This endpoint is unreachable from any current UI.

### 3. Revenue Fields in Analytics Not Rendered — Confirmed: data gap
The API returns `totalRevenue` and `transactionCount` on `TopStoreItem` and `TopProductItem` analytics objects. These fields are typed in the Company Portal's TypeScript types but **never rendered** in any widget — only units sold are shown.

### 4. Store User Assignment API in Company Portal — Confirmed: wired but no UI
`assignUserToStore`, `revokeStoreAccess`, `getStoreUsers`, `searchUsersInCompany` are all implemented in `kioscify-company/lib/api.ts` but **no screens** exist to invoke them. Store staff management from the company portal is absent.

### 5. `canOnboardStores` Flag — Confirmed: partially implemented
The `Company` model has a `canOnboardStores` flag that Platform Admins can toggle. The Company Portal type includes it but **never checks it** — there is no store onboarding UI in the Company Portal regardless of the flag value.

### 6. Brand `isActive` Toggle — Confirmed: API supports, UI missing
The brands API supports activating/deactivating brands. Neither portal exposes an activate/deactivate toggle for brands in any screen.

### 7. Redis JWT Blacklist — Confirmed: implemented, invisible to users
On logout, the JWT's `jti` is blacklisted in Redis until token expiry. Stolen or leaked tokens cannot be reused after a user logs out. Not documented anywhere in the product.

### 8. Internal `AuthService.register()` — Confirmed: dead code
A `register()` method and corresponding `RegisterDto` exist in the Auth module. No HTTP endpoint exposes this method — onboarding uses `/onboard-admin` instead. Orphaned from an earlier architecture.

### 9. Offline Sale Timestamp Preservation — Confirmed: implemented
Transactions created offline record the `timestamp` at checkout time in the SQLite queue. When synced, the original checkout time is sent to the API (not the sync time). Offline sales appear correctly in time-based reports.

### 10. Sync Engine ClientId Deduplication Chain — Confirmed: sophisticated
All offline-queueable entities carry a `clientId` (UUID v4). The API deduplicates on this field — the sync engine treats `409 Conflict` as success. This prevents phantom duplicate data on reconnect even if the network dropped mid-request.

### 11. Submitted Report with Pending ID Resolution — Confirmed: undocumented
When a submitted daily report is queued offline and it references transactions/expenses that were also queued offline, the sync engine first syncs those items, resolves their server-assigned IDs, then syncs the report with correct server IDs. This multi-step dependency resolution is handled transparently.

### 12. Delivery Platform Dual-Pricing System — Confirmed: implemented
Products, sizes, and add-ons all have `foodpandaPrice` and `grabPrice` fields independent of the regular price. The mobile POS switches to platform-specific prices when FoodPanda or Grab order type is selected. `FOODPANDA` and `GRAB` are also valid payment methods. This entire system is implemented but not documented in any product-facing material.

### 13. Seed Script Missing — Confirmed: broken
`package.json` references `prisma/seed.ts` in the `prisma.seed` npm script. This file **does not exist**. Running `npm run prisma:seed` will fail.

### 14. `UPLOAD_PATH` Environment Variable — Confirmed: documented but ignored
`CLAUDE.md` and `.env.example` document `UPLOAD_PATH` as configurable. The NestJS controllers hardcode `./uploads` as the upload destination. Setting `UPLOAD_PATH` has no effect.

### 15. `DailyReportModal` Unused Component — Confirmed: dead code
`components/DailyReportModal.tsx` exists in the mobile app but is never imported or used. The daily report was promoted to a dedicated full screen (`daily-report.tsx`).

### 16. `data/mockData.ts` — Confirmed: legacy orphan
The mobile app's `data/mockData.ts` contains a hardcoded product catalog (lemonade/calamansi menu). The POS loads from the API — only `TransactionSummary.tsx` imports types from this file. A legacy artifact.

### 17. `x-company-slug` CORS Header — Confirmed: partially used
The API's CORS config allows the `x-company-slug` request header. The Company Portal and Store Portal middlewares inject it for branded login page pre-fill. No API endpoint reads it server-side — it is used only for public store/company branding lookup.

### 18. Reactotron Debug Integration — Confirmed: dev tooling
The mobile app has `ReactotronConfig.ts` and a safe wrapper that logs network requests and AsyncStorage to Reactotron in development builds. Invisible in production.

### 19. Platform Dashboard Deep-Link Bug — Confirmed: broken
The Platform Portal dashboard links to `/companies?action=create`. The companies page never reads this query parameter — the create modal does not auto-open. This is a broken deep-link.

### 20. Password Policy Inconsistency — Confirmed: inconsistent
The Company Portal's `/change-password` screen enforces a 10-character minimum. The Settings page change-password form in the same portal enforces only 8 characters. The API enforces 10 characters with complexity requirements. The Settings page is out of sync.

---

## Recommendations

### Missing Documentation

1. **API documentation is outdated** — `TENANT_API_EXAMPLES.md` references the old `/tenants` endpoint and an incorrect login request body. The migration to Company/Brand/Store hierarchy is undocumented.
2. **README files are stale** — `kioskly-admin` README still documents product/category CRUD pages and port 3001; both are incorrect.
3. **Delivery platform dual-pricing is undocumented** — no user-facing documentation explains how FoodPanda/Grab pricing works or how to configure it.
4. **Offline sync behavior has no in-app help** — the sync engine is sophisticated but invisible to users beyond the banner count.
5. **AsyncStorage key naming inconsistency** — legacy docs reference `@kioskly:` prefix; live code uses `@kioscify:` prefix. Old `AUTH_INTEGRATION.md` and `IMPLEMENTATION_SUMMARY.md` are misleading.

### Incomplete Features

1. **Platform analytics** — Login page markets "Analytics" as a feature. No analytics page exists. `recharts` and `date-fns` are installed and unused in `kioscify-platform`.
2. **Company portal store staff management** — Full API client is wired (`assignUserToStore`, `revokeStoreAccess`, `getStoreUsers`, `searchUsersInCompany`) but no UI exists. Company owners cannot manage store staff without giving store managers direct portal access.
3. **Activity feed** — `GET /platform/activity` is built and returning data but never surfaced in any portal.
4. **Brand activation/deactivation** — The API supports it; neither portal exposes the toggle.
5. **Store Portal settings** — README mentions logo upload and theme editing; these are not implemented. Settings is read-only.
6. **Void alert notifications** — No push notification, email, or in-portal notification badge alerts store admins to pending void requests. Admins must poll the Void Requests tab manually.
7. **`canOnboardStores` not enforced in Company Portal** — The flag exists at the data model and Platform Portal level but has no effect in the Company Portal.

### Dead Code

| Item | Location | Status |
|------|----------|--------|
| `AuthService.register()` + `RegisterDto` | `kioskly-api/src/auth/` | Orphaned — no HTTP endpoint |
| `data/mockData.ts` | `kioskly-app/data/` | Legacy catalog — unused |
| `DailyReportModal.tsx` | `kioskly-app/components/` | Superseded by full screen |
| `prisma/seed.ts` | `kioskly-api/prisma/` | Referenced in npm script but file missing |
| `recharts`, `date-fns`, `clsx`, `tailwind-merge` | `kioscify-platform/package.json` | Installed, never imported |
| `getBrandById`, `getStoresByBrand` | `kioscify-platform/lib/api.ts` | Methods exist, never called from UI |
| Product/category/size/addon CRUD methods | `kioskly-admin/lib/api.ts` | UI pages removed, service methods remain |
| `createInventoryRecord`, `bulkCreateInventoryRecords` | `kioskly-admin/lib/api.ts`, `kioskly-app/services/` | Service layer exists, no UI paths |
| `expenseService` update/delete/stats | `kioskly-app/services/expenseService.ts` | Implemented, no screens invoke them |
| `submittedInventoryReportService` progression/alerts | `kioskly-app/services/` | Implemented, not wired to any screen |
| `createTransaction()` direct (non-offline) | `kioskly-app/services/transactionService.ts` | Superseded by `createTransactionOffline` |

### Product Opportunities

1. **Void request push notifications** — Notify store admins via push or email when a cashier submits a void request. The approval workflow currently has no alert mechanism.
2. **Real-time sales dashboard** — WebSocket-based live sales updates would improve monitoring value for busy stores.
3. **Platform revenue analytics** — The Platform Portal could show MRR, company growth, store count trends, and churn using data already in the system.
4. **Company portal store onboarding** — The permissions infrastructure (`canOnboardStores`) is already built. Building the UI would give franchise owners self-service store provisioning.
5. **Brand-level performance drill-down** — The Company Portal shows aggregate analytics. Per-brand daily/weekly/monthly breakdowns would increase value for multi-brand operators.
6. **Inventory receiving / stock intake** — The system tracks outgoing consumption (depletion via counting). There is no intake/receiving workflow to log new stock arrivals at a store.
7. **Cash management / shift reconciliation** — The system records individual transactions but has no opening float, cash drawer, or shift-close reconciliation concept beyond the end-of-day report.
8. **Customer management & loyalty** — No customer record or repeat-customer system exists. Customer profiles would enable order history and loyalty discounts.
9. **Thermal receipt printing** — The mobile app shows a digital receipt but has no ESC/POS or thermal printer integration.
10. **Product availability toggling** — Temporarily marking a product as unavailable without deleting it from the catalog is a standard F&B operational need not yet implemented.

### Partially Implemented Features

| Feature | Status |
|---------|--------|
| Revenue in analytics widgets | `totalRevenue` + `transactionCount` returned by API, typed in frontend, but **not rendered** in Company Portal widgets |
| Per-store delivery platform overrides | Data model + Company Portal UI support it; Store Portal and mobile rely on brand-level setting only |
| Dashboard create deep-link | Platform Portal dashboard links `/companies?action=create`; companies page ignores query param |
| Password policy consistency | Company Portal: change-password enforces 10 chars; settings page enforces 8 chars; should both match API's 10-char policy |
| `requiresExpirationDate` in brand templates | UI form collects this field; `api.ts` payload in Company Portal omits it — may be silently dropped |
| Company portal `canOnboardStores` | Flag in data model and toggled from Platform Portal; never checked in Company Portal UI |
