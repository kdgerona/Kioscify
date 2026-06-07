# Company Portal Analytics — Design Spec

**Date:** 2026-06-06  
**Feature:** Analytics page for the Kioscify company portal  
**Route:** `<slug>.kioscify.localhost:3001/analytics`

---

## Context

Company admins run franchise businesses with multiple brands and stores. The analytics page gives them a bird's-eye view of how their franchise network is structured, growing, and performing — without exposing individual store-level operational data (sales ledgers, inventory levels, expense details). All metrics are aggregated at the company or brand level.

---

## Layout & Widgets

### Date Range Selector
Top-of-page filter bar. Options:
- Today / Yesterday / This Week / This Month / Last 3 Months / This Year / Custom (date picker, max 2-year span)

Changing the range re-fetches all widgets in parallel. Each widget manages its own loading and error state independently.

### Row 1 — KPI Cards (3 cards)
| Card | Value |
|---|---|
| Total Brands | Count of brands belonging to the company |
| Total Stores | Count of stores (tenants) belonging to the company |
| Active Stores | Stores with at least 1 non-voided transaction in the selected period |

### Row 2 — Top Brands
Horizontal bar chart + ranked table side by side. Brands ranked by aggregate revenue (sum of non-voided transaction amounts across all their stores) within the selected period. Shows: brand name, total revenue, store count, transaction count.

### Row 3 — Two columns
**Left — Top Selling Products (per brand)**  
Brand selector dropdown at the top. Shows top products ranked by units sold within the selected brand's stores for the selected period. Fields: product name, units sold, total revenue. No cross-brand mixing.

**Right — Top Stores**  
Stores ranked by aggregate revenue across the company, with brand label. Shows: store name, brand name, total revenue, transaction count.

### Row 4 — Network Growth Chart
Line chart (recharts) showing store count and brand count over time. Bucketed automatically:
- Today / Yesterday → by hour
- This Week / This Month → by day
- Last 3 Months → by week
- This Year / Custom (>3 months) → by month

---

## API Design

New `analytics` NestJS module in `kioskly-api`. All endpoints under `GET /api/v1/analytics/company/*`. All require `JwtAuthGuard` + `@Roles('COMPANY_ADMIN')`. `companyId` extracted from JWT via `@CompanyId()` decorator. Date range passed as `?startDate=&endDate=` ISO string query params. Voided transactions (`voidStatus: APPROVED`) excluded from all revenue aggregations.

| Endpoint | Response shape |
|---|---|
| `GET /analytics/company/overview` | `{ totalBrands, totalStores, activeStores }` |
| `GET /analytics/company/top-brands` | `{ brandId, brandName, totalRevenue, storeCount, transactionCount }[]` |
| `GET /analytics/company/top-products?brandId=` | `{ productId, productName, unitsSold, totalRevenue }[]` |
| `GET /analytics/company/top-stores` | `{ storeId, storeName, brandName, totalRevenue, transactionCount }[]` |
| `GET /analytics/company/growth` | `{ date, storeCount, brandCount }[]` |

---

## Frontend Structure

All new files inside `kioscify-company/app/(main)/analytics/`. Follows existing patterns: client components, `useEffect` + `useState`, Axios via `lib/api.ts`, Tailwind + lucide-react + recharts.

```
app/(main)/analytics/
├── page.tsx                    # Orchestrator — owns dateRange state, renders all widgets
└── components/
    ├── DateRangePicker.tsx     # Dropdown + custom date inputs
    ├── OverviewCards.tsx       # 3 KPI cards
    ├── TopBrandsWidget.tsx     # Bar chart + ranked table
    ├── TopProductsWidget.tsx   # Brand selector + ranked product list
    ├── TopStoresWidget.tsx     # Ranked store list with brand label
    └── NetworkGrowthChart.tsx  # Line chart (recharts)
```

New methods added to `lib/api.ts`:
- `getAnalyticsOverview(startDate, endDate)`
- `getTopBrands(startDate, endDate)`
- `getTopProducts(brandId, startDate, endDate)`
- `getTopStores(startDate, endDate)`
- `getNetworkGrowth(startDate, endDate)`

---

## Data Scoping & Privacy

- All backend queries are scoped to `companyId` from the JWT — a company admin can never see data from another company.
- No individual store transaction or inventory detail is exposed to the frontend. Only aggregated totals are returned.
- Top Stores ranking shows aggregate revenue per store but does not expose individual transactions, payment methods, expense breakdowns, or inventory.

---

## Verification

1. Start API (`npm run api:dev`) and company portal (`npm run company:dev`).
2. Log in as a COMPANY_ADMIN at `marajoy.kioscify.localhost:3001`.
3. Navigate to `/analytics`.
4. Verify KPI cards show correct brand/store counts matching the database.
5. Switch date ranges — verify all 5 widgets re-fetch and show updated data.
6. Verify Top Products brand selector filters products to the selected brand only.
7. Verify voided transactions are excluded from all revenue figures.
8. Verify a STORE_ADMIN or CASHIER JWT cannot access any `/analytics/company/*` endpoint (should get 403).
9. Test custom date range with a span near the 2-year maximum.
