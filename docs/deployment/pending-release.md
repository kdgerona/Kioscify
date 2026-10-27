# Release runbook: pending store fixes

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

**Services to rebuild:** `api`, `store`, `platform`. Deploy `api` and `platform` together (change 4): the new Platform tab reads the API's new `inactive` count.
**Not affected:** `company`, nginx, MongoDB, Redis, MinIO.
**Kiosk APK:** needed for change 5 (in-app Resubscribe screen). Release it **after** the API is deployed; see step 6.

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
docker exec -i kioskly-mongo mongosh "$(docker exec kioskly-api printenv DATABASE_URL)" --quiet \
  < docs/deployment/store-list-indexes.js
```

Expected output ends with `Done: 2 indexes in place.`

Run it on **staging first**, then production. Prefer this script to a full
`prisma db push` on a live database (see `billing-release.md`, step 3).

### 4. Rebuild and restart the changed services

Build one service at a time on a small server:

```bash
free -h
docker compose build api
docker compose build store
docker compose build platform
docker compose up -d api store platform
```

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

### 6. Release the kiosk APK (change 5)

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

---

## Rollback

Check out the previous master commit and repeat step 4. The new indexes are
harmless to the old code and can stay. No data changes to undo. Stores that resubscribed stay
switched on (they paid). A new kiosk APK keeps working against the old API: its Resubscribe
screen simply never appears, because the old API refuses switched-off stores at login.

---

## Change log

- **2026-10-27**: Created with changes 1 and 2.
- **2026-10-27**: Added change 3 (Analytics stuck state). Store Portal only; no new steps.
- **2026-10-27**: Added change 4 (Inactive stores tab). Adds `platform` to the rebuild.
- **2026-10-27**: Added change 5 (Resubscribe). No new services or scripts; adds the **kiosk APK
  release** (step 6).
