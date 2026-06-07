import { apiPost, apiGet, apiPatch, apiDelete } from "../utils/api";
import { safeReactotron } from "../utils/reactotron";
import { enqueue, generateClientId } from "./syncEngine";
import { cacheExpenses, getCachedExpenses, getPendingByType } from "../lib/localCache";
import AsyncStorage from "@react-native-async-storage/async-storage";

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
    firstName?: string;
    lastName?: string;
    email: string;
    role: string;
  };
  voidStatus?: "NONE" | "PENDING" | "APPROVED" | "REJECTED";
  voidReason?: string;
  voidRequestedBy?: string;
  voidRequestedAt?: string;
  voidReviewedBy?: string;
  voidReviewedAt?: string;
  voidRejectionReason?: string;
  voidRequester?: {
    id: string;
    username: string;
    firstName?: string;
    lastName?: string;
    email: string;
    role: string;
  };
  voidReviewer?: {
    id: string;
    username: string;
    firstName?: string;
    lastName?: string;
    email: string;
    role: string;
  };
  createdAt: string;
  updatedAt: string;
  pendingSync?: boolean;
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

async function getStoredUser(): Promise<{ id: string; username: string; firstName?: string; lastName?: string; email: string; role: string } | null> {
  try {
    const raw = await AsyncStorage.getItem("@kioscify:user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function buildLocalExpense(
  clientId: string,
  data: CreateExpensePayload,
  user: { id: string; username: string; firstName?: string; lastName?: string; email: string; role: string } | null,
  queuedAt?: string,
): ExpenseResponse {
  // Prefer the tap-time date captured in the payload; fall back to the SQLite
  // enqueue timestamp (stable across refreshes); last resort is now().
  const stableTime = data.date ?? queuedAt ?? new Date().toISOString();
  return {
    id: clientId,
    description: data.description,
    amount: data.amount,
    category: data.category,
    date: stableTime,
    receipt: data.receipt,
    notes: data.notes,
    userId: user?.id ?? "",
    user: user ?? { id: "", username: "Offline", email: "", role: "" },
    voidStatus: "NONE",
    createdAt: stableTime,
    updatedAt: stableTime,
    pendingSync: true,
  };
}

/**
 * Create a new expense — offline-first.
 * Tries network; on failure queues locally. Returns immediately in both cases.
 */
export const createExpense = async (
  expenseData: CreateExpensePayload
): Promise<ExpenseResponse> => {
  const clientId = await generateClientId();
  const payload = { ...expenseData, clientId };

  safeReactotron.display({
    name: "CREATE EXPENSE",
    value: payload,
    preview: `Creating expense: ${expenseData.description}`,
  });

  try {
    const response = await apiPost("/expenses", payload);

    if (response.status === 409) {
      const existing = await response.json().catch(() => ({}));
      return existing as ExpenseResponse;
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create expense: ${errorText}`);
    }

    const data = await response.json();
    safeReactotron.display({ name: "EXPENSE SUCCESS", value: data, preview: `Expense ${data.id} created` });
    // Append to local cache so the expense is visible offline
    const cached = (await getCachedExpenses()) ?? [];
    await cacheExpenses([data, ...cached.filter((e: ExpenseResponse) => e.id !== data.id)]);
    return data;
  } catch (err) {
    // Queue on any non-4xx failure (network down, timeout, server error).
    // 4xx errors surface immediately so the user knows what went wrong.
    const status = (err as any)?.status;
    const is4xx = typeof status === "number" && status >= 400 && status < 500;
    if (!is4xx) {
      await enqueue("expense", "/expenses", payload as unknown as Record<string, unknown>, clientId);
      const user = await getStoredUser();
      const local = buildLocalExpense(clientId, expenseData, user);
      safeReactotron.display({ name: "EXPENSE QUEUED", value: local, preview: "Expense queued for sync" });
      return local;
    }
    throw err;
  }
};

/**
 * Fetch expenses — returns API data cached locally; falls back to cache + pending
 * queue items when offline.
 */
/**
 * Returns all pending (unsynced) expenses from the local queue,
 * shaped as ExpenseResponse so they can be used in report computations.
 */
export async function getPendingExpenses(): Promise<(ExpenseResponse & { pendingSync: true })[]> {
  const pending = await getPendingByType("expense");
  const user = await getStoredUser();
  return pending.map((item) => {
    const p = item.payload as any;
    return { ...buildLocalExpense(item.clientId, p, user, item.createdAt), pendingSync: true as const };
  });
}

export const getExpenses = async (filters?: {
  startDate?: string;
  endDate?: string;
  category?: ExpenseCategory;
  minAmount?: number;
  maxAmount?: number;
}): Promise<ExpenseResponse[]> => {
  const params = new URLSearchParams();
  if (filters?.startDate) params.append("startDate", filters.startDate);
  if (filters?.endDate) params.append("endDate", filters.endDate);
  if (filters?.category) params.append("category", filters.category);
  if (filters?.minAmount !== undefined) params.append("minAmount", filters.minAmount.toString());
  if (filters?.maxAmount !== undefined) params.append("maxAmount", filters.maxAmount.toString());
  const queryString = params.toString();
  const endpoint = `/expenses${queryString ? `?${queryString}` : ""}`;

  const getPending = async (): Promise<ExpenseResponse[]> => {
    const pending = await getPendingByType("expense");
    const user = await getStoredUser();
    return pending.map((item) => {
      const p = item.payload as any;
      return buildLocalExpense(item.clientId, p, user, item.createdAt);
    });
  };

  try {
    const response = await apiGet(endpoint);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data: ExpenseResponse[] = await response.json();
    await cacheExpenses(data);
    const pending = await getPending();
    // De-duplicate by clientId: the server expense response includes clientId (Prisma
    // returns all model fields), and buildLocalExpense sets id = clientId, so
    // serverClientIds.has(p.id) correctly identifies already-synced pending items.
    const serverClientIds = new Set(data.map((e: any) => e.clientId).filter(Boolean));
    const newPending = pending.filter((p) => !serverClientIds.has(p.id));
    return [...newPending, ...data].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
  } catch {
    let cached = (await getCachedExpenses()) ?? [];
    // Apply date filter offline so yesterday's cache doesn't bleed into today's report
    if (filters?.startDate || filters?.endDate) {
      const start = filters.startDate ? new Date(filters.startDate).getTime() : -Infinity;
      const end = filters.endDate ? new Date(filters.endDate).getTime() : Infinity;
      cached = cached.filter((e: ExpenseResponse) => {
        const ts = new Date(e.date).getTime();
        return ts >= start && ts <= end;
      });
    }
    const pending = await getPending();
    const cachedClientIds = new Set(cached.map((e: any) => e.clientId).filter(Boolean));
    const newPending = pending.filter((p) => !cachedClientIds.has(p.id));
    return [...newPending, ...cached].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
  }
};

export const getExpense = async (expenseId: string): Promise<ExpenseResponse> => {
  const response = await apiGet(`/expenses/${expenseId}`);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch expense: ${errorText}`);
  }
  return response.json();
};

export const updateExpense = async (
  expenseId: string,
  updateData: UpdateExpensePayload
): Promise<ExpenseResponse> => {
  const response = await apiPatch(`/expenses/${expenseId}`, updateData);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to update expense: ${errorText}`);
  }
  return response.json();
};

export const deleteExpense = async (
  expenseId: string
): Promise<{ message: string }> => {
  const response = await apiDelete(`/expenses/${expenseId}`);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to delete expense: ${errorText}`);
  }
  return response.json();
};

export const getExpenseStats = async (
  period: "daily" | "weekly" | "monthly" = "daily"
): Promise<ExpenseStatsResponse> => {
  const response = await apiGet(`/expenses/stats?period=${period}`);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch expense stats: ${errorText}`);
  }
  return response.json();
};

export const requestVoidExpense = async (
  expenseId: string,
  reason: string
): Promise<ExpenseResponse> => {
  const response = await apiPost(`/expenses/${expenseId}/void-request`, { reason });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to request expense void: ${errorText}`);
  }
  return response.json();
};
