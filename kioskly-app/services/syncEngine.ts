/**
 * Offline Sync Engine
 *
 * Queues write operations locally when offline and syncs them when connectivity
 * is restored. Uses AsyncStorage as the local queue (SQLite alternative that
 * doesn't require native modules).
 *
 * Deduplication: every queued item carries a clientId (UUID). The server returns
 * 409 Conflict when a clientId already exists — the engine marks those as synced.
 *
 * Queue item lifecycle:
 *   pending → syncing → synced | failed (retried up to MAX_RETRIES times)
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const QUEUE_KEY = "@kioscify:sync_queue";
const MAX_RETRIES = 3;

export type SyncItemType = "transaction" | "expense" | "inventory_record" | "submitted_report" | "submitted_inventory_report";

export interface SyncQueueItem {
  clientId: string;
  type: SyncItemType;
  endpoint: string;            // e.g., "/transactions"
  method: "POST";
  payload: Record<string, unknown>;
  createdAt: string;
  syncedAt?: string;
  serverId?: string;           // set after successful sync
  retries: number;
  status: "pending" | "syncing" | "synced" | "failed";
  errorMessage?: string;
}

// ─── Listeners ────────────────────────────────────────────────────────────────

type QueueChangeListener = (pending: number) => void;
const listeners: Set<QueueChangeListener> = new Set();

export function onQueueChange(listener: QueueChangeListener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function notifyListeners(items: SyncQueueItem[]) {
  const pending = items.filter((i) => i.status === "pending" || i.status === "syncing").length;
  listeners.forEach((l) => l(pending));
}

// ─── Queue operations ─────────────────────────────────────────────────────────

async function loadQueue(): Promise<SyncQueueItem[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveQueue(items: SyncQueueItem[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  notifyListeners(items);
}

// Pure JS UUID v4 — no native dependencies required
function uuidv4(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export async function generateClientId(): Promise<string> {
  return uuidv4();
}

export async function enqueue(
  type: SyncItemType,
  endpoint: string,
  payload: Record<string, unknown>,
  clientId?: string,
): Promise<string> {
  const id = clientId ?? (await generateClientId());
  const item: SyncQueueItem = {
    clientId: id,
    type,
    endpoint,
    method: "POST",
    payload: { ...payload, clientId: id },
    createdAt: new Date().toISOString(),
    retries: 0,
    status: "pending",
  };

  const queue = await loadQueue();
  queue.push(item);
  await saveQueue(queue);
  return id;
}

export async function getPendingCount(): Promise<number> {
  const queue = await loadQueue();
  return queue.filter((i) => i.status === "pending" || i.status === "syncing").length;
}

export async function getQueue(): Promise<SyncQueueItem[]> {
  return loadQueue();
}

// ─── Sync ─────────────────────────────────────────────────────────────────────

let isSyncing = false;

export async function syncAll(token: string, apiUrl: string): Promise<{ synced: number; failed: number }> {
  if (isSyncing) return { synced: 0, failed: 0 };
  isSyncing = true;

  let synced = 0;
  let failed = 0;

  try {
    const queue = await loadQueue();
    const pending = queue.filter((i) => i.status === "pending" && i.retries < MAX_RETRIES);

    for (const item of pending) {
      item.status = "syncing";
      await saveQueue(queue);

      try {
        const response = await fetch(`${apiUrl}${item.endpoint}`, {
          method: item.method,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(item.payload),
        });

        if (response.ok) {
          const data = await response.json();
          item.status = "synced";
          item.syncedAt = new Date().toISOString();
          item.serverId = data?.id;
          synced++;
        } else if (response.status === 409) {
          // Already synced — mark as done
          const data = await response.json().catch(() => ({}));
          item.status = "synced";
          item.syncedAt = new Date().toISOString();
          item.serverId = data?.id;
          synced++;
        } else if (response.status === 429 || response.status >= 500) {
          // Rate limited or server error — back to pending for retry
          item.status = "pending";
          item.retries += 1;
          failed++;
        } else {
          // Client error (4xx except 409) — mark as failed, won't retry
          item.status = "failed";
          item.errorMessage = `HTTP ${response.status}`;
          failed++;
        }
      } catch (networkError) {
        // Network error — retry later
        item.status = "pending";
        item.retries += 1;
      }

      await saveQueue(queue);
    }
  } finally {
    isSyncing = false;
  }

  return { synced, failed };
}

// Clean up old synced items (keep last 7 days for reference)
export async function pruneQueue(): Promise<void> {
  const queue = await loadQueue();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const pruned = queue.filter(
    (i) => i.status !== "synced" || (i.syncedAt ?? "") > sevenDaysAgo,
  );
  if (pruned.length < queue.length) {
    await saveQueue(pruned);
  }
}
