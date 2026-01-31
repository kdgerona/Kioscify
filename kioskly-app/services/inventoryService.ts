import { apiPost, apiGet, apiPatch, apiDelete } from "../utils/api";
import { safeReactotron } from "../utils/reactotron";

export enum InventoryCategory {
  MAINS = "MAINS",
  FLAVORED_JAMS = "FLAVORED_JAMS",
  ADD_ONS = "ADD_ONS",
  SYRUPS = "SYRUPS",
  HOT = "HOT",
  PACKAGING = "PACKAGING",
}

export interface InventoryItem {
  id: string;
  tenantId: string;
  name: string;
  category: InventoryCategory;
  unit: string;
  description?: string;
  minStockLevel?: number;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryRecord {
  id: string;
  inventoryItemId: string;
  inventoryItem: {
    id: string;
    name: string;
    category: InventoryCategory;
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
  category: InventoryCategory;
  unit: string;
  description?: string;
  minStockLevel?: number;
  requiresExpirationDate?: boolean;
  expirationWarningDays?: number;
  latestQuantity: number | null;
  latestRecordDate: string | null;
  previousQuantity: number | null;
}

export interface CreateInventoryRecordPayload {
  inventoryItemId: string;
  quantity: number;
  date?: string;
  notes?: string;
}

export interface BulkCreateInventoryRecordsPayload {
  records: CreateInventoryRecordPayload[];
}

/**
 * Get all inventory items
 * @param category - Optional category filter
 * @returns List of inventory items
 */
export const getInventoryItems = async (
  category?: InventoryCategory
): Promise<InventoryItem[]> => {
  try {
    const params = new URLSearchParams();
    if (category) params.append("category", category);

    const queryString = params.toString();
    const endpoint = `/inventory/items${queryString ? `?${queryString}` : ""}`;

    console.log("🔵 FETCHING INVENTORY ITEMS:", endpoint);

    safeReactotron.display({
      name: "FETCH INVENTORY ITEMS",
      value: { endpoint, category },
      preview: "Fetching inventory items from API",
    });

    const response = await apiGet(endpoint);

    if (!response.ok) {
      const errorText = await response.text();
      console.log("🔴 FETCH INVENTORY ITEMS ERROR:", errorText);

      safeReactotron.display({
        name: "FETCH INVENTORY ITEMS ERROR",
        value: { status: response.status, error: errorText },
        preview: "Failed to fetch inventory items",
        important: true,
      });

      throw new Error(`Failed to fetch inventory items: ${errorText}`);
    }

    const data = await response.json();
    console.log("🟢 INVENTORY ITEMS FETCHED:", data.length, "items");

    safeReactotron.display({
      name: "INVENTORY ITEMS FETCHED",
      value: { count: data.length },
      preview: `Fetched ${data.length} inventory items`,
    });

    return data;
  } catch (error) {
    console.error("Failed to fetch inventory items:", error);
    throw error;
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
  try {
    const params = new URLSearchParams();
    if (date) params.append("date", date.toISOString());

    const queryString = params.toString();
    const endpoint = `/inventory/latest${queryString ? `?${queryString}` : ""}`;

    console.log("🔵 FETCHING LATEST INVENTORY:", endpoint);

    safeReactotron.display({
      name: "FETCH LATEST INVENTORY",
      value: { endpoint, date },
      preview: "Fetching latest inventory from API",
    });

    const response = await apiGet(endpoint);

    if (!response.ok) {
      const errorText = await response.text();
      console.log("🔴 FETCH LATEST INVENTORY ERROR:", errorText);

      safeReactotron.display({
        name: "FETCH LATEST INVENTORY ERROR",
        value: { status: response.status, error: errorText },
        preview: "Failed to fetch latest inventory",
        important: true,
      });

      throw new Error(`Failed to fetch latest inventory: ${errorText}`);
    }

    const data = await response.json();
    console.log("🟢 LATEST INVENTORY FETCHED:", data.length, "items");

    safeReactotron.display({
      name: "LATEST INVENTORY FETCHED",
      value: { count: data.length },
      preview: `Fetched ${data.length} inventory items`,
    });

    return data;
  } catch (error) {
    console.error("Failed to fetch latest inventory:", error);
    throw error;
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
  try {
    console.log("🔵 CREATING BULK INVENTORY RECORDS:");
    console.log("  Count:", payload.records.length);

    safeReactotron.display({
      name: "CREATE BULK INVENTORY RECORDS",
      value: payload,
      preview: `Creating ${payload.records.length} inventory records`,
    });

    const response = await apiPost("/inventory/records/bulk", payload);

    if (!response.ok) {
      const errorText = await response.text();
      console.log("🔴 BULK INVENTORY RECORDS ERROR:", errorText);

      safeReactotron.display({
        name: "BULK INVENTORY RECORDS ERROR",
        value: { status: response.status, error: errorText },
        preview: "Bulk inventory records creation failed",
        important: true,
      });

      throw new Error(`Failed to create bulk inventory records: ${errorText}`);
    }

    const data = await response.json();
    console.log("🟢 BULK INVENTORY RECORDS CREATED:", data.length, "records");

    safeReactotron.display({
      name: "BULK INVENTORY RECORDS SUCCESS",
      value: { count: data.length },
      preview: `${data.length} inventory records created successfully`,
    });

    return data;
  } catch (error) {
    console.error("Failed to create bulk inventory records:", error);
    throw error;
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
