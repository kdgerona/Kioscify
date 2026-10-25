# Automated Subscription Billing (PayMongo QRPH)

**Date:** 2026-10-24
**Status:** Draft (pending approval)
**Portals:** kioskly-api, kioscify-platform (Platform Admin), kioskly-admin (Store Portal), kioskly-app (Kiosk). The Company Portal is **not** touched.
**Supersedes:** the "no cron / no automated billing / no currency totals" constraints of `2026-07-01-store-subscription-management-design.md`. That spec's data (`StoreSubscription`, `SubscriptionPayment`) and UI stay. This spec extends them.
**Source prompt:** `docs/prompts/2026-10-24-automated-subscription-billing.md`

## Overview

Today, platform admins record each store's monthly payment by hand in a checklist. This spec makes the platform bill stores itself, in five steps:

1. **Invoice.** On each store's billing date (Asia/Manila), the API issues an invoice for the next month.
2. **Pay.** Store admins tap **Pay now** in the Store Portal or the Kiosk app. They get a PayMongo **QRPH** code, which can be scanned with GCash, Maya or any bank app, plus a shareable Kioscify pay page that shows the same QR.
3. **Confirm.** A signed PayMongo webhook marks the invoice paid. As backup, a reconciliation job and an admin **Re-check** button poll PayMongo.
4. **Grace period.** During the grace period (default 7 days after the due date), every Store Portal page and Kiosk screen shows a banner. In-app reminders fire on days 0, 3 and 7.
5. **Lock.** After the grace period, the store is **LOCKED**. Users can still log in, but they only see a "Subscription overdue" screen. The API enforces this with a guard. Offline-sync uploads are always accepted, so no sales data is lost.

All of this is driven by settings and is **OFF by default**. With the global switch off, every store, portal and app version behaves exactly as it does today, and tests prove it. Each store also opts in individually.

## Goals / non-goals / anti-goals

**Goals**
- Invoices, payment and unlock run with no manual work.
- Platform admins control everything through settings.
- Rollout can't charge anyone retroactively.

**Non-goals (this release)**
- Cards, GCash/Maya direct checkout, or auto-debit. The PayMongo account is an *unregistered individual* account, which only supports QRPH. The `PaymentProvider` interface leaves room to add these later.
- Email, SMS or push reminders. Reminders are in-app only, behind a `ReminderChannel` interface.
- Combined company invoices. Billing is per store.
- Any Company Portal UI.

**Anti-goals: the release fails, even if it technically works, if any of these happen**
- Any store sees any change after deploy before an admin enables billing.
- A sale or report is rejected or lost because of the lock.
- A replayed webhook extends a store twice.
- A prepaid store is invoiced before its paid-through date.
- PayMongo keys reach the DB or a browser.

## PayMongo facts (verified against current docs, 2026-10-24; re-verify in test mode)

| Topic | Fact |
|---|---|
| Dynamic QRPH | 1. `POST /v1/payment_intents` with `{data:{attributes:{amount (centavos), currency:'PHP', payment_method_allowed:['qrph'], description, metadata}}}` returns `id` and `client_key`.<br>2. `POST /v1/payment_methods` with `{type:'qrph'}`.<br>3. `POST /v1/payment_intents/:id/attach` with `{payment_method, client_key}`. The status becomes `awaiting_next_action`, and `next_action.code.image_url` holds a **base64 PNG** of the QR. |
| QR lifetime | About **30 minutes**. `qrph.expired` fires if the QR isn't scanned in time. |
| Paid signal | Webhook `payment.paid`, or poll `GET /v1/payment_intents/:id` until status `succeeded`. |
| Webhook events used | `payment.paid`, `payment.failed`, `qrph.expired` |
| Signature | The `Paymongo-Signature` header looks like `t=<ts>,te=<test sig>,li=<live sig>`. Compute `HMAC_SHA256(webhookSecret, "<t>.<raw body>")` as hex. Compare it with `te` in test mode or `li` in live mode, using `timingSafeEqual`. Reject the request if the timestamp is more than 5 minutes off (my call; PayMongo recommends a check but doesn't give a value). |
| Auth | HTTP Basic, with the secret key as the username and an empty password. Every call uses the **secret key, from the server only**. The public key is only needed if we ever create payment methods client-side, which we don't. It's kept in env for the future. |
| Individual account limits | **Wallet limit ₱50,000; cash-in ₱10,000/month** (PayMongo "Business Types" doc). The wallet is closed-loop: funds can only go to other PayMongo wallets, and bank transfers need a registered account. |

### Limit analysis (₱1,500 / store / month)
- If QRPH collections count toward the **₱10,000/month cash-in** limit: 6 stores is ₱9,000, so the **7th store (₱10,500) exceeds it**.
- If only the ₱50,000 wallet balance applies, and funds are moved out every month: **34 stores (₱51,000) exceed it**, so ~33 stores fit.
- Money can't be withdrawn to a bank on a closed-loop wallet, so the balance may only grow. In that case even the ₱50k cap fills cumulatively, in about 33 store-months.
- **Recommendation:** register the business before going past about 5 paying stores.
- The dashboard warns at 80% of the configurable `paymongoMonthlyLimit` (default **₱10,000**, the user's decision).

## Status model (derived on read, never persisted)

`computeBillingStatus(input, now)` is a pure function in `kioskly-api/src/common/utils/billing-status.util.ts`. It follows the shape of `computeAccountStatus`. The scheduler only creates invoices and reminders, so **locking never depends on a cron run**.

```
BillingStatus = EXEMPT | NOT_ACTIVATED | TRIAL | ACTIVE | DUE | LOCKED
```

Evaluation order (first match wins):

1. `config.billingEnabled !== true` → **EXEMPT**. Global OFF means behaviour is identical to today.
2. No subscription row, or `sub.billingEnabled !== true` → **EXEMPT**. The UI tells "Not set up" (null) apart from "Exempt: <reason>" (false).
3. `sub.activatedAt == null` → **NOT_ACTIVATED**. Nothing is billed.
4. Let `dueAt` be either the `dueAt` of the oldest OPEN invoice, or `sub.nextBillingAt` if that has passed and no invoice exists for it yet. The second case is the "virtual invoice" used when cron hasn't run.
   - If there is none, or `now < dueAt`: return **TRIAL** if `now < trialEndsAt` and no paid invoice or prepayment exists. Otherwise return **ACTIVE**.
5. `graceEndsAt = max(dueAt + graceDays, invoice.graceExtendedUntil)`. If `now < graceEndsAt` → **DUE**.
6. Otherwise, **LOCKED** if `config.enforcementEnabled`. If enforcement is off it stays **DUE** (overdue), with `daysOverdue`.

`graceDays = sub.graceDaysOverride ?? config.defaultGraceDays`.

The result also carries `amountCentavos`, `dueAt`, `graceEndsAt`, `daysLeft`, `daysOverdue`, `trialEndsAt`, `paidThroughAt`, `nextBillingAt`, `openInvoiceId` and `enforcement`.

### Combining with deactivation (gate only)
Billing status stays separate from `accountStatus`, so a store can be active but overdue. They are combined only at the gate, and deactivation takes priority:
- DEACTIVATED or GRACE_PERIOD → the existing behaviour, unchanged. Billing is ignored.
- Otherwise, billing LOCKED → the billing lock.

### Date math
- All dates are Manila calendar days. Values are stored as the UTC instant of Manila 00:00, using `common/utils/timezone.ts` helpers. We add `addZonedMonthsClamped(date, n, anchorDay)` and `startOfZonedDay`.
- **Trial:** `trialStartAt` defaults to `activatedAt`. `trialDays` defaults to `config.defaultTrialDays` (15). `trialEndsAt = startOfZonedDay(trialStart) + trialDays days`, which is the first non-trial day.
- **Default first billing date** = `trialEndsAt` ("the day after the trial ends"). **`anchorDay`** = its day of the month.
- **Periods:** `[periodStart, nextPeriodStart)` with `nextPeriodStart = addZonedMonthsClamped(periodStart, 1, anchorDay)`. Days 29–31 are clamped to the month end: anchor 31 gives Jan 31 → Feb 28/29 → Mar 31. The anchor is kept, so a short month never pulls later months earlier.
- **Paid in advance:** `dueAt = periodStart`. Invoices are issued `config.invoiceLeadDays` (default 7) before `periodStart`.
- **Reminder before the due date:** from `dueAt - invoiceLeadDays` the status stays TRIAL/ACTIVE (nothing counts towards grace or the lock) but carries `upcomingDueAt` and `daysUntilDue`, and the store sees a reminder banner: admins "Subscription due on Nov 1, 2026 — 7 days left" with the amount and Pay now; cashiers the same title and "Please ask your store admin to pay on or before Nov 1, 2026." `invoiceLeadDays: 0` turns the reminder off.
- **`nextBillingAt`** is a persisted field: the start of the next period not yet invoiced. It's computed when billing is enabled or settings change, and admins can override it. An override always wins over the trial/anchor-derived date. When an invoice is generated, `nextBillingAt` moves forward one period.
- **`paidThroughAt`** = the last day covered (`periodEnd - 1 day`, shown inclusively). It's set by payments and prepayments.

### One open invoice at a time (my call)
New invoices are generated only when the store has **no OPEN invoice**. A store that has been locked for months owes one invoice, not a growing pile.

**Late payment (user decision):** when an invoice is paid **after its grace period ended**, that invoice's period is **re-anchored to the payment date**. This applies whether the store was LOCKED or, with enforcement off, still DUE.
- `periodStart` becomes the payment day, `periodEnd` moves one period later, and `anchorDay` becomes that day of the month.
- Months the store spent unpaid past grace are **never billed**.
- A store that never pays owes exactly one invoice.
- Payments made on or before `graceEndsAt` keep the original period and anchor.
- The dashboard's "Outstanding" figure is the sum of OPEN invoices, so at most one per store.

## Data model (additive only)

All new fields are optional or have safe defaults. No existing field changes.

**No backfill script is needed.** Every query filters on positive values (`billingEnabled: true`, `status: 'OPEN'`). On MongoDB a missing field correctly fails those filters, which means OFF. This is the opposite case from the 2026-07-06 `tombstone: {not: 1}` incident, where a missing field broke a negative filter. **Never add a unique index on a nullable field.** MongoDB indexes `null`, so a second null would collide. Every unique below is on required fields.

```prisma
model BillingConfig {            // singleton, upserted like PlatformConfig
  id                         String   @id @default(auto()) @map("_id") @db.ObjectId
  key                        String   @unique @default("global")
  billingEnabled             Boolean  @default(false)
  enforcementEnabled         Boolean  @default(false)
  defaultTrialDays           Int      @default(15)
  defaultGraceDays           Int      @default(7)
  reminderOffsets            Int[]    @default([0, 3, 7])
  invoiceLeadDays            Int      @default(7)
  paymongoMonthlyLimitCentavos Int    @default(1000000)   // ₱10,000
  limitWarnPercent           Int      @default(80)
  overduePollSeconds         Int      @default(30)
  minKioskVersionCode        Int?     // required before enforcement can be enabled
  updatedAt                  DateTime @updatedAt
  @@map("billing_config")
}

model StoreSubscription {         // existing — new optional fields only
  // ...existing: id, tenantId @unique, activatedAt, createdAt, updatedAt
  billingEnabled     Boolean?   // null = not set up, false = exempt, true = billed
  exemptReason       String?    // required when billingEnabled === false
  priceCentavos      Int?       // required before billingEnabled can be true
  trialStartAt       DateTime?
  trialDays          Int?
  anchorDay          Int?       // 1–31
  nextBillingAt      DateTime?
  nextBillingOverridden Boolean? // true when an admin set nextBillingAt explicitly
  paidThroughAt      DateTime?
  graceDaysOverride  Int?
  invoices           BillingInvoice[]
}

model BillingInvoice {
  id               String   @id @default(auto()) @map("_id") @db.ObjectId
  number           String   @unique          // e.g. KSF-202611-00042
  subscriptionId   String   @db.ObjectId
  tenantId         String   @db.ObjectId
  periodStart      DateTime
  revision         Int      @default(0)        // bumps when a VOIDed invoice for the same period is reissued
  periodEnd        DateTime                    // exclusive
  issuedAt         DateTime
  dueAt            DateTime
  amountCentavos   Int                         // snapshot; price changes don't affect issued invoices
  status           BillingInvoiceStatus @default(OPEN)  // OPEN | PAID | VOID | WAIVED
  graceExtendedUntil DateTime?
  paidAt           DateTime?
  paymentMethod    BillingPaymentMethod?        // QRPH | MANUAL | PREPAID
  payToken         String   @unique             // random 32-byte url-safe; public pay page
  voidReason       String?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  subscription     StoreSubscription @relation(fields: [subscriptionId], references: [id], onDelete: Cascade)
  @@unique([subscriptionId, periodStart, revision])  // idempotent generation; revision = number of VOID invoices for that periodStart
  @@index([status, dueAt])
  @@index([tenantId])
  @@map("billing_invoices")
}

model BillingPayment {            // every money-in event: webhook, reconcile, manual, prepayment
  id                String   @id @default(auto()) @map("_id") @db.ObjectId
  tenantId          String   @db.ObjectId
  subscriptionId    String   @db.ObjectId
  invoiceId         String?  @db.ObjectId     // null for prepayments
  source            BillingPaymentSource       // WEBHOOK | RECONCILE | MANUAL | PREPAYMENT
  method            BillingPaymentMethod       // QRPH | MANUAL | PREPAID
  manualMethod      String?                    // "cash" | "bank_transfer" | "gcash_direct" | other
  amountCentavos    Int
  monthsCovered     Int      @default(1)
  paidAt            DateTime
  reference         String?                    // PayMongo payment id or manual ref no.
  providerIntentId  String?
  note              String?
  flagged           Boolean  @default(false)   // NOT applied (invoice no longer OPEN) — review for a refund
  amountMismatch    Boolean?                   // applied, but paid ≠ invoice amount (missing = false)
  recordedById      String?  @db.ObjectId      // admin user for manual/prepayment
  createdAt         DateTime @default(now())
  @@index([paidAt])
  @@index([tenantId])
  @@map("billing_payments")
}

model BillingPaymentAttempt {     // one QRPH Payment Intent
  id               String   @id @default(auto()) @map("_id") @db.ObjectId
  invoiceId        String   @db.ObjectId
  provider         String   // "paymongo"
  providerIntentId String   @unique
  qrImage          String   // data:image/png;base64,...
  expiresAt        DateTime
  status           String   // awaiting_payment | succeeded | expired | failed
  livemode         Boolean
  createdAt        DateTime @default(now())
  @@index([invoiceId, createdAt])
  @@map("billing_payment_attempts")
}

model PaymentWebhookEvent {       // dedupe ledger
  id              String   @id @default(auto()) @map("_id") @db.ObjectId
  provider        String
  providerEventId String   @unique
  type            String
  payload         Json
  processedAt     DateTime?
  error           String?
  createdAt       DateTime @default(now())
  @@map("payment_webhook_events")
}

model BillingReminder {
  id              String   @id @default(auto()) @map("_id") @db.ObjectId
  invoiceId       String   @db.ObjectId
  tenantId        String   @db.ObjectId
  offsetDays      Int
  channel         String   // "in_app"
  sentAt          DateTime @default(now())
  acknowledgedByUserIds String[] @default([]) @db.ObjectId
  @@unique([invoiceId, offsetDays, channel])     // never send twice
  @@map("billing_reminders")
}

model BillingAuditLog {
  id          String   @id @default(auto()) @map("_id") @db.ObjectId
  tenantId    String?  @db.ObjectId   // null for global config changes
  actorUserId String?  @db.ObjectId   // null = system (scheduler/webhook)
  action      String   // e.g. settings.update, invoice.void, payment.manual, config.update
  before      Json?
  after       Json?
  createdAt   DateTime @default(now())
  @@index([tenantId, createdAt])
  @@map("billing_audit_logs")
}

model JobLock {
  id          String   @id @default(auto()) @map("_id") @db.ObjectId
  name        String   @unique
  lockedUntil DateTime
  owner       String
  @@map("job_locks")
}
```

## API (`kioskly-api`)

### Module layout
```
src/billing/
  billing.module.ts
  billing-config.service.ts      # get/update singleton, 30s in-memory cache, invalidate on write
  billing-status.service.ts      # loads inputs, calls computeBillingStatus
  billing-invoices.service.ts    # ensureInvoice (idempotent), void/waive/extend-grace
  billing-payments.service.ts    # recordPayment() — the ONE path for all payments; prepayments
  billing-reminders.service.ts   # due-reminder detection + ReminderChannel fan-out
  billing-scheduler.service.ts   # @Cron jobs wrapped in JobLock
  billing-audit.service.ts
  providers/payment-provider.interface.ts
  providers/paymongo.provider.ts
  reminders/reminder-channel.interface.ts
  reminders/in-app.channel.ts
  controllers/store-billing.controller.ts     # billing/me/*
  controllers/pay-page.controller.ts          # billing/pay/:token (public)
  controllers/paymongo-webhook.controller.ts  # billing/webhooks/paymongo (public)
  controllers/platform-billing.controller.ts  # platform/billing/* + platform/subscriptions/:tenantId/billing/*
common/utils/billing-status.util.ts
common/guards/billing-status.guard.ts
common/decorators/allow-when-billing-locked.decorator.ts
common/utils/job-lock.util.ts
```
`subscriptions/` keeps its existing routes. Its list, stats and detail responses gain billing fields so the existing UI keeps working.

### PaymentProvider interface
```ts
interface PaymentProvider {
  readonly name: 'paymongo';
  mode(): 'test' | 'live' | 'unconfigured';           // from key prefix sk_test_/sk_live_
  createQrCharge(args: { amountCentavos; description; metadata: { invoiceId; tenantId } }):
    Promise<{ providerIntentId; qrImage; expiresAt; livemode }>;
  getChargeStatus(providerIntentId): Promise<{ status: 'pending'|'succeeded'|'failed'|'expired'; paymentId?; paidAt?; amountCentavos? }>;
  verifyWebhook(rawBody: Buffer, headers): boolean;
  parseEvent(rawBody: Buffer): { eventId; type; providerIntentId?; paymentId?; amountCentavos?; paidAt?; livemode };
}
```
- `PaymongoProvider` uses plain `fetch` (Node 20+), with no SDK.
- `expiresAt` = attempt creation + 30 min, unless the API response gives an explicit expiry.
- If keys aren't configured, `createQrCharge` throws `ServiceUnavailable`, and Pay now shows "Online payment unavailable, contact Kioscify".

### Single payment path
`BillingPaymentsService.recordPayment({ invoiceId, source, method, amountCentavos, paidAt, reference, providerIntentId?, manualMethod?, note?, actorUserId? })` runs inside `prisma.$transaction`:
1. `updateMany({ where: { id: invoiceId, status: 'OPEN' }, data: { status: 'PAID', paidAt, paymentMethod } })`.
2. If the count is 0 (already paid, voided or waived): create the `BillingPayment` with `flagged: true` and an audit row, change nothing else, and return `{ applied: false }`. This is what makes a payment impossible to apply twice.
3. If the count is 1:
   - **Re-anchor if paid after grace** (see above).
   - Set `paidThroughAt = periodEnd - 1 day`.
   - If `nextBillingAt < periodEnd`, set `nextBillingAt = periodEnd` (this happens after a re-anchor).
   - Create the `BillingPayment`.
   - Upsert `SubscriptionPayment(subscriptionId, month = getZonedMonthBounds(periodStart).start)` with `paid: true`, `paidAt`, `note: "Invoice <number> (<method>)"`. If a note already exists, append rather than overwrite.
   - Write an audit row.
- An amount mismatch on a webhook payment (paid ≠ invoice amount) is still applied, with `amountMismatch: true` (`flagged` stays false, so it counts in collected totals and the limit) (my call).

**Prepayment** (`recordPrepayment({ tenantId, amountCentavos, monthsCovered, paidThroughAt, nextBillingAt, manualMethod, reference, note })`):
- Creates a `BillingPayment(source PREPAYMENT, invoiceId null)`.
- Sets `paidThroughAt` and `nextBillingAt` (with `nextBillingOverridden = true`).
- Upserts each covered `SubscriptionPayment` month as paid.
- Audits the change.
- Creates no invoice. Nothing is invoiced, shown, reminded or locked before `nextBillingAt`.
- Refused (400) while the store has an OPEN invoice. Mark it paid, waive it or void it first.

### Invoice generation
`ensureInvoice(subscriptionId, now)` runs when all of these hold: billing applies (global and store on, activated, price set), there is no OPEN invoice, and `now >= nextBillingAt - invoiceLeadDays`. It:
1. Creates the invoice with `periodStart = nextBillingAt`, `revision = count(VOID invoices with that subscriptionId + periodStart)`, `amountCentavos = sub.priceCentavos` (snapshot), and `dueAt = periodStart`, except for a reissue after a void (`revision > 0`), which is due `max(periodStart, today)` and so gets a full grace window. A normal invoice created late, for example after scheduler downtime, keeps the due date the store already saw as the virtual invoice. Voiding reissues the period immediately while billing is on.
2. Advances `nextBillingAt` by one period.

A unique-constraint collision on `(subscriptionId, periodStart, revision)` (P2002) means a concurrent call already created it, which is fine. The scheduler, "Generate invoice now" and "Pay now" all call it, so a store whose cron never ran can still pay.

Invoice numbers come from `KSF-YYYYMM-<5 random base32 chars>`, retried on P2002. This avoids needing a counter document.

### Webhook
`POST /api/v1/billing/webhooks/paymongo` uses `@Public()` and `@SkipThrottle()`.

**Raw body:** `main.ts` changes `express.json({ limit, verify: (req, _res, buf) => { if (req.originalUrl.includes('/billing/webhooks/')) req.rawBody = buf } })`. Nothing else changes.

**Handling:**
1. Verify the signature. Missing or invalid gives `401`, with nothing stored. If the livemode doesn't match the configured key mode, ignore with `200`.
2. `create PaymentWebhookEvent`. A P2002 on `providerEventId` is a duplicate, so respond `200 {duplicate:true}` and do nothing else.
3. For `payment.paid`: find the attempt by `providerIntentId` (fall back to `metadata.invoiceId`), mark it `succeeded`, and call `recordPayment(source WEBHOOK, method QRPH, reference paymentId)`. For `qrph.expired` or `payment.failed`: mark the attempt `expired`/`failed`.
4. Set `processedAt`. Respond `200`. If processing throws, store `error` and return 500 so PayMongo retries. Retries hit dedupe, so a retry first checks `processedAt == null` and reprocesses only in that case.

### Reconciliation
- `reconcileInvoice(invoiceId)`: for the invoice's attempts created in the last 24h with status `awaiting_payment`, call `getChargeStatus`. If it is `succeeded`, call `recordPayment(source RECONCILE)`. It's exposed as the admin **Re-check payment** action. The `payment-status` poll endpoint also calls it (throttled to once per 20s per invoice, claimed atomically through the optional `BillingInvoice.lastReconciledAt`, so the throttle is shared by every API instance) while a QR is on screen.
- Scheduler job `reconcileOpenInvoices`: every 15 min, it checks attempts from the last 2h that are still awaiting payment.

### Scheduler (`@nestjs/schedule`, new dependency)
`ScheduleModule.forRoot()` is added to `app.module.ts`.

| Job | Schedule | Work |
|---|---|---|
| `billing.generateInvoices` | hourly at :05 | for each billed store, `ensureInvoice` |
| `billing.sendReminders` | hourly at :10 | for each OPEN invoice, for each offset in `config.reminderOffsets` where `now >= dueAt + offset days` (Manila day), deliver via channel; unique `(invoiceId, offsetDays, channel)` makes it idempotent. Offsets already passed when an invoice is created late fire once (only the latest passed offset, my call, to avoid three modals at once). |
| `billing.reconcile` | every 15 min | see above |

- Every job returns immediately when `config.billingEnabled` is false.
- Every job takes a `JobLock` before running: `findOneAndUpdate` (via `$runCommandRaw` or `updateMany` with `lockedUntil < now`), with a TTL of 10 min and `owner = hostname:pid`.
- Unique constraints also keep every write idempotent, so two instances can run without harm even if the lock fails.
- Production runs one API container today (`docker-compose.yml`), and this design is safe for N containers.

### Guard and request status
- `JwtStrategy.validate` gets the effective tenant, for roles STORE_ADMIN, ADMIN and CASHIER only. If `billingConfig.billingEnabled` (cached), it attaches `req.user.billingStatus` from `BillingStatusService.forTenant(tenantId)`.
  - That is one subscription read, one oldest-OPEN-invoice read and one latest-claim read (for the claim hold), reused per store for 10s (`forTenantCached`, an in-memory cache in each API process). A fresh `billing/me` refreshes the entry (`prime`), so paying unlocks the next request. A failed lookup never locks a store (fails open).
  - **With billing OFF, there are no extra DB reads beyond the cached config.**
- `BillingStatusGuard` is a global `APP_GUARD` registered **after** `AccountStatusGuard`. It passes if there's no user, the user is PLATFORM_ADMIN or COMPANY_ADMIN, `billingStatus` is undefined, or the status is not LOCKED, or the route has `@AllowWhenBillingLocked()` (handler or class). Otherwise it throws:
  ```ts
  throw new ForbiddenException({ code: 'SUBSCRIPTION_LOCKED', message: "This store's subscription is overdue. Please settle the invoice to continue.", billing: { amountCentavos, dueAt, invoiceId } });
  ```
  `AllExceptionsFilter` must pass the `billing` field through (small change: it currently passes only `code`).

**Allowlist (`@AllowWhenBillingLocked`)**
- Auth: `auth/login`, `auth/logout`, `auth/change-password`, `auth/account-status`, `auth/switch-store`, `auth/me` if present.
- `billing/me/*` and `billing/pay/:token`.
- **All offline-sync uploads:**
  - `POST transactions`, `POST expenses`
  - `POST inventory/records`, `POST inventory/records/bulk`
  - `POST submitted-reports`, `POST submitted-inventory-reports`
  - `POST user-shift-reports`, `POST user-shift-inventory-reports`
  - `POST staff-time-logs` if queued (check)
  - Also `GET platform/maintenance-status` and `GET app/version`, which are already public.

The API can't reliably tell a queued sale from a new one (device clocks drift), so sync uploads are **always accepted**. The lock is enforced through the UI and through every read and other write, such as catalog fetches, held orders and edits. No sales data is ever lost.

**`GET auth/account-status` and the login response**
- If account status is ACTIVE **and** billing is LOCKED **and** enforcement is on, `status = 'SUBSCRIPTION_LOCKED'`. Old APKs (≤ 1.0.5) treat any non-ACTIVE status as locked and show their existing "Your subscription has ended" screen. They pay from the Store Portal or the pay page.
- Both responses always gain an additive `billing` object, `null` when the status is EXEMPT. New clients read it.
- No other account-status semantics change.

### Store-facing endpoints (`billing/me`, store-scoped via the JWT tenant; a store can only read its own data)

| Method & path | Roles | Purpose |
|---|---|---|
| `GET billing/me` | STORE_ADMIN, ADMIN, CASHIER | Status object, plan (price, trial end, paid-through, next billing), open invoice summary, `pendingReminder` (unacknowledged by this user, store admins only), `serverTime`, `pollSeconds`, and `cache: { dueAt, graceEndsAt, enforcement, validUntil }` for kiosk offline enforcement. |
| `GET billing/me/invoices` | STORE_ADMIN, ADMIN | History, newest first. |
| `GET billing/me/invoices/:id` | STORE_ADMIN, ADMIN | One invoice and its payments (receipt data). |
| `POST billing/me/invoices/:id/pay` | **STORE_ADMIN, ADMIN only** | Reuses the newest attempt with `expiresAt > now + 2 min`, otherwise creates one through `createQrCharge`. Returns `{ qrImage, expiresAt, payUrl, amountCentavos, invoiceNumber }`. Cashiers get a 403. If the invoice doesn't exist yet (virtual due), it calls `ensureInvoice` first. A `POST billing/me/pay` shortcut does the same for the current open invoice. |
| `GET billing/me/invoices/:id/payment-status` | STORE_ADMIN, ADMIN, CASHIER | `{ status, paid }`. Triggers a throttled reconcile. |
| `POST billing/me/reminders/:id/ack` | STORE_ADMIN, ADMIN | Adds the user to `acknowledgedByUserIds`. |
| `GET billing/pay/:token` | Public, throttled 10/min/IP | Store name, invoice number, amount, due date, status, and a QR through the same reuse-or-create logic. Paid or void invoices show a status only and no QR. The token is per invoice, unguessable, and only shown to store admins. |

`payUrl = ${BILLING_PAY_PAGE_BASE_URL}/pay/<payToken>` (Store Portal origin, e.g. `https://kioscify.com`).

### Platform Admin endpoints (PLATFORM_ADMIN)

| Method & path | Purpose |
|---|---|
| `GET / PATCH platform/billing/config` | Global settings. GET also returns `paymongoMode` (test/live/unconfigured, from env) and `webhookConfigured`. Turning on `enforcementEnabled` requires `minKioskVersionCode` to be set and a confirm flag in the body. Audited. |
| `GET platform/billing/overview` | Store counts by status; expected revenue this month (sum of invoices with `dueAt` in the current Manila month); collected this month (sum of non-flagged `BillingPayment.amount` with `paidAt` this month, all sources); outstanding (sum of OPEN invoices); upcoming invoices in the next 7 days; limit usage `{ collectedCentavos, limitCentavos, percent, warn }`. QRPH-only collections are counted for the limit. |
| `GET platform/billing/stores` | Table: store, company/brand, price, status, paid-through, next billing, days overdue, last payment date. Filters: `companyId`, `brandId`, `status`, `dueFrom`, `dueTo`, `q` (search). Paginated. |
| `GET platform/billing/payments` | Cross-store payment log, newest first. `?format=csv` streams CSV through the existing `toCsv` util. |
| `GET platform/subscriptions/:tenantId/billing` | Settings, computed status, preview ("what the store sees": the banner or lock variant and its copy), invoices, payments, attempts (PayMongo refs), reminders, audit log. |
| `PATCH platform/subscriptions/:tenantId/billing` | `{ billingEnabled?, exemptReason?, priceCentavos?, activatedAt?, trialStartAt?, trialDays?, anchorDay?, nextBillingAt?, graceDaysOverride? }`. Validation: `billingEnabled:true` needs `priceCentavos > 0` (stored or in the same request) and `activatedAt`. `billingEnabled:false` needs `exemptReason`. Price changes apply to future invoices only. **Enabling for an existing store (no retroactive charges; manual months honored):** if `nextBillingAt` isn't set or overridden, the server derives it in four steps.
1. Find the latest run of consecutive `paid:true` ledger months that ends at or after the current Manila month, which may include future months.
2. If such a run exists, set `paidThroughAt` to the last day of its last month. If no `anchorDay` is set, use `anchorDay = 1`, because the legacy ledger is calendar-monthly. The candidate is the first anchor-day date after that.
3. Otherwise, the candidate is the derived anchor date, rolled forward to the first anchor occurrence on or after today.
4. `nextBillingAt = max(candidate, trialEndsAt)`.

Past unpaid ledger months never become invoices. When global billing is switched OFF→ON, every billed store with no invoices yet and a `nextBillingAt` before today has that date rolled forward to its first billing day on or after today (anchor kept, audited as `schedule.rollforward`). Stores onboarded or enabled while billing was OFF are never charged retroactively. The preview and the PATCH share one planning function, so the confirmed dates are the saved dates. An existing override is shown and kept. `GET …/billing/enable-preview` returns the derived `paidThroughAt` and `nextBillingAt` and the months it honored. The UI shows them in a confirm dialog before enabling, and the admin can edit them, which sets an override. Audited with before/after. Creates the `StoreSubscription` row if missing. |
| `POST platform/subscriptions/:tenantId/billing/prepayments` | Prepayment entry, as described above. |
| `POST platform/subscriptions/:tenantId/billing/invoices` | Generate an invoice now. Ignores `invoiceLeadDays` and the date check, but still allows only one OPEN invoice. |
| `POST platform/billing/invoices/:id/mark-paid` | `{ manualMethod, reference?, note?, paidAt? }` → `recordPayment(source MANUAL)`. |
| `POST platform/billing/invoices/:id/void` and `/waive` | `{ reason }`. OPEN → VOID/WAIVED. Waive counts the period as covered (paid-through extends, ledger month marked paid with a "waived" note). **Void** means "issued in error, reissue it". `nextBillingAt` resets to that `periodStart`, so the next `ensureInvoice` (scheduler, Generate now, or Pay now) creates a corrected invoice with `revision + 1` at the current price. Use **waive** to forgive a period instead. |
| `POST platform/billing/invoices/:id/extend-grace` | `{ until }` sets `graceExtendedUntil`. |
| `POST platform/billing/invoices/:id/recheck` | `reconcileInvoice`. |
| `POST platform/billing/invoices/:id/reminders/resend` | Delivers again through the channel by clearing `acknowledgedByUserIds` on the latest reminder, so the modal reappears. |
| `PATCH platform/billing/stores/bulk` | `{ tenantIds[], patch }`. The same validation runs per store, and the result is reported per store. |

**Legacy checklist:** `PUT platform/subscriptions/:tenantId/payments/:month` returns `409` for stores with `billingEnabled === true` ("Managed by billing; use mark-paid or prepayment"). The UI shows that checklist read-only for those stores. All other stores behave as today. (My call: one source of truth.)

**CORS fix:** add `'PUT'` to `main.ts` CORS `methods`. Today it's missing, which breaks the existing `PUT …/payments/:month` cross-origin call.

### Onboarding
- `CreateStoreDto` gains `billing: { priceCentavos (required, >0), trialDays (required, ≥0), firstBillingDate (required, ISO date), activatedAt? }`.
- `stores.service.create` creates the `StoreSubscription` (`billingEnabled: true`, `activatedAt = activatedAt ?? now`, `trialStartAt = activatedAt`, `trialDays`, `nextBillingAt = firstBillingDate`, `anchorDay` = day of `firstBillingDate`, `nextBillingOverridden = false`) in the same `$transaction` as the tenant.
- This applies to every `POST /stores` caller, which means PLATFORM_ADMIN and COMPANY_ADMIN when `canOnboardStores` is set. The Company Portal has no onboarding UI, so none is added.
- Existing stores are untouched.
- The `billing` field is **required**. The platform portal ships in the same deploy. (Company Portal has no caller.)

### Fallback payment QR (user decision: used when the PayMongo limit is reached or PayMongo fails)
The owner uploads a **static bank QR** (InstaPay / QR Ph) in Platform Admin. Payments to it never pass through PayMongo, so they **can't be auto-confirmed**. The payer reports the payment and a platform admin verifies it.

**Config** (`BillingConfig` additions):

| Field | Type / default | Purpose |
|---|---|---|
| `fallbackQrImageUrl` | `String?` | Uploaded through the existing `StorageService.upload` (MinIO), the same pattern as brand logos |
| `fallbackQrAccountName` | `String?` | e.g. "Kevin Dave Gerona, BPI" |
| `fallbackQrInstructions` | `String?` | Shown next to the QR |
| `claimLockHoldDays` | `Int @default(3)` | How long a pending claim holds off the lock |

**When the fallback is shown instead of PayMongo**, if a fallback QR is configured:
- `qrphCollectedThisMonth >= paymongoMonthlyLimitCentavos`, counting non-flagged `BillingPayment` with `method QRPH` and a Manila-month `paidAt`, plus the amount being paid now; or
- the provider is unconfigured; or
- `createQrCharge` fails: PayMongo returns an error, returns no QR, can't be reached, or doesn't answer within 15 seconds (every PayMongo call times out after 15s, so a hung call can't leave Pay now waiting).

If there's no fallback configured either, Pay now shows "Online payment is unavailable right now. Please email us at support@kioscify.com." with an email button. The `pay` endpoint response gains `kind: 'paymongo' | 'fallback'`. For `fallback` it returns `{ fallbackQrImageUrl, accountName, instructions, amountCentavos, invoiceNumber }` and no PayMongo call is made.

**Payment claims:** a new model.
```prisma
model BillingPaymentClaim {
  id            String   @id @default(auto()) @map("_id") @db.ObjectId
  invoiceId     String   @db.ObjectId
  tenantId      String   @db.ObjectId
  submittedById String   @db.ObjectId
  amountCentavos Int
  reference     String            // bank/e-wallet reference number (required)
  paidAt        DateTime
  receiptImageUrl String?         // optional screenshot via StorageService
  note          String?
  status        String   @default("PENDING")   // PENDING | APPROVED | REJECTED
  reviewedById  String?  @db.ObjectId
  reviewedAt    DateTime?
  rejectReason  String?
  createdAt     DateTime @default(now())
  @@index([status, createdAt])
  @@index([invoiceId])
  @@map("billing_payment_claims")
}
```

**Endpoints:**
- `POST billing/me/invoices/:id/claims` (STORE_ADMIN/ADMIN only; multipart with an optional receipt image, using the `FileInterceptor` pattern from `stores.controller.ts`). Allowed while LOCKED. One PENDING claim per invoice: a new submission replaces the earlier PENDING one.
- Platform: `GET platform/billing/claims?status=PENDING`, `POST platform/billing/claims/:id/approve` (calls `recordPayment(source MANUAL, method MANUAL, manualMethod 'bank_qr', reference)`, then APPROVED), and `POST …/reject {reason}`. All are audited.

**Status effect:** while an invoice has a PENDING claim younger than `claimLockHoldDays`, `computeBillingStatus` returns **DUE** with `verificationPending: true` instead of LOCKED.
- The banner reads "Payment submitted, awaiting verification".
- After the hold expires, or once the claim is rejected, normal rules apply. The rejection reason is shown in the banner.
- (My call. This keeps honest payers from being locked while they wait for review, and a fake claim only buys `claimLockHoldDays`.)

**Limit counting:** only QRPH (PayMongo) payments count toward the limit. Manual payments, approved claims and prepayments don't.

**Dashboard:**
- The "Pending payment claims" count and queue get their own card and tab.
- The limit banner says "PayMongo limit reached: stores are being shown your bank QR".

**UI:**
- Store Portal and Kiosk Pay now: when `kind === 'fallback'`, show your QR image, account name, instructions and the amount to enter. Then an **"I've paid"** form: reference (required), amount (prefilled), date, optional receipt photo. `expo-image-picker` isn't installed, so the Kiosk omits the photo (my call: no new native dependency). Receipt photos can be attached from the Store Portal.
- Platform Settings → Billing: upload or replace the fallback QR, plus account name and instructions.

### Reminders
- `ReminderChannel { name; deliver(reminder, invoice, recipients) }`. The only implementation today is `InAppReminderChannel`, which only creates the `BillingReminder` row.
- **Recipients:** store admins (STORE_ADMIN/ADMIN with access to the tenant). `GET billing/me` returns the latest unacknowledged reminder to those roles. Clients show a one-time modal, and acknowledging it records the user.
- The banner copy gets stronger at each offset: day 0 "Due today", day 3 "4 days left before access is paused", day 7 "Last day before access is paused". During grace the banner title reads "Subscription due — N days left before access is paused"; with enforcement off nothing is locked, so it reads just "N days left".

### Env vars
Added to `kioskly-api/.env.example`, root `.env.example`, `docker-compose.yml` `api.environment`, and the deployment docs:
```
PAYMONGO_SECRET_KEY=sk_test_...
PAYMONGO_PUBLIC_KEY=pk_test_...
PAYMONGO_WEBHOOK_SECRET=whsk_...
BILLING_PAY_PAGE_BASE_URL=http://kioscify.localhost
```
- Use test keys locally.
- Keys are only read through `ConfigService`. They're never logged: the pino redact list gains `authorization`. They're never returned.
- Register the webhook in the PayMongo dashboard (or with `POST /v1/webhooks`) for `payment.paid`, `payment.failed` and `qrph.expired`, pointing at `https://<api-host>/api/v1/billing/webhooks/paymongo`.

## Store Portal (`kioskly-admin`)

- **`BillingProvider`** (new context) in `app/(main)/layout.tsx`. It fetches `GET billing/me` after the existing account-status check, refreshes on window focus and every 5 min, and exposes `status` and `refresh()`. With billing OFF (`status: EXEMPT`) it renders nothing, so the page is unchanged.
- **Global banner** (`components/BillingBanner.tsx`): rendered inside `<main>` above `{children}` when the status is DUE.
  - Shows amount, due date, days left and **Pay now**.
  - Collapsible to a slim bar for the session (`sessionStorage`). It can't be dismissed.
  - The variant gets stronger from day 0 to day 7.
- **Reminder modal:** shown once per `pendingReminder`, then acknowledged.
- **Pay now modal** (`components/PayNowModal.tsx`):
  - Calls `POST billing/me/pay` and shows the QR `<img src={qrImage}>`, a countdown to `expiresAt`, a "Copy/Open pay link" button and a "Refresh QR" button once expired.
  - Polls `payment-status` every `pollSeconds`. When paid, it shows success and refreshes billing.
- **Lock:** the layout redirects to `/subscription-overdue` when the status is LOCKED, unless the account status is non-ACTIVE (deactivation wins, and the existing `/account-status` flow applies).
  - The `/subscription-overdue` page is full-bleed like `/account-status`. It shows the amount, the inline QR (same component), the pay link, and **Log out**.
  - It polls `billing/me` every `pollSeconds` and redirects to `/dashboard` when the store is unlocked.
  - The axios interceptor also redirects on `code === 'SUBSCRIPTION_LOCKED'`.
  - `account-status` type: `SUBSCRIPTION_LOCKED` routes to `/subscription-overdue`, not `/account-status`.
- **Billing page** `app/(main)/billing/page.tsx`, with sidebar item "Billing" (`CreditCard` icon):
  - Owner/admin only.
  - **Current plan:** price, status, trial end, paid-through, next billing, and Pay now when an invoice is open.
  - **History table:** period, amount, due date, status (Open/Paid/Waived/Void), paid date, method (QRPH/Manual/Prepaid), reference.
  - **Receipt:** `/billing/receipts/[invoiceId]` is a print-styled page with `window.print()`. It's cheap, so it's included.
  - Exempt stores see "No billing for this store."
  - Reachable while LOCKED: the layout allows `/billing` and `/subscription-overdue`, and the APIs are allowlisted.
- **Public pay page** `app/pay/[token]/page.tsx` sits outside `(main)`, with no auth. `middleware.ts` skips subdomain and auth handling for `/pay/*`. Maintenance mode still applies. It renders the store name, amount, QR, countdown and paid state, and polls.

## Kiosk app (`kioskly-app`)

- **`contexts/BillingContext.tsx`** goes under `AuthProvider`.
  - **Fetch:** `GET billing/me` on login, cold start, AppState→active, every 5 min, and every `pollSeconds` while the overdue screen is open.
  - **Cache:** saved in AsyncStorage as `@kioscify:billing_status` (`{ me, fetchedAt, tenantId }`, where `me` is the last `billing/me` response, including its `cache` hints). It is read only when its `tenantId` matches the current store, so another store's entry is ignored.
  - **Store switch:** the previous store's status is cleared from memory at once. A `billing/me` response that arrives after the switch is dropped, so it is neither shown nor cached under the new store.
  - The `SUBSCRIPTION_LOCKED` status from login and account-status also feeds it. It triggers a `billing/me` fetch and counts as LOCKED until that fetch returns.
- **Offline policy (decision 4):**
  - If the fetch fails because of the network, or the API answers with a 5xx, the effective status comes from the cache: once `now ≥ cache.validUntil` (enforcement on) → **LOCKED locally**. `validUntil` is the grace end, extended to the claim-hold end while an "I've paid" claim is pending.
  - The cache survives app restarts: on a cold start it is kept while the stored login is restored, so restarting an offline kiosk does not unlock it. It is cleared only on logout.
  - A cached ACTIVE or TRIAL whose `nextBillingAt + grace` has passed while offline also locks (`cache.validUntil` = the moment the cached status would become LOCKED).
  - It unlocks only after an online `billing/me` says the store isn't LOCKED.
  - Known limitation: a device clock moved backwards defeats the offline lock. This is accepted, since the server still enforces.
- **Checkout not interrupted:** `home.tsx` publishes `checkoutInProgress = showCheckoutModal || isCreatingTransaction || showTransactionSummary` to `BillingContext` through `setCheckoutInProgress`.
  - The redirect to `/subscription-overdue` in `AppNavigator` waits while that flag is true, and runs when it goes false.
  - It also runs on foreground and on navigation.
  - The transaction POST itself is allowlisted, so an in-flight sale always succeeds.
- **Banner:** `components/BillingBanner.tsx` sits in `AppNavigator` next to `OfflineBanner`, so it appears on every screen during DUE.
  - STORE_ADMIN/ADMIN: amount, due, days left, **Pay now**.
  - CASHIER: "Your store's subscription is due. Please contact your store admin." No pay action.
  - It can be collapsed for the session (in-memory). The reminder modal is for store admins only.
- **Overdue screen** `app/subscription-overdue.tsx`:
  - Admins see amount, QR (`<Image source={{uri: qrImage}}>`, so no native QR lib is needed), countdown/refresh, "Open pay page" (`expo-web-browser`), and Log out.
  - Cashiers see the contact-your-admin message and Log out.
  - It polls and unlocks automatically.
- **`utils/api.ts`:** a 403 with `code === 'SUBSCRIPTION_LOCKED'` triggers `billingEvents.notifyLocked()` (mirrors `authEvents`), and the context refreshes.
- **Sync engine:** a 403 `SUBSCRIPTION_LOCKED` must never consume retries (it shouldn't happen, since uploads are allowlisted, but this guards against it). It's treated like 429: back to pending, run stopped.
  - Also fix `expenseService` `is4xx`, which is always false today.
- **Versions:** bump `android/app/build.gradle` to versionCode 7 / versionName 1.1.0 and `app.json` version.
  - **Minimum kiosk version for enforcement = 7 (1.1.0).**
  - Release it with `force_update: true` through the existing `/app/version` flow before turning enforcement on.

**Old APKs (≤1.0.5, versionCode ≤6) with this API:**
- Billing OFF: no change.
- DUE: no banner, no change.
- LOCKED with enforcement:
  - login and account-status return `SUBSCRIPTION_LOCKED`, so the old "Your subscription has ended" screen appears with Sign Out only;
  - mid-session calls get 403s, which show error text at checkout (sales still sync, because uploads are allowlisted).
- This is acceptable but poor, which is why enforcement requires `minKioskVersionCode` and force-update first.

## Platform Admin (`kioscify-platform`)

- **Settings → Billing card** (`settings/page.tsx`, next to Maintenance):
  - Billing enabled and Enforcement enabled toggles (`MaintenanceToggleRow` style). Enabling enforcement opens a confirm dialog that shows `minKioskVersionCode` and the rollout checklist.
  - Number inputs for trial days, grace days, "Remind before due (days)" (`invoiceLeadDays`), poll seconds, monthly limit (₱) and warn %.
  - Reminder offsets as comma-separated days.
  - A read-only PayMongo mode badge (TEST / LIVE / NOT CONFIGURED) and webhook status.
- **`/subscriptions` dashboard** (replaces the current list):
  - **Overview cards:** Trial, Active/paid, Due (grace), Locked, Exempt, Not activated, Not set up; Expected this month, Collected this month, Outstanding; Upcoming invoices (7 days).
  - **Limit banner:** amber at ≥ warn %, red at ≥ 100%.
  - **Store table:** filters (company, brand, status, due date range), search, the columns listed above, row checkboxes for **bulk** "Apply settings / Enable billing / Mark exempt".
  - **Payments tab:** cross-store log with Export CSV.
- **`/subscriptions/[tenantId]` detail:**
  - **Settings form:** billing toggle, with a required reason when off; price ₱ (required to enable); activation date; trial start/length with the computed trial end shown and an "Extend trial" button; anchor day; next billing date override; paid-through display; grace override.
  - **Status + preview panel:** renders the same banner/lock copy the store would see.
  - **Actions:** generate invoice now, mark paid manually (method, reference, note), waive/void, extend grace, re-check PayMongo, resend reminder, record prepayment (amount, months, paid-through, next billing, method, reference, note).
  - **Tabs:** Invoices, Payments (webhook/manual/prepayment, with PayMongo refs), Reminders, Audit log, Legacy months (the existing checklist, read-only when billed).
- **Onboard-store modal** (`companies/[id]/page.tsx`): required fields Monthly price (₱), Trial days (prefilled from the global default 15), and First billing date (prefilled to today + trial days, editable). They're sent as `billing` on `createStore`.

## Suggested additional settings (and why)

| Setting | Why |
|---|---|
| `invoiceLeadDays` (global, default 7; shown as "Remind before due (days)") | Issues the invoice and shows the reminder banner this many days before the due date, so stores can pay ahead. With 0 the invoice is issued on the due date and there is no reminder. |
| `minKioskVersionCode` (global) | Makes sure old APKs are gone before enforcement is turned on, so they never hit the degraded lock. |
| `overduePollSeconds` (global, default 30) | Sets how fast the overdue screen unlocks after payment, traded against API load. |
| `limitWarnPercent` (global, default 80) | Sets when the PayMongo limit warning triggers. |
| Per-invoice grace extension | One-off leniency without changing the store's settings. |
| Exempt reason (per store) | An audit trail for special agreements. |
| (Deferred) Price effective date | "New price from <date>" instead of "from next invoice". Not needed yet. |

## Edge cases & error handling

- **Billing toggled off while an invoice is OPEN:** the status becomes EXEMPT right away. The open invoice stays OPEN in history, and the admin can void or waive it.
- **Global switch turned off:** every store goes back to EXEMPT, and jobs stop. Data is kept.
- **Price changed:** affects future invoices only. Issued invoices keep their snapshot.
- **Trial extended:** recomputes `nextBillingAt` unless it was overridden.
- **Store deactivated:** deactivation wins at the gate. Jobs skip inactive or tombstoned tenants.
- **Store deleted:** cascades through `StoreSubscription` to invoices. Payments, attempts and reminders keep `tenantId` as historical data. They're cleaned up by the store-deletion cascade if one exists; otherwise they're orphaned and harmless.
- **Multi-store admins:** everything is scoped to the JWT's active tenant. Switching stores re-fetches billing.
- **Concurrency:** generation is protected by a unique index, payments by the conditional OPEN→PAID update, webhooks by a unique event id, reminders by a unique `(invoice, offset, channel)`.
- **PayMongo down:** Pay now returns 503 with a friendly message. The banner and lock still work.
- **Month end:** anchor clamping is unit-tested for 29/30/31 and leap years.

## Phasing (each phase deployable with billing OFF)

1. **Schema + settings + status.** Prisma models and fields; `BillingConfig` endpoints; per-store billing PATCH, validation and audit; `computeBillingStatus` and its tests; onboarding fields (API + modal); Platform settings card, dashboard and detail (settings, preview, audit); CORS PUT fix.
2. **Invoices + PayMongo.** `@nestjs/schedule` + JobLock; `ensureInvoice`; `recordPayment` / prepayment / manual actions; `PaymongoProvider`; webhook + raw body; reconciliation; the remaining Platform actions; payments log + CSV; fallback QR config/upload, payment claims (API + Platform review queue), limit detection.
3. **Store-facing.** `billing/me` endpoints and the pay page API; Store Portal BillingProvider, banner, Pay now, Billing page, receipt, public pay page; Kiosk BillingContext, cache, banner, Pay now (role-aware, including the fallback QR + "I've paid" claim form), version bump.
4. **Reminders.** Job, channel, ack, modals.
5. **Lock.** `BillingStatusGuard` + allowlist; `SUBSCRIPTION_LOCKED` in account-status and login; Store Portal and Kiosk overdue screens; offline lock policy; checkout deferral; sync-engine 403 handling; the enforcement confirm and minimum version.

## Testing

- **Unit (`*.spec.ts` next to services):**
  - `computeBillingStatus`: global off, store off, null, not activated, trial, active, due day 0/6, lock day 7, enforcement off stays DUE, grace extension, override, virtual due (no invoice), Manila midnight boundary, anchor 29/30/31 and leap year, deactivated combination at the gate.
  - `ensureInvoice`: idempotency, including P2002 and two concurrent calls.
  - `recordPayment`: double webhook means no double extension; flagged overpayment; re-anchor when paid after grace; ledger upsert.
  - Webhook: valid te, valid li, invalid, missing header, stale timestamp, duplicate event id.
  - Reminder dedupe; JobLock.
  - Guard: LOCKED blocks a normal route but allows the sync POSTs and the allowlist; PLATFORM_ADMIN and COMPANY_ADMIN pass.
  - Prepayment: nothing before `nextBillingAt`.
  - Fallback: chosen when the limit is reached, the provider is unconfigured or creation fails; a pending claim holds off the lock until `claimLockHoldDays`; approving a claim goes through `recordPayment`; a rejected claim restores the lock.
  - Enable preview: honors consecutive paid ledger months; void then reissue gives revision 1 and no P2002 deadlock.
  - Late payment re-anchors with enforcement both on and off.
  - Price validation on enable.
- **Billing-OFF parity:**
  - `JwtStrategy` makes no billing queries when off.
  - The guard passes everything when off.
  - `auth/account-status` and the login response are unchanged apart from `billing: null`.
  - `POST /stores` with `billing` creates the subscription (billingEnabled true). It has no effect while global billing is OFF.
  - `subscriptions` list/detail is unchanged for non-billed stores.
- **E2E in PayMongo test mode:** local API with test keys plus a tunnel for the webhook. Enable a staging store → generate an invoice → Pay now (portal, kiosk, pay page) → pay the test QR → webhook marks it PAID → unlock. Replay the webhook (no-op). Drop the webhook and use Re-check.

## Rollout checklist

1. Deploy all phases with **Billing enabled = OFF** and **Enforcement = OFF**. Verify nothing changed: spot-check the Store Portal, kiosk and Company Portal.
2. Set the env vars (live keys only at step 6). Register the webhook. Check that the PayMongo mode badge shows TEST on staging.
3. In the Platform Admin, mark your own store and the special-agreement stores **Exempt**, with a reason.
4. For **prepaid stores**, record a prepayment that sets paid-through and next billing date **before** enabling billing for them.
5. Set the **price** on every store to be billed. Enabling is blocked without one.
6. On staging, turn global billing ON and run the full **PayMongo test-mode** flow end to end on a staging store.
7. In production, turn global billing ON and enable **one real store**. Watch its first invoice, payment and webhook.
8. Release kiosk APK **1.1.0 (versionCode 7)** with `force_update`. Wait until the kiosks have updated, then set `minKioskVersionCode = 7`.
9. Turn **Enforcement ON**.
10. Enable the remaining stores, in bulk if you like.

## Decisions made during review (2026-10-24)

**User decisions**
1. **Late payment:** a payment after grace re-anchors the period to the payment date, whether or not enforcement is on. There is one open invoice at a time, and unpaid months past grace are never billed.
2. **PayMongo limit reached:** fall back to the owner's uploaded static bank QR, with payer-submitted claims verified by an admin.
3. **Old APKs:** for locked stores, the legacy `account-status` returns `SUBSCRIPTION_LOCKED`.
4. **Pay link:** a Kioscify pay page around a single QRPH Payment Intent. No Checkout Session.
5. **Default monthly limit:** ₱10,000.

**Builder's calls (check these while reading)**
- Void means reissue (revision + 1). Waive means forgive.
- Enabling an existing store honors consecutive paid ledger months, and the derived dates are shown in a confirm dialog.
- A pending claim holds off the lock for `claimLockHoldDays` (3).
- Only QRPH counts toward the limit.
- The legacy month checklist is read-only for billed stores.
- Payments on an already-settled invoice are recorded as `flagged` (not applied) for a manual refund; mismatched amounts are applied and marked `amountMismatch`.
- When an invoice is issued late, only the most recent passed reminder offset fires.
- Sync uploads are always accepted while LOCKED.
- Invoice numbers are `KSF-YYYYMM-<random>`.
- The webhook rejects requests whose timestamp is more than 5 minutes off.
- The minimum kiosk version for enforcement is versionCode 7 (1.1.0).

## Out of scope / deferred

- Cards, auto-debit, and PayMongo Checkout Sessions (wait for a registered business; add a `PaymentProvider` implementation).
- Email, SMS and push reminders (add a `ReminderChannel`).
- Refund automation: flagged overpayments are refunded by hand in PayMongo.
- Company Portal visibility and company-level invoices.
- Proration on price change.
