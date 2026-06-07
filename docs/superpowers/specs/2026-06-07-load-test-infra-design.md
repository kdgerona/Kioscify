# Load Test & Infrastructure Sizing Design

**Date:** 2026-06-07
**Status:** Implemented

## Context

Kioscify is early-stage (one live client: GreatServe) targeting 1–10 stores, max 3 staff per store (~30 users). All services run on a single Digital Ocean droplet: NestJS API, MongoDB replica set, 3 Next.js portals, nginx, Redis, and a backup service. The goal was to choose the right droplet size backed by analysis, write load test scripts for ongoing milestone validation, and define an upgrade playbook.

## Server Recommendation

**DO Basic — 2 vCPU / 4 GB RAM (~$24/month) + DO Backups (~$4.80/month) = ~$29/month**

At the target scale (<100 tx/day per store, 10 stores max, ~30 concurrent users peak), memory is the binding constraint—not CPU. The full service stack needs ~1.4–1.8 GB at idle–moderate load:

| Service | RAM |
|---|---|
| MongoDB (small dataset, single-node replica set) | 512–800 MB |
| NestJS API | 150–200 MB |
| kioscify-store (Next.js SSR) | 150–200 MB |
| kioscify-company (Next.js SSR) | 100–150 MB |
| kioscify-platform (Next.js SSR) | 80–100 MB |
| nginx + Redis + OS | ~380 MB |
| **Total** | **~1.4–1.8 GB** |

A 2 GB droplet is too tight: MongoDB + 3 Next.js SSR processes under concurrent dashboard load + sync bursts can trigger OOM kills. 4 GB gives 2–2.5 GB of real headroom—comfortable for 20+ stores without any action.

**Upgrade path:**
- 2 vCPU / 4 GB (~$24/mo): up to ~20 stores
- 4 vCPU / 8 GB (~$48/mo): up to ~50 stores
- Split MongoDB to DO Managed MongoDB (~$15/mo) + 4 vCPU / 8 GB app droplet: beyond 50 stores

## Pre-flight Database Indexes

Three indexes added to `kioskly-api/prisma/schema.prisma` before load testing. Without these, analytics and report endpoints do full collection scans on the transactions collection.

```prisma
model Transaction   { @@index([tenantId, createdAt]) }
model TransactionItem { @@index([transactionId]) }
model Expense       { @@index([tenantId, createdAt]) }
```

Apply: `npm run prisma:migrate --workspace=kioskly-api`

## Load Test Scripts

Located in `load-tests/`. Require k6 (`brew install k6`). All credentials are passed via environment variables—see `load-tests/README.md`.

| Script | VUs | Duration | Purpose |
|---|---|---|---|
| `scenarios/smoke.js` | 1 | 30s | Golden path — run before every deployment |
| `scenarios/sync-burst.js` | 5 | 2 min | 5 stores simultaneously flushing offline queues |
| `scenarios/dashboard.js` | 3 | 2 min | Concurrent admin dashboard loads (analytics aggregations) |
| `scenarios/milestone.js` | 10 | 5 min | Combined mixed load — the gate test |

Shared thresholds baked into all scripts:
- HTTP error rate < 1%
- p95 response time < 800 ms (API endpoints)
- p95 response time < 2,000 ms (analytics/report aggregation endpoints)
- No 429s on sync endpoints (those bypass the global throttle by design)

## Milestone Gates

Run `milestone.js` before each growth threshold. Save output to `load-tests/results/gate-N.json` and compare p95 against the Gate 0 baseline.

| Gate | Trigger | Response if failing |
|---|---|---|
| Gate 0 | Before onboarding GreatServe | Fix before going live |
| Gate 1 | Before 5th store | Check indexes and memory limits |
| Gate 2 | Before 10th store | Plan droplet upgrade |
| Gate 3 | Before 20th store | Upgrade first, then onboard |

A >20% p95 increase between gates warrants investigation before proceeding.

## Upgrade Triggers

Enable free DO Monitoring alerts:

| Metric | Threshold | Action |
|---|---|---|
| CPU | Sustained >60% during normal hours | Upgrade droplet |
| Free RAM | <600 MB regularly | Upgrade droplet |
| MongoDB query time | >200 ms avg | Add indexes first, then upgrade |
| Disk | >70% full | Add DO Volume ($10/mo, 100 GB) |
