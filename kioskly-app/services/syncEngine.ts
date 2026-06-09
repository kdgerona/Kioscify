/**
 * Offline Sync Engine
 *
 * Queues write operations in SQLite when offline and syncs them when connectivity
 * is restored. SQLite provides ACID guarantees — no data loss from crashes or
 * extended offline periods.
 *
 * Deduplication: every queued item carries a clientId (UUID). The server returns
 * 409 Conflict when a clientId already exists — the engine marks those as synced.
 *
 * Queue item lifecycle:
 *   pending → syncing → synced | failed (retried up to MAX_RETRIES times)
 */

import { getDb } from "../lib/db";

const MAX_RETRIES = 5;

export type SyncItemType =
  | "transaction"
  | "expense"
  | "inventory_record"
  | "submitted_report"
  | "submitted_inventory_report";

export interface SyncQueueItem {
  clientId: string;
  type: SyncItemType;
  endpoint: string;
  method: "POST" | "PATCH" | "DELETE";
  payload: Record<string, unknown>;
  createdAt: string;
  syncedAt?: string;
  serverId?: string;
  retries: number;
  status: "pending" | "syncing" | "synced" | "failed";
  errorMessage?: string;
}

// ─── Row ↔ SyncQueueItem mapping ─────────────────────────────────────────────

interface SyncQueueRow {
  client_id: string;
  type: string;
  endpoint: string;
  method: string;
  payload: string;
  created_at: string;
  synced_at: string | null;
  server_id: string | null;
  retries: number;
  status: string;
  error_message: string | null;
}

function rowToItem(row: SyncQueueRow): SyncQueueItem {
  return {
    clientId: row.client_id,
    type: row.type as SyncItemType,
    endpoint: row.endpoint,
    method: row.method as SyncQueueItem["method"],
    payload: JSON.parse(row.payload),
    createdAt: row.created_at,
    syncedAt: row.synced_at ?? undefined,
    serverId: row.server_id ?? undefined,
    retries: row.retries,
    status: row.status as SyncQueueItem["status"],
    errorMessage: row.error_message ?? undefined,
  };
}

// ─── Listeners ────────────────────────────────────────────────────────────────

type QueueChangeListener = (pending: number) => void;
const listeners: Set<QueueChangeListener> = new Set();

export function onQueueChange(listener: QueueChangeListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function notifyListeners(): Promise<void> {
  const count = await getPendingCount();
  listeners.forEach((l) => l(count));
}

// ─── UUID ────────────────────────────────────────────────────────────────────

function uuidv4(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export async function generateClientId(): Promise<string> {
  return uuidv4();
}

// ─── Queue operations ─────────────────────────────────────────────────────────

export async function enqueue(
  type: SyncItemType,
  endpoint: string,
  payload: Record<string, unknown>,
  clientId?: string,
): Promise<string> {
  const id = clientId ?? uuidv4();
  const db = await getDb();
  await db.runAsync(
    `INSERT OR IGNORE INTO sync_queue
       (client_id, type, endpoint, method, payload, created_at, retries, status)
     VALUES (?, ?, ?, 'POST', ?, ?, 0, 'pending')`,
    id,
    type,
    endpoint,
    JSON.stringify({ ...payload, clientId: id }),
    new Date().toISOString(),
  );
  await notifyListeners();
  return id;
}

export async function getPendingCount(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM sync_queue WHERE status IN ('pending', 'syncing')`,
  );
  return row?.count ?? 0;
}

export async function getQueue(): Promise<SyncQueueItem[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<SyncQueueRow>(`SELECT * FROM sync_queue ORDER BY created_at ASC`);
  return rows.map(rowToItem);
}

// ─── ClientId resolution ─────────────────────────────────────────────────────

// Looks up server IDs for a list of clientIds from the sync_queue.
// Used when syncing submitted_report items that were queued while transactions
// were still pending — by the time the report syncs, those transactions should
// have synced and have a server_id stored in the queue.
async function resolveClientIdsToServerIds(clientIds: string[]): Promise<string[]> {
  if (!clientIds.length) return [];
  const db = await getDb();
  const placeholders = clientIds.map(() => "?").join(",");
  const rows = await db.getAllAsync<{ server_id: string }>(
    `SELECT server_id FROM sync_queue WHERE client_id IN (${placeholders}) AND server_id IS NOT NULL`,
    clientIds,
  );
  return rows.map((r) => r.server_id).filter(Boolean);
}

// ─── Sync ─────────────────────────────────────────────────────────────────────

let isSyncing = false;

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

    // Recover items left in 'syncing' by a previous interrupted run (crash / OS kill).
    // Starting a new syncAll() means the prior run has ended, so these can safely retry.
    await db.runAsync(
      `UPDATE sync_queue SET status = 'pending', error_message = 'recovered after interrupted sync'
       WHERE status = 'syncing'`,
    );

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

    // Recover items stuck in pending-zombie state (retries >= MAX_RETRIES but
    // status never flipped to failed — legacy 429 accumulation).
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
              ({ productName: _pn, sizeName: _sn, preferenceName: _pfn, ...item }: any) => ({
                ...item,
                addons: Array.isArray(item.addons)
                  ? item.addons.map(({ addonName: _an, ...addon }: any) => addon)
                  : item.addons,
              }),
            );
            body = JSON.stringify(parsed);
          }
        }

        // For submitted reports queued offline, resolve any pending transaction/
        // expense clientIds to their real server IDs. Transactions are ordered
        // before the report in the queue, so they should be synced by now.
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
          // This is a healthy item, not a failure, so we don't increment failed.
          await db.runAsync(
            `UPDATE sync_queue
             SET status = 'pending', error_message = 'HTTP 429'
             WHERE client_id = ?`,
            row.client_id,
          );
          rateLimited = true;
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

export async function pruneQueue(): Promise<void> {
  const db = await getDb();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  await db.runAsync(
    `DELETE FROM sync_queue WHERE status = 'synced' AND synced_at < ?`,
    sevenDaysAgo,
  );
}

export async function getFailedCount(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM sync_queue WHERE status = 'failed'`,
  );
  return row?.count ?? 0;
}

export async function resetFailedItems(): Promise<void> {
  const db = await getDb();
  // HTTP 400 items get a clean slate (display-field stripping fixed these)
  await db.runAsync(
    `UPDATE sync_queue SET status = 'pending', retries = 0, error_message = NULL
     WHERE status = 'failed' AND error_message = 'HTTP 400'`,
  );
  // Other failed items below the ceiling reset normally
  await db.runAsync(
    `UPDATE sync_queue SET status = 'pending', error_message = NULL
     WHERE status = 'failed' AND retries < ? AND error_message != 'HTTP 400'`,
    MAX_RETRIES,
  );
  // Non-400 items at the ceiling get a clean slate too — user explicitly requested retry
  await db.runAsync(
    `UPDATE sync_queue SET status = 'pending', retries = 0, error_message = NULL
     WHERE status = 'failed' AND retries >= ? AND error_message != 'HTTP 400'`,
    MAX_RETRIES,
  );
  await notifyListeners();
}
