import { apiPost, apiGet } from "../utils/api";
import { safeReactotron } from "../utils/reactotron";
import { InventoryCategory } from "./inventoryService";

export interface InventoryItemSnapshot {
  inventoryItemId: string;
  itemName: string;
  category: string;
  unit: string;
  quantity: number;
  minStockLevel?: number;
  recordDate: string;
}

export interface InventorySnapshot {
  items: InventoryItemSnapshot[];
  totalItems: number;
  submittedBy: string;
}

export interface CreateSubmittedInventoryReportPayload {
  reportDate: string; // YYYY-MM-DD
  inventorySnapshot: InventorySnapshot;
  notes?: string;
  replaceExisting?: boolean;
}

export interface SubmittedInventoryReport {
  id: string;
  tenantId: string;
  userId: string;
  reportDate: string;
  submittedAt: string;
  inventorySnapshot: InventorySnapshot;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    username: string;
    email: string;
    role: string;
  };
}

export enum ViewMode {
  DAY_OVER_DAY = "day_over_day",
  WEEKLY_TREND = "weekly_trend",
}

export interface DailyDataPoint {
  date: string;
  quantity: number;
  change: number;
  percentChange: number;
  consumption: number;
}

export interface ProgressionItem {
  inventoryItemId: string;
  itemName: string;
  category: string;
  unit: string;
  dailyData: DailyDataPoint[];
  totalConsumption: number;
  avgDailyConsumption: number;
}

export interface InventoryProgression {
  viewMode: ViewMode;
  period: {
    start: string;
    end: string;
  };
  items: ProgressionItem[];
}

export interface InventoryAlert {
  type: "LOW_STOCK" | "USAGE_SPIKE" | "PROJECTED_STOCKOUT";
  severity: "LOW" | "MEDIUM" | "HIGH";
  itemId: string;
  itemName: string;
  category: string;
  currentQuantity?: number;
  minStockLevel?: number;
  shortfall?: number;
  latestConsumption?: number;
  averageConsumption?: number;
  percentageIncrease?: number;
  avgDailyConsumption?: number;
  daysUntilStockout?: number;
  estimatedStockoutDate?: string;
}

export interface InventoryAlerts {
  generatedAt: string;
  totalAlerts: number;
  alertsByType: {
    LOW_STOCK: number;
    USAGE_SPIKE: number;
    PROJECTED_STOCKOUT: number;
  };
  alerts: InventoryAlert[];
}

export interface InventoryReportStats {
  totalReports: number;
  reportsThisMonth: number;
  lastSubmission: {
    date: string;
    submittedAt: string;
  } | null;
}

/**
 * Submit an inventory report
 * @param reportData - Inventory report data
 * @returns Created inventory report
 */
export const submitInventoryReport = async (
  reportData: CreateSubmittedInventoryReportPayload
): Promise<SubmittedInventoryReport> => {
  try {
    console.log("🔵 SUBMITTING INVENTORY REPORT:");
    console.log("  Report Date:", reportData.reportDate);
    console.log("  Items Count:", reportData.inventorySnapshot.totalItems);

    safeReactotron.display({
      name: "SUBMIT INVENTORY REPORT",
      value: reportData,
      preview: `Submitting inventory report for ${reportData.reportDate}`,
    });

    const response = await apiPost("/submitted-inventory-reports", reportData);

    if (!response.ok) {
      const errorText = await response.text();
      console.log("🔴 SUBMIT REPORT ERROR:", errorText);

      safeReactotron.display({
        name: "SUBMIT REPORT ERROR",
        value: { status: response.status, error: errorText },
        preview: "Inventory report submission failed",
        important: true,
      });

      throw new Error(`Failed to submit inventory report: ${errorText}`);
    }

    const data = await response.json();
    console.log("🟢 INVENTORY REPORT SUBMITTED:", data.id);

    safeReactotron.display({
      name: "INVENTORY REPORT SUCCESS",
      value: data,
      preview: `Inventory report ${data.id} submitted successfully`,
    });

    return data;
  } catch (error) {
    console.error("Failed to submit inventory report:", error);
    throw error;
  }
};

/**
 * Get all submitted inventory reports
 * @param filters - Optional filters (reportDate, date range, userId)
 * @returns List of submitted inventory reports
 */
export const getSubmittedInventoryReports = async (filters?: {
  reportDate?: string;
  startDate?: string;
  endDate?: string;
  userId?: string;
}): Promise<SubmittedInventoryReport[]> => {
  try {
    const params = new URLSearchParams();
    if (filters?.reportDate) params.append("reportDate", filters.reportDate);
    if (filters?.startDate) params.append("startDate", filters.startDate);
    if (filters?.endDate) params.append("endDate", filters.endDate);
    if (filters?.userId) params.append("userId", filters.userId);

    const queryString = params.toString();
    const endpoint = `/submitted-inventory-reports${queryString ? `?${queryString}` : ""}`;

    console.log("🔵 FETCHING SUBMITTED INVENTORY REPORTS:", endpoint);

    safeReactotron.display({
      name: "FETCH SUBMITTED REPORTS",
      value: { endpoint, filters },
      preview: "Fetching submitted inventory reports from API",
    });

    const response = await apiGet(endpoint);

    if (!response.ok) {
      const errorText = await response.text();
      console.log("🔴 FETCH REPORTS ERROR:", errorText);

      safeReactotron.display({
        name: "FETCH REPORTS ERROR",
        value: { status: response.status, error: errorText },
        preview: "Failed to fetch submitted inventory reports",
        important: true,
      });

      throw new Error(`Failed to fetch submitted inventory reports: ${errorText}`);
    }

    const data = await response.json();
    console.log("🟢 SUBMITTED REPORTS FETCHED:", data.length, "reports");

    safeReactotron.display({
      name: "SUBMITTED REPORTS FETCHED",
      value: { count: data.length },
      preview: `Fetched ${data.length} submitted inventory reports`,
    });

    return data;
  } catch (error) {
    console.error("Failed to fetch submitted inventory reports:", error);
    throw error;
  }
};

/**
 * Get single inventory report by ID
 * @param id - Report ID
 * @returns Submitted inventory report
 */
export const getInventoryReportById = async (
  id: string
): Promise<SubmittedInventoryReport> => {
  try {
    console.log("🔵 FETCHING INVENTORY REPORT:", id);

    safeReactotron.display({
      name: "FETCH INVENTORY REPORT",
      value: { id },
      preview: `Fetching inventory report ${id}`,
    });

    const response = await apiGet(`/submitted-inventory-reports/${id}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.log("🔴 FETCH REPORT ERROR:", errorText);

      safeReactotron.display({
        name: "FETCH REPORT ERROR",
        value: { status: response.status, error: errorText },
        preview: "Failed to fetch inventory report",
        important: true,
      });

      throw new Error(`Failed to fetch inventory report: ${errorText}`);
    }

    const data = await response.json();
    console.log("🟢 INVENTORY REPORT FETCHED:", data.id);

    safeReactotron.display({
      name: "INVENTORY REPORT FETCHED",
      value: data,
      preview: `Fetched inventory report ${data.id}`,
    });

    return data;
  } catch (error) {
    console.error("Failed to fetch inventory report:", error);
    throw error;
  }
};

/**
 * Get inventory progression data
 * @param query - Query parameters (viewMode, date range, category filter)
 * @returns Inventory progression data
 */
export const getInventoryProgression = async (query: {
  viewMode: ViewMode;
  startDate?: string;
  endDate?: string;
  categoryFilter?: string;
}): Promise<InventoryProgression> => {
  try {
    const params = new URLSearchParams();
    params.append("viewMode", query.viewMode);
    if (query.startDate) params.append("startDate", query.startDate);
    if (query.endDate) params.append("endDate", query.endDate);
    if (query.categoryFilter) params.append("categoryFilter", query.categoryFilter);

    const queryString = params.toString();
    const endpoint = `/submitted-inventory-reports/progression?${queryString}`;

    console.log("🔵 FETCHING INVENTORY PROGRESSION:", endpoint);

    safeReactotron.display({
      name: "FETCH INVENTORY PROGRESSION",
      value: { endpoint, query },
      preview: "Fetching inventory progression from API",
    });

    const response = await apiGet(endpoint);

    if (!response.ok) {
      const errorText = await response.text();
      console.log("🔴 FETCH PROGRESSION ERROR:", errorText);

      safeReactotron.display({
        name: "FETCH PROGRESSION ERROR",
        value: { status: response.status, error: errorText },
        preview: "Failed to fetch inventory progression",
        important: true,
      });

      throw new Error(`Failed to fetch inventory progression: ${errorText}`);
    }

    const data = await response.json();
    console.log("🟢 INVENTORY PROGRESSION FETCHED:", data.items.length, "items");

    safeReactotron.display({
      name: "INVENTORY PROGRESSION FETCHED",
      value: { count: data.items.length },
      preview: `Fetched ${data.items.length} progression items`,
    });

    return data;
  } catch (error) {
    console.error("Failed to fetch inventory progression:", error);
    throw error;
  }
};

/**
 * Get inventory alerts
 * @returns Inventory alerts data
 */
export const getInventoryAlerts = async (): Promise<InventoryAlerts> => {
  try {
    console.log("🔵 FETCHING INVENTORY ALERTS");

    safeReactotron.display({
      name: "FETCH INVENTORY ALERTS",
      value: {},
      preview: "Fetching inventory alerts from API",
    });

    const response = await apiGet("/submitted-inventory-reports/alerts");

    if (!response.ok) {
      const errorText = await response.text();
      console.log("🔴 FETCH ALERTS ERROR:", errorText);

      safeReactotron.display({
        name: "FETCH ALERTS ERROR",
        value: { status: response.status, error: errorText },
        preview: "Failed to fetch inventory alerts",
        important: true,
      });

      throw new Error(`Failed to fetch inventory alerts: ${errorText}`);
    }

    const data = await response.json();
    console.log("🟢 INVENTORY ALERTS FETCHED:", data.totalAlerts, "alerts");

    safeReactotron.display({
      name: "INVENTORY ALERTS FETCHED",
      value: data,
      preview: `Fetched ${data.totalAlerts} inventory alerts`,
    });

    return data;
  } catch (error) {
    console.error("Failed to fetch inventory alerts:", error);
    throw error;
  }
};

/**
 * Get inventory report statistics
 * @returns Inventory report statistics
 */
export const getInventoryReportStats = async (): Promise<InventoryReportStats> => {
  try {
    console.log("🔵 FETCHING INVENTORY REPORT STATS");

    safeReactotron.display({
      name: "FETCH INVENTORY REPORT STATS",
      value: {},
      preview: "Fetching inventory report stats from API",
    });

    const response = await apiGet("/submitted-inventory-reports/stats");

    if (!response.ok) {
      const errorText = await response.text();
      console.log("🔴 FETCH STATS ERROR:", errorText);

      safeReactotron.display({
        name: "FETCH STATS ERROR",
        value: { status: response.status, error: errorText },
        preview: "Failed to fetch inventory report stats",
        important: true,
      });

      throw new Error(`Failed to fetch inventory report stats: ${errorText}`);
    }

    const data = await response.json();
    console.log("🟢 INVENTORY REPORT STATS FETCHED:", data);

    safeReactotron.display({
      name: "INVENTORY REPORT STATS FETCHED",
      value: data,
      preview: `Fetched inventory report stats`,
    });

    return data;
  } catch (error) {
    console.error("Failed to fetch inventory report stats:", error);
    throw error;
  }
};
