# Release runbook: automated subscription billing

How to release automated store subscription billing (PayMongo QR Ph) to the
existing production deployment (`docker-compose.yml`, project
`kioscify-production`).

Everything ships with billing **OFF**. Parts A and B change nothing for
stores; nothing is billed, shown or paused until a platform admin turns it on
in Part C.

- Spec: `docs/superpowers/specs/2026-10-24-automated-subscription-billing-design.md`
- Plan: `docs/superpowers/plans/2026-10-24-automated-subscription-billing.md`

---

## Part A: Deploy the code (billing stays OFF)

### 1. Pull the code on the server

```bash
cd <repo dir>
git checkout master && git pull
```

### 2. Back up the database

```bash
docker exec kioskly-mongo sh -c 'mongodump -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --archive=/tmp/pre-billing.gz --gzip'
docker cp kioskly-mongo:/tmp/pre-billing.gz ./backups/pre-billing-$(date +%F).gz
```

### 3. Create the new collections and indexes (required)

The billing collections rely on unique indexes for safety: no duplicate
invoices, and no payment applied twice. They must exist before billing is
used.

- The API image does not include the Prisma CLI (it is a dev dependency).
- The database network `kioskly-internal` has no internet access
  (`internal: true`).

So the command below creates a throwaway container on the default network,
where it can download Prisma. It then attaches the container to the database
network and runs `db push`:

```bash
docker create --name prisma-push -w /prisma \
  -v "$PWD/kioskly-api/prisma:/prisma:ro" \
  -e DATABASE_URL="$(docker exec kioskly-api printenv DATABASE_URL)" \
  node:20-alpine sh -c "npx -y prisma@6.19.0 db push --schema=schema.prisma --skip-generate"
docker network connect kioscify-production_kioskly-internal prisma-push
docker start -a prisma-push
docker rm prisma-push
```

- Expected result: "Your database indexes are now in sync."
- The change is additive only: new collections, optional fields and indexes.
  No existing data is modified, and no backfill is needed, because a missing
  field reads as OFF.
- **If Prisma warns about data loss or asks to drop anything, stop.** Do not
  add `--accept-data-loss`. Investigate first.
- If the network name differs, check it with `docker network ls`.

### 4. Rebuild and restart the changed services together

```bash
docker compose build api store platform
docker compose up -d api store platform
```

Deploy the API and Platform Admin together. Platform Admin's "Onboard store"
form needs the new API, because `POST /stores` now requires billing details.
The Company portal, nginx and MongoDB do not need restarting.

### 5. Smoke test

- `docker compose ps`: api, store and platform are healthy.
- `docker compose logs api --tail 50`: no errors; the billing scheduler starts.
- The Store Portal and kiosk work as before, with no banners.
- Platform → Settings → **Billing** card shows Billing **OFF** and PayMongo
  **unconfigured**.
- The "Onboard store" form asks for a monthly price, trial and first billing
  date.

---

## Part B: Connect PayMongo (still invisible to stores)

### 6. Add the live keys

Add these to the server's `.env`. `docker-compose.yml` already passes them to
the API. Keys are read server-side only, never stored in the database and
never returned to clients.

```env
PAYMONGO_SECRET_KEY=sk_live_...
PAYMONGO_PUBLIC_KEY=pk_live_...
BILLING_PAY_PAGE_BASE_URL=https://kioscify.com
```

```bash
docker compose up -d api
```

### 7. Register the webhook

In the PayMongo dashboard (**Live** mode → Developers → Webhooks):

- URL: `https://kioscify.com/api/v1/billing/webhooks/paymongo`
- Events: `payment.paid`, `payment.failed`, `qrph.expired`

Copy the webhook's `whsk_...` secret into `.env` as
`PAYMONGO_WEBHOOK_SECRET`, then restart:

```bash
docker compose up -d api
```

Settings → Billing should now show **Live**, with the webhook configured.

The webhook makes confirmation instant. Without it, payments still confirm:
while a QR is on screen, the API asks PayMongo directly about every 20
seconds, and an hourly job reconciles recent attempts.

### 8. Upload the fallback bank QR

In Settings → Billing → **Fallback bank QR**, upload the QR, then add the
account name and instructions. Stores see it instead of PayMongo when any of
these happen:

- the PayMongo monthly limit is reached;
- PayMongo isn't configured;
- PayMongo returns an error, returns no QR, or doesn't answer within 15
  seconds.

Stores submit "I've paid", and a platform admin approves the payment.

---

## Part C: Roll out to stores

### 9. Set up every store

Go to Platform → **Subscriptions** → each store:

| Store | Action |
|---|---|
| Own store / stores on a separate agreement | **Turn off billing** (exempt), with a reason |
| Prepaid stores | **Record prepayment**, or set the next billing date after what they've paid for. Nothing is charged retroactively. |
| Everyone else | Monthly price and activation date. Check the "What will happen" preview. |

### 10. Turn billing on and test with one real store

1. Turn on **Billing enabled** in Settings → Billing.
2. Start with one real store.
3. Make one real low-value payment end to end, and check:
   - the QR is generated;
   - the payment confirms;
   - the banner disappears;
   - a receipt appears on the Store Portal's Billing page.

### 11. Enable the remaining stores

With enforcement still off, an unpaid store only ever sees a banner. Nothing
is paused.

---

## Part D: Turn on enforcement (pausing access). Do this last.

### 12. Release kiosk APK 1.1.0 (versionCode 7)

On the build machine:

```bash
cd kioskly-app && npm run build:apk
```

The build script refuses to run if the production API URL is wrong. Upload
the APK in Platform → **App Releases** with **Force update** on.

### 13. Wait until every kiosk has updated

Old APKs (1.0.5, versionCode 6) are still paused correctly. They show the
old "subscription ended" screen, which has no Pay button, so they must be
gone before enforcement is turned on.

### 14. Turn on enforcement

In Settings → Billing:

1. Set **Minimum kiosk version code = 7**.
2. Turn on **Enforcement** and confirm the dialog.

From then on, a store still unpaid after its grace period has its Store
Portal and kiosk access paused until it pays. Paying restores access
immediately. Sales recorded offline always sync; the pause never loses data.

---

## Rollback

- **Turn billing off (no deploy):** Settings → Billing → **Billing enabled
  OFF**. Every banner, pause and new invoice stops immediately.
- **Roll back the code:** check out the previous master commit and repeat
  step 4. The new collections and fields are ignored by the old code, so no
  data cleanup is needed. Restore the step 2 backup only if the data itself
  went wrong.

---

## Follow-ups

- The `kioscify-onboarding` skill creates stores through `POST /stores`,
  which now requires a `billing` object (`priceCentavos`, `trialDays`,
  `firstBillingDate`). Update the skill before using it again.
