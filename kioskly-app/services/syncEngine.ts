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

    // Reset previously-failed items that haven't hit the retry ceiling so they
    // get another chance (e.g., items that failed due to a server-side bug that
    // has since been fixed).
    await db.runAsync(
      `UPDATE sync_queue SET status = 'pending', error_message = NULL
       WHERE status = 'failed' AND retries < ?`,
      MAX_RETRIES,
    );

    const rows = await db.getAllAsync<SyncQueueRow>(
      `SELECT * FROM sync_queue WHERE status = 'pending' AND retries < ? ORDER BY created_at ASC`,
      MAX_RETRIES,
    );

    for (const row of rows) {
      // Mark as syncing
      await db.runAsync(
        `UPDATE sync_queue SET status = 'syncing' WHERE client_id = ?`,
        row.client_id,
      );
      await notifyListeners();

      try {
        const response = await fetch(`${apiUrl}${row.endpoint}`, {
          method: row.method,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: row.method !== "DELETE" ? row.payload : undefined,
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
          // Already synced on server — mark done
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
        } else if (response.status === 429 || response.status >= 500) {
          // Retriable error — back to pending
          await db.runAsync(
            `UPDATE sync_queue
             SET status = 'pending', retries = retries + 1, error_message = ?
             WHERE client_id = ?`,
            `HTTP ${response.status}`,
            row.client_id,
          );
          failed++;
        } else {
          // Other 4xx — retry up to MAX_RETRIES, then permanently fail.
          // Treating as retriable handles server-side bugs that may be fixed
          // before the next sync attempt (e.g., missing DTO field).
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
        // Network error — retry later with backoff via retries counter
        await db.runAsync(
          `UPDATE sync_queue
           SET status = 'pending', retries = retries + 1
           WHERE client_id = ?`,
          row.client_id,
        );
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
