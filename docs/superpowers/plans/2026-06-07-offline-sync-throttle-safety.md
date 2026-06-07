# Offline Sync: Throttle Safety & Data-Loss Prevention

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guarantee that offline-queued transactions/expenses/inventory records are never lost and always eventually reach the server, even when a burst of sync requests triggers rate-limiting.

**Architecture:** Two-layer fix — (1) skip the global throttle guard on the four authenticated POST endpoints the sync engine targets, since JWT already authenticates callers; (2) fix the sync engine so a 429 response does not consume the retry budget and instead aborts the current sync run to prevent hammering; (3) surface `failedCount` to the user so permanently-stuck items are visible and retryable.

**Tech Stack:** NestJS + `@nestjs/throttler` (API), expo-sqlite + React Native (mobile), TypeScript throughout.

---

## Context

The API applies a global `ThrottlerGuard` (100 req/60 s per client IP, `app.module.ts`). The mobile sync engine calls `POST /transactions`, `POST /expenses`, `POST /inventory/records`, and `POST /inventory/records/bulk` sequentially for every queued item. A cashier who goes offline during a busy shift and later reconnects can easily have 100+ queued transactions — all of which would fire within the first sync run and trip the rate limit.

**Current 429 bug in `syncEngine.ts`:** The 429 branch (`response.status === 429`) increments `retries` and resets the item to `pending`. However, the `SELECT` query that feeds the sync loop uses `WHERE retries < 5`. After 5 consecutive 429s the item is stuck: `status = 'pending'` but `retries = 5` — so it is silently excluded from every future sync run without ever being marked `failed`. The user has no visibility into this stuck state.

---

## Files Changed

| File | Change |
|------|--------|
| `kioskly-api/src/transactions/transactions.controller.ts` | Add `@SkipThrottle()` to `POST /` |
| `kioskly-api/src/expenses/expenses.controller.ts` | Add `@SkipThrottle()` to `POST /` |
| `kioskly-api/src/inventory/inventory.controller.ts` | Add `@SkipThrottle()` to `POST /records` and `POST /records/bulk` |
| `kioskly-app/services/syncEngine.ts` | Fix 429 handling; add `getFailedCount()`, `resetFailedItems()` |
| `kioskly-app/contexts/SyncContext.tsx` | Expose `failedCount`, `retryFailed()` |
| `kioskly-app/components/OfflineBanner.tsx` | Show failed-items alert when online |

---

## Task 1 — API: Skip throttle on sync endpoints

These four endpoints require a valid JWT, so skipping the IP-based throttle guard does not weaken security.

**Files:**
- Modify: `kioskly-api/src/transactions/transactions.controller.ts`
- Modify: `kioskly-api/src/expenses/expenses.controller.ts`
- Modify: `kioskly-api/src/inventory/inventory.controller.ts`

- [ ] **Step 1: Add `SkipThrottle` to the transactions POST endpoint**

  In `kioskly-api/src/transactions/transactions.controller.ts`, add the import and decorator:

  ```typescript
  // Add to existing import from '@nestjs/throttler':
  import { SkipThrottle } from '@nestjs/throttler';
  ```

  Then add `@SkipThrottle()` above `@Post()` on the `create` method (line 37):

  ```typescript
  @SkipThrottle()
  @Post()
  @ApiOperation({ summary: 'Create a new transaction' })
  @ApiResponse({ status: 201, description: 'Transaction created successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  create(@Body() createTransactionDto: CreateTransactionDto, @Request() req) {
    return this.transactionsService.create(
      createTransactionDto,
      req.user.id,
      req.user.tenantId,
    );
  }
  ```

- [ ] **Step 2: Add `SkipThrottle` to the expenses POST endpoint**

  In `kioskly-api/src/expenses/expenses.controller.ts`, add the import and decorator:

  ```typescript
  import { SkipThrottle } from '@nestjs/throttler';
  ```

  Add `@SkipThrottle()` above `@Post()` on the `create` method (line 38):

  ```typescript
  @SkipThrottle()
  @Post()
  @ApiOperation({ summary: 'Create a new expense' })
  @ApiResponse({ status: 201, description: 'Expense created successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  create(@Body() createExpenseDto: CreateExpenseDto, @Request() req) {
    return this.expensesService.create(
      createExpenseDto,
      req.user.id,
      req.user.tenantId,
    );
  }
  ```

- [ ] **Step 3: Add `SkipThrottle` to both inventory records POST endpoints**

  In `kioskly-api/src/inventory/inventory.controller.ts`, add the import:

  ```typescript
  import { SkipThrottle } from '@nestjs/throttler';
  ```

  Add `@SkipThrottle()` to `POST /records` (line 162) and `POST /records/bulk` (line 181):

  ```typescript
  @SkipThrottle()
  @Post('records')
  @ApiOperation({ summary: 'Record a single inventory count' })
  // ... rest unchanged

  @SkipThrottle()
  @Post('records/bulk')
  @ApiOperation({ summary: 'Record multiple inventory counts at once' })
  // ... rest unchanged
  ```

- [ ] **Step 4: Verify the API compiles and tests pass**

  Run from repo root:
  ```bash
  npm run test --workspace=kioskly-api
  ```
  Expected: all tests pass, no TypeScript errors.

- [ ] **Step 5: Commit**

  ```bash
  git add kioskly-api/src/transactions/transactions.controller.ts \
          kioskly-api/src/expenses/expenses.controller.ts \
          kioskly-api/src/inventory/inventory.controller.ts
  git commit -m "feat(api): skip throttle on authenticated sync endpoints"
  ```

---

## Task 2 — Mobile: Fix 429 handling in sync engine

**Problem:** 429 currently increments `retries`, so items become silently zombie-stuck in `pending` with `retries >= MAX_RETRIES`. The correct behaviour: 429 means "slow down now" — it should not consume the retry budget and should halt the current sync run immediately.

**Files:**
- Modify: `kioskly-app/services/syncEngine.ts`

- [ ] **Step 1: Fix the 429 branch — do not increment retries, abort run**

  Replace the current `429 || >= 500` branch (lines 277–285) and the network-error catch block (lines 303–310) with the following. Also add a `rateLimited` flag at the top of the sync loop so subsequent items are skipped after a 429:

  The complete new `syncAll` function body (replace from `try {` through `return { synced, failed };`):

  ```typescript
  export async function syncAll(
    token: string,
    apiUrl: string,
  ): Promise<{ synced: number; failed: number }> {
    if (isSyncing) return { synced: 0, failed: 0 };
    isSyncing = true;

    let synced = 0;
    let failed = 0;

    try {
      const db = await getDb();

      // Reset items that failed with HTTP 400 — previously caused by display-only
      // fields; sync loop now strips them, so giving a clean retry.
      await db.runAsync(
        `UPDATE sync_queue SET status = 'pending', retries = 0, error_message = NULL
         WHERE status = 'failed' AND error_message = 'HTTP 400'`,
      );

      // Reset other failed items that haven't hit the retry ceiling.
      await db.runAsync(
        `UPDATE sync_queue SET status = 'pending', error_message = NULL
         WHERE status = 'failed' AND retries < ? AND error_message != 'HTTP 400'`,
        MAX_RETRIES,
      );

      // Also recover items stuck in pending-zombie state (retries >= MAX_RETRIES
      // but status never flipped to failed — legacy 429 accumulation).
      await db.runAsync(
        `UPDATE sync_queue SET status = 'failed', error_message = 'retry limit exceeded'
         WHERE status = 'pending' AND retries >= ?`,
        MAX_RETRIES,
      );

      const rows = await db.getAllAsync<SyncQueueRow>(
        `SELECT * FROM sync_queue WHERE status = 'pending' AND retries < ? ORDER BY created_at ASC`,
        MAX_RETRIES,
      );

      let rateLimited = false;

      for (const row of rows) {
        // If this sync run was rate-limited, skip remaining items — they stay
        // pending and will retry on the next sync trigger.
        if (rateLimited) break;

        await db.runAsync(
          `UPDATE sync_queue SET status = 'syncing' WHERE client_id = ?`,
          row.client_id,
        );
        await notifyListeners();

        try {
          let body = row.method !== "DELETE" ? row.payload : undefined;

          if (row.type === "transaction" && body) {
            const parsed = JSON.parse(body) as Record<string, unknown>;
            if (Array.isArray(parsed.items)) {
              parsed.items = (parsed.items as any[]).map(
                ({ productName: _pn, sizeName: _sn, ...item }: any) => ({
                  ...item,
                  addons: Array.isArray(item.addons)
                    ? item.addons.map(({ addonName: _an, ...addon }: any) => addon)
                    : item.addons,
                }),
              );
              body = JSON.stringify(parsed);
            }
          }

          if (row.type === "submitted_report" && body) {
            const parsed = JSON.parse(body) as Record<string, unknown>;
            let dirty = false;
            if (Array.isArray(parsed.pendingTransactionClientIds) && parsed.pendingTransactionClientIds.length) {
              const resolved = await resolveClientIdsToServerIds(parsed.pendingTransactionClientIds as string[]);
              parsed.transactionIds = [...((parsed.transactionIds as string[]) ?? []), ...resolved];
              delete parsed.pendingTransactionClientIds;
              dirty = true;
            }
            if (Array.isArray(parsed.pendingExpenseClientIds) && parsed.pendingExpenseClientIds.length) {
              const resolved = await resolveClientIdsToServerIds(parsed.pendingExpenseClientIds as string[]);
              parsed.expenseIds = [...((parsed.expenseIds as string[]) ?? []), ...resolved];
              delete parsed.pendingExpenseClientIds;
              dirty = true;
            }
            if (dirty) body = JSON.stringify(parsed);
          }

          const response = await fetch(`${apiUrl}${row.endpoint}`, {
            method: row.method,
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body,
          });

          if (response.ok) {
            const data = await response.json().catch(() => ({}));
            await db.runAsync(
              `UPDATE sync_queue
               SET status = 'synced', synced_at = ?, server_id = ?
               WHERE client_id = ?`,
              new Date().toISOString(),
              (data as any)?.id ?? null,
              row.client_id,
            );
            synced++;
          } else if (response.status === 409) {
            const data = await response.json().catch(() => ({}));
            await db.runAsync(
              `UPDATE sync_queue
               SET status = 'synced', synced_at = ?, server_id = ?
               WHERE client_id = ?`,
              new Date().toISOString(),
              (data as any)?.id ?? null,
              row.client_id,
            );
            synced++;
          } else if (response.status === 429) {
            // Rate limited — reset to pending WITHOUT consuming retry budget.
            // Abort the rest of this sync run; next trigger will retry.
            await db.runAsync(
              `UPDATE sync_queue
               SET status = 'pending', error_message = 'HTTP 429'
               WHERE client_id = ?`,
              row.client_id,
            );
            rateLimited = true;
            failed++;
          } else if (response.status >= 500) {
            // Transient server error — reset to pending, increment retries.
            await db.runAsync(
              `UPDATE sync_queue
               SET status = 'pending', retries = retries + 1, error_message = ?
               WHERE client_id = ?`,
              `HTTP ${response.status}`,
              row.client_id,
            );
            failed++;
          } else {
            // 4xx (non-409, non-429) — logic/validation error. Retry up to
            // MAX_RETRIES, then permanently fail so user can see it.
            const newRetries = row.retries + 1;
            await db.runAsync(
              `UPDATE sync_queue
               SET status = ?, retries = ?, error_message = ?
               WHERE client_id = ?`,
              newRetries >= MAX_RETRIES ? "failed" : "pending",
              newRetries,
              `HTTP ${response.status}`,
              row.client_id,
            );
            failed++;
          }
        } catch {
          // Network error — reset to pending, increment retries.
          await db.runAsync(
            `UPDATE sync_queue
             SET status = 'pending', retries = retries + 1
             WHERE client_id = ?`,
            row.client_id,
          );
          failed++;
        }

        await notifyListeners();
      }
    } finally {
      isSyncing = false;
    }

    return { synced, failed };
  }
  ```

- [ ] **Step 2: Add `getFailedCount()` and `resetFailedItems()` exports**

  Append to `kioskly-app/services/syncEngine.ts` after `pruneQueue`:

  ```typescript
  export async function getFailedCount(): Promise<number> {
    const db = await getDb();
    const row = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM sync_queue WHERE status = 'failed'`,
    );
    return row?.count ?? 0;
  }

  export async function resetFailedItems(): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      `UPDATE sync_queue SET status = 'pending', retries = 0, error_message = NULL
       WHERE status = 'failed'`,
    );
    await notifyListeners();
  }
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add kioskly-app/services/syncEngine.ts
  git commit -m "fix(mobile): fix 429 retry budget leak and add failed-item helpers in sync engine"
  ```

---

## Task 3 — Mobile: Surface failed sync items to user

**Files:**
- Modify: `kioskly-app/contexts/SyncContext.tsx`
- Modify: `kioskly-app/components/OfflineBanner.tsx`

- [ ] **Step 1: Expose `failedCount` and `retryFailed` in SyncContext**

  Replace the entire `kioskly-app/contexts/SyncContext.tsx` with:

  ```typescript
  import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
  import { AppState, AppStateStatus } from "react-native";
  import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
  import { useAuth } from "./AuthContext";
  import {
    syncAll,
    getPendingCount,
    getFailedCount,
    resetFailedItems,
    pruneQueue,
    onQueueChange,
  } from "../services/syncEngine";

  interface SyncContextType {
    pendingCount: number;
    failedCount: number;
    isOnline: boolean;
    isSyncing: boolean;
    triggerSync: () => Promise<void>;
    retryFailed: () => Promise<void>;
  }

  const SyncContext = createContext<SyncContextType | undefined>(undefined);

  export const SyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { token } = useAuth();
    const [pendingCount, setPendingCount] = useState(0);
    const [failedCount, setFailedCount] = useState(0);
    const [isOnline, setIsOnline] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const appState = useRef(AppState.currentState);
    const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? "";

    const refreshCounts = useCallback(async () => {
      const [pending, failed] = await Promise.all([getPendingCount(), getFailedCount()]);
      setPendingCount(pending);
      setFailedCount(failed);
    }, []);

    useEffect(() => {
      refreshCounts();
      return onQueueChange(() => refreshCounts());
    }, [refreshCounts]);

    const syncPromiseRef = useRef<Promise<void> | null>(null);

    const triggerSync = useCallback(async (): Promise<void> => {
      if (!token) return;
      if (syncPromiseRef.current) return syncPromiseRef.current;
      const promise = (async () => {
        setIsSyncing(true);
        try {
          await syncAll(token, apiUrl);
          await pruneQueue();
          await refreshCounts();
        } finally {
          setIsSyncing(false);
          syncPromiseRef.current = null;
        }
      })();
      syncPromiseRef.current = promise;
      return promise;
    }, [token, apiUrl, refreshCounts]);

    const retryFailed = useCallback(async (): Promise<void> => {
      await resetFailedItems();
      await triggerSync();
    }, [triggerSync]);

    useEffect(() => {
      const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
        const connected = !!state.isConnected && state.isInternetReachable !== false;
        setIsOnline(connected);
        if (connected && token) {
          triggerSync();
        }
      });
      return unsubscribe;
    }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
      const sub = AppState.addEventListener("change", async (next: AppStateStatus) => {
        if (appState.current.match(/inactive|background/) && next === "active") {
          await triggerSync();
        }
        appState.current = next;
      });
      return () => sub.remove();
    }, [triggerSync]);

    useEffect(() => {
      if (token) triggerSync();
    }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
      <SyncContext.Provider value={{ pendingCount, failedCount, isOnline, isSyncing, triggerSync, retryFailed }}>
        {children}
      </SyncContext.Provider>
    );
  };

  export const useSync = (): SyncContextType => {
    const context = useContext(SyncContext);
    if (!context) throw new Error("useSync must be used within a SyncProvider");
    return context;
  };
  ```

- [ ] **Step 2: Update OfflineBanner to show failed-sync alert when online**

  Replace `kioskly-app/components/OfflineBanner.tsx` with:

  ```typescript
  import React from "react";
  import { View, Text, TouchableOpacity } from "react-native";
  import { Ionicons } from "@expo/vector-icons";
  import { useSafeAreaInsets } from "react-native-safe-area-context";
  import { useSync } from "../contexts/SyncContext";

  export default function OfflineBanner() {
    const { isOnline, pendingCount, failedCount, retryFailed } = useSync();
    const insets = useSafeAreaInsets();

    // Show offline banner
    if (!isOnline) {
      return (
        <View
          style={{ paddingTop: insets.top, backgroundColor: "#1f2937" }}
          className="px-4 pb-2 flex-row items-center justify-center gap-2"
        >
          <Ionicons name="cloud-offline-outline" size={14} color="#f9fafb" />
          <Text className="text-gray-100 text-xs font-medium">
            {pendingCount > 0
              ? `Offline — ${pendingCount} pending ${pendingCount === 1 ? "change" : "changes"}`
              : "Offline mode"}
          </Text>
        </View>
      );
    }

    // Show failed-sync alert when online but items are permanently stuck
    if (failedCount > 0) {
      return (
        <View
          style={{ paddingTop: insets.top, backgroundColor: "#7f1d1d" }}
          className="px-4 pb-2 flex-row items-center justify-between gap-2"
        >
          <View className="flex-row items-center gap-2">
            <Ionicons name="warning-outline" size={14} color="#fca5a5" />
            <Text className="text-red-200 text-xs font-medium">
              {failedCount} {failedCount === 1 ? "record" : "records"} failed to sync
            </Text>
          </View>
          <TouchableOpacity onPress={retryFailed} className="px-2 py-1">
            <Text className="text-red-200 text-xs font-semibold underline">Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return null;
  }
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add kioskly-app/contexts/SyncContext.tsx \
          kioskly-app/components/OfflineBanner.tsx
  git commit -m "feat(mobile): surface failed sync items with retry banner in OfflineBanner"
  ```

---

## Verification

1. **API throttle bypass** — start the API (`npm run api:dev`), use a tool like `curl` or Postman with a valid JWT to fire 110 POST requests to `/api/v1/transactions` in quick succession. Confirm all return 201/409 and none return 429.

2. **429 does not consume retries** — in `syncEngine.ts`, temporarily stub `fetch` to always return 429. Run `syncAll`. Confirm: after the run, the item has `status = 'pending'` and `retries = 0` (unchanged), and only one request was fired (not all queued items).

3. **Failed items appear in banner** — manually `INSERT INTO sync_queue (..., status='failed')` via SQLite tooling, restart the app while online. Confirm the red "failed to sync" banner appears. Tap "Retry", confirm banner disappears and a sync run fires.

4. **Online + no issues = no banner** — with zero pending and zero failed items while online, confirm `OfflineBanner` renders nothing.

5. **Data not lost on 5xx** — stub `fetch` to return 500. Run `syncAll`. Confirm item stays `pending` with `retries = 1`, not `synced`.

6. **Run full test suite**

   ```bash
   npm run test --workspace=kioskly-api
   ```
