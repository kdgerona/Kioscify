# Dashboard Timezone Date Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the dashboard's `getAnalytics` calls to send explicit local-time date boundaries instead of relying on the server-side timezone fallback.

**Architecture:** The analytics page already does this correctly — `computeDateRange()` builds local midnight-to-midnight ISO strings and passes them as `startDate`/`endDate`. The dashboard currently omits these params, causing the API to fall back to its own server timezone (UTC), which drifts by up to 8 hours from the user's local time (Philippines = UTC+8). The fix mirrors the analytics page pattern directly in `dashboard/page.tsx`.

**Tech Stack:** Next.js 15, TypeScript, Axios (`lib/api.ts`)

---

## Audit Results (no code changes required for these)

| Page | Date Filter | Status |
|---|---|---|
| `analytics/page.tsx` — preset buttons | `computeDateRange()` → local midnight ISO | ✓ Correct |
| `analytics/page.tsx` — custom range | `dayStart(new Date(str + "T00:00:00"))` → local midnight ISO | ✓ Correct |
| `transactions/page.tsx` | `setHours(0,0,0,0)` → `.toISOString()` | ✓ Correct |
| `expenses/page.tsx` | `setHours(0,0,0,0)` → `.toISOString()` | ✓ Correct |
| `sales-reports/page.tsx` — filter | `setHours(0,0,0,0)` → `.toISOString()` | ✓ Correct |
| `sales-reports/page.tsx` — Period Covered | Was `toLocaleString()` on UTC string | ✓ Already fixed |
| **`dashboard/page.tsx`** | **No dates sent → server UTC fallback** | ❌ **Bug — fix below** |

---

## Root Cause

`dashboard/page.tsx:74-77`:
```typescript
const [monthlyData, dailyData] = await Promise.all([
  api.getAnalytics({ period: "monthly" }),  // no dates → server computes in UTC
  api.getAnalytics({ period: "daily" }),    // no dates → server computes in UTC
]);
```

`reports.service.ts:20-21`:
```typescript
if (startDate && endDate) {
  return { start: new Date(startDate), end: new Date(endDate) }; // trusts client
}
// Falls through to server-local Date arithmetic ← hit by dashboard
```

The response `period.start`/`period.end` (server UTC) is then reused by `loadTodayTransactions`, `loadTodayExpenses`, `loadTransactions`, `loadExpenses` to filter modals — same wrong window.

---

## Task 1: Fix Dashboard Date Boundaries

**File:** `kioskly-admin/app/(main)/dashboard/page.tsx`

- [ ] **Step 1: Add local date boundary helpers before `loadDashboardData`**

In `dashboard/page.tsx`, add these two helpers right before `loadDashboardData` (currently at line 72). They are identical to those in `analytics/page.tsx:91-94`:

```typescript
const dayStart = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
const dayEnd = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
```

- [ ] **Step 2: Compute and pass explicit date boundaries in `loadDashboardData`**

Replace the current `loadDashboardData` body (lines 72-85) with:

```typescript
const loadDashboardData = async () => {
  try {
    const now = new Date();

    const todayStart = dayStart(now).toISOString();
    const todayEnd = dayEnd(now).toISOString();

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthStartISO = dayStart(monthStart).toISOString();
    const monthEndISO = dayEnd(now).toISOString();

    const [monthlyData, dailyData] = await Promise.all([
      api.getAnalytics({ period: "monthly", startDate: monthStartISO, endDate: monthEndISO }),
      api.getAnalytics({ period: "daily", startDate: todayStart, endDate: todayEnd }),
    ]);
    setAnalytics(monthlyData);
    setDailyAnalytics(dailyData);
  } catch (error) {
    console.error("Failed to load dashboard data:", error);
  } finally {
    setLoading(false);
  }
};
```

- [ ] **Step 3: Verify the full file reads correctly**

Run: `npx tsc --noEmit --project kioskly-admin/tsconfig.json`
Expected: no new type errors

- [ ] **Step 4: Manual smoke test**

Start the store portal: `npm run store:dev` from repo root.
Navigate to the Dashboard. Open browser DevTools → Network tab.
Confirm the two `GET /reports/analytics` requests now include `startDate` and `endDate` query params matching the browser's local midnight and end-of-day times.
Click "View Transactions" and "View Expenses" on the dashboard — verify the modals show today's data.

---

## Verification

End-to-end check:
1. Open Dashboard → inspect network requests for `getAnalytics` — should see `startDate` and `endDate` params
2. The `period.start` in the response should now match the browser's local midnight converted to UTC (e.g. `2026-06-12T16:00:00.000Z` for a Philippines UTC+8 browser viewing June 13)
3. Transactions/expenses modals on the dashboard should show the same data as the Analytics page "Today" filter
