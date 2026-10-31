# Release runbook: pending store fixes

> **Deployed to production on 2026-10-30** (master `769fcfb`, server `/root/apps/Kioscify`). Server
> steps 1–5 are done, and kiosk APK 1.2.0 (versionCode 8) is released as a force update. See the change log.
>
> **Not deployed yet:** change 11. For it, run steps 1, 2, 4 (api only), 4b and the change 11 smoke test.

Running checklist for everything on `feature/store-transactions-pagination`
that has **not been merged to master or deployed yet**. Each fix added to the
branch adds its deploy steps here, so the release is one pass through this
file. Merge to master only when the branch is ready to ship as a whole.

Production: `docker-compose.yml`, project `kioscify-production`.

## What's in this release

| # | Change | Commit | Services | Data / scripts | Kiosk APK |
|---|---|---|---|---|---|
| 1 | Store Portal list pagination + rows-per-page (Transactions, Expenses, Sales/Inventory Reports, Attendance, Sessions, Store Users, Billing History); server-side expense search | `6cf3199` | api, store | Indexes: `store-list-indexes.js` | No |
| 2 | `/reports/time-of-day` returns 400 instead of 500 for missing/invalid dates | `173d996` | api | None | No |
| 3 | Store Portal Analytics stuck on "No data available" on some devices (saved Custom Range without dates hid the date selector); selector now always shows, with Retry on load errors | `cb72903` | store | None | No |
| 4 | Platform → Subscriptions: inactive stores (toggle off under Company → Stores) moved to their own **Inactive stores (N)** tab with a Reactivate button; status cards count active stores only | `c4ea1bc` | api, platform | None | No |
| 5 | **Resubscribe**: a Store Admin of a switched-off store can log in to a "Your subscription has ended." screen (Store Portal and kiosk app), pay by QR, and the store switches itself back on. Any applied payment (QR, Mark paid, approved claim) reactivates an eligible switched-off store | `299c3d5` | api, store | None | **Yes** (step 6) |
| 6 | "Pay now" needed several taps on phones: the due banner's Pay now (and its collapse arrow), the reminder popup and the Billing page button are now thumb-sized (44 px / hit area extended on the kiosk) | `aef62b1` | store | None | **Yes** (same APK, step 6) |
| 7 | Kiosk app **Settings → Billing** (Store Admins only): subscription status and price, plus a **Billing & Payments** screen with plan details, Pay now and billing history. Cashiers don't see it. Uses the existing `/billing/me` endpoints; no API change | `8c3f7fa` | None | None | **Yes** (same APK, step 6) |
| 8 | **Payment successful** confirmation: after a QR payment goes through, Store Portal and kiosk show "Payment successful" with **View receipt**, **Go to Billing** and **Done**. Before, the success message flickered away (the due banner, the overdue screen and Resubscribe all close the moment the payment lands). Adds a receipt screen on the kiosk; paid rows in kiosk billing history open it. **Also fixes** a paid store still seeing "Subscription due" (and being invoiced again) when its next billing date sat inside a month it had already paid; paying an older invoice no longer pulls paid-through back | `e82342e`, `8532087` | api, store | Check (read-only): `billing-dates-check.js` | **Yes** (same APK, step 6) |
| 9 | **Free trial banner**: stores on their free trial see a blue "Free trial — N days left" banner (Store Portal and kiosk, admins and cashiers) with an **X** to close it. Closed, it comes back the next day with the updated count. In the last 7 days before the first billing date the existing due reminder takes its place, unchanged (collapse only). Platform's "what the store sees" preview shows it too | `5ca602e` | api, store, platform | None | **Yes** (same APK, step 6) |
| 10 | **Pay at the end of each month, for new stores only.** A store set up from now on gets its free trial, then its first month starts when the trial ends and is **paid a month later** (trial ends Nov 13 → first payment Dec 13 for Nov 13 – Dec 12, then Jan 13 for Dec 13 – Jan 12). Applies to stores onboarded from Platform and to existing **Not set up** stores when they're first set up. Onboarding's first payment date is now optional and defaults to a month after the trial ends. **Existing stores don't change:** every store already billed, exempt, prepaid, invoiced or with a month ticked paid in the manual ledger keeps paying in advance. Platform shows each store's **Payment timing**; the schedule preview says which month each bill covers. Also brings back Platform's "Coming up" schedule during a store's trial (hidden by change 9) | `95a8b76` | api, platform | Check (read-only): `billing-timing-check.js`. New optional field `StoreSubscription.billedInArrears`, no backfill | No |
| 11 | **Prepayments in billing history, with a receipt.** A prepayment recorded in Platform (Subscriptions → store → Prepayment) didn't appear in the store's billing history: Store Portal and kiosk showed "No invoices yet." and there was no receipt. Each prepayment now shows as a **Paid** row (method **Prepaid**, the months it covers as the period, number `KSF-PRE-YYYYMM-XXXXXX`) and opens a receipt like any paid invoice. API only: the already-released kiosk APK 1.2.0 and the Store Portal show it without a rebuild | `19c1852` | api | Backfill: `prepayment-periods-backfill.js` (step 4b). New optional fields `BillingPayment.periodStart` / `periodEnd`, not filtered on | No |

**Services to rebuild:** `api`, `store`, `platform`. Deploy `api` and `platform` together (change 4): the new Platform tab reads the API's new `inactive` count.
**Not affected:** `company`, nginx, MongoDB, Redis, MinIO.
**Kiosk APK:** needed for changes 5–9 (Resubscribe screen, Pay now, Settings → Billing, payment confirmation, trial banner). Release it **after** the API is deployed; see step 6.

**Resubscribe rules (change 5)**, so support can answer "why can't this store resubscribe?":
- Only a **Store Admin**, never a cashier. Cashiers of a switched-off store still can't log in.
- Only when the **store itself** is switched off. If the whole **Company** is switched off, paying can't fix it and nobody can log in, as before.
- Only when the store is **billed with a price** (not exempt or not set up) and billing is on globally. Otherwise the old "Email support to resubscribe" screen shows.
- While switched off, that admin can use **billing only** (plus logout and change password); everything else stays blocked.
  During the 15-day grace period, **Export your data** still works as before (shown on the
  Resubscribe screen); after it, export is closed as before.
- A platform admin's **Mark paid** on a switched-off store's invoice also switches the store back on.

## Impact on live users

| Step | What users notice |
|---|---|
| 1–3 (pull, backup, indexes) | Nothing visible. The index build scans `transactions` and `expenses`, adding read load while it runs; it takes only brief locks at start and end. |
| 4 build | Nothing directly, but the build uses CPU and memory, so the apps can feel slower. |
| 4 restart | **API unavailable for roughly 10–30 seconds**, plus a few seconds for the Store Portal. Kiosks are offline-first: sales save locally and sync automatically. Store Portal users may need to refresh. Nobody is logged out. |

**Recommended timing:** after stores close or in the quietest hour, mainly for the index build on large stores.

---

## Steps

### 1. Pull the code on the server

```bash
cd <repo dir>
git checkout master && git pull
```

### 2. Back up the database

```bash
docker exec kioskly-mongo sh -c 'mongodump -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --archive=/tmp/pre-store-fixes.gz --gzip'
mkdir -p backups
docker cp kioskly-mongo:/tmp/pre-store-fixes.gz ./backups/pre-store-fixes-$(date +%F).gz
ls -lh backups/
```

### 3. Create the list indexes (from change 1)

`docs/deployment/store-list-indexes.js` creates two indexes and nothing else:
`transactions { tenantId, timestamp }` and `expenses { tenantId, date }`.
Pagination works without them, but large stores only get faster once they
exist. Index names match `prisma db push`; re-running is a no-op.

```bash
docker cp docs/deployment/store-list-indexes.js kioskly-mongo:/tmp/store-list-indexes.js
docker exec kioskly-mongo mongosh "$(docker exec kioskly-api printenv DATABASE_URL)" --quiet --file /tmp/store-list-indexes.js
```

Expected output ends with `Done: 2 indexes in place.`

Run it on **staging first**, then production. Prefer this script to a full
`prisma db push` on a live database (see `billing-release.md`, step 3).

### 3b. Check billing dates (from change 8, read-only)

`docs/deployment/billing-dates-check.js` changes nothing. It lists billed stores whose
next billing date falls inside a month they already paid. Before this release those
stores were told "Subscription due" for a paid month and would be invoiced for it again;
after it, their next billing moves to the day after paid-through on its own.

```bash
docker cp docs/deployment/billing-dates-check.js kioskly-mongo:/tmp/billing-dates-check.js
docker exec kioskly-mongo mongosh "$(docker exec kioskly-api printenv DATABASE_URL)" --quiet --file /tmp/billing-dates-check.js
```

Expected on a healthy database: `0 stores affected.` Run it **before** step 4 and keep the
output. For any store it lists, check Platform → Subscriptions after step 4: it should no
longer show as Due for that month. If one of those stores has an **open invoice for a month
it already paid** (listed under "open invoices"), void it in Platform; the fix stops new
duplicates but doesn't remove an existing one.

### 3c. Check payment timing (from change 10, read-only)

`docs/deployment/billing-timing-check.js` changes nothing. It lists how each store pays and
which "Not set up" stores will pay at the end of the month once they're set up.

```bash
docker cp docs/deployment/billing-timing-check.js kioskly-mongo:/tmp/billing-timing-check.js
docker exec kioskly-mongo mongosh "$(docker exec kioskly-api printenv DATABASE_URL)" --quiet --file /tmp/billing-timing-check.js
```

Run it **before** step 4 and again **after** it, and compare. Both runs should show
`End of month: 0` and the same stores under **In advance (unchanged)**: the deploy itself
switches nobody. Only setting up a store afterwards does.

No data script is needed for the new `billedInArrears` field: it is optional, empty means
"in advance", and nothing filters on it.

### 4. Rebuild and restart the changed services

Build one service at a time on a small server:

```bash
free -h
docker compose build api
docker compose build store
docker compose build platform
docker compose up -d api store platform
```

Then **reload nginx**. It resolves `store`/`platform` to container IPs once, so after the
containers are recreated it keeps sending to the old IPs and the sites return **502**
(happened on the 2026-10-30 deploy until the reload):

```bash
docker exec kioskly-nginx nginx -t && docker exec kioskly-nginx nginx -s reload
curl -s -o /dev/null -w "%{http_code}\n" https://kioscify.com          # 200
curl -s -o /dev/null -w "%{http_code}\n" https://platform.kioscify.com/login  # 200
```

### 4b. Backfill prepayment periods (from change 11)

`docs/deployment/prepayment-periods-backfill.js` copies the period each older prepayment covers
from its `payment.prepayment` audit entry onto the payment, so the history row and the receipt show
the right months. New prepayments save it themselves. It's a **dry run unless `APPLY=true`**, and only
touches prepayments with no period yet, so re-running it is safe. Run it after step 4: until it runs,
older prepayments still show, but with a period estimated from the payment date.

```bash
docker cp docs/deployment/prepayment-periods-backfill.js kioskly-mongo:/tmp/prepayment-periods-backfill.js
# Dry run: check each listed period against Platform → Subscriptions → the store's paid-through date
docker exec kioskly-mongo mongosh "$(docker exec kioskly-api printenv DATABASE_URL)" --quiet --file /tmp/prepayment-periods-backfill.js
# Write
docker exec kioskly-mongo mongosh "$(docker exec kioskly-api printenv DATABASE_URL)" --quiet --eval 'var APPLY=true' --file /tmp/prepayment-periods-backfill.js
```

Expected: one line per prepayment ending the day it's paid through, then `Backfilled N prepayment(s).`
Any `SKIP` line (no matching audit entry) leaves that prepayment showing the estimated period;
note it and tell the developer.

### 5. Smoke test

- `docker compose ps`: `api`, `store` and `platform` are healthy.
- `docker compose logs api --tail 50`: no errors.
- Store Portal → **Transactions**: loads quickly on the largest store; footer shows
  "Showing 1–10 of N", rows-per-page works, Previous/Next work, filters reset to page 1.
- Spot-check the other paginated pages: Expenses (incl. search), both Void Requests tabs,
  Sales Reports and Inventory Reports (both tabs), Attendance, Sessions, Store Users,
  Billing → Billing history.
- CSV export on Transactions/Expenses downloads the current page with the current filters.
- **Dashboard** and **Analytics** totals match before the deploy (they still use full lists).
- Kiosk app: transactions list, expenses list, daily/shift report submission work as before.
- **Analytics** (change 3): opens with data on a phone that was previously stuck. No storage
  clearing is needed; the page now falls back to Today. The Date Range selector is always visible.
  Custom Range with no dates prompts for dates. A saved custom range survives a reload.
- **Platform → Subscriptions** (change 4): the Stores tab no longer lists Puso Village Cebu,
  LG Garden Cebu, Persimmon Cebu or Metro Astra Cebu (or any store switched off). They appear
  under **Inactive stores (N)** with a "Deactivated on" date. Status cards add up to active stores
  only. Don't press Reactivate on a real store as a test; it switches the store back on.
- **Resubscribe** (change 5), on staging with a test store that has a price set:
  - Switch it off under Company → Stores. Its Store Admin logs in to the Store Portal and sees
    "Your subscription has ended." with **Resubscribe**; a cashier of that store still can't log in.
  - Resubscribe shows the payment QR. Pay it (or use Platform → Mark paid on the invoice): the store
    switches back on and the admin lands on the dashboard within ~15 seconds.
  - Platform → Subscriptions → Inactive stores no longer lists it.
- **Payment successful** (change 8), on staging with a Due test store: Pay now from the banner, pay the QR
  (or Platform → Mark paid on the invoice). Within ~30 seconds "Payment successful" appears and stays;
  the due banner behind it is gone. **View receipt** (green) opens that invoice's receipt.
- **Trial banner** (change 9), with a store on its free trial: the Store Portal shows the blue
  "Free trial — N days left" banner; **X** closes it, and it stays closed after a refresh that day.
  Platform → Subscriptions → that store's "what the store sees" shows the same banner, marked (closable).
- **Payment timing** (change 10): Platform → a company → **Onboard Store**: the first payment
  date is prefilled with a month after the trial ends (trial 15 days → today + 15 days + 1 month)
  and "What will happen" says "for the month just ended" and which month the first bill covers.
  On an existing **billed** store, Platform → Subscriptions → Settings shows **Payment timing: In
  advance** and its Next billing date is unchanged. Delete any test store you onboard.
- **Billing dates** (change 8): any store listed by step 3b no longer shows Due for a month it paid.
- **Prepayments** (change 11): for a store with a prepayment (e.g. the store from the report: paid
  through Nov 1 2026, next billing Jan 1 2027), Store Portal → **Billing** → Billing history shows a
  **Paid** row with method **Prepaid** and the months it covers. **Receipt** opens a receipt numbered
  `KSF-PRE-…` with the period, total and "Prepaid · Ref …". On the kiosk (APK 1.2.0, no update), Settings →
  Billing & Payments shows the same row, and **View receipt ›** opens it.
- **Pay now on a phone** (change 6): on a store that is Due, open the Store Portal on a phone;
  one tap on the banner's **Pay now** opens the payment window. Same on a phone kiosk (after step 6).

### 6. Release the kiosk APK (changes 5–9)

Only after the API from step 4 is live. An older APK still works with the new API: its
Store Admin sees the old "Email support to resubscribe" screen instead of being refused at login.

1. Bump the version before building: `kioskly-app/app.json` `"version"` (currently `1.1.0`) and
   `kioskly-app/android/app/build.gradle` `versionCode` (currently `7`, so `8`).
2. On the build machine: `cd kioskly-app && npm run build:apk` (refuses to run if the production
   API URL is wrong).
3. Upload the APK in Platform → **Kiosk App**. Force update is optional: the new screen only
   matters to stores that are switched off.
4. Check on a kiosk logged in as a Store Admin of a switched-off test store: "Your subscription has
   ended." → Resubscribe → QR → after paying, the kiosk returns to the POS and any sales made
   offline before the switch-off sync.
5. On a **phone** kiosk of a Due store, as a Store Admin: one tap on the banner's **Pay now**
   opens the payment sheet (change 6).
6. **Settings → Billing** (change 7): as a Store Admin, Settings shows a **Billing** section
   (status · price) and **Billing & Payments** opens the plan, Pay now (when something is owed) and
   billing history matching Store Portal → Billing. As a cashier, Settings has no Billing section.
7. **Payment successful** (change 8): pay from the kiosk banner's Pay now; "Payment successful" appears
   and stays, **View receipt** opens the kiosk receipt, and paid rows in Billing & Payments open it too.
8. **Trial banner** (change 9): on a kiosk of a store on its free trial, the blue trial banner shows
   under the header for admins and cashiers; **X** hides it on every screen and it stays hidden after
   an app restart that day. An older APK simply shows no trial banner.

---

## Rollback

Check out the previous master commit and repeat step 4. The new indexes are
harmless to the old code and can stay. No data changes to undo. Stores that resubscribed stay
switched on (they paid). A new kiosk APK keeps working against the old API: its Resubscribe
screen simply never appears, because the old API refuses switched-off stores at login.
Dates written by payments after the deploy (paid-through never moved back) are valid for the old
code too; only the old code's "due for a paid month" behaviour returns. Rolling back change 9 just
removes the trial banner; the "closed today" marker it leaves in browsers and kiosks is unused.
Rolling back change 10: the old code ignores `billedInArrears`, so a store set up after the deploy
is billed in advance from its stored next billing date (a Dec 13 bill would then cover Dec 13 –
Jan 12). Nobody is charged twice; such a store just never pays for its first month. Check the
stores listed under "End of month" by step 3c if you roll back.
Rolling back change 11: the old code ignores the new prepayment period fields, so prepayments
just disappear from store billing history again. Nothing to undo.

---

## Change log

- **2026-10-27**: Created with changes 1 and 2.
- **2026-10-27**: Added change 3 (Analytics stuck state). Store Portal only; no new steps.
- **2026-10-27**: Added change 4 (Inactive stores tab). Adds `platform` to the rebuild.
- **2026-10-27**: Added change 5 (Resubscribe). No new services or scripts; adds the **kiosk APK
  release** (step 6).
- **2026-10-27**: Added change 6 (Pay now tap targets). Store Portal + the same kiosk APK; no new steps.
- **2026-10-29**: Added change 7 (kiosk Settings → Billing). Kiosk APK only; no server changes.
- **2026-10-29**: Added change 8 (Payment successful confirmation). Store Portal + the same kiosk APK; no new steps.
- **2026-10-29**: Change 8 also fixes billing dates for a store whose next billing sat inside a paid month
  (API). Adds the read-only check, step 3b.
- **2026-10-29**: Added change 9 (closable free trial banner). API + Store Portal + Platform preview +
  the same kiosk APK; no new steps or scripts.
- **2026-10-29**: Added change 10 (new stores pay for each month at its end). API + Platform; adds
  the read-only check, step 3c. No kiosk APK, no data script.
- **2026-10-30**: **Deployed to production** (changes 1–10; master fast-forwarded to `769fcfb`).
  Backup `backups/pre-store-fixes-2026-10-30.gz` (2.3 MB). Indexes: 2 in place. Step 3b: 0 stores
  affected. Step 3c before and after: End of month 0, the same 9 stores In advance, 7 Not set up.
  Every `store_subscriptions` document identical before and after. After the restart nginx kept
  the old container IPs: Store Portal and Platform returned 502 for ~3 minutes (3 failed requests;
  the API, and so the kiosks, were unaffected) until `nginx -s reload`, now part of step 4. The
  mongosh commands now run the scripts with `--file`: piping them on stdin broke
  `billing-dates-check.js` (read as REPL input).
- **2026-10-30**: Kiosk APK **1.2.0** (versionCode 8) uploaded in Platform → Kiosk App as a
  **force update** (step 6, changes 5–9).
- **2026-10-31**: Added change 11 (prepayments in billing history with a receipt). API only; adds
  the backfill, step 4b. No kiosk APK, no portal rebuild.
