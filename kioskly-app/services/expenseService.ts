import { apiPost, apiGet, apiPatch, apiDelete } from "../utils/api";
import { safeReactotron } from "../utils/reactotron";

export enum ExpenseCategory {
  SUPPLIES = "SUPPLIES",
  UTILITIES = "UTILITIES",
  RENT = "RENT",
  SALARIES = "SALARIES",
  MARKETING = "MARKETING",
  MAINTENANCE = "MAINTENANCE",
  TRANSPORTATION = "TRANSPORTATION",
  MISCELLANEOUS = "MISCELLANEOUS",
}

export interface CreateExpensePayload {
  description: string;
  amount: number;
  category: ExpenseCategory;
  date?: string;
  receipt?: string;
  notes?: string;
}

export interface UpdateExpensePayload {
  description?: string;
  amount?: number;
  category?: ExpenseCategory;
  date?: string;
  receipt?: string;
  notes?: string;
}

export interface ExpenseResponse {
  id: string;
  description: string;
  amount: number;
  category: ExpenseCategory;
  date: string;
  receipt?: string;
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

export interface ExpenseStatsResponse {
  period: "daily" | "weekly" | "monthly";
  startDate: string;
  endDate: string;
  totalExpenses: number;
  totalCount: number;
  averageExpense: number;
  categoryBreakdown: Record<
    string,
    {
      total: number;
      count: number;
    }
  >;
}

/**
 * Create a new expense on the backend
 * @param expenseData - Expense data to send to the API
 * @returns Created expense response
 */
export const createExpense = async (
  expenseData: CreateExpensePayload
): Promise<ExpenseResponse> => {
  try {
    console.log("🔵 CREATING EXPENSE:");
    console.log("  Description:", expenseData.description);
    console.log("  Amount:", expenseData.amount);
    console.log("  Category:", expenseData.category);

    safeReactotron.display({
      name: "CREATE EXPENSE",
      value: expenseData,
      preview: `Creating expense: ${expenseData.description}`,
    });

    const response = await apiPost("/expenses", expenseData);

    if (!response.ok) {
      const errorText = await response.text();
      console.log("🔴 EXPENSE ERROR:", errorText);

      safeReactotron.display({
        name: "EXPENSE ERROR",
        value: { status: response.status, error: errorText },
        preview: "Expense creation failed",
        important: true,
      });

      throw new Error(`Failed to create expense: ${errorText}`);
    }

    const data = await response.json();
    console.log("🟢 EXPENSE CREATED:", data.id);

    safeReactotron.display({
      name: "EXPENSE SUCCESS",
      value: data,
      preview: `Expense ${data.id} created successfully`,
    });

    return data;
  } catch (error) {
    console.error("Failed to create expense:", error);
    throw error;
  }
};

/**
 * Fetch all expenses for the current tenant
 * @param filters - Optional filters (startDate, endDate, category, minAmount, maxAmount)
 * @returns List of expenses
 */
export const getExpenses = async (filters?: {
  startDate?: string;
  endDate?: string;
  category?: ExpenseCategory;
  minAmount?: number;
  maxAmount?: number;
}): Promise<ExpenseResponse[]> => {
  try {
    const params = new URLSearchParams();
    if (filters?.startDate) params.append("startDate", filters.startDate);
    if (filters?.endDate) params.append("endDate", filters.endDate);
    if (filters?.category) params.append("category", filters.category);
    if (filters?.minAmount !== undefined)
      params.append("minAmount", filters.minAmount.toString());
    if (filters?.maxAmount !== undefined)
      params.append("maxAmount", filters.maxAmount.toString());

    const queryString = params.toString();
    const endpoint = `/expenses${queryString ? `?${queryString}` : ""}`;

    console.log("🔵 FETCHING EXPENSES:", endpoint);

    safeReactotron.display({
      name: "FETCH EXPENSES",
      value: { endpoint, filters },
      preview: "Fetching expenses from API",
    });

    const response = await apiGet(endpoint);

    if (!response.ok) {
      const errorText = await response.text();
      console.log("🔴 FETCH EXPENSES ERROR:", errorText);

      safeReactotron.display({
        name: "FETCH EXPENSES ERROR",
        value: { status: response.status, error: errorText },
        preview: "Failed to fetch expenses",
        important: true,
      });

      throw new Error(`Failed to fetch expenses: ${errorText}`);
    }

    const data = await response.json();
    console.log("🟢 EXPENSES FETCHED:", data.length, "expenses");

    safeReactotron.display({
      name: "EXPENSES FETCHED",
      value: { count: data.length },
      preview: `Fetched ${data.length} expenses`,
    });

    return data;
  } catch (error) {
    console.error("Failed to fetch expenses:", error);
    throw error;
  }
};

/**
 * Fetch a single expense by ID
 * @param expenseId - Expense ID to fetch
 * @returns Expense details
 */
export const getExpense = async (
  expenseId: string
): Promise<ExpenseResponse> => {
  try {
    console.log("🔵 FETCHING EXPENSE:", expenseId);

    safeReactotron.display({
      name: "FETCH EXPENSE",
      value: { expenseId },
      preview: `Fetching expense ${expenseId}`,
    });

    const response = await apiGet(`/expenses/${expenseId}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.log("🔴 FETCH EXPENSE ERROR:", errorText);

      safeReactotron.display({
        name: "FETCH EXPENSE ERROR",
        value: { status: response.status, error: errorText },
        preview: "Failed to fetch expense",
        important: true,
      });

      throw new Error(`Failed to fetch expense: ${errorText}`);
    }

    const data = await response.json();
    console.log("🟢 EXPENSE FETCHED:", data.id);

    safeReactotron.display({
      name: "EXPENSE FETCHED",
      value: data,
      preview: `Fetched expense ${data.id}`,
    });

    return data;
  } catch (error) {
    console.error("Failed to fetch expense:", error);
    throw error;
  }
};

/**
 * Update an expense
 * @param expenseId - Expense ID to update
 * @param updateData - Updated expense data
 * @returns Updated expense
 */
export const updateExpense = async (
  expenseId: string,
  updateData: UpdateExpensePayload
): Promise<ExpenseResponse> => {
  try {
    console.log("🔵 UPDATING EXPENSE:", expenseId);

    safeReactotron.display({
      name: "UPDATE EXPENSE",
      value: { expenseId, updateData },
      preview: `Updating expense ${expenseId}`,
    });

    const response = await apiPatch(`/expenses/${expenseId}`, updateData);

    if (!response.ok) {
      const errorText = await response.text();
      console.log("🔴 UPDATE EXPENSE ERROR:", errorText);

      safeReactotron.display({
        name: "UPDATE EXPENSE ERROR",
        value: { status: response.status, error: errorText },
        preview: "Failed to update expense",
        important: true,
      });

      throw new Error(`Failed to update expense: ${errorText}`);
    }

    const data = await response.json();
    console.log("🟢 EXPENSE UPDATED:", data.id);

    safeReactotron.display({
      name: "EXPENSE UPDATED",
      value: data,
      preview: `Expense ${data.id} updated successfully`,
    });

    return data;
  } catch (error) {
    console.error("Failed to update expense:", error);
    throw error;
  }
};

/**
 * Delete an expense
 * @param expenseId - Expense ID to delete
 * @returns Success message
 */
export const deleteExpense = async (
  expenseId: string
): Promise<{ message: string }> => {
  try {
    console.log("🔵 DELETING EXPENSE:", expenseId);

    safeReactotron.display({
      name: "DELETE EXPENSE",
      value: { expenseId },
      preview: `Deleting expense ${expenseId}`,
    });

    const response = await apiDelete(`/expenses/${expenseId}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.log("🔴 DELETE EXPENSE ERROR:", errorText);

      safeReactotron.display({
        name: "DELETE EXPENSE ERROR",
        value: { status: response.status, error: errorText },
        preview: "Failed to delete expense",
        important: true,
      });

      throw new Error(`Failed to delete expense: ${errorText}`);
    }

    const data = await response.json();
    console.log("🟢 EXPENSE DELETED:", expenseId);

    safeReactotron.display({
      name: "EXPENSE DELETED",
      value: data,
      preview: `Expense ${expenseId} deleted successfully`,
    });

    return data;
  } catch (error) {
    console.error("Failed to delete expense:", error);
    throw error;
  }
};

/**
 * Get expense statistics for a given period
 * @param period - Statistics period (daily, weekly, monthly)
 * @returns Expense statistics
 */
export const getExpenseStats = async (
  period: "daily" | "weekly" | "monthly" = "daily"
): Promise<ExpenseStatsResponse> => {
  try {
    console.log("🔵 FETCHING EXPENSE STATS:", period);

    safeReactotron.display({
      name: "FETCH EXPENSE STATS",
      value: { period },
      preview: `Fetching ${period} expense stats`,
    });

    const response = await apiGet(`/expenses/stats?period=${period}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.log("🔴 FETCH EXPENSE STATS ERROR:", errorText);

      safeReactotron.display({
        name: "FETCH EXPENSE STATS ERROR",
        value: { status: response.status, error: errorText },
        preview: "Failed to fetch expense stats",
        important: true,
      });

      throw new Error(`Failed to fetch expense stats: ${errorText}`);
    }

    const data = await response.json();
    console.log("🟢 EXPENSE STATS FETCHED:", data.totalExpenses);

    safeReactotron.display({
      name: "EXPENSE STATS FETCHED",
      value: data,
      preview: `Fetched ${period} expense stats`,
    });

    return data;
  } catch (error) {
    console.error("Failed to fetch expense stats:", error);
    throw error;
  }
};
