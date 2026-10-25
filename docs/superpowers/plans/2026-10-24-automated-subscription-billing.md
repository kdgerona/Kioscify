# Automated Subscription Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kioscify bills each store itself, with invoices, PayMongo QRPH payment confirmed by webhook, a grace-period banner, and a lock. Everything is settings-driven and OFF by default.

**Architecture:** A new `kioskly-api/src/billing/` module sits beside the existing `subscriptions/` module.
- **Status:** computed fresh on every read by a pure `computeBillingStatus` util, like `computeAccountStatus`. It's never stored.
- **Scheduler:** jobs only create invoices and reminders. Locking doesn't depend on them having run.
- **Payments:** `recordPayment` is the only path that applies a payment.
- **Clients:** the Platform Admin, Store Portal and Kiosk all read the same status object.

**Tech Stack:** NestJS 11, Prisma 6 + MongoDB, Jest; Next.js 15 (kioscify-platform, kioskly-admin); Expo SDK 54 (kioskly-app); `@nestjs/schedule` (phase 2); PayMongo REST via `fetch` (phase 2).

**Spec:** `docs/superpowers/specs/2026-10-24-automated-subscription-billing-design.md`

**Plan depth:** phase 1 is planned task by task below. Phases 2–5 are listed as tasks with their interfaces. Each of those phases gets its detailed steps written at its start, against the code that exists by then.

## Global Constraints

- **No commits or pushes.** The user reviews and commits (memory `feedback_no_auto_commit`). Each task ends at a **Checkpoint** instead of a commit.
- **Schema changes are additive only.** New fields are optional or have defaults. Never put a unique index on a nullable field. No backfill script, because every filter matches positive values (`billingEnabled: true`, `status: 'OPEN'`).
- **Billing-OFF parity:** with `BillingConfig.billingEnabled = false` (the default), every existing endpoint response and every UI stays exactly as it is today. The only allowed additions are new fields, and `billing: null`.
- **Money** is stored as integer centavos (`₱1,500 = 150000`). The UI shows `₱1,500.00`.
- **Dates:** all date math is in Manila days, through `kioskly-api/src/common/utils/timezone.ts` (fixed +8h). Dates are stored as the UTC instant of Manila 00:00.
- **Status values:** `EXEMPT | NOT_ACTIVATED | TRIAL | ACTIVE | DUE | LOCKED`.
- **Defaults:** trial 15 days, grace 7, reminders `[0,3,7]`, invoice lead days 0, monthly limit `1000000` centavos, warn at 80%, poll every 30 seconds, claim lock hold 3 days.
- **Copy:**
  - Exempt store: "No billing for this store."
  - Cashier: "Your store's subscription is due/overdue. Please contact your store admin."
  - Validation messages: "Set a monthly price before enabling billing", "Set an activation date before enabling billing", "An exemption reason is required".
- **Permissions:** platform billing routes are `@Roles('PLATFORM_ADMIN')` behind `JwtAuthGuard` and `RolesGuard`. The Company Portal is never touched.
- **API tests** run with `npm run test --workspace=kioskly-api` (Jest, `*.spec.ts` next to the source, Prisma mocked as in `subscriptions.service.spec.ts`).
- **Anchor for stores that already have paid months (my call, refining the spec):** when the manual ledger has a paid run and no `anchorDay` is set, use `anchorDay = 1`. The legacy ledger is calendar-monthly, so billing continues on the 1st of the month after the last paid month.

## Review Focus

1. **Enable on a legacy store with the current or future months ticked paid.** Expected: `nextBillingAt` is the 1st of the month after the last consecutive paid month, and nothing is billed for months already paid. Test: Task 3 `deriveEnableDates honors a paid run that extends into future months`.
2. **Anchor 31 across February and leap years.** Expected: Jan 31 → Feb 29 (2028) → Mar 31; the anchor is kept. Test: Task 2 `addZonedMonthsClamped keeps anchor 31 through Feb in a leap year`.
3. **A UTC time near Manila midnight.** Expected: `2026-11-30T16:30Z` is Dec 1 in Manila, so it's past a Dec 1 due date. Test: Task 3 `computeBillingStatus treats 16:30Z as next Manila day`.
4. **Global billing OFF while a store has `billingEnabled: true` and an overdue date.** Expected: EXEMPT, with no lock and no banner anywhere. Test: Task 3 `global off wins over store on`, plus the Task 8 parity test.
5. **Turning billing off for a store without a reason, or turning it on without a price, including in bulk.** Expected: a 400 per store with the exact copy, and nothing changes for the stores that fail. Test: Task 5 `bulk update reports per-store failures and leaves failed stores untouched`.

---

## Phase 1: Schema, settings and status (deployable with billing OFF)

### Task 1: Prisma schema (all billing models)

**Files:**
- Modify: `kioskly-api/prisma/schema.prisma`. Add the new fields to `StoreSubscription` (near L151) and the new models and enums after `PlatformConfig` (near L1109).

**Interfaces:**
- Produces: Prisma models `BillingConfig`, `BillingInvoice`, `BillingPayment`, `BillingPaymentAttempt`, `PaymentWebhookEvent`, `BillingReminder`, `BillingAuditLog`, `BillingPaymentClaim`, `JobLock`; enums `BillingInvoiceStatus { OPEN PAID VOID WAIVED }`, `BillingPaymentMethod { QRPH MANUAL PREPAID }`, `BillingPaymentSource { WEBHOOK RECONCILE MANUAL PREPAYMENT }`; new `StoreSubscription` fields `billingEnabled Boolean?`, `exemptReason String?`, `priceCentavos Int?`, `trialStartAt DateTime?`, `trialDays Int?`, `anchorDay Int?`, `nextBillingAt DateTime?`, `nextBillingOverridden Boolean?`, `paidThroughAt DateTime?`, `graceDaysOverride Int?`, `invoices BillingInvoice[]`.

- [ ] **Step 1:** Add every model exactly as written in the spec's "Data model" and "Fallback payment QR" sections. Add `fallbackQrImageUrl String?`, `fallbackQrAccountName String?`, `fallbackQrInstructions String?` and `claimLockHoldDays Int @default(3)` to `BillingConfig`. Put the invoice unique on `[subscriptionId, periodStart, revision]`. Add a section banner comment in the style of the file's existing `// ───` banners.
- [ ] **Step 2:** Run `npm run prisma:generate --workspace=kioskly-api`. Expected: "Generated Prisma Client" with no errors.
- [ ] **Step 3:** Run `npx prisma validate` in `kioskly-api`. Expected: "The schema … is valid".
- [ ] **Step 4:** If local Mongo is up (`docker compose -f docker-compose.local.yml ps`), run `npx prisma db push` in `kioskly-api` so the indexes get created. Expected: "Your database indexes are now in sync". If Mongo isn't up, note it and skip this step.
- [ ] **Checkpoint**

### Task 2: Manila date helpers

**Files:**
- Modify: `kioskly-api/src/common/utils/timezone.ts`
- Test: `kioskly-api/src/common/utils/timezone.spec.ts`

**Interfaces:**
- Produces:
  - `startOfZonedDay(date: Date): Date` (equals `getZonedDayBounds(date).start`)
  - `addZonedDays(date: Date, days: number): Date` (Manila 00:00 `days` days after the Manila day of `date`)
  - `zonedDayOfMonth(date: Date): number`
  - `addZonedMonthsClamped(date: Date, months: number, anchorDay: number): Date` (Manila 00:00 on `min(anchorDay, daysInTargetMonth)` of the Manila month `months` after `date`'s)
  - `zonedDaysBetween(from: Date, to: Date): number` (whole Manila days from `from`'s day to `to`'s day; can be negative)

- [ ] **Step 1: Write the failing tests.** `m(y, mo, d)` is a helper for Manila midnight, `new Date(Date.UTC(y, mo-1, d) - 8h)`.
  ```ts
  it('startOfZonedDay maps 2026-11-30T16:30Z to Manila Dec 1 00:00', () =>
    expect(startOfZonedDay(new Date('2026-11-30T16:30:00Z')).toISOString()).toBe('2026-11-30T16:00:00.000Z'));
  it('addZonedDays crosses month end', () =>
    expect(addZonedDays(m(2026,1,31), 1).toISOString()).toBe(m(2026,2,1).toISOString()));
  it('addZonedMonthsClamped keeps anchor 31 through Feb in a leap year', () => {
    const feb = addZonedMonthsClamped(m(2028,1,31), 1, 31);
    expect(feb.toISOString()).toBe(m(2028,2,29).toISOString());
    expect(addZonedMonthsClamped(feb, 1, 31).toISOString()).toBe(m(2028,3,31).toISOString());
  });
  it('addZonedMonthsClamped clamps 30 in non-leap Feb', () =>
    expect(addZonedMonthsClamped(m(2026,1,30), 1, 30).toISOString()).toBe(m(2026,2,28).toISOString()));
  it('addZonedMonthsClamped crosses year', () =>
    expect(addZonedMonthsClamped(m(2026,12,15), 1, 15).toISOString()).toBe(m(2027,1,15).toISOString()));
  it('zonedDaysBetween counts Manila days', () =>
    expect(zonedDaysBetween(m(2026,11,1), new Date('2026-11-07T15:59:00Z'))).toBe(6));
  ```
- [ ] **Step 2:** Run `npx jest src/common/utils/timezone.spec.ts` in `kioskly-api`. Expected: FAIL (the functions aren't exported).
- [ ] **Step 3:** Implement the functions in `timezone.ts` with the existing `toZoned` / `toUtcInstant` helpers.
- [ ] **Step 4:** Run the same command. Expected: all PASS, existing tests included.
- [ ] **Checkpoint**

### Task 3: Billing status and enable-date derivation (pure utils)

**Files:**
- Create: `kioskly-api/src/common/utils/billing-status.util.ts`
- Create: `kioskly-api/src/common/utils/billing-dates.util.ts`
- Create: `kioskly-api/src/common/utils/billing-copy.util.ts`
- Test: `billing-status.util.spec.ts`, `billing-dates.util.spec.ts`, `billing-copy.util.spec.ts` next to them

**Interfaces:**
- Consumes: Task 2 helpers.
- Produces:
```ts
// billing-status.util.ts
export type BillingStatus = 'EXEMPT' | 'NOT_ACTIVATED' | 'TRIAL' | 'ACTIVE' | 'DUE' | 'LOCKED';
export interface BillingConfigInput { billingEnabled: boolean; enforcementEnabled: boolean; defaultTrialDays: number; defaultGraceDays: number; claimLockHoldDays: number; }
export interface SubscriptionInput { billingEnabled: boolean | null; priceCentavos: number | null; activatedAt: Date | null; trialStartAt: Date | null; trialDays: number | null; nextBillingAt: Date | null; paidThroughAt: Date | null; graceDaysOverride: number | null; }
export interface OpenInvoiceInput { id: string; dueAt: Date; amountCentavos: number; graceExtendedUntil: Date | null; pendingClaimSubmittedAt: Date | null; }
export interface BillingStatusResult {
  status: BillingStatus; enforcement: boolean; amountCentavos: number | null;
  dueAt: Date | null; graceEndsAt: Date | null; daysLeft: number | null; daysOverdue: number | null;
  trialEndsAt: Date | null; paidThroughAt: Date | null; nextBillingAt: Date | null;
  openInvoiceId: string | null; verificationPending: boolean;
}
export function getTrialEndsAt(sub: SubscriptionInput, config: BillingConfigInput): Date | null;
export function computeBillingStatus(config: BillingConfigInput | null, sub: SubscriptionInput | null, openInvoice: OpenInvoiceInput | null, now?: Date): BillingStatusResult;
export const DEFAULT_BILLING_CONFIG: BillingConfigInput; // { false, false, 15, 7, 3 }

// billing-dates.util.ts
export interface EnableDatesInput { activatedAt: Date; trialStartAt: Date | null; trialDays: number; anchorDay: number | null; paidMonthStarts: Date[]; now: Date; }
export interface EnableDatesResult { trialEndsAt: Date; anchorDay: number; paidThroughAt: Date | null; nextBillingAt: Date; honoredMonths: string[] /* YYYY-MM */; }
export function deriveEnableDates(input: EnableDatesInput): EnableDatesResult;

// billing-copy.util.ts
export interface StoreView { variant: 'none' | 'banner' | 'lock'; title: string; body: string; showPayAction: boolean; }
export function describeStoreView(result: BillingStatusResult, audience: 'admin' | 'cashier'): StoreView;
```

`computeBillingStatus` applies the spec's evaluation order. Rules fixed by this task:
- `getTrialEndsAt` = `addZonedDays(trialStartAt ?? activatedAt, trialDays ?? defaultTrialDays)`.
- The virtual due date is `sub.nextBillingAt`, used when there's no open invoice and `now >= nextBillingAt`. Its amount is `sub.priceCentavos`.
- TRIAL applies only when `now < trialEndsAt` and `paidThroughAt == null`.
- `graceEndsAt = max(addZonedDays(dueAt, sub.graceDaysOverride ?? defaultGraceDays), graceExtendedUntil)`.
- `daysLeft = zonedDaysBetween(now, graceEndsAt)`, and `daysOverdue = max(0, zonedDaysBetween(dueAt, now))`.
- A claim hold applies when `pendingClaimSubmittedAt` is set and `now < addZonedDays(pendingClaimSubmittedAt, claimLockHoldDays)`. A store that would be LOCKED becomes DUE instead, and `verificationPending` is true whenever a pending claim exists.

`deriveEnableDates`:
- `paidMonthStarts` are ledger month starts with `paid: true`. Find the run of consecutive months that ends latest. Use it only if its last month is at or after the current Manila month.
- With a run: `paidThroughAt` is the last day of the last month (Manila 00:00 of that day), `anchorDay = anchorDay ?? 1`, and the candidate is the first anchor date at or after the day after `paidThroughAt`.
- Without a run: `anchorDay = anchorDay ?? zonedDayOfMonth(trialEndsAt)`. The candidate starts at `trialEndsAt` and steps forward with `addZonedMonthsClamped` until it is `>= startOfZonedDay(now)`.
- `nextBillingAt = max(candidate, trialEndsAt)`.

- [ ] **Step 1: Write the failing status tests.** Each builds a config and subscription from `DEFAULT_BILLING_CONFIG` and a base subscription `{ billingEnabled: true, priceCentavos: 150000, activatedAt: m(2026,10,1), trialStartAt: null, trialDays: null, nextBillingAt: m(2026,10,16), paidThroughAt: null, graceDaysOverride: null }`, with `config.billingEnabled = true`.
  - `global off wins over store on`: `config.billingEnabled = false`, `now = m(2027,1,1)` → `EXEMPT`.
  - `null sub / billingEnabled null / false` → `EXEMPT`.
  - `activatedAt null` → `NOT_ACTIVATED`.
  - `trial`: `now = m(2026,10,10)` → `TRIAL`, with `trialEndsAt = m(2026,10,16)`.
  - `virtual due day 0`: `now = m(2026,10,16)` and no invoice → `DUE`, `amountCentavos 150000`, `graceEndsAt m(2026,10,23)`, `daysLeft 7`.
  - `day 6 still DUE`: `now = m(2026,10,22)` → `DUE`, `daysLeft 1`.
  - `lock day 7 with enforcement`: `enforcementEnabled = true`, `now = m(2026,10,23)` → `LOCKED`, `daysOverdue 7`.
  - `enforcement off stays DUE`: same `now`, enforcement off → `DUE`, `daysOverdue 7`.
  - `open invoice not yet due` → `ACTIVE`, `openInvoiceId` set.
  - `graceExtendedUntil m(2026,10,30)`, enforcement on, `now = m(2026,10,25)` → `DUE`.
  - `graceDaysOverride 3`, enforcement on, `now = m(2026,10,19)` → `LOCKED`.
  - `pending claim holds lock`: enforcement on, `now = m(2026,10,24)`, claim submitted `m(2026,10,23)` → `DUE` with `verificationPending: true`. With `now = m(2026,10,26)` → `LOCKED` with `verificationPending: true`.
  - `paidThroughAt set during trial window` → `ACTIVE`, not TRIAL.
  - `computeBillingStatus treats 16:30Z as next Manila day`: `nextBillingAt = m(2026,12,1)`, `now = new Date('2026-11-30T16:30:00Z')` → `DUE`.
- [ ] **Step 2: Write the failing date tests.**
  - `no paid run, trial in future`: activated `m(2026,10,1)`, trial 15, `now = m(2026,10,5)` → `nextBillingAt m(2026,10,16)`, `anchorDay 16`, `paidThroughAt null`.
  - `no retroactive: old activation rolls forward`: activated `m(2025,1,10)`, trial 15, `now = m(2026,10,24)` → `anchorDay 25`, `nextBillingAt m(2026,10,25)`.
  - `deriveEnableDates honors a paid run that extends into future months`: paid `[2026-09, 2026-10, 2026-11, 2026-12]`, `now = m(2026,10,24)` → `paidThroughAt m(2026,12,31)`, `nextBillingAt m(2027,1,1)`, `anchorDay 1`, `honoredMonths ['2026-09','2026-10','2026-11','2026-12']`.
  - `ignores a paid run that ended before current month`: paid `[2026-05]`, `now = m(2026,10,24)` → `paidThroughAt null`.
  - `run broken by a gap uses the latest run`: paid `[2026-08, 2026-10]`, `now = m(2026,10,24)` → `paidThroughAt m(2026,10,31)`, `honoredMonths ['2026-10']`.
  - `nextBillingAt never before trialEndsAt`: activated `m(2026,10,20)`, trial 15, paid `[2026-10]` → `nextBillingAt m(2026,11,4)`.
- [ ] **Step 3: Write the failing copy tests.**
  - `EXEMPT` → `variant 'none'`.
  - `DUE` admin → `'banner'` with `showPayAction true`.
  - `DUE` cashier → `body` equals "Your store's subscription is due. Please contact your store admin." and `showPayAction false`.
  - `LOCKED` cashier → `body` contains "overdue".
  - `verificationPending` → `title` "Payment submitted, awaiting verification".
- [ ] **Step 4:** Run `npx jest src/common/utils/billing-` in `kioskly-api`. Expected: FAIL (modules missing).
- [ ] **Step 5:** Implement the three utils.
- [ ] **Step 6:** Run the same command. Expected: all PASS.
- [ ] **Checkpoint**

### Task 4: Billing config + audit services and the global settings API

**Files:**
- Create: `kioskly-api/src/billing/billing.module.ts`, `billing-config.service.ts`, `billing-audit.service.ts`, `paymongo-mode.util.ts`, `dto/update-billing-config.dto.ts`, `controllers/platform-billing.controller.ts`
- Modify: `kioskly-api/src/app.module.ts` (import `BillingModule`), `kioskly-api/.env.example`, `.env.example`, `docker-compose.yml` (`api.environment`: `PAYMONGO_SECRET_KEY`, `PAYMONGO_PUBLIC_KEY`, `PAYMONGO_WEBHOOK_SECRET`, `BILLING_PAY_PAGE_BASE_URL`)
- Test: `billing-config.service.spec.ts`, `paymongo-mode.util.spec.ts`

**Interfaces:**
- Produces:
  - `BillingConfigService.get(): Promise<BillingConfig>`: upserts `key:'global'` with the defaults and caches it in memory for 30 seconds.
  - `BillingConfigService.update(dto: UpdateBillingConfigDto, actorUserId: string): Promise<BillingConfig>`: invalidates the cache and writes an audit row with action `config.update`.
  - `BillingConfigService.toStatusConfig(c: BillingConfig): BillingConfigInput`.
  - `BillingAuditService.log(entry: { tenantId: string | null; actorUserId: string | null; action: string; before?: unknown; after?: unknown }): Promise<void>`.
  - `BillingAuditService.list(tenantId: string | null, limit = 50)`.
  - `getPaymongoMode(secretKey?: string): 'test' | 'live' | 'unconfigured'`.
  - Routes `GET /platform/billing/config` → `{ ...config, paymongoMode, webhookConfigured: boolean }` and `PATCH /platform/billing/config`.
  - `BillingModule` exports `BillingConfigService`, `BillingAuditService` and `BillingStatusService` (Task 5).
- `UpdateBillingConfigDto` has every config field optional:

  | Field | Validation |
  |---|---|
  | `billingEnabled`, `enforcementEnabled` | `@IsBoolean` |
  | `defaultTrialDays` | `@IsInt @Min(0) @Max(365)` |
  | `defaultGraceDays` | `@IsInt @Min(0) @Max(60)` |
  | `reminderOffsets` | `@IsArray @IsInt({each}) @Min(0,{each}) @Max(60,{each}) @ArrayMaxSize(10)` |
  | `invoiceLeadDays` | 0..28 |
  | `paymongoMonthlyLimitCentavos` | `@Min(0)` |
  | `limitWarnPercent` | 1..100 |
  | `overduePollSeconds` | 10..300 |
  | `claimLockHoldDays` | 0..14 |
  | `minKioskVersionCode` | `@IsInt @Min(1)`, nullable |
  | `fallbackQrAccountName`, `fallbackQrInstructions` | `@MaxLength(280)` |
  | `confirmEnforcement` | `@IsBoolean` |

- [ ] **Step 1: Write the failing tests.**
  - `get upserts defaults and caches within 30s`: the Prisma upsert is called once across two calls.
  - `update invalidates cache and audits before/after`.
  - `enabling enforcement without minKioskVersionCode throws BadRequest "Set the minimum kiosk version before enabling enforcement"`.
  - `enabling enforcement without confirmEnforcement:true throws BadRequest "Confirm enforcement to continue"`.
  - `reminderOffsets are de-duplicated and sorted ascending`.
  - `getPaymongoMode`: `sk_test_x` → `'test'`, `sk_live_x` → `'live'`, `undefined` or `''` → `'unconfigured'`.
  - `the config response never contains key material`: the serialized `GET` result does not match `/sk_|pk_|whsk_/`.
- [ ] **Step 2:** Run `npx jest src/billing` in `kioskly-api`. Expected: FAIL.
- [ ] **Step 3:** Implement. The controller uses `@Controller('platform/billing')`, `@UseGuards(JwtAuthGuard, RolesGuard)`, `@Roles('PLATFORM_ADMIN')` and `@ApiTags('billing')`, mirroring `subscriptions.controller.ts`. The actor id comes from `req.user` (check the field `JwtStrategy.validate` returns). Keys are read only through `ConfigService`.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Checkpoint**

### Task 5: Per-store billing settings, status service, overview, store table, bulk; legacy PUT guard; CORS PUT fix

**Files:**
- Create: `kioskly-api/src/billing/billing-status.service.ts`, `billing-settings.service.ts`, `dto/update-store-billing.dto.ts`, `dto/bulk-store-billing.dto.ts`
- Modify:
  - `kioskly-api/src/billing/controllers/platform-billing.controller.ts` (add routes)
  - `kioskly-api/src/subscriptions/subscriptions.service.ts` (`upsertPayment` gets a 409 when billed)
  - `kioskly-api/src/subscriptions/subscriptions.module.ts` (import `BillingModule` if it needs the config, otherwise read `billingEnabled` from the subscription row directly)
  - `kioskly-api/src/main.ts` (CORS `methods` gains `'PUT'`)
- Test: `billing-status.service.spec.ts`, `billing-settings.service.spec.ts`, update `subscriptions.service.spec.ts`

**Interfaces:**
- Consumes: Task 3 utils, Task 4 services.
- Produces:
  - `BillingStatusService.forTenant(tenantId: string, opts?: { previewEnabled?: boolean }): Promise<BillingStatusResult>`: loads the subscription, the oldest OPEN invoice and that invoice's latest PENDING claim. With `previewEnabled`, it computes with `billingEnabled: true` forced.
  - `BillingStatusService.forTenants(tenantIds: string[], opts?)`: `Promise<Map<string, BillingStatusResult>>`, batched with `findMany`.
  - `BillingSettingsService.getStoreBilling(tenantId)` → `{ tenantId, storeName, company, brand, settings: { billingEnabled, exemptReason, priceCentavos, activatedAt, trialStartAt, trialDays, trialEndsAt, anchorDay, nextBillingAt, nextBillingOverridden, paidThroughAt, graceDaysOverride }, status: BillingStatusResult, previewStatus: BillingStatusResult, storeView: { admin: StoreView, cashier: StoreView }, audit: BillingAuditLog[], globalBillingEnabled: boolean }`.
  - `BillingSettingsService.enablePreview(tenantId)` → `EnableDatesResult` (it 400s if price or activation is missing, with the Global Constraints copy).
  - `BillingSettingsService.updateStoreBilling(tenantId, dto: UpdateStoreBillingDto, actorUserId)` → the same shape as `getStoreBilling`.
  - `BillingSettingsService.bulkUpdate(tenantIds: string[], patch: UpdateStoreBillingDto, actorUserId)` → `{ tenantId: string; ok: boolean; error?: string }[]`.
  - `BillingSettingsService.overview()` → `{ globalBillingEnabled, counts: Record<BillingStatus | 'NOT_SET_UP', number>, upcomingNext7Days: number }`. Counts use `previewEnabled` so admins can prepare the rollout while billing is OFF. `NOT_SET_UP` means the subscription is missing or has `billingEnabled === null`. Money totals come in phase 2.
  - `BillingSettingsService.listStores(filters: { companyId?, brandId?, status?: BillingStatus | 'NOT_SET_UP', dueFrom?, dueTo?, q?, page?, limit? })` → `{ data: { tenantId, storeName, company, brand, priceCentavos, billingEnabled, exemptReason, status, paidThroughAt, nextBillingAt, daysOverdue, lastPaymentAt }[], pagination }`. `lastPaymentAt` is the latest ledger `paidAt` (phase 2 adds `BillingPayment`). `q` matches the store, company or brand name case-insensitively. It filters in memory, like `SubscriptionsService.getList`.
  - Routes:
    - `GET platform/billing/overview`
    - `GET platform/billing/stores`
    - `PATCH platform/billing/stores/bulk`
    - `GET platform/subscriptions/:tenantId/billing`
    - `GET platform/subscriptions/:tenantId/billing/enable-preview`
    - `PATCH platform/subscriptions/:tenantId/billing`
- `UpdateStoreBillingDto` has every field optional:

  | Field | Validation |
  |---|---|
  | `billingEnabled` | `@IsBoolean` |
  | `exemptReason` | `@IsString @MaxLength(280)`, nullable |
  | `priceCentavos` | `@IsInt @Min(1)` |
  | `activatedAt`, `trialStartAt`, `nextBillingAt` | `@IsDateString`, nullable |
  | `trialDays` | `@IsInt @Min(0) @Max(365)`, nullable |
  | `anchorDay` | `@IsInt @Min(1) @Max(31)`, nullable |
  | `graceDaysOverride` | `@IsInt @Min(0) @Max(60)`, nullable |

  Nullable fields use `@ValidateIf(v => v !== null)`. ISO date inputs are normalized with `startOfZonedDay`.
- `BulkStoreBillingDto`: `tenantIds: string[]` (`@ArrayMinSize(1) @ArrayMaxSize(200)`), `patch: UpdateStoreBillingDto` (`@ValidateNested`).

`updateStoreBilling` rules:
1. 404 if the tenant is missing. Upsert the `StoreSubscription`.
2. Merge the existing values with the DTO.
3. A merged `billingEnabled === true` needs `priceCentavos > 0` and `activatedAt`.
4. A merged `billingEnabled === false` needs a non-empty `exemptReason`.
5. `dto.nextBillingAt` set to a date makes `nextBillingOverridden = true`. Set to `null`, it clears the override.
6. On a transition to enabled, or when the trial, anchor or override changes while enabled and not overridden: if the store has no BillingInvoice rows yet, run `deriveEnableDates` with the ledger's paid month starts. Set `nextBillingAt` and `anchorDay`, and set `paidThroughAt` only if it's currently null.
7. Audit with action `settings.update` and before/after values of the changed fields only.

`bulkUpdate` runs `updateStoreBilling` per tenant and catches each error into `error: e.message`.

- [ ] **Step 1: Write the failing tests.**
  - `forTenant returns EXEMPT and issues no invoice query when the subscription has billingEnabled !== true`.
  - `forTenants batches: one findMany per model regardless of tenant count`.
  - `enable without price → BadRequest "Set a monthly price before enabling billing"`.
  - `enable without activation → BadRequest "Set an activation date before enabling billing"`.
  - `disable without reason → BadRequest "An exemption reason is required"`.
  - `enable on legacy store derives nextBillingAt from paid ledger run`: ledger paid `[2026-10, 2026-11]`, `now` mocked to `m(2026,10,24)` with `jest.useFakeTimers().setSystemTime(...)` → `nextBillingAt m(2026,12,1)`, `paidThroughAt m(2026,11,30)`.
  - `explicit nextBillingAt sets override and wins over derivation`.
  - `price change does not touch nextBillingAt`.
  - `audit row records only changed fields`.
  - `bulk update reports per-store failures and leaves failed stores untouched`: two tenants, one with no price, `patch {billingEnabled: true}` → `[{ok:true},{ok:false,error:'Set a monthly price before enabling billing'}]`, and no upsert or update for the failing tenant.
  - `listStores filters by status and q`.
  - `overview counts NOT_SET_UP and uses preview config when global off`.
  - In `subscriptions.service.spec.ts`: `upsertPayment throws ConflictException "Managed by billing; use mark-paid or prepayment" when subscription.billingEnabled === true`, and the existing tests still pass for non-billed stores.
- [ ] **Step 2:** Run `npx jest src/billing src/subscriptions` in `kioskly-api`. Expected: the new tests FAIL.
- [ ] **Step 3:** Implement the services, DTOs and routes, the 409 guard in `upsertPayment`, and the CORS `'PUT'`.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Checkpoint**

### Task 6: Onboarding creates a billed subscription

**Files:**
- Modify: `kioskly-api/src/stores/dto/store.dto.ts`, `kioskly-api/src/stores/stores.service.ts` (`create`, near L100–131)
- Test: `kioskly-api/src/stores/stores.service.spec.ts`

**Interfaces:**
- Produces:
  - `CreateStoreBillingDto { priceCentavos: number /* @IsInt @Min(1) */; trialDays: number /* @IsInt @Min(0) @Max(365) */; firstBillingDate: string /* @IsDateString */; activatedAt?: string /* @IsDateString */ }`.
  - `CreateStoreDto.billing: CreateStoreBillingDto`, required, via `@ValidateNested() @Type(...)`.
  - `UpdateStoreDto` becomes `PartialType(OmitType(CreateStoreDto, ['billing']))`, so billing can't be patched through `PATCH /stores/:id`.

- [ ] **Step 1: Write the failing tests.**
  - `create writes tenant and StoreSubscription in one $transaction` with `{ billingEnabled: true, priceCentavos: 150000, activatedAt: <given or now>, trialStartAt: activatedAt, trialDays: 15, nextBillingAt: startOfZonedDay(firstBillingDate), anchorDay: zonedDayOfMonth(firstBillingDate), nextBillingOverridden: false }`.
  - `create does not pass billing into tenant.create data`.
  - `the canOnboardStores and slug-conflict checks still run first` (the existing tests are updated to include `billing`).
- [ ] **Step 2:** Run `npx jest src/stores` in `kioskly-api`. Expected: FAIL.
- [ ] **Step 3:** Implement with `this.prisma.$transaction(async tx => { const tenant = await tx.tenant.create({ data: rest }); await tx.storeSubscription.create({ data: { tenantId: tenant.id, ... } }); return tenant; })`.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Checkpoint**

### Task 7: Platform Admin UI (settings card, dashboard, detail, onboarding)

**Files:**
- Modify: `kioscify-platform/types/index.ts`. Add `BillingStatus`, `BillingConfig`, `BillingStatusResult`, `StoreView`, `StoreBillingDetail`, `BillingStoreRow`, `BillingOverview`, `EnableDatesPreview` (mirroring the Task 4/5 shapes; dates as strings).
- Modify: `kioscify-platform/lib/api.ts`. Add a `// ─── Billing ───` section with:

  | Method | Route |
  |---|---|
  | `getBillingConfig()` | `GET /platform/billing/config` |
  | `updateBillingConfig(p)` | `PATCH /platform/billing/config` |
  | `getBillingOverview()` | `GET /platform/billing/overview` |
  | `getBillingStores(params)` | `GET /platform/billing/stores` |
  | `bulkUpdateStoreBilling(tenantIds, patch)` | `PATCH /platform/billing/stores/bulk` |
  | `getStoreBilling(tenantId)` | `GET /platform/subscriptions/:tenantId/billing` |
  | `getEnablePreview(tenantId)` | `GET /platform/subscriptions/:tenantId/billing/enable-preview` |
  | `updateStoreBilling(tenantId, p)` | `PATCH /platform/subscriptions/:tenantId/billing` |

  `createStore` and `onboardStore*` gain `billing`.
- Modify: `kioscify-platform/types/index.ts` `OnboardStorePayload` (add `billing`).
- Create: `kioscify-platform/lib/money.ts`: `formatPeso(centavos: number | null): string` (`₱1,500.00`, or `—` for null), `pesoToCentavos(input: string): number | null`.
- Create: `kioscify-platform/components/billing/BillingStatusBadge.tsx`, `components/billing/BillingSettingsCard.tsx`, `components/billing/StoreBillingForm.tsx`, `components/billing/EnableBillingDialog.tsx`, `components/billing/StoreViewPreview.tsx`, `components/billing/AuditLogList.tsx`.
- Modify: `kioscify-platform/app/(main)/settings/page.tsx` (render `BillingSettingsCard` below the Maintenance card).
- Modify: `kioscify-platform/app/(main)/subscriptions/page.tsx` (rebuilt as a dashboard).
- Modify: `kioscify-platform/app/(main)/subscriptions/[tenantId]/page.tsx`.
- Modify: `kioscify-platform/app/(main)/companies/[id]/page.tsx` (onboard modal near L1492 and `handleOnboardStore` near L569).

**Behaviour (each item is a manual check in Step 3):**
- **`BillingSettingsCard`**:
  - Toggles for Billing enabled and Enforcement enabled, in the `MaintenanceToggleRow` style.
  - Enforcement ON opens a confirm dialog listing the rollout checklist steps 7–9 from the spec. It requires `minKioskVersionCode` (a number input in the dialog) and sends `confirmEnforcement: true`.
  - Number inputs, saved with a Save button: trial days, grace days, invoice lead days, poll seconds, monthly limit (₱), warn %, claim hold days. Reminder offsets are a comma-separated text input.
  - Read-only badges for PayMongo mode (TEST amber, LIVE green, NOT CONFIGURED gray) and webhook status.
  - The fallback QR fields (account name, instructions) appear now. The image upload comes in phase 2.
- **Dashboard**:
  - A gray info bar when `globalBillingEnabled` is false: "Billing is OFF globally — statuses below show what will apply once it's enabled."
  - `StatCard`s for Trial, Active, Due, Locked, Exempt, Not activated, Not set up and Upcoming (7 days). Money cards render "—" until phase 2.
  - Filters: company, brand, status, due-from/to dates, search box.
  - Table columns: store, company · brand, price, status badge, paid-through, next billing, days overdue, last payment.
  - Row checkboxes, plus a bulk bar with "Set price…", "Enable billing" and "Mark exempt…" (prompts for a reason). Results are toasted per store, with a failure count.
  - Pagination as today.
- **Detail page**:
  - `StoreBillingForm`: billing toggle, with a reason textarea that's required when off; price ₱; activation date; trial start/days with the computed trial end and an "Extend trial +7 days" button; anchor day; next billing date (override) with a "Clear override" link; read-only paid-through; grace override.
  - Turning the toggle on opens `EnableBillingDialog` with `getEnablePreview` (paid-through, next billing, honored months, editable next billing). Confirm calls `updateStoreBilling`.
  - `StoreViewPreview` renders the admin and cashier `StoreView`s side by side.
  - Tabs: Settings, Audit log (`AuditLogList`), Legacy months (the existing checklist; read-only with a note "Managed by billing" when `billingEnabled === true`). The Invoices, Payments and Reminders tabs come in phases 2–4.
  - The existing activation card is replaced by the form's activation field. It still calls `setStoreActivation` for non-billed stores, so their behaviour is unchanged.
- **Onboard modal**:
  - Required fields: Monthly price (₱), Trial days (prefilled from `getBillingConfig().defaultTrialDays`, falling back to 15), First billing date (prefilled to today + trial days, recomputed when trial days change until the admin edits it).
  - They're sent as `billing: { priceCentavos, trialDays, firstBillingDate }`.

- [ ] **Step 1:** Implement the types, the api client and `money.ts`, then the components and pages.
- [ ] **Step 2:** Run `npm run build --workspace=kioscify-platform` and `npm run lint --workspace=kioscify-platform`. Expected: the build succeeds and there are no new lint errors.
- [ ] **Step 3: Manual check.** Run `npm run api:dev` and `npm run platform:dev`, sign in as the platform admin, and go through each behaviour above.
  - With global OFF, the dashboard shows the info bar.
  - Enabling a store without a price shows the exact 400 copy as a toast.
  - Onboarding a store creates its subscription, visible on the detail page as TRIAL in preview.
- [ ] **Checkpoint**

### Task 8: Phase 1 verification and billing-OFF parity

**Files:**
- Test: `kioskly-api/src/billing/billing-parity.spec.ts`

- [ ] **Step 1: Write the parity tests.**
  - `with default config every status is EXEMPT for any subscription shape`: a table of subscription shapes (null, not set up, exempt, enabled with an overdue date, enabled with a past invoice). With `DEFAULT_BILLING_CONFIG`, each gives `computeBillingStatus(...).status === 'EXEMPT'` and `describeStoreView(...).variant === 'none'` for both audiences.
  - `SubscriptionsService.getList/getDetail responses for non-billed stores are unchanged`: snapshot-style `toEqual` against the pre-change shape.
- [ ] **Step 2:** Run `npm run test --workspace=kioskly-api`. Expected: all suites PASS.
- [ ] **Step 3:** Run `npm run build --workspace=kioskly-api && npm run build --workspace=kioscify-platform && npm run build --workspace=kioskly-admin && npm run build --workspace=kioscify-company`. Expected: all succeed. The admin and company workspaces don't change in phase 1, but this confirms nothing broke.
- [ ] **Checkpoint: stop for the user's review of phase 1**

---

## Phase 2: Invoices, PayMongo, webhook, reconciliation, fallback QR (deployable with billing OFF)

**Phase 2 constraints, in addition to the Global Constraints:**
- **PayMongo facts** (ctx7 `/websites/paymongo`, re-checked 2026-10-24):
  - QR Ph uses a Payment Intent (`payment_method_allowed: ['qrph']`), then a Payment Method `{type:'qrph', expiry_seconds}` (60–9000; we use **1800**), then attach. The QR is a base64 PNG at `next_action.code.image_url`.
  - Intent statuses: `awaiting_payment_method | awaiting_next_action | processing | succeeded`. There is no `failed` status.
  - Webhook payload: `data.id` (`evt_…`), `data.attributes.type`, `data.attributes.livemode`, `data.attributes.data` (the resource; for `payment.paid` it's a payment with `attributes.payment_intent_id`, `amount`, `paid_at` (unix seconds) and `metadata`).
  - `Paymongo-Signature: t=…,te=…,li=…`. The signature is HMAC-SHA256 of `${t}.${rawBody}` using the webhook secret.
  - All calls use Basic auth with the **secret** key, server-side only.
- **Every scheduler job** returns immediately when `BillingConfig.billingEnabled` is false.
- **Platform actions** that create invoices (Generate now) return 400 "Billing is OFF globally" while global billing is off. Settings and payment recording are always allowed.
- **Dependency:** `@nestjs/schedule@6.1.3`, the current Nest 11 line. 12.x is under two months old.
- **Prisma `$transaction`** needs the Mongo replica set (`rs0`), which local and production both have.

**Phase 2 Review Focus:**
1. **The same webhook delivered twice, at the same moment.** Expected: one PAID and one payment. The second gets `duplicate: true`, or is recorded as flagged and never extends twice. Test: Task 11 `concurrent recordPayment for one invoice applies once`.
2. **Paid after grace while enforcement is OFF.** Expected: re-anchored to the payment date (user decision 4). Test: Task 11 `re-anchors when paid after grace even with enforcement off`.
3. **The scheduler down for days, then Pay now.** Expected: the invoice is due on `periodStart` (the virtual due date already shown), with no fresh grace. Test: Task 10 `late generation keeps dueAt = periodStart`.
4. **Void then reissue.** Expected: `revision` 1 with the current price, and `dueAt` set to today so the store gets a full grace window. Test: Task 10 `void then ensureInvoice reissues revision 1`.
5. **Webhook for an intent we don't know.** Expected: 200, stored with `error`, and no throw, so PayMongo stops retrying. Test: Task 13 `unknown intent is recorded and acknowledged`.

### Task 9: Scheduler + JobLock

**Files:** Create `kioskly-api/src/common/utils/job-lock.util.ts`, `kioskly-api/src/billing/billing-scheduler.service.ts`. Modify `kioskly-api/src/app.module.ts` (`ScheduleModule.forRoot()`), `kioskly-api/package.json`. Test: `job-lock.util.spec.ts`, `billing-scheduler.service.spec.ts`.

**Interfaces:**
- Produces `withJobLock(prisma, name: string, ttlMs: number, fn: () => Promise<void>): Promise<boolean>`.
  - Acquire with `jobLock.updateMany({ where: { name, lockedUntil: { lt: now } }, data: { lockedUntil: now + ttl, owner } })`. If that matches nothing, `jobLock.create`; a P2002 there means not acquired.
  - Release with `updateMany({ where: { name, owner }, data: { lockedUntil: now } })` in `finally`.
  - `owner = ${hostname()}:${process.pid}:${random}`.
- Produces `BillingSchedulerService`:
  - `@Cron('5 * * * *') generateInvoices()` calls `invoices.generateDue(now)` (Task 10).
  - `@Cron('*/15 * * * *') reconcile()` calls `reconcile.reconcileRecent(now)` (Task 14).
  - Both check `config.billingEnabled` first and take a lock (TTL 10 min) named `billing.generateInvoices` or `billing.reconcile`.

- [ ] **Step 1: Tests.**
  - `acquires when no lock exists`: `create` is called and the result is true.
  - `skips while another owner holds an unexpired lock`: `updateMany` returns count 0 and `create` throws P2002, so the result is false and `fn` is not called.
  - `takes over an expired lock`: `updateMany` returns count 1, so the result is true.
  - `releases in finally even when fn throws`.
  - Scheduler: `jobs do nothing when billing is globally off`, where neither `withJobLock` nor the services are called.
- [ ] **Step 2:** Run `npx jest src/common/utils/job-lock src/billing/billing-scheduler` in kioskly-api. Expected: FAIL.
- [ ] **Step 3:** Run `npm install @nestjs/schedule@6.1.3 --workspace=kioskly-api`, then implement.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Checkpoint**

### Task 10: Invoice generation + void / waive / extend grace

**Files:** Create `kioskly-api/src/billing/billing-invoices.service.ts`, `invoice-number.util.ts`. Test: `billing-invoices.service.spec.ts`, `invoice-number.util.spec.ts`.

**Interfaces:**
- `generateInvoiceNumber(periodStart: Date): string`: `KSF-YYYYMM-` (the Manila month) followed by 5 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`.
- `generatePayToken(): string`: `randomBytes(24).toString('base64url')`.
- `ensureInvoice(subscriptionId: string, now = new Date(), opts: { ignoreDate?: boolean } = {}): Promise<BillingInvoice | null>`:
  1. Return null unless `billingEnabled === true`, `activatedAt`, `priceCentavos > 0` and `nextBillingAt` are all set.
  2. If the store already has an OPEN invoice, return it.
  3. Unless `ignoreDate`, return null while `now < addZonedDays(nextBillingAt, -invoiceLeadDays)`.
  4. Build the invoice:
     - `periodStart = nextBillingAt`, and `anchor = anchorDay ?? zonedDayOfMonth(periodStart)`.
     - `periodEnd = addZonedMonthsClamped(periodStart, 1, anchor)`.
     - `revision` = the count of VOID invoices with that `periodStart`.
     - `dueAt = revision === 0 ? periodStart : max(periodStart, startOfZonedDay(now))`.
     - `issuedAt = now`, `amountCentavos = priceCentavos`.
  5. In one `$transaction`, create the invoice and set `sub.nextBillingAt = periodEnd`.
  6. Handle P2002:
     - On `number`, retry up to 3 times.
     - On any other key, return the existing OPEN invoice.
- `generateDue(now): Promise<number>`: calls `ensureInvoice` for every subscription with `billingEnabled: true, nextBillingAt: { lte: addZonedDays(now, invoiceLeadDays) }`. Only stores whose tenant is active and not tombstoned qualify.
- `voidInvoice(id, reason, actorUserId)`: OPEN only, otherwise 400 "Only open invoices can be changed". Sets `status VOID, voidReason`, resets `sub.nextBillingAt = periodStart`, and audits `invoice.void`.
- `waiveInvoice(id, reason, actorUserId)`: OPEN only. Sets `status WAIVED`, `sub.paidThroughAt = addZonedDays(periodEnd, -1)`. Upserts the ledger month of `periodStart` as paid with note `Waived: <reason>`, and audits `invoice.waive`.
- `extendGrace(id, until: string, actorUserId)`: OPEN only. Sets `graceExtendedUntil = startOfZonedDay(until)` and audits `invoice.extend_grace`.
- `listForTenant(tenantId, limit = 50)`: newest `periodStart` first.

- [ ] **Step 1: Tests.**
  - `returns null for not-billed / no price / before nextBillingAt`.
  - `invoiceLeadDays issues early`: lead 3, `nextBillingAt` Nov 16, `now` Nov 13 → an invoice due Nov 16.
  - `creates period [Nov 16, Dec 16) with a price snapshot and advances nextBillingAt to Dec 16`.
  - `anchor 31 period ends Feb 28`.
  - `returns the existing OPEN invoice instead of a second one`.
  - `late generation keeps dueAt = periodStart`: `now` is Nov 20 and `nextBillingAt` Nov 16 → `dueAt` Nov 16.
  - `void then ensureInvoice reissues revision 1`: one VOID for Nov 16, `now` Nov 25 → revision 1, `dueAt` Nov 25, at the current price.
  - `P2002 on the compound key returns the concurrent OPEN invoice`.
  - `P2002 on number retries with a new number`.
  - `void/waive/extendGrace reject non-OPEN invoices with "Only open invoices can be changed"`.
  - `waive extends paidThroughAt and marks the ledger month`.
  - `generateInvoiceNumber uses the Manila month`: `periodStart` 2026-11-30T16:00Z → `KSF-202612-`.
- [ ] **Step 2:** Run `npx jest src/billing/billing-invoices src/billing/invoice-number`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Checkpoint**

### Task 11: `recordPayment`, prepayment, manual mark-paid

**Files:** Create `kioskly-api/src/billing/billing-payments.service.ts`, `dto/mark-paid.dto.ts`, `dto/prepayment.dto.ts`. Test: `billing-payments.service.spec.ts`.

**Interfaces:**
- `RecordPaymentInput { invoiceId: string; source: BillingPaymentSource; method: BillingPaymentMethod; amountCentavos: number; paidAt: Date; reference?: string | null; providerIntentId?: string | null; manualMethod?: string | null; note?: string | null; actorUserId?: string | null }`.
- `recordPayment(input): Promise<{ applied: boolean; paymentId: string }>` runs inside `$transaction`:
  1. `updateMany({ where: { id, status: 'OPEN' } })` → PAID, with `paidAt` and `paymentMethod`.
  2. If the count is 0, create the payment with `flagged: true`, audit `payment.flagged`, and return `applied: false`.
  3. Otherwise:
     - `graceEndsAt = max(addZonedDays(dueAt, sub.graceDaysOverride ?? config.defaultGraceDays), graceExtendedUntil)`.
     - **If `paidAt >= graceEndsAt`, re-anchor:** `periodStart = startOfZonedDay(paidAt)`, `anchorDay = zonedDayOfMonth(paidAt)`, `periodEnd = addZonedMonthsClamped(periodStart, 1, anchorDay)`, and update the invoice period. Then set `sub.nextBillingAt = periodEnd` and `anchorDay`.
     - **Otherwise:** `sub.nextBillingAt = max(sub.nextBillingAt, periodEnd)`.
     - `sub.paidThroughAt = addZonedDays(periodEnd, -1)`.
     - Upsert the ledger row for `getZonedMonthBounds(periodStart).start` with `paid: true` and `paidAt`. The note gets `Invoice <number> (<method>)` appended to any existing note, joined with ` · `.
     - The payment row has `flagged = amountCentavos !== invoice.amountCentavos`.
     - After the transaction, audit `payment.record`.
- `markPaid(invoiceId, dto: { manualMethod: 'cash' | 'bank_transfer' | 'bank_qr' | 'gcash_direct' | 'other'; reference?; note?; paidAt? }, actorUserId)` → `recordPayment` with source MANUAL, method MANUAL and the invoice amount.
- `recordPrepayment(tenantId, dto: { amountCentavos ≥1; monthsCovered 1..36; paidThroughAt: date; nextBillingAt: date; manualMethod; reference?; note? }, actorUserId)`:
  - 404 when there is no subscription. 400 when `nextBillingAt <= paidThroughAt`: "Next billing date must be after the paid-through date".
  - Creates the payment (PREPAYMENT, PREPAID, `invoiceId` null) and sets `paidThroughAt`, `nextBillingAt`, `nextBillingOverridden: true` and `anchorDay = zonedDayOfMonth(nextBillingAt)`.
  - Marks `monthsCovered` ledger months paid, ending at the month of `paidThroughAt`.
  - Audits `payment.prepayment`.
- `qrphCollectedThisMonth(now): Promise<number>`: the sum of non-flagged QRPH payments with a Manila-month `paidAt`.
- Routes on `PlatformBillingController`:
  - `POST invoices/:id/mark-paid`, `POST invoices/:id/void {reason}`, `POST invoices/:id/waive {reason}`, `POST invoices/:id/extend-grace {until}`.
  - On `PlatformStoreBillingController`: `POST :tenantId/billing/invoices` (generate now, `ignoreDate`, 400 when global is OFF or `ensureInvoice` returns null: "Store is not ready to invoice (check price, activation and billing toggle)") and `POST :tenantId/billing/prepayments`.

- [ ] **Step 1: Tests.**
  - `marks OPEN invoice PAID, extends paidThroughAt to periodEnd - 1 day, advances nextBillingAt, upserts ledger month`.
  - `second recordPayment for the same invoice is flagged and changes nothing else`.
  - `concurrent recordPayment for one invoice applies once`: two calls in `Promise.all`, where the mock `updateMany` returns count 1 and then 0 → exactly one `applied: true`.
  - `re-anchors when paid after grace even with enforcement off`: due Oct 16, grace 7, paid Nov 3 → period `[Nov 3, Dec 3)`, `nextBillingAt` Dec 3, `anchorDay` 3.
  - `paid during grace keeps the original period`.
  - `amount mismatch is applied but flagged`.
  - `appends to an existing ledger note`.
  - `prepayment sets override + paid-through and marks monthsCovered ledger months`: 3 months through Dec 31 → `2026-10`, `2026-11`, `2026-12`.
  - `prepayment rejects nextBillingAt on or before paidThroughAt`.
  - `qrphCollectedThisMonth sums only non-flagged QRPH in the Manila month`.
- [ ] **Step 2:** Run `npx jest src/billing/billing-payments`. Expected: FAIL.
- [ ] **Step 3:** Implement, including the routes.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Checkpoint**

### Task 12: PaymentProvider + PaymongoProvider

**Files:** Create `kioskly-api/src/billing/providers/payment-provider.interface.ts`, `providers/paymongo.provider.ts`. Test: `providers/paymongo.provider.spec.ts`.

**Interfaces:**
- `PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER')`.
- `PaymentProvider` (per the spec):
  - `mode()`
  - `createQrCharge({ amountCentavos, description, metadata: { invoiceId, tenantId } }): Promise<{ providerIntentId; qrImage; expiresAt: Date; livemode: boolean }>`
  - `getChargeStatus(intentId): Promise<{ status: 'pending' | 'succeeded' | 'failed'; paymentId?; paidAt?: Date; amountCentavos? }>`
  - `verifyWebhook(rawBody: Buffer, signatureHeader: string | undefined, now?: Date): boolean`
  - `parseEvent(rawBody: Buffer): ParsedProviderEvent { eventId; type; livemode; providerIntentId?; paymentId?; amountCentavos?; paidAt?: Date; invoiceId? }`
- `PaymentProviderError extends Error { status?: number }`.
- `PaymongoProvider`, `@Injectable`, base URL `https://api.paymongo.com/v1`:
  - **Unconfigured key:** `createQrCharge` and `getChargeStatus` throw `ServiceUnavailableException('Online payment is not configured')`.
  - **Status mapping:** `succeeded → succeeded` (using `attributes.payments[0]`); `awaiting_next_action | processing → pending`; `awaiting_payment_method → failed`.
  - **`verifyWebhook`:** compares against `li` in live mode and `te` in test mode. Rejects when the timestamp is more than 300s off, the header is missing, or the parts are missing or malformed. Uses `timingSafeEqual` on equal-length buffers.
  - **`parseEvent`:** `providerIntentId = attributes.payment_intent_id ?? (resource.id starts with 'pi_' ? resource.id : undefined)`, `paidAt = paid_at * 1000`, `invoiceId = attributes.metadata?.invoiceId`.

- [ ] **Step 1: Tests** (`global.fetch` mocked).
  - `createQrCharge` makes three calls in order (intent, method with `expiry_seconds: 1800`, attach with `client_key`), sends Basic auth with the secret key, and returns the `image_url` with `expiresAt = now + 30 min`.
  - A PayMongo 4xx throws `PaymentProviderError` carrying `errors[0].detail`.
  - Status mapping: one case each.
  - `verifyWebhook`: a valid `te` in test mode is accepted; a valid `li` in live mode is accepted; `te` is rejected in live mode; a tampered body, a stale timestamp and a missing header are rejected.
  - `parseEvent` on the documented `payment.paid` example gives `eventId`, type, `providerIntentId`, `paymentId`, amount and `paidAt`.
  - Unconfigured key throws 503.
- [ ] **Step 2:** Run `npx jest src/billing/providers`. Expected: FAIL.
- [ ] **Step 3:** Implement and register `{ provide: PAYMENT_PROVIDER, useClass: PaymongoProvider }`.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Checkpoint**

### Task 13: Webhook endpoint

**Files:** Modify `kioskly-api/src/main.ts` (`express.json` gets a `verify` callback that stores `req.rawBody` for `/billing/webhooks/` URLs) and `kioskly-api/src/common/filters/all-exceptions.filter.ts` (pass through `billing`, like `code`). Create `kioskly-api/src/billing/billing-webhook.service.ts`, `controllers/paymongo-webhook.controller.ts`. Test: `billing-webhook.service.spec.ts`, plus a filter test if a spec exists.

**Interfaces:**
- `POST /billing/webhooks/paymongo`: `@Public()`, `@SkipThrottle()`, `@HttpCode(200)`. Calls `webhooks.handlePaymongo(req.rawBody, req.headers['paymongo-signature'])`.
- `handlePaymongo(rawBody?: Buffer, signature?: string): Promise<{ ok: true; duplicate?: boolean; ignored?: boolean }>`:
  1. **Signature:** a bad signature throws `UnauthorizedException('Invalid signature')` and nothing is stored.
  2. **Mode:** if the event's livemode doesn't match the key's mode, ignore it.
  3. **Dedupe:** create the event row. On P2002, if it was already processed, return duplicate; otherwise reprocess.
  4. **`payment.paid`:** find the attempt by intent, falling back to `invoiceId` from metadata. If there's no match, store `error: 'No matching invoice'` and return ok (Review Focus 5). Otherwise mark the attempt succeeded and call `recordPayment(WEBHOOK, QRPH, amount, paidAt, reference: paymentId, providerIntentId)`.
  5. **`qrph.expired` / `payment.failed`:** update the attempt status to expired or failed.
  6. **Finish:** set `processedAt`. On an unexpected error, store `error` and rethrow, so the response is 500 and PayMongo retries.

- [ ] **Step 1: Tests.**
  - `invalid signature → 401, no event stored`.
  - `payment.paid marks the attempt succeeded and records payment once`.
  - `duplicate processed event → duplicate:true, recordPayment not called`.
  - `duplicate unprocessed event is reprocessed`.
  - `unknown intent is recorded and acknowledged`.
  - `livemode mismatch is ignored`.
  - `qrph.expired marks the attempt expired`.
  - `processing error stores error and rethrows`.
  - Filter: `passes billing through`.
- [ ] **Step 2:** Run `npx jest src/billing/billing-webhook src/common/filters`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Checkpoint**

### Task 14: Reconciliation

**Files:** Create `kioskly-api/src/billing/billing-reconcile.service.ts`. Test: `billing-reconcile.service.spec.ts`.

**Interfaces:**
- `reconcileInvoice(invoiceId, now = new Date()): Promise<{ paid: boolean }>`:
  - Checks attempts for the invoice with status `awaiting_payment` and `createdAt >= now - 24h`, via `getChargeStatus`.
  - `succeeded` → the attempt becomes succeeded and `recordPayment(RECONCILE, QRPH, …)` runs.
  - `failed`, or `expiresAt` passed while still pending → expired or failed.
  - Returns `{ paid: true }` when any attempt succeeded, or when the invoice is already PAID.
- `reconcileRecent(now): Promise<number>`: covers attempts that are awaiting payment and were created in the last 2h, at most once per invoice.
- Route `POST platform/billing/invoices/:id/recheck` → `reconcileInvoice`.

- [ ] **Step 1: Tests.**
  - `succeeded attempt records RECONCILE payment`.
  - `pending past expiresAt marks expired without recording`.
  - `already PAID invoice returns paid:true without provider calls`.
  - `reconcileRecent de-duplicates by invoice`.
- [ ] **Step 2:** Run `npx jest src/billing/billing-reconcile`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Checkpoint**

### Task 15: Fallback QR + payment claims (API)

**Files:**
- Create `kioskly-api/src/billing/payment-kind.util.ts`, `billing-claims.service.ts`, `dto/claim.dto.ts`.
- Modify `billing-config.service.ts` (`setFallbackQrImage(url | null, actor)`) and the platform controller.
- Modify `billing-status.service.ts` so that a REJECTED claim newer than any PENDING one is surfaced as `lastClaimRejectedReason` on the store status. This is additive: the result gains `lastClaimRejectedReason: string | null`.
- Test: `payment-kind.util.spec.ts`, `billing-claims.service.spec.ts`.

**Interfaces:**
- `selectPaymentKind({ providerMode, qrphCollectedThisMonthCentavos, amountCentavos, limitCentavos, hasFallback }): 'paymongo' | 'fallback' | 'unavailable'`:
  - **Unconfigured provider:** `hasFallback ? 'fallback' : 'unavailable'`.
  - **`collected + amount > limit`:** `hasFallback ? 'fallback' : 'paymongo'`. (Ruling: the limit is advisory without a fallback, and PayMongo may still accept.)
  - **Otherwise:** `'paymongo'`.
- **Config upload:**
  - `POST platform/billing/config/fallback-qr`: multipart field `image`; png, jpeg or webp; at most 2 MB. Stored with `storage.upload('billing', 'fallback-qr-<ts>.<ext>', …)`; the previous image is deleted best-effort.
  - `DELETE platform/billing/config/fallback-qr` clears it.
  - Both are audited as `config.fallback_qr`.
- **Claims service:**
  - `submitClaim(tenantId, invoiceId, userId, dto: { amountCentavos ≥1; reference (1..100); paidAt: date; note? }, receiptImageUrl?: string | null)`:
    - The invoice must belong to the tenant and be OPEN, otherwise 404 or 400 "This invoice is no longer open".
    - Earlier PENDING claims for the invoice become REJECTED with `rejectReason: 'Replaced by a newer claim'`.
    - Creates a PENDING claim and audits `claim.submit`.
  - `listClaims(status?: 'PENDING' | 'APPROVED' | 'REJECTED')`: newest first, with store and invoice number.
  - `approveClaim(id, actor)`: PENDING only. Calls `recordPayment(MANUAL, MANUAL, manualMethod 'bank_qr', amount, paidAt, reference)` and becomes APPROVED.
  - `rejectClaim(id, reason, actor)`: PENDING only; becomes REJECTED.
- **Routes:** `GET platform/billing/claims?status=`, `POST platform/billing/claims/:id/approve`, `POST platform/billing/claims/:id/reject {reason}`. The store submit route comes in phase 3.

- [ ] **Step 1: Tests.**
  - `selectPaymentKind`: one case per row above.
  - Claims:
    - `submit replaces earlier pending claim`.
    - `submit rejects a non-OPEN invoice`.
    - `submit 404s for another tenant's invoice`.
    - `approve records a bank_qr MANUAL payment and marks APPROVED`.
    - `approve/reject non-PENDING → 400 "This claim was already reviewed"`.
  - Status: `rejected claim reason is surfaced when no pending claim exists`.
- [ ] **Step 2:** Run `npx jest src/billing/payment-kind src/billing/billing-claims src/billing/billing-status`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Checkpoint**

### Task 16: Money overview, payments log + CSV, detail history (API + Platform UI)

**Files:**
- API: modify `billing-settings.service.ts` (`overview` gains `money`; `getStoreBilling` gains `invoices`, `payments`, `attempts` and `claims`), the platform controller (`GET platform/billing/payments`).
- UI:
  - Modify `kioscify-platform/types/index.ts`, `lib/api.ts`, `app/(main)/subscriptions/page.tsx`, `app/(main)/subscriptions/[tenantId]/page.tsx`, `components/billing/BillingSettingsCard.tsx`.
  - Create `components/billing/InvoicesPanel.tsx`, `PaymentsPanel.tsx`, `ClaimsQueue.tsx`, `PrepaymentDialog.tsx`, `MarkPaidDialog.tsx`.
- Test: extend `billing-settings.service.spec.ts`; create `billing-payments-log.spec.ts`.

**Interfaces:**
- `overview().money = { expectedThisMonthCentavos, collectedThisMonthCentavos, outstandingCentavos, qrphCollectedThisMonthCentavos, limitCentavos, limitPercent, limitWarn: boolean, pendingClaims }`:
  - Expected: invoices not VOID with a Manila-month `dueAt`.
  - Collected: non-flagged payments in this Manila month.
  - Outstanding: OPEN invoices.
  - `limitWarn`: `limitPercent >= limitWarnPercent`.
- `listPayments({ page, limit, tenantId? })` → rows `{ id, paidAt, storeName, companyName, brandName, invoiceNumber, amountCentavos, method, source, manualMethod, reference, flagged, note }`.
- `GET platform/billing/payments?format=csv`: `toCsv` over every row, with amounts in pesos (`amount` = centavos/100 to 2 decimals). Headers are `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="kioscify-payments-YYYY-MM-DD.csv"` and `Cache-Control: no-store`.
- **UI:**
  - Dashboard: money cards (₱), a limit banner (amber at ≥ warn %, red at ≥ 100% with "PayMongo limit reached: stores are being shown your bank QR"), a "Pending claims" card linking to a Claims tab, and a Payments tab with Export CSV.
  - Detail page: tabs Invoices (per-OPEN-row actions: Mark paid, Void, Waive, Extend grace, Re-check), Payments, Claims. Header actions "Generate invoice now" and "Record prepayment".
  - Settings card: fallback QR upload, preview and remove.

- [ ] **Step 1: Tests.**
  - `overview money sums expected/collected/outstanding in the Manila month and sets limitWarn`.
  - `payments CSV has one row per payment with peso amounts and no internal ids beyond invoice number`.
  - `getStoreBilling includes invoices, payments, attempts (without qrImage) and claims`.
- [ ] **Step 2:** Run `npx jest src/billing`. Expected: the new tests FAIL.
- [ ] **Step 3:** Implement the API, then the UI.
- [ ] **Step 4:** Run `npx jest src/billing` (PASS), then `npx tsc --noEmit` and `npm run lint` in kioscify-platform (clean apart from the one existing warning).
- [ ] **Checkpoint: phase 2 verification.** Run `npm run test --workspace=kioskly-api` (all green) and `npm run build --workspace=kioskly-api`. Run the PayMongo test-mode end-to-end only if test keys and Mongo are available; otherwise report that it was skipped.

## Phase 3: Store-facing billing (deployable with billing OFF)

**Phase 3 Review Focus:**
1. **A cashier calls `POST billing/me/pay`.** Expected: 403, and no PayMongo call. Test: Task 17 `cashier cannot create a pay link`.
2. **Pay now twice within 30 minutes.** Expected: the same QR is returned (the attempt is reused) while it has more than 2 minutes left. Test: Task 17 `reuses a valid attempt`.
3. **PayMongo errors while the fallback QR is configured.** Expected: the fallback is returned, not a 500. Test: Task 17 `provider failure falls back to the bank QR`.
4. **Pay page token for a paid or void invoice.** Expected: status only, no QR, no PayMongo call. Test: Task 17 `pay page for a paid invoice shows status only`.
5. **Billing OFF.** Expected: `billing/me` returns `status: EXEMPT` and `storeView.variant: 'none'`. The banner is absent in both clients. Test: Task 17 `me is EXEMPT and viewless while billing is off`.

### Task 17: Store billing API

**Files:**
- Create `kioskly-api/src/billing/billing-pay.service.ts`, `billing-me.service.ts`, `controllers/store-billing.controller.ts`, `controllers/pay-page.controller.ts`.
- Tests: `billing-pay.service.spec.ts`, `billing-me.service.spec.ts`.

**Interfaces:**
- `BillingPayService.payInvoice(tenantId: string, invoiceId: string | null, now = new Date()): Promise<PayResult>`. `PayResult` is one of:
  - `{ kind: 'paymongo'; invoiceId; invoiceNumber; amountCentavos; qrImage; expiresAt; payUrl }`
  - `{ kind: 'fallback'; invoiceId; invoiceNumber; amountCentavos; fallbackQrImageUrl; accountName; instructions; payUrl }`
  - `{ kind: 'unavailable'; invoiceId; invoiceNumber; amountCentavos; message: 'Online payment unavailable. Please contact Kioscify.' }`
- How `payInvoice` works:
  - 400 "Billing is OFF globally" while billing is off.
  - With `invoiceId === null` it uses the current OPEN invoice. It calls `ensureInvoice(sub.id, now)` so a virtual due becomes a real invoice. 400 "Nothing to pay right now" when there is none.
  - It reuses the newest `awaiting_payment` attempt whose `expiresAt > now + 2 min`. Otherwise it creates one, using `metadata { invoiceId, tenantId }` and the description `Kioscify subscription <number>`.
- `BillingPayService.payByToken(token)` returns `{ storeName, invoiceNumber, amountCentavos, dueAt, status, payment: PayResult | null }`. `payment` is null unless the invoice is OPEN.
- `BillingPayService.paymentStatus(tenantId | null, invoiceId | token)` returns `{ status: BillingInvoiceStatus; paid: boolean }`. It runs `reconcileInvoice` at most once per 20 seconds per invoice (an in-memory map).
- `BillingMeService.getMe(user: { id; role; tenantId })` returns:
  - `status` (`BillingStatusResult`) and `storeView` (`describeStoreView` with admin or cashier)
  - `plan { billingEnabled, priceCentavos, trialEndsAt, paidThroughAt, nextBillingAt }`
  - `openInvoice` (`{ id, number, amountCentavos, dueAt, periodStart, periodEnd } | null`)
  - `canPay` (true for STORE_ADMIN and ADMIN)
  - `pendingReminder: null` (filled in phase 4), `serverTime`, `pollSeconds`
  - `cache { status, dueAt, graceEndsAt, enforcement, validUntil }`. `validUntil` is when a cached non-locked status would become LOCKED: `graceEndsAt` when DUE; `nextBillingAt + grace` when TRIAL or ACTIVE with `nextBillingAt`; otherwise null.
- `listInvoices(tenantId)` and `getInvoice(tenantId, id)` (receipt data: the invoice, its payments, store name and number). A foreign id gets a 404.
- Routes on `@Controller('billing/me')` with `@Roles('STORE_ADMIN','ADMIN','CASHIER')`:
  - `GET /` (all roles)
  - `GET invoices`, `GET invoices/:id` (admin only)
  - `POST pay` and `POST invoices/:id/pay` (admin only)
  - `GET invoices/:id/payment-status` (all roles)
  - `POST invoices/:id/claims` (admin only, multipart with an optional `receipt` image of 5 MB or less, stored via `StorageService.upload('billing-receipts', …)`)
- `@Controller('billing/pay')`: `@Public()`, `@Throttle({ default: { limit: 10, ttl: 60000 } })`, `GET :token`, `GET :token/status`.

- [ ] **Tests:**
  - `me is EXEMPT and viewless while billing is off`
  - `me for a cashier has canPay false and cashier copy`
  - `me cache.validUntil is graceEndsAt while DUE`
  - `cashier cannot create a pay link` (the role check in the controller is metadata, so test it through `payInvoice` being called only from admin routes and assert the `@Roles` metadata)
  - `reuses a valid attempt`
  - `creates a new attempt when the last one expires within 2 minutes`
  - `virtual due becomes an invoice on Pay now`
  - `nothing to pay → 400`
  - `limit reached → fallback`
  - `provider failure falls back to the bank QR`
  - `provider failure without fallback → unavailable`
  - `pay page for a paid invoice shows status only`
  - `unknown token → 404`
  - `paymentStatus reconciles at most once per 20s`
  - `getInvoice 404s for another tenant`
- [ ] Run `npx jest src/billing/billing-pay src/billing/billing-me`: FAIL, then implement, then PASS.

### Task 18: Store Portal (kioskly-admin)

**Files:**
- Modify `types/index.ts`, `lib/api.ts`, `app/(main)/layout.tsx`, `components/Sidebar.tsx`, `middleware.ts`.
- Create:
  - `contexts/BillingContext.tsx`
  - `components/billing/BillingBanner.tsx`, `components/billing/PayNowModal.tsx`, `components/billing/ClaimForm.tsx`
  - `app/(main)/billing/page.tsx`, `app/(main)/billing/receipts/[invoiceId]/page.tsx`
  - `app/pay/[token]/page.tsx`
  - `lib/billing-format.ts` (peso and Manila date formatting)

**Behaviour:**
- **`BillingProvider`:**
  - Fetches `billing/me` after the account-status check, on window focus, and every 5 minutes. It exposes `{ me, refresh }`.
  - If the fetch fails, it fails open (no banner).
- **Banner** (inside `<main>` above children, when `storeView.variant === 'banner'`):
  - Shows title, body and "Pay now" (if `showPayAction`).
  - Can be collapsed to a slim bar for the session (sessionStorage `kioscify_billing_banner_collapsed_<invoiceId>`).
- **`PayNowModal`:**
  - `kind` paymongo: the QR `<img>`, an mm:ss countdown, "Copy pay link", "Refresh QR" once expired, and a `payment-status` poll every `pollSeconds`. On paid it shows success and calls `refresh()`.
  - `kind` fallback: the bank QR image, account name, instructions, the amount, and an "I've paid" `ClaimForm` (reference, amount, date, optional receipt photo).
  - `kind` unavailable: the message.
- **Sidebar:** a "Billing" item (CreditCard icon, `section: null`). Hidden when `me.status.status === 'EXEMPT' && me.plan.billingEnabled !== true`.
- **`/billing` page:**
  - Plan card (price, status, trial end, paid-through, next billing, Pay now).
  - History table (period, amount, due, status Open/Paid/Waived/Void, paid date, method QRPH/Manual/Prepaid, reference).
  - A "Receipt" link for PAID rows.
  - Exempt stores see "No billing for this store."
- **Receipt page:** printable, with `window.print()`.
- **`/pay/[token]` page:**
  - Public, outside `(main)`, using a plain `fetch`. Same QR, countdown and poll, plus a paid state.
  - In the fallback case it says to submit "I've paid" from the Store Portal or Kiosk app.
  - The middleware leaves `/pay/*` alone apart from maintenance.

- [ ] Run `npx tsc --noEmit` and `npm run lint` in kioskly-admin: clean apart from existing warnings.

### Task 19: Kiosk app (kioskly-app)

**Files:**
- Create `contexts/BillingContext.tsx`, `components/BillingBanner.tsx`, `components/PayNowSheet.tsx`, `utils/billingEvents.ts`.
- Modify `app/_layout.tsx` (provider and banner), `services/expenseService.ts` (`is4xx` fix), `android/app/build.gradle` and `app.json` (versionCode 7 / 1.1.0).

**Behaviour:**
- **`BillingContext`:**
  - Fetches `billing/me` on token change, AppState → active, and every 5 minutes. Caches to AsyncStorage `@kioscify:billing_status` (`{ me, fetchedAt, tenantId }`). Clears on logout and on tenant change.
  - Exposes `{ me, effectiveStatus, refresh, checkoutInProgress, setCheckoutInProgress }`. `effectiveStatus` gets its offline rule in phase 5.
- **Banner** (in `AppNavigator` next to `OfflineBanner`):
  - Shown for DUE. The admin variant has "Pay now"; the cashier variant has the copy only.
  - Collapsible for the session.
- **`PayNowSheet`:**
  - paymongo: the QR `<Image source={{ uri: qrImage }}>`, countdown/refresh, "Open pay page" (`expo-web-browser`), and a status poll.
  - fallback: the bank QR, instructions, and an "I've paid" form (reference, amount) without a photo.
  - unavailable: the message.
- **`expenseService`:** carry `.status` on the thrown error so 4xx responses aren't queued.

- [ ] Run `npx tsc --noEmit` in kioskly-app: no new errors versus baseline.

## Phase 4: Reminders

### Task 20: In-app reminders

**Files:**
- Create `kioskly-api/src/billing/reminders/reminder-channel.interface.ts`, `reminders/in-app.channel.ts`, `billing-reminders.service.ts`.
- Modify `billing-scheduler.service.ts` (job `billing.sendReminders`, `@Cron('10 * * * *')`), `billing-me.service.ts` (`pendingReminder`), `store-billing.controller.ts` (`POST billing/me/reminders/:id/ack`).
- Clients: Store Portal `components/billing/ReminderModal.tsx`, Kiosk `components/ReminderModal.tsx`.
- Tests: `billing-reminders.service.spec.ts`, plus extend `billing-me.service.spec.ts`.

**Interfaces:**
- `ReminderChannel { name: string; deliver(reminder: BillingReminder, invoice: BillingInvoice): Promise<void> }`. `InAppReminderChannel.name = 'in_app'`. Its `deliver` does nothing; the row is the delivery.
- `dueOffsets(dueAt, offsets: number[], now): number[]` (pure): offsets where `now >= addZonedDays(dueAt, offset)`.
- `sendDue(now)`: for each OPEN invoice of a billed, active store, take only the **latest** due offset and create `BillingReminder { invoiceId, tenantId, offsetDays, channel: 'in_app' }`. A P2002 means it was already sent, so skip it. Then call `channel.deliver`. Returns the number created.
- `resend(invoiceId, actor)`: clears `acknowledgedByUserIds` on the newest reminder for the invoice (404 if none) and audits `reminder.resend`.
- `ack(tenantId, reminderId, userId)`: `$addToSet`-like (push only if missing). A foreign tenant gets a 404.
- `getMe().pendingReminder`: the newest reminder for the open invoice that this user hasn't acknowledged, for admins only: `{ id, offsetDays, title, body }`. Titles: day 0 "Your subscription is due today"; other days "Reminder: subscription due — N days left"; when `daysLeft <= 0`, "Last day before your store is locked" if enforcement is on, otherwise "Your subscription is overdue".
- Platform route `POST platform/billing/invoices/:id/reminders/resend`.

- [ ] **Tests:**
  - `dueOffsets picks offsets whose day has arrived (Manila)`
  - `sendDue creates only the latest due offset`
  - `sendDue is idempotent on P2002`
  - `sendDue skips while billing is off` (via the scheduler test)
  - `ack adds the user once`
  - `ack 404s for another tenant`
  - `resend clears acknowledgements`
  - `pendingReminder is null for cashiers and after ack`

## Phase 5: Lock

**Phase 5 Review Focus:**
1. **A queued offline sale posted while the store is LOCKED.** Expected: 201, and the sale is stored. Test: Task 21 `sync uploads pass while LOCKED`.
2. **A store that is both deactivated and billing-locked.** Expected: the deactivation behaviour (401 or GRACE_PERIOD); `SUBSCRIPTION_LOCKED` is never returned. Test: Task 21 `deactivation wins at the gate`.
3. **Global billing OFF.** Expected: zero billing queries per request, and the guard passes everything. Test: Task 21 `no billing reads when billing is off`.
4. **A kiosk offline past grace.** Expected: it locks locally, and unlocks only after an online check reports it unlocked. Test: Task 23 (a pure `effectiveBillingStatus` util test in the app, if Jest is available; otherwise a typed util plus a manual check).
5. **The lock arrives mid-checkout.** Expected: the redirect waits until the checkout modal closes. Covered by code review plus a manual check.

### Task 21: API lock

**Files:**
- Create `kioskly-api/src/common/decorators/allow-when-billing-locked.decorator.ts`, `common/guards/billing-status.guard.ts`.
- Modify:
  - `app.module.ts` (APP_GUARD after `AccountStatusGuard`)
  - `auth/strategies/jwt.strategy.ts` (`billingStatus` for STORE_ADMIN/ADMIN/CASHIER via `BillingStatusService.forTenant`, only when the cached config has `billingEnabled`)
  - `auth/auth.service.ts` (`getAccountStatus` and `loginStore` return `SUBSCRIPTION_LOCKED` plus `billing`)
  - `@AllowWhenBillingLocked()` on the allowlisted routes: auth login/logout/change-password/account-status/switch-store/profile; `billing/me` (class); `billing/pay` (public anyway); the sync POSTs (transactions, expenses, inventory records and bulk, submitted-reports, submitted-inventory-reports, user-shift-reports, user-shift-inventory-reports, staff time logs if queued); the existing grace-period export routes.
- Tests: `billing-status.guard.spec.ts`, update `jwt.strategy.spec.ts` / `auth.service.spec.ts` where they exist.

**Interfaces:**
- `BILLING_LOCK_ALLOWED_KEY = 'allowWhenBillingLocked'`, `AllowWhenBillingLocked = () => SetMetadata(KEY, true)`.
- The guard passes when there is no user, the role is not STORE_ADMIN/ADMIN/CASHIER, `billingStatus` is undefined or not LOCKED, the route carries the metadata (handler or class), or `accountStatus` is not ACTIVE (deactivation wins). Otherwise it throws `ForbiddenException({ code: 'SUBSCRIPTION_LOCKED', message: "This store's subscription is overdue. Please settle the invoice to continue.", billing: { amountCentavos, dueAt, invoiceId } })`.
- `AuthenticatedUser.billingStatus?: BillingStatusResult`.
- `getAccountStatus` returns `status: 'SUBSCRIPTION_LOCKED'` when the account is ACTIVE, billing is LOCKED and enforcement is on. It adds `billing: BillingStatusResult | null`, which is null when EXEMPT.

- [ ] **Tests:**
  - `blocks a normal route with SUBSCRIPTION_LOCKED and billing details`
  - `sync uploads pass while LOCKED` (metadata present on each sync controller method; assert via `Reflect.getMetadata`)
  - `platform and company admins pass`
  - `deactivation wins at the gate`
  - `not locked → pass`
  - `no billing reads when billing is off` (jwt strategy)
  - `account-status reports SUBSCRIPTION_LOCKED only when ACTIVE + LOCKED + enforcement`

### Task 22: Store Portal lock

**Files:** Create `app/(main)/subscription-overdue/page.tsx`. Modify `app/(main)/layout.tsx` (redirect when `me.status.status === 'LOCKED'` and the account is ACTIVE; allow `/billing`, `/billing/receipts/*` and `/subscription-overdue`; render the overdue page full-bleed), `lib/api.ts` (the interceptor sends `SUBSCRIPTION_LOCKED` to `/subscription-overdue`), and `types` (`AccountStatus` gains `SUBSCRIPTION_LOCKED`, which routes to `/subscription-overdue`).

**Behaviour:** the overdue page shows amount and due date, Pay now (the same modal, inline), "View billing", and Log out. It polls `billing/me` every `pollSeconds` and redirects to `/dashboard` once the store is unlocked.

### Task 23: Kiosk lock

**Files:** Create `app/subscription-overdue.tsx` and `utils/billingStatus.ts` (the pure `effectiveBillingStatus(cache, now, online)`). Modify `contexts/BillingContext.tsx`, `app/_layout.tsx` (redirect logic), `app/home.tsx` (`setCheckoutInProgress`), `utils/api.ts` (on `SUBSCRIPTION_LOCKED`, `billingEvents.notifyLocked()`), and `services/syncEngine.ts` (a 403 `SUBSCRIPTION_LOCKED` is treated like 429).

**Rules:**
- **Effective status:** when online and the fetch succeeds, use the server's status. Otherwise, if `cache.enforcement` is on and `now >= cache.validUntil`, the store is LOCKED. Otherwise use the cached status.
- **Redirect:** when the effective status is LOCKED, no checkout is in progress, and the account is ACTIVE → `/subscription-overdue`. When it's no longer LOCKED and the user is on that screen → `/home`.
- **Overdue screen:** admins see the same pay flow. Cashiers see "Your store's subscription is overdue. Please contact your store admin." Both get Log out, and the screen polls every `pollSeconds`.

- [ ] **Verification:**
  - kioskly-api: full test suite and build.
  - kioskly-admin, kioscify-platform, kioskly-app: `tsc --noEmit`.
  - Lint for the Next apps.
  - Final whole-branch review of phases 3–5.
