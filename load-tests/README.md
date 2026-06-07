# Kioscify Load Tests

k6-based load test suite for sizing, validation, and milestone gates.

## Prerequisites

Install k6 (macOS):
```bash
brew install k6
```

Or via the official installer: https://grafana.com/docs/k6/latest/set-up/install-k6/

## Test Data

All scripts require real data to exist in the database. Before running any test, make sure:
- At least one tenant (store) exists with a cashier user and at least one product
- For `dashboard.js` and `milestone.js`: a company admin user exists
- Seed via `npm run prisma:seed --workspace=kioskly-api` or create via the API/Swagger UI

## Environment Variables

Create a `.env.test` file (never commit this — it has credentials):

```bash
# Store 1
K6_TENANT_ID_1=<mongodb-object-id>
K6_CASHIER_USER_1=cashier1
K6_CASHIER_PASS_1=yourpassword
K6_PRODUCT_ID_1=<product-id-in-that-store>

# Store 2-5 (use same values as store 1 if you only have one store)
K6_TENANT_ID_2=<id>
K6_CASHIER_USER_2=cashier2
K6_CASHIER_PASS_2=yourpassword
K6_PRODUCT_ID_2=<id>
# ... repeat for 3, 4, 5

# Company admin (for dashboard.js)
K6_COMPANY_SLUG=greatserve
K6_COMPANY_USER=companyadmin
K6_COMPANY_PASS=yourpassword
K6_BRAND_ID=<mongodb-object-id>

# Store admin (for dashboard.js reports section)
K6_TENANT_ID=<mongodb-object-id>
K6_STORE_ADMIN_USER=storeadmin
K6_STORE_ADMIN_PASS=yourpassword

# Optional overrides
K6_BASE_URL=http://localhost:3000/api/v1
```

Load the file when running k6:
```bash
export $(cat load-tests/.env.test | xargs) && k6 run load-tests/scenarios/smoke.js
```

## Running Tests

Make sure the API is running locally first:
```bash
docker-compose -f docker/docker-compose.yml up -d  # MongoDB
npm run api:dev                                     # NestJS API
```

### Smoke (30s — run before every deployment)
```bash
k6 run \
  -e K6_TENANT_ID_1=$K6_TENANT_ID_1 \
  -e K6_CASHIER_USER_1=$K6_CASHIER_USER_1 \
  -e K6_CASHIER_PASS_1=$K6_CASHIER_PASS_1 \
  -e K6_PRODUCT_ID_1=$K6_PRODUCT_ID_1 \
  load-tests/scenarios/smoke.js
```

### Sync burst (2 min — after onboarding each new store)
```bash
k6 run \
  -e K6_TENANT_ID_1=$K6_TENANT_ID_1 \
  -e K6_CASHIER_USER_1=$K6_CASHIER_USER_1 \
  -e K6_CASHIER_PASS_1=$K6_CASHIER_PASS_1 \
  -e K6_PRODUCT_ID_1=$K6_PRODUCT_ID_1 \
  ... \
  load-tests/scenarios/sync-burst.js
```

### Dashboard (2 min — after adding analytics features)
```bash
k6 run \
  -e K6_COMPANY_SLUG=$K6_COMPANY_SLUG \
  -e K6_COMPANY_USER=$K6_COMPANY_USER \
  -e K6_COMPANY_PASS=$K6_COMPANY_PASS \
  -e K6_BRAND_ID=$K6_BRAND_ID \
  -e K6_TENANT_ID=$K6_TENANT_ID \
  -e K6_STORE_ADMIN_USER=$K6_STORE_ADMIN_USER \
  -e K6_STORE_ADMIN_PASS=$K6_STORE_ADMIN_PASS \
  load-tests/scenarios/dashboard.js
```

### Milestone gate (5 min — run before each growth milestone)
```bash
mkdir -p load-tests/results

# Gate 0: baseline before onboarding GreatServe
k6 run [all env vars] \
  --out json=load-tests/results/gate-0.json \
  load-tests/scenarios/milestone.js

# Gate 1: before 5th store
k6 run [all env vars] \
  --out json=load-tests/results/gate-1.json \
  load-tests/scenarios/milestone.js
```

## Interpreting Results

k6 prints a summary table at the end. Key metrics:

| Metric | What it means | Target |
|---|---|---|
| `http_req_failed` | % of requests that errored | < 1% |
| `http_req_duration p(95)` | 95th percentile response time | < 800ms (API), < 2000ms (analytics) |
| `checks` | % of explicit assertions that passed | Should be 100% |
| `http_req_duration{status:429}` | Any rate-limit hits | Should be 0 (sync endpoints bypass throttle) |

A green `✓` next to each threshold means the server handled the load. A red `✗` means you've hit a constraint and need to investigate before going live.

## Comparing Milestone Results

Extract p95 from saved JSON results:
```bash
# Summary JSON (k6 --out json writes raw metrics; use k6 cloud or grep for the summary)
jq 'select(.type=="Point" and .metric=="http_req_duration") | .data.value' \
  load-tests/results/gate-0.json | awk '{sum+=$1; n++} END {print "avg:", sum/n, "ms"}'
```

For a simpler comparison, just look at the printed summary tables side by side.
A >20% increase in p95 between gates is the signal to investigate before onboarding more stores.

## Milestone Gate Schedule

| Gate | Trigger | Action if thresholds fail |
|---|---|---|
| Gate 0 | Before onboarding GreatServe | Fix before going live |
| Gate 1 | Before 5th store | Check indexes, memory limits, slow queries |
| Gate 2 | Before 10th store | Likely time to upgrade to 4 vCPU / 8 GB droplet |
| Gate 3 | Before 20th store | Upgrade droplet, consider splitting MongoDB |

## Upgrade Triggers (DO Monitoring)

Enable free monitoring alerts in the Digital Ocean control panel:

| Metric | Alert threshold | Action |
|---|---|---|
| CPU | Sustained > 60% | Upgrade droplet |
| Free RAM | < 600 MB regularly | Upgrade droplet |
| Disk | > 70% full | Add DO Volume (100 GB, $10/mo) |

Upgrade path:
- **Now**: 2 vCPU / 4 GB (~$24/mo) — handles up to ~20 stores
- **Next**: 4 vCPU / 8 GB (~$48/mo) — handles up to ~50 stores
- **After that**: Split MongoDB to DO Managed MongoDB (~$15/mo) + keep 4 vCPU / 8 GB app droplet
