/**
 * Local cache for read data (catalog + history).
 *
 * AsyncStorage key-value store — each entry is JSON: { data, cachedAt }.
 * Returns null if the cache is empty so callers can show appropriate UI.
 *
 * Also exposes getPendingByType() which reads from the SQLite sync_queue
 * so services can merge pending items into their response.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { getDb } from "./db";
import type { SyncQueueItem } from "../services/syncEngine";

const KEYS = {
  products: "@kioscify:cache:products",
  categories: "@kioscify:cache:categories",
  inventoryItems: "@kioscify:cache:inventory_items",
  latestInventory: "@kioscify:cache:latest_inventory",
  transactions: "@kioscify:cache:transactions",
  expenses: "@kioscify:cache:expenses",
};

async function saveCache(key: string, data: unknown[]): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify({ data, cachedAt: Date.now() }));
}

async function readCache<T>(key: string): Promise<T[] | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed.data ?? null;
  } catch {
    return null;
  }
}

// ─── Products ────────────────────────────────────────────────────────────────

export const cacheProducts = (data: unknown[]) => saveCache(KEYS.products, data);
export const getCachedProducts = () => readCache<any>(KEYS.products);

// ─── Categories ──────────────────────────────────────────────────────────────

export const cacheCategories = (data: unknown[]) => saveCache(KEYS.categories, data);
export const getCachedCategories = () => readCache<any>(KEYS.categories);

// ─── Inventory items ─────────────────────────────────────────────────────────

export const cacheInventoryItems = (data: unknown[]) => saveCache(KEYS.inventoryItems, data);
export const getCachedInventoryItems = () => readCache<any>(KEYS.inventoryItems);

// ─── Latest inventory (mobile inventory screen) ───────────────────────────────

export const cacheLatestInventory = (data: unknown[]) => saveCache(KEYS.latestInventory, data);
export const getCachedLatestInventory = () => readCache<any>(KEYS.latestInventory);

// ─── Transactions ─────────────────────────────────────────────────────────────

export const cacheTransactions = (data: unknown[]) => saveCache(KEYS.transactions, data);
export const getCachedTransactions = () => readCache<any>(KEYS.transactions);

// ─── Expenses ────────────────────────────────────────────────────────────────

export const cacheExpenses = (data: unknown[]) => saveCache(KEYS.expenses, data);
export const getCachedExpenses = () => readCache<any>(KEYS.expenses);

// ─── Pending queue items ─────────────────────────────────────────────────────

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

export async function getPendingByType(type: string): Promise<SyncQueueItem[]> {
  try {
    const db = await getDb();
    const rows = await db.getAllAsync<SyncQueueRow>(
      `SELECT * FROM sync_queue WHERE type = ? AND status IN ('pending', 'syncing') ORDER BY created_at ASC`,
      type,
    );
    return rows.map((row) => ({
      clientId: row.client_id,
      type: row.type as SyncQueueItem["type"],
      endpoint: row.endpoint,
      method: row.method as SyncQueueItem["method"],
      payload: JSON.parse(row.payload),
      createdAt: row.created_at,
      syncedAt: row.synced_at ?? undefined,
      serverId: row.server_id ?? undefined,
      retries: row.retries,
      status: row.status as SyncQueueItem["status"],
      errorMessage: row.error_message ?? undefined,
    }));
  } catch {
    return [];
  }
}
