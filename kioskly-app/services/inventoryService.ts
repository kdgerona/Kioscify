import { apiPost, apiGet, apiPatch, apiDelete } from "../utils/api";
import { safeReactotron } from "../utils/reactotron";
import { enqueue, generateClientId } from "./syncEngine";
import {
  cacheInventoryItems,
  getCachedInventoryItems,
  cacheLegacyInventoryItems,
  getCachedLegacyInventoryItems,
  cacheInventoryCategories,
  getCachedInventoryCategories,
  cacheLatestInventory,
  getCachedLatestInventory,
} from "../lib/localCache";

// Inventory categories are now defined per-InventorySetup by the brand (see
// kioskly-api InventorySetup/Category) and fetched dynamically — no longer a
// fixed client-side enum.
export interface InventoryCategory {
  id: string;
  name: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  description?: string | null;
  category: InventoryCategory | null;
  minStockLevel?: number | null;
  minStockLevelOverridden: boolean;
  requiresExpirationDate?: boolean;
  expirationWarningDays?: number | null;
  expirationWarningDaysOverridden: boolean;
  isLegacy: boolean;
}

export interface InventoryItemsResponse {
  active: InventoryItem[];
  legacy: InventoryItem[];
}

export interface InventoryRecord {
  id: string;
  inventoryItemId: string;
  inventoryItem: {
    id: string;
    name: string;
    unit: string;
  };
  quantity: number;
  date: string;
  notes?: string;
  userId: string;
  user: {
    id: string;
    username: string;
    email: string;
    role: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface LatestInventoryItem {
  id: string;
  name: string;
  category: string | null;
  unit: string;
  description?: string | null;
  minStockLevel?: number | null;
  requiresExpirationDate?: boolean;
  expirationWarningDays?: number | null;
  isLegacy: boolean;
  latestQuantity: number | null;
  latestRecordDate: string | null;
  previousQuantity: number | null;
}

export interface CreateInventoryRecordPayload {
  inventoryItemId: string;
  quantity: number;
  date?: string;
  notes?: string;
  clientId?: string;
}

export interface BulkCreateInventoryRecordsPayload {
  records: CreateInventoryRecordPayload[];
}

/**
 * Get the dynamic list of inventory categories for the store's current
 * InventorySetup — replaces the old hardcoded InventoryCategory enum.
 */
export const getInventoryCategories = async (): Promise<InventoryCategory[]> => {
  try {
    const response = await apiGet("/categories?type=INVENTORY");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data: InventoryCategory[] = await response.json();
    await cacheInventoryCategories(data);
    return data;
  } catch (err) {
    const cached = await getCachedInventoryCategories();
    if (cached) return cached;
    throw err;
  }
};

/**
 * Get all inventory items for the store's current InventorySetup.
 * @param categoryId - Optional category filter (active items only)
 * @returns active items (in the current setup) and legacy items (has
 * recorded history but no longer in the current setup — preserved, still
 * fully recordable, excluded from low-stock alerts and the active picker)
 */
export const getInventoryItems = async (
  categoryId?: string
): Promise<InventoryItemsResponse> => {
  const params = new URLSearchParams();
  if (categoryId) params.append("categoryId", categoryId);
  const queryString = params.toString();
  const endpoint = `/inventory/items${queryString ? `?${queryString}` : ""}`;

  try {
    const response = await apiGet(endpoint);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data: InventoryItemsResponse = await response.json();
    await cacheInventoryItems(data.active);
    await cacheLegacyInventoryItems(data.legacy);
    return data;
  } catch (err) {
    const [active, legacy] = await Promise.all([
      getCachedInventoryItems(),
      getCachedLegacyInventoryItems(),
    ]);
    if (active) return { active, legacy: legacy ?? [] };
    throw err;
  }
};

/**
 * Get latest inventory counts for all items
 * @param date - Optional date to get inventory for (defaults to today)
 * @returns List of items with their latest inventory counts
 */
export const getLatestInventory = async (
  date?: Date
): Promise<LatestInventoryItem[]> => {
  const params = new URLSearchParams();
  if (date) params.append("date", date.toISOString());
  const queryString = params.toString();
  const endpoint = `/inventory/latest${queryString ? `?${queryString}` : ""}`;

  try {
    const response = await apiGet(endpoint);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data: LatestInventoryItem[] = await response.json();
    await cacheLatestInventory(data);
    return data;
  } catch (err) {
    // Always try the cache on any failure (network down, server error, timeout).
    // Only re-throw if there is genuinely nothing to show.
    const cached = await getCachedLatestInventory();
    if (cached) return cached;
    throw err;
  }
};

/**
 * Create a single inventory record
 * @param recordData - Inventory record data
 * @returns Created inventory record
 */
export const createInventoryRecord = async (
  recordData: CreateInventoryRecordPayload
): Promise<InventoryRecord> => {
  try {
    console.log("🔵 CREATING INVENTORY RECORD:");
    console.log("  Item ID:", recordData.inventoryItemId);
    console.log("  Quantity:", recordData.quantity);

    safeReactotron.display({
      name: "CREATE INVENTORY RECORD",
      value: recordData,
      preview: `Creating inventory record for item ${recordData.inventoryItemId}`,
    });

    const response = await apiPost("/inventory/records", recordData);

    if (!response.ok) {
      const errorText = await response.text();
      console.log("🔴 INVENTORY RECORD ERROR:", errorText);

      safeReactotron.display({
        name: "INVENTORY RECORD ERROR",
        value: { status: response.status, error: errorText },
        preview: "Inventory record creation failed",
        important: true,
      });

      throw new Error(`Failed to create inventory record: ${errorText}`);
    }

    const data = await response.json();
    console.log("🟢 INVENTORY RECORD CREATED:", data.id);

    safeReactotron.display({
      name: "INVENTORY RECORD SUCCESS",
      value: data,
      preview: `Inventory record ${data.id} created successfully`,
    });

    return data;
  } catch (error) {
    console.error("Failed to create inventory record:", error);
    throw error;
  }
};

/**
 * Create multiple inventory records at once (bulk)
 * @param payload - Bulk inventory records payload
 * @returns Created inventory records
 */
export const bulkCreateInventoryRecords = async (
  payload: BulkCreateInventoryRecordsPayload
): Promise<InventoryRecord[]> => {
  // Assign a clientId to each record if not already set
  const recordsWithIds: CreateInventoryRecordPayload[] = await Promise.all(
    payload.records.map(async (r) => ({
      ...r,
      clientId: r.clientId ?? (await generateClientId()),
    })),
  );
  const payloadWithIds: BulkCreateInventoryRecordsPayload = { records: recordsWithIds };

  safeReactotron.display({
    name: "CREATE BULK INVENTORY RECORDS",
    value: payloadWithIds,
    preview: `Creating ${recordsWithIds.length} inventory records`,
  });

  try {
    const response = await apiPost("/inventory/records/bulk", payloadWithIds);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create bulk inventory records: ${errorText}`);
    }
    const data = await response.json();
    return data;
  } catch (err) {
    // Queue on any non-4xx failure so offline submissions aren't lost
    const msg = err instanceof Error ? err.message : "";
    if (msg.startsWith("Failed to create bulk")) throw err; // 4xx — surface to user
    for (const r of recordsWithIds) {
      await enqueue(
        "inventory_record",
        "/inventory/records",
        r as unknown as Record<string, unknown>,
        r.clientId,
      );
    }
    safeReactotron.display({
      name: "BULK INVENTORY QUEUED",
      value: { count: recordsWithIds.length },
      preview: `${recordsWithIds.length} records queued for sync`,
    });
    return [];
  }
};

/**
 * Get all inventory records
 * @param filters - Optional filters (startDate, endDate, inventoryItemId)
 * @returns List of inventory records
 */
export const getInventoryRecords = async (filters?: {
  startDate?: string;
  endDate?: string;
  inventoryItemId?: string;
}): Promise<InventoryRecord[]> => {
  try {
    const params = new URLSearchParams();
    if (filters?.startDate) params.append("startDate", filters.startDate);
    if (filters?.endDate) params.append("endDate", filters.endDate);
    if (filters?.inventoryItemId)
      params.append("inventoryItemId", filters.inventoryItemId);

    const queryString = params.toString();
    const endpoint = `/inventory/records${queryString ? `?${queryString}` : ""}`;

    console.log("🔵 FETCHING INVENTORY RECORDS:", endpoint);

    safeReactotron.display({
      name: "FETCH INVENTORY RECORDS",
      value: { endpoint, filters },
      preview: "Fetching inventory records from API",
    });

    const response = await apiGet(endpoint);

    if (!response.ok) {
      const errorText = await response.text();
      console.log("🔴 FETCH INVENTORY RECORDS ERROR:", errorText);

      safeReactotron.display({
        name: "FETCH INVENTORY RECORDS ERROR",
        value: { status: response.status, error: errorText },
        preview: "Failed to fetch inventory records",
        important: true,
      });

      throw new Error(`Failed to fetch inventory records: ${errorText}`);
    }

    const data = await response.json();
    console.log("🟢 INVENTORY RECORDS FETCHED:", data.length, "records");

    safeReactotron.display({
      name: "INVENTORY RECORDS FETCHED",
      value: { count: data.length },
      preview: `Fetched ${data.length} inventory records`,
    });

    return data;
  } catch (error) {
    console.error("Failed to fetch inventory records:", error);
    throw error;
  }
};
