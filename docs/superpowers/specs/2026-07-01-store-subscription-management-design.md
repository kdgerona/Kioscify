# Store Subscription Management (Platform Admin)

**Date:** 2026-07-01
**Status:** Approved
**Portals:** kioscify-platform (Platform Admin), kioskly-api

## Overview

Payment for Kioscify is still collected manually (outside the platform), per Store. Platform Admin currently has no way to track which stores have paid for a given month, when a store's billing actually started, or how many onboarded stores are actually activated/paying. This adds a lightweight, manual subscription-tracking feature: a per-store activation date, a rolling monthly paid/unpaid checklist, and an analytics overview — with no payment processing, invoicing, or automated billing involved.

## Scope

- Subscriptions are tracked **per Store (Tenant)**, not per Company.
- Payment status is a manual checklist the platform admin updates by hand — no integration with a payment processor.
- Out of scope: revenue/currency totals, automated recurring billing, notifications/reminders, company- or store-side visibility (this is platform-internal only).

## Data model

Two new Prisma models, both scoped to `Tenant`:

```prisma
model StoreSubscription {
  id          String    @id @default(auto()) @map("_id") @db.ObjectId
  tenantId    String    @unique @db.ObjectId
  activatedAt DateTime? // null = pending activation, no billing yet
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  tenant      Tenant                 @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  payments    SubscriptionPayment[]

  @@map("store_subscriptions")
}

model SubscriptionPayment {
  id             String    @id @default(auto()) @map("_id") @db.ObjectId
  subscriptionId String    @db.ObjectId
  month          DateTime  // normalized to first-of-month (UTC)
  paid           Boolean   @default(true)
  paidAt         DateTime?
  note           String?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  subscription   StoreSubscription @relation(fields: [subscriptionId], references: [id], onDelete: Cascade)

  @@unique([subscriptionId, month])
  @@map("subscription_payments")
}
```

Add the inverse relation on `Tenant`:

```prisma
model Tenant {
  // ...existing fields...
  subscription StoreSubscription?
}
```

### Sparse ledger design

- A store has **no** `StoreSubscription` row until a platform admin first sets an activation date. Until then it shows as "Pending Activation" in the list/overview.
- The rolling monthly checklist (`activatedAt` → current month) is generated on read, not stored per-month: the service walks the months in that range and left-joins whatever `SubscriptionPayment` rows exist. A month with no row defaults to unpaid.
- Toggling a month's paid status is an upsert on the `(subscriptionId, month)` unique constraint — idempotent under rapid/duplicate toggles.
- No cron job, no background backfill. Changing `activatedAt` later just changes which months the generated checklist covers on the next read; it never deletes or auto-creates `SubscriptionPayment` rows.

## API (new `subscriptions` module, `kioskly-api`)

Mirrors the conventions of the existing `platform` module. All routes: `@UseGuards(JwtAuthGuard, RolesGuard)`, `@Roles('PLATFORM_ADMIN')`.

| Method & path | Purpose |
|---|---|
| `GET /platform/subscriptions` | Paginated list of stores with company/brand, activation status, current-month paid status. Query filters: `companyId`, `brandId`, `status` (`activated` \| `pending`), `paid` (`paid` \| `overdue`), `page`, `limit`. |
| `GET /platform/subscriptions/stats` | Overview counts: total stores, activated, pending activation, paid this month, overdue this month. |
| `GET /platform/subscriptions/:tenantId` | One store's subscription detail + full rolling payment history (`activatedAt` → current month). |
| `PATCH /platform/subscriptions/:tenantId/activation` | Body: `{ activatedAt: string \| null }`. Sets/clears activation date; creates the `StoreSubscription` row on first call if it doesn't exist. `null` reverts the store to "Pending Activation." |
| `PUT /platform/subscriptions/:tenantId/payments/:month` | Path `month` as `YYYY-MM`. Body: `{ paid: boolean, note?: string }`. Upserts the `SubscriptionPayment` row; sets `paidAt` to now when transitioning to `paid: true`, clears `paidAt` when set to `paid: false`. |

"Current month" comparisons reuse the existing `getZonedMonthBounds` helper already used in `platform.service.ts`, normalizing `month` to first-of-month UTC.

### `Overdue` definition

A store counts as overdue in `stats` and the `paid` filter when: it is activated (`activatedAt` is set) AND the current month has no `SubscriptionPayment` row with `paid: true`.

## UI (kioscify-platform)

### Navigation

Add a new sidebar item `Subscriptions` (between `Companies` and `Users` in `app/(main)/layout.tsx`'s nav array), routed to `/subscriptions`.

### List page — `app/(main)/subscriptions/page.tsx`

- Overview cards at top, backed by `GET /platform/subscriptions/stats`: Total Stores, Activated, Pending Activation, Paid This Month, Overdue.
- Below: a filterable table of all stores (filters: company, brand, activation status, payment status), each row showing store name, company, brand, activation date (or "Pending"), and a paid/overdue badge for the current month.
- Clicking a row navigates to the store's detail view.

### Detail page — `app/(main)/subscriptions/[tenantId]/page.tsx`

- Header: store name, company/brand breadcrumb, back link to `/subscriptions`.
- Activation control: shows current activation date, or a "Set Activation Date" button if pending. Editable at any time (changing it re-derives the checklist range on next load).
- If activated: rolling checklist, one row per month from `activatedAt` to the current month, each with a paid/unpaid toggle, the `paidAt` date when paid, and an optional note field. Toggling calls the `PUT .../payments/:month` endpoint.
- If not yet activated: empty state prompting the admin to set an activation date first; no checklist shown (matches the sparse-ledger design — there's nothing to bill before activation).

## Edge cases & error handling

- **Store deleted**: `StoreSubscription` (and its `SubscriptionPayment` rows via cascade-through) is deleted when the `Tenant` is deleted, consistent with existing store-scoped model cascade behavior.
- **Store deactivated (`isActive: false`)**: unrelated to subscription — the existing Store active/inactive toggle stays independent. A deactivated-but-still-onboarded store keeps its subscription history and still shows in the subscriptions list.
- **Changing activation date earlier or later**: does not delete or auto-create `SubscriptionPayment` rows. Moving the date later shrinks the visible checklist range (older payment rows outside the new range are preserved in the DB but not shown); moving it earlier extends the checklist backward, with new months defaulting to unpaid.
- **Concurrent/duplicate toggles**: the `(subscriptionId, month)` unique constraint makes the upsert idempotent.
- **Permissions**: `PLATFORM_ADMIN` only. No Company Portal or Store Portal visibility — this is platform-internal.

## Out of scope / explicitly deferred

- Revenue/currency amounts or totals.
- Payment reminders or notifications.
- Any automated/recurring billing integration.
- Per-Company (vs per-Store) subscription rollups.
