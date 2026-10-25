# Feature: Automated Subscription Billing (PayMongo QRPH) — Kioscify

You are working in the Kioscify Turborepo monorepo (read `CLAUDE.md` first). This feature
turns the existing **manual** store-subscription tracker into a platform that **bills
itself**: it issues monthly invoices, collects payment via PayMongo QRPH, marks stores
paid via webhook, shows a due banner during a grace period, and locks the Store Portal
and Kiosk app when the grace period passes.

**Production has live paying stores. The rollout must be seamless and fully
settings-driven — nothing changes for any store until a platform admin turns it on.**

## How to work

1. Use the brainstorming → spec → plan workflow this repo already follows
   (`docs/superpowers/specs/*-design.md`, `docs/superpowers/plans/*.md`). Write
   `docs/superpowers/specs/2026-10-24-automated-subscription-billing-design.md` first.
2. **Before writing the spec, investigate the existing code listed below.** The
   decisions at the end of this prompt are already made. Ask me about anything else
   that's genuinely ambiguous. Don't guess.
3. Implement in the phases listed under "Phasing", each independently shippable and
   safe to deploy with billing still OFF. Write tests as you go (the repo has
   `*.spec.ts` next to services — follow that).
4. Verify PayMongo API details against the **current** PayMongo docs
   (developers.paymongo.com) — do not rely on memory for endpoint names, payload
   shapes, webhook event names, or signature format.

## Existing code to build on (do NOT duplicate)

- `kioskly-api/prisma/schema.prisma`: `Tenant` (= Store), `Company`, `PlatformConfig`,
  **`StoreSubscription`** (per-store, `activatedAt`), **`SubscriptionPayment`**
  (sparse per-month paid ledger, unique `(subscriptionId, month)`).
- `kioskly-api/src/subscriptions/*`: platform-admin-only module (list, stats, detail,
  set activation, upsert month payment) + `subscription-months.util.ts`.
- Spec for the above: `docs/superpowers/specs/2026-07-01-store-subscription-management-design.md`.
- Platform Admin UI: `kioscify-platform/app/(main)/subscriptions/page.tsx` and
  `[tenantId]/page.tsx`.
- **Account-status gating pattern** (deactivation grace period) — reuse its shape:
  `kioskly-api/src/common/utils/account-status.util.ts` (status derived on read, never
  persisted), `kioskly-api/src/auth/strategies/jwt.strategy.ts` (computes
  `accountStatus` fresh per request), `kioskly-api/src/common/guards/account-status.guard.ts`,
  `GET auth/account-status`, `kioskly-admin/app/(main)/account-status/page.tsx`,
  `kioskly-app/app/account-status.tsx`.
- `PlatformConfig` maintenance toggles + `GET /platform/maintenance-status` — pattern
  for global settings read by every client.
- Mobile offline sync engine (SQLite queue, `clientId` dedupe) in `kioskly-app`.
- Kiosk APK auto-update (`docs/superpowers/specs/2026-06-16-kiosk-apk-auto-update-design.md`).

Keep **billing status separate from deactivation status** (a store can be active but
overdue). Combine them only at the gate, with deactivation taking priority.

## Requirements

### 1. The platform bills itself
- On each store's billing date (Asia/Manila time), the API creates an **invoice** for
  the next period (amount, period start/end, due date, status).
- The store sees a banner in the **Store Portal (`kioskly-admin`) and Kiosk app
  (`kioskly-app`)** with a **"Pay now"** action that opens a PayMongo **payment link /
  checkout page and a QRPH code** they can scan with GCash, Maya or any bank app.
- PayMongo account is an **unregistered individual account → QRPH only** (no cards,
  no GCash/Maya direct checkout). Design the gateway layer behind an interface
  (`PaymentProvider`) so cards/auto-debit can be added later when the business is
  registered, without reworking invoices.
- QR codes / checkout sessions expire — **create or refresh them on demand** when the
  user opens "Pay now", and reuse a still-valid one. Don't store a single QR made on
  the billing date.

### 2. Webhook marks them paid
- `POST` webhook endpoint for PayMongo (public, excluded from the JWT global guard, raw
  body available for signature verification).
- **Verify the PayMongo signature header** with the webhook secret; reject invalid.
- **Idempotent**: dedupe on PayMongo event/payment ID (store processed event IDs). A
  replayed or duplicate webhook must never double-extend.
- On paid: invoice → PAID (store amount, PayMongo IDs, paidAt, method), extend the
  store's paid-through date by one period, **and upsert the matching existing
  `SubscriptionPayment` month row as paid** so the current Platform Admin checklist
  stays accurate.
- Also add a reconciliation path: an admin "Re-check payment" button and/or a
  scheduled job that polls PayMongo for open invoices in case a webhook was missed.
- Keep **manual mark-as-paid** in Platform Admin (cash/bank transfer), with method,
  reference number and note. Manual and webhook payments go through the same service.

### 3. Grace period, reminders, banner and lock
- Grace period = **X days after the due date**, from settings, **default 7**.
- **During grace**: a persistent banner on **every page/screen** of the Store Portal and
  Kiosk app (global layout level, not per page), showing amount, due date, days left
  and "Pay now". It can't be dismissed permanently (collapse for the session at most).
- **Reminders** on day 0 (due date), day 3 and day 7 by default. Make the schedule
  configurable (list of day offsets). Channel: in-app only (see decisions). Never send the same
  reminder twice (record sent reminders per invoice + offset).
- **After the grace period** → status LOCKED:
  - Users **can still log in**. After login they land on a **"Subscription overdue"
    screen** (Store Portal + Kiosk app) with the amount, "Pay now" (link + QRPH) and
    logout. Nothing else in the app is reachable.
  - Enforce on the **API** too (guard), not just the UI. Allowlist only: auth/login,
    logout, change-password, account/billing status, create/refresh pay link, invoice
    view.
  - **Never reject offline-sync uploads** (transactions, expenses, inventory, submitted
    reports created before the lock). Sales data must not be lost. Only block *new
    operational use*.
  - Don't interrupt a checkout in progress. Apply the lock on app launch/foreground,
    navigation and the next API call after the current transaction.
  - **Kiosk offline behavior**: cache the last-known billing status and its expiry
    locally. Define and document what happens if the device stays offline past the
    lock date (propose a policy, e.g. enforce from cached due date + grace).
  - Instantly unlock after payment (webhook → next status poll / app foreground). Poll
    the status every N seconds while the overdue screen is open.
- Platform admins are never locked. Company Portal is unaffected (see decisions).
- Status is **derived on read** (like `computeAccountStatus`): e.g.
  `EXEMPT | NOT_ACTIVATED | TRIAL | ACTIVE | DUE (grace) | LOCKED`. The scheduler only
  generates invoices and sends reminders. Locking must not depend on a cron having run.

### 4. Platform Admin settings (all configurable)
**Global defaults** (Platform Admin → Settings → Billing; extend `PlatformConfig` or a
new `BillingConfig` singleton):
- Master switch **Billing enabled** (default OFF) and a separate **Enforcement/lock
  enabled** switch (default OFF), so invoices + banners can run before locking is on.
- Default trial days (**15**), default grace days (**7**), reminder day offsets (`[0, 3, 7]`), PayMongo account limit for the dashboard warning.
- PayMongo mode indicator (test/live) read from env. **Never store keys in DB or
  return them to the frontend.**

**Per store** (extend the existing Platform Admin subscription detail page):
- **Billing toggle** — on/off. Off = exempt (for my own store and stores with special
  agreements), with a required **exemption reason/note**. Exempt stores never see a
  banner, invoice or lock.
- **Activation date** (existing `activatedAt`).
- **Trial**: start date (defaults to activation date), length in days (defaults to
  global 15, overridable), computed trial end shown. Allow extending a trial.
- **Billing date / anchor day** (default = day after trial ends). Handle days 29–31
  safely (clamp to month end).
- **Paid-through date / next billing date override.** Some stores already paid me
  directly in advance (outside the platform). I must be able to set, per store, the
  date they are paid through and the date their **first/next invoice** is created.
  No invoice, banner, reminder or lock happens before that date. Record it as a
  manual **prepayment** entry (amount, months covered, method, reference, note) so it
  shows in the payment history, and mark the covered months paid in the existing
  `SubscriptionPayment` ledger. The override must be editable later, and it wins over
  the trial/anchor-derived date.
- **Grace days override** (blank = use global default).
- **Monthly subscription price (PHP) — per store, required.** There is **no global
  default price**. The billing toggle cannot be turned ON for a store until a price is
  set (validate in API + UI). Changing the price applies from the next invoice on;
  issued invoices keep their amount.
- Actions: generate invoice now, mark paid manually, waive/void an invoice, extend
  grace for this invoice, re-check PayMongo, resend reminder.
- Invoice + payment history and a **settings change audit log** (who/when/what).
- Show the computed current status and "what the store sees right now" preview.
- Optionally bulk actions: apply settings/enable billing for multiple stores at once.

**New store onboarding** (Platform Admin store-creation flow, and the Company Portal
flow if `canOnboardStores` is ever used):
- Make **monthly price**, **trial period (days, prefilled with the global default 15)**
  and **billing date** required fields on the onboarding form.
- **Billing is automatically ON** for newly onboarded stores (activation date = creation
  date unless set otherwise). The admin can still switch a store to exempt afterwards.
- This applies only to stores created after the feature ships. Existing stores keep
  billing OFF until I set them up (see rollout).

Also suggest any other settings you think are missing and tell me why, in the spec.

### 5. Seamless production rollout
- **Additive schema only** (Prisma + MongoDB). New fields optional or with safe
  defaults. No destructive changes. Existing `StoreSubscription` / `SubscriptionPayment`
  data must keep working and keep showing in the current UI.
- With billing OFF globally (default after deploy), **behavior is identical to today**
  for every store, every portal and every app version. Prove this with tests.
- **Per-store opt-in**: a store with billing toggle OFF or no activation is unaffected
  even when the global switch is ON.
- **Existing stores have no price yet**: enabling billing for them requires setting a
  price first (enforced). Rollout checklist: set price → (prepaid date if any) → enable.
- **Prepaid stores**: during rollout I need to enter each prepaid store's paid-through /
  next billing date *before* turning billing on for it. The first invoice is
  generated on that date, not earlier. Include this step in the rollout checklist.
- **No retroactive charges**: when billing is enabled for an existing store, the first
  invoice is for the next billing date. Months already marked paid manually are
  honored. Past unpaid months in the manual ledger do NOT become invoices.
- **Old kiosk APKs**: check how current production app versions react to a new API
  lock response. Ship the app update (banner + overdue screen) via auto-update
  **before** enforcement can be turned on, and make the API's lock error something
  older apps degrade gracefully on (e.g. reuse the existing account-status handling
  if that's safe). Document the required minimum app version.
- Scheduler: the API has no scheduler yet. Add one (e.g. `@nestjs/schedule`) and make
  jobs **safe with multiple API instances** (check `docker-compose.yml`). Use a DB lock
  or idempotent, unique-constrained writes.
- Env vars: `PAYMONGO_SECRET_KEY`, `PAYMONGO_PUBLIC_KEY`, `PAYMONGO_WEBHOOK_SECRET`,
  (no reminder env vars needed: reminders are in-app). Add them to `.env.example` and the deployment
  docs, and use test-mode keys locally.
- Include a rollout checklist in the spec: deploy (OFF) → mark my store + agreement
  stores exempt → set paid-through / next billing dates for prepaid stores → test with PayMongo test mode on a staging store → enable for one
  real store → enable enforcement → the rest.

### 6. Platform Admin billing dashboard
Extend/replace the existing `/subscriptions` pages in `kioscify-platform`:
- **Overview cards**: stores by status (Trial, Active/paid, Due in grace, Locked,
  Exempt, Not activated), expected revenue this month, collected this month,
  outstanding amount, upcoming invoices in the next 7 days.
- **Store table** with filters (company, brand, status, due date range) and search:
  store, company/brand, price, status, paid-through date, next billing date, days
  overdue, last payment date.
- **Per-store detail**: full invoice + payment history (webhook, manual, prepayment),
  reminders sent, PayMongo references, settings audit log, and the actions listed in
  section 4.
- Optionally a cross-store **payments log** (all payments, newest first) with CSV export,
  following the repo's existing CSV export pattern.

### 7. Store Portal billing page
In `kioskly-admin`, add a **Billing** page (sidebar item) for store admins, scoped
to their **own store** only (multi-store admins see the store they have selected):
- Current plan: monthly price, status (Trial / Active / Due / Locked), trial end,
  paid-through date, next billing date, "Pay now" when an invoice is open.
- **Billing history table**: invoice period, amount, due date, status (Open / Paid /
  Waived / Void), paid date, method (QRPH / manual / prepaid), reference.
- Downloadable/printable receipt per paid invoice would be nice (see if it's cheap).
- This page must stay reachable while LOCKED (add it to the API allowlist), so they can
  see what they owe. Exempt stores: hide the page or show "No billing for this store".
- API: store-scoped endpoints guarded so a store can only read its own billing data.

## Phasing (each phase deployable with billing OFF)
1. Schema + settings (global + per store, required price) + billing-status derivation +
   onboarding form changes + Platform Admin dashboard/detail UI.
2. Invoices + scheduler + PayMongo provider (QRPH checkout/link) + webhook + reconciliation.
3. Store Portal + Kiosk app: global banner, Pay-now flow, billing status endpoint/polling,
   Store Portal Billing page + history table.
4. Reminders.
5. Lock: API guard + overdue screens + offline policy + old-app compatibility.

## Testing
- Unit tests for status derivation (trial, active, due/grace, locked, exempt, deactivated
  combination, timezone and month-end edge cases), invoice generation idempotency,
  webhook signature + duplicate events, reminder dedupe, sync endpoints still accepting
  data while locked.
- Run the full PayMongo flow end to end in **test mode**.
- Confirm nothing changes with billing OFF.

## Decisions already made (do not re-ask)
1. **Reminders are in-app only** for now: no email/SMS/push, so no email provider or
   extra env vars needed. "Sending" a reminder on day 0/3/7 means recording it and
   showing a stronger/updated banner or notice in-app (e.g. a one-time modal per
   reminder offset on next login/open). **Recipients: store admins.** Keep the
   reminder layer behind an interface so email/SMS can be added later.
2. **Company Portal stays unaffected:** no banner, no lock, no billing UI there.
3. **Billing is per store** (current `StoreSubscription` model). No combined company invoices.
4. **Kiosk offline past the lock date: the kiosk locks itself** using the last-seen
   due date + grace days it cached. It unlocks once it's back online and the API says
   paid/active.
5. **Role rules on the kiosk app:**
   - **STORE_ADMIN** (and legacy ADMIN): sees the banner with **"Pay now"** (payment
     link + QRPH) during grace, and the overdue screen with "Pay now" when locked.
   - **CASHIER** (or any lower role): sees the banner / overdue screen **without any
     payment action**, only "Your store's subscription is due/overdue. Please contact
     your store admin." Enforce on the API too: only store admins can create/refresh a
     pay link.
   - The Store Portal is store-admin only already, so it always shows "Pay now".
6. **Pricing context:** ₱1,500 per store per month for now (still set per store, no
   global default). Check PayMongo's **current** individual-account limits (wallet
   balance, monthly cash-in/collection limits) against (number of stores × ₱1,500).
   Report the store count at which the limit would be hit, and show a warning on the
   Platform Admin billing dashboard when monthly collections approach the configured
   limit (make the limit a global setting).

If you hit any other real ambiguity while investigating, ask me before writing the spec.
