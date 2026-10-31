# Release runbook: pending fixes

Running checklist for fixes that are **not deployed yet**. Each fix adds its own deploy steps
here, so a release is one pass through this file. Once a release is deployed, move this file to
`<name>-release-<date>.md` as a record and start a fresh one.

The previous release (store fixes, changes 1–10, deployed 2026-10-30) is recorded in
`store-fixes-release-2026-10-30.md`. Nothing from it needs to run again.

Production: `docker-compose.yml`, project `kioscify-production`, server `/root/apps/Kioscify`.

## What's in this release

| # | Change | Branch / commit | Services | Data / scripts | Kiosk APK |
|---|---|---|---|---|---|
| 1 | **Prepayments in billing history, with a receipt.** A prepayment recorded in Platform (Subscriptions → store → Record prepayment) didn't appear in the store's billing history: Store Portal and kiosk showed "No invoices yet." and there was no receipt. Each prepayment now shows as a **Paid** row (method **Prepaid**, the months it covers as the period, number `KSF-PRE-YYYYMM-XXXXXX`) and opens a receipt like any paid invoice. The kiosk app (APK 1.2.0) and the Store Portal show it without a rebuild | `feature/prepayment-billing-history`, `19c1852` | api | Backfill: `prepayment-periods-backfill.js` (step 3). New optional fields `BillingPayment.periodStart` / `periodEnd`, not filtered on | No |

**Services to rebuild:** `api` only.
**Not affected:** `store`, `platform`, `company`, nginx, MongoDB, Redis, MinIO. No kiosk APK.

## Impact on live users

The API restart makes it **unavailable for roughly 10–30 seconds**. Kiosks are offline-first:
sales save locally and sync automatically. Store Portal users may need to refresh. Nobody is
logged out. Any time of day is fine; there's no index build or heavy script.

---

## Steps

### 1. Pull the code on the server

```bash
cd /root/apps/Kioscify
git checkout master && git pull
```

### 2. Back up the database

```bash
docker exec kioskly-mongo sh -c 'mongodump -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --archive=/tmp/pre-prepayment-history.gz --gzip'
docker cp kioskly-mongo:/tmp/pre-prepayment-history.gz ./backups/pre-prepayment-history-$(date +%F).gz
ls -lh backups/
```

### 3. Rebuild the API, then backfill prepayment periods

```bash
docker compose build api
docker compose up -d api
docker exec kioskly-nginx nginx -t && docker exec kioskly-nginx nginx -s reload
```

Reload nginx after every restart: last time it kept the old container IPs and returned 502s until reloaded.

`docs/deployment/prepayment-periods-backfill.js` copies the period each older prepayment covers
from its `payment.prepayment` audit entry onto the payment, so the history row and the receipt
show the right months. New prepayments save it themselves. It's a **dry run unless
`APPLY=true`**, and only touches prepayments with no period yet, so re-running it is safe. Until it
runs, older prepayments still show, but with a period estimated from the payment date.

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

### 4. Smoke test

- `docker compose ps`: `api` is healthy. `docker compose logs api --tail 50`: no errors.
- For the store from the report (paid through Nov 1 2026, next billing Jan 1 2027), as its Store Admin:
  - Store Portal → **Billing** → Billing history shows a **Paid** row with method **Prepaid**, the
    months it covers and its reference.
  - **Receipt** opens a receipt numbered `KSF-PRE-…` with the period, total and "Prepaid · Ref …".
- On a kiosk with that store (APK 1.2.0, no update needed): Settings → **Billing & Payments** shows
  the same row, and **View receipt ›** opens it.
- A store with ordinary invoices: its billing history and receipts look the same as before.

---

## Rollback

Check out the previous master commit and repeat step 3's rebuild (skip the backfill). The old
code ignores the new prepayment period fields, so prepayments just disappear from store billing
history again. Nothing to undo; the backfilled fields can stay.

---

## Change log

- **2026-10-31**: Created after the store fixes release was archived. Added change 1 (prepayments
  in billing history with a receipt; API + backfill). Tested locally end to end in the Platform
  portal and Store Portal via nginx.
- **2026-10-31**: Fixed the backfill skipping real prepayments: Prisma stores the payment's amount and
  months as 64-bit numbers and the audit log as plain numbers, so they never compared equal. Production
  has a prepayment to backfill. Verified with `mongosh` (as in production) against a prepayment
  recorded through the API: the dry run lists it, apply writes the same period the API saves, and a
  re-run changes nothing.
