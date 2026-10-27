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

**Services to rebuild:** `api`, `store`.
**Not affected:** `company`, `platform`, nginx, MongoDB, Redis, MinIO. No kiosk app release is needed; the kiosk app still gets full lists because it never sends `page`.

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
docker compose up -d api store
```

### 5. Smoke test

- `docker compose ps`: `api` and `store` are healthy.
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

---

## Rollback

Check out the previous master commit and repeat step 4. The new indexes are
harmless to the old code and can stay. No data changes to undo.

---

## Change log

- **2026-10-27**: Created with changes 1 and 2.
- **2026-10-27**: Added change 3 (Analytics stuck state). Store Portal only; no new steps.
