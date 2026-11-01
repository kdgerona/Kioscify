# Release runbook: pending fixes

Running checklist for fixes that are **not deployed yet**. Each fix adds its own deploy steps
here, so a release is one pass through this file. Once a release is deployed, move this file to
`<name>-release-<date>.md` as a record and start a fresh one.

Previous releases (records only, nothing to re-run):
- `prepayment-history-release-2026-10-31.md`: prepayments in billing history, deployed 2026-10-31
- `store-fixes-release-2026-10-30.md`: store fixes 1–10, deployed 2026-10-30

Production: `docker-compose.yml`, project `kioscify-production`, server `/root/apps/Kioscify`
(SSH host `Kioscify-v2-Digital-Ocean-Server`).

## What's in this release

| # | Change | Branch / commit | Services | Data / scripts | Kiosk APK |
|---|---|---|---|---|---|
| 1 | **Reward system, starting with Loyalty Cards.** A type-agnostic rewards engine (Loyalty Card is the first type; BOGO / % off can be added later as new types). **Company portal → Rewards**: build a program for a brand (stamp circles with conditions, milestone rewards) and turn it on **only for the stores you select**. **Store Portal → Rewards**: the store's own programs, enrolled company programs (read-only), and an Activity log of cards issued, stamps and redemptions. **Kiosk**: a Loyalty Card step in checkout records card issued, stamped circles and milestone redemptions (applied as an item discount). Paper cards, so no customer data is stored | `feature/reward-system`, `94653a4` | api, store, company | Indexes: `rewards-indexes.js` (step 3). Privileges: `rewards-privileges.js` (step 4). New collections only, so **no backfill** | **Yes**: 1.3.0 (versionCode 9) |

**Not affected:** `platform`, nginx config, MongoDB, Redis, MinIO.

## Impact on live users

- Nothing changes for a store until a company enrolls it in an **ACTIVE** program, or the store
  creates its own. With no active programs, the kiosk doesn't show the Loyalty Card step.
- Older APKs (1.2.0) keep working: `rewards` on `POST /transactions` is optional.
- New data lives in three new collections (`reward_programs`, `reward_program_stores`,
  `reward_events`). No field is added to an existing collection, so the CLAUDE.md "required field
  without backfill" incident can't happen here. `Transaction.rewardEvents` is a Prisma
  back-relation only, with nothing stored on transactions.
- **Offline sales are never lost to reward changes.** A sale queued on a kiosk that syncs after its
  program was paused, unenrolled, edited or deleted is still accepted. The reward event is saved
  with `validationWarnings` and shows as **Flagged** in the Activity lists. Only malformed or
  foreign (another company's) reward data is rejected with a 400.
- Restricted (non-owner) admins can't see Rewards until step 4 runs and they log in again.

## Steps

### 1. Pull the code on the server

```bash
cd /root/apps/Kioscify
git checkout master && git pull
```

### 2. Back up the database

```bash
docker exec kioskly-mongo sh -c 'mongodump -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --archive=/tmp/pre-rewards.gz --gzip'
mkdir -p backups
docker cp kioskly-mongo:/tmp/pre-rewards.gz ./backups/pre-rewards-$(date +%F).gz
ls -lh backups/
```

### 3. Create the reward indexes (change 1)

`docs/deployment/rewards-indexes.js` creates 7 indexes on the three new collections, including the
**unique** `{ programId, tenantId }` on `reward_program_stores`, which stops a store being enrolled
twice. The collections are empty, so this is instant. Names match `prisma db push`; re-running is
a no-op.

```bash
docker cp docs/deployment/rewards-indexes.js kioskly-mongo:/tmp/rewards-indexes.js
docker exec kioskly-mongo mongosh "$(docker exec kioskly-api printenv DATABASE_URL)" --quiet --file /tmp/rewards-indexes.js
```

Expected output ends with `Done: 7 indexes in place.` (Tested locally 2026-10-31, twice: idempotent.)

### 4. Give existing restricted admins the `rewards` privilege (change 1)

Both portals treat a missing privilege section as **no access**. Restricted admins created before
this release have no `rewards` key, so Rewards would be hidden from them.
`docs/deployment/rewards-privileges.js` sets `rewards: 'read'` (the default new users get) where
it's missing. Owners (`null` privileges = full access) and anyone already set are untouched.
Re-running is a no-op.

Dry run first, then apply:

```bash
docker cp docs/deployment/rewards-privileges.js kioskly-mongo:/tmp/rewards-privileges.js
DB="$(docker exec kioskly-api printenv DATABASE_URL)"
docker exec kioskly-mongo mongosh "$DB" --quiet --eval 'var DRY_RUN=true' --file /tmp/rewards-privileges.js
docker exec kioskly-mongo mongosh "$DB" --quiet --file /tmp/rewards-privileges.js
```

Local dry run (2026-10-31): 6 company users and 2 store users would be updated. Afterwards, an
owner can raise a user to write/all in the portal's privileges editor (write is needed to create
or edit programs). Affected users must **log out and back in** to see the change.

> Note: the API's `PrivilegeGuard` / `StorePrivilegeGuard` don't enforce privileges today
> (`JwtStrategy.validate` doesn't put `companyPrivileges`/`storePrivileges` on `req.user`). Only the
> portals enforce them. That's pre-existing, applies to every section, and isn't changed by this release.

### 5. Rebuild and restart the changed services

Build one service at a time on the small server (`docker compose build api` can take >10 min, and
SSH output may hang; check the image's CreatedAt instead):

```bash
free -h
docker compose build api
docker compose build store
docker compose build company
docker compose up -d api store company
```

Then **reload nginx**, which caches container IPs (502s otherwise, as on 2026-10-30):

```bash
docker exec kioskly-nginx nginx -t && docker exec kioskly-nginx nginx -s reload
curl -s -o /dev/null -w "%{http_code}\n" https://kioscify.com   # 200
```

The API must be live **before** the portals, because the portals call `/rewards/*`.

> Before deploying, build `store` and `company` with Docker once (locally or on staging).
> `npm run build` for both portals fails in the local monorepo at the `/404` prerender
> (`Cannot read properties of null (reading 'useContext')`). That failure was reproduced on
> untouched master and comes from hoisted React versions in `node_modules`, not from this change.
> The Docker images install each portal's dependencies on their own, so they're expected to build,
> but confirm it before the production deploy.

### 6. Smoke test (server)

- `docker compose ps`: `api`, `store` and `company` are healthy. `docker compose logs api --tail 50`: no errors.
- **Company portal → Rewards** (as the company owner, on staging or with a test program you delete after):
  1. New program → Loyalty Card → pick the brand → build a small card (e.g. 1 row: a "Base price ₱49+"
     circle, a product-name circle, a "₱98+ purchase" circle, and a 50%-off milestone) → save as Draft.
  2. **Stores** tab: enroll **one** test store → save. Set the status to **Active**.
  3. A store that isn't enrolled doesn't get it: on that store's kiosk/portal, Rewards shows no company program.
- **Store Portal → Rewards → Programs** (enrolled store): the company program shows with a **Company**
  badge and is read-only. Create a store program; both are listed.
- Transactions, Dashboard and Analytics behave as before for a store with no programs.

### 7. Release the kiosk APK 1.3.0 (change 1)

Only after the API from step 5 is live. The version is already bumped in this branch:
`kioskly-app/app.json` `"version": "1.3.0"`, `android/app/build.gradle` `versionCode 9` / `versionName "1.3.0"`.

1. On the build machine: `cd kioskly-app && npm run build:apk` (refuses to run if the production API URL is wrong).
2. Upload the APK in Platform → **Kiosk App**. Force update is optional: an older APK just doesn't show the Loyalty Card step.
3. Check on a kiosk of the enrolled test store:
   - Add a ₱49+ drink and the product named on a circle. Checkout shows **Loyalty Card** with a count badge.
   - Open it: the matching circles are highlighted and the rest are dimmed. Toggle **New card issued**, tick 2 circles.
   - Tap **Redeem**: it asks "Check the customer's card. Are circles 1–4 stamped?" → **Yes, redeem** → pick the item:
     the preview shows 50% of one unit, and the total drops by that amount.
   - With the reward's item **not** in the cart, Redeem explains what to add ("Add a … item to the order, then tap
     Redeem again. It will be free.") instead of doing nothing.
   - **One stamp per visit** program (Company → program → "How are stamps earned?"): every circle is tappable,
     only one can be ticked per sale (tapping another moves the tick), whatever is in the cart.
   - Complete the sale. The summary says "Stamp the paper card: 2 circles".
   - **Offline**: airplane mode, repeat a sale with a stamp, reconnect. It syncs once, and Activity shows no duplicate.
4. Store Portal → **Rewards → Activity**: 1 card issued, the stamps and the redemption are listed, each linked to its
   transaction. Company portal → the program → **Activity** shows the same under that store.
5. **Void** the test transaction (as Store Admin). Its reward events drop out of Activity and the summary tiles.
   Delete or archive the test programs afterwards.

---

## Rollback

Check out the previous master commit and repeat step 5 (`api store company`). The three new
collections and their indexes are ignored by the old code and can stay; nothing on existing
collections was changed, so there's no data to undo. The `rewards` key added by step 4 is ignored
by old portals. A 1.3.0 kiosk against the old API: `GET /rewards/active` 404s, which the kiosk
treats as "no programs", so the Loyalty Card step doesn't appear and sales post as before.

---

## Change log

- **2026-10-31**: Started fresh after the prepayments release was deployed.
- **2026-10-31**: Added change 1 (reward system / Loyalty Card). Services `api`, `store`, `company`;
  scripts `rewards-indexes.js`, `rewards-privileges.js`; kiosk APK 1.3.0.
- **2026-11-01**: Change 1 extended after review: per-program stamp mode (`config.stampMode`:
  "One stamp per visit" or per-circle conditions, default unchanged so no migration), a card-check
  confirmation before redeeming, add-the-item guidance in the kiosk, readable colours on light brand
  colours, and the store-portal `/rewards/<id>` middleware fix. No new services, scripts or steps.
