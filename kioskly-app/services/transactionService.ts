import { apiPost, apiGet, apiPatch } from "../utils/api";
import { safeReactotron } from "../utils/reactotron";
import { enqueue, generateClientId } from "./syncEngine";
import { cacheTransactions, getCachedTransactions, getPendingByType } from "../lib/localCache";
import AsyncStorage from "@react-native-async-storage/async-storage";

async function getStoredUser(): Promise<{ id: string; username: string; firstName?: string; lastName?: string; email: string; role: string } | null> {
  try {
    const raw = await AsyncStorage.getItem("@kioscify:user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function buildLocalTransaction(clientId: string, payload: Record<string, unknown>, user: { id: string; username: string; firstName?: string; lastName?: string; email: string; role: string } | null): TransactionResponse & { pendingSync: true } {
  // Use the timestamp captured at sale time so pending transactions always
  // display when the sale happened, not when this function is called.
  const saleTime = (payload.timestamp as string | undefined) ?? new Date().toISOString();

  // Reconstruct display items from the names embedded in the payload at checkout.
  // productName / sizeName / addonName are stripped before the API call but kept
  // in the SQLite queue so pending transactions can show what was ordered.
  const payloadItems = (payload.items as any[] | undefined) ?? [];
  const items: TransactionItemResponse[] = payloadItems.map((item: any) => ({
    id: item.productId,
    productId: item.productId,
    product: { id: item.productId, name: item.productName ?? item.productId, price: 0 },
    quantity: item.quantity,
    sizeId: item.sizeId,
    size: item.sizeName ? { id: item.sizeId ?? "", name: item.sizeName, priceModifier: 0 } : undefined,
    preferenceId: item.preferenceId,
    preference: item.preferenceName ? { id: item.preferenceId ?? "", name: item.preferenceName } : undefined,
    subtotal: item.subtotal,
    addons: (item.addons as any[] | undefined)
      ?.filter((a: any) => a.addonName)
      .map((a: any) => ({ id: a.addonId, name: a.addonName, price: 0 })) ?? [],
  }));

  return {
    id: clientId,
    transactionId: (payload.transactionId as string) ?? clientId,
    tenantId: "",
    userId: user?.id ?? "",
    user: user ?? { id: "", username: "Offline", email: "", role: "" },
    subtotal: (payload.subtotal as number) ?? 0,
    discountAmount: (payload.discountAmount as number | undefined) ?? null,
    total: (payload.total as number) ?? 0,
    paymentMethod: (payload.paymentMethod as string) ?? "CASH",
    cashReceived: payload.cashReceived as number | undefined,
    change: payload.change as number | undefined,
    referenceNumber: payload.referenceNumber as string | undefined,
    remarks: payload.remarks as string | undefined,
    timestamp: saleTime,
    createdAt: saleTime,
    updatedAt: saleTime,
    items,
    voidStatus: "NONE",
    pendingSync: true,
  } as TransactionResponse & { pendingSync: true };
}

interface TransactionItemAddon {
  addonId: string;
  addonName?: string; // display-only: stored in queue, stripped before API call
}

interface TransactionItem {
  productId: string;
  productName?: string; // display-only: stored in queue, stripped before API call
  quantity: number;
  sizeId?: string;
  sizeName?: string;  // display-only: stored in queue, stripped before API call
  preferenceId?: string;
  preferenceName?: string; // display-only: stored in queue, stripped before API call
  subtotal: number;
  addons?: TransactionItemAddon[];
}

export type PaymentMethodType = "CASH" | "GCASH" | "PAYMAYA" | "ONLINE" | "FOODPANDA" | "GRAB";

interface CreateTransactionPayload {
  transactionId: string;
  timestamp?: string; // ISO string captured at sale time; preserved through offline queue
  subtotal: number;
  total: number;
  paymentMethod: PaymentMethodType;
  cashReceived?: number;
  change?: number;
  referenceNumber?: string;
  remarks?: string;
  discountAmount?: number;
  items: TransactionItem[];
}

export interface TransactionItemResponse {
  id: string;
  productId: string;
  product: {
    id: string;
    name: string;
    price: number;
  };
  quantity: number;
  sizeId?: string;
  size?: {
    id: string;
    name: string;
    priceModifier: number;
  };
  preferenceId?: string;
  preference?: {
    id: string;
    name: string;
  };
  subtotal: number;
  addons?: Array<{
    id: string;
    name: string;
    price: number;
  }>;
}

export interface TransactionResponse {
  id: string;
  transactionId: string;
  tenantId: string;
  userId: string;
  user: {
    id: string;
    username: string;
    firstName?: string;
    lastName?: string;
    email: string;
    role: string;
  };
  subtotal: number;
  discountAmount?: number | null;
  total: number;
  paymentMethod: string;
  cashReceived?: number;
  change?: number;
  referenceNumber?: string;
  remarks?: string;
  timestamp: string;
  createdAt: string;
  updatedAt: string;
  items: TransactionItemResponse[];
  voidStatus?: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
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
}

/**
 * Create a transaction — offline-first. Tries network; falls back to local queue.
 * The clientId ensures no duplicates when the queue syncs later.
 */
export const createTransactionOffline = async (
  transactionData: CreateTransactionPayload
): Promise<{ transaction: TransactionResponse | null; queued: boolean; clientId: string }> => {
  const clientId = await generateClientId();
  const payload = { ...transactionData, clientId };

  // Strip display-only fields (productName, sizeName, addonName) before sending
  // to the API — the server DTO rejects unknown fields (forbidNonWhitelisted).
  // These fields are kept in `payload` so the SQLite queue has them for display.
  const apiPayload = {
    ...payload,
    items: payload.items.map(({ productName: _pn, sizeName: _sn, preferenceName: _pfn, ...item }) => ({
      ...item,
      addons: item.addons?.map(({ addonName: _an, ...addon }) => addon),
    })),
  };

  try {
    const response = await apiPost("/transactions", apiPayload);

    if (response.ok) {
      const data: TransactionResponse = await response.json();
      // Append to local cache so the transaction is visible offline
      // even if the user never visits the transactions/daily-report screen.
      const cached = (await getCachedTransactions()) ?? [];
      await cacheTransactions([data, ...cached.filter((t: TransactionResponse) => t.id !== data.id)]);
      return { transaction: data, queued: false, clientId };
    }

    if (response.status === 409) {
      // Already exists — treat as success
      const data = await response.json().catch(() => ({}));
      return { transaction: data as TransactionResponse, queued: false, clientId };
    }

    // Non-network error (4xx) — don't queue, surface to user
    const errorText = await response.text();
    throw new Error(`Failed to create transaction: ${errorText}`);
  } catch (networkError: any) {
    if (networkError.message?.includes("Failed to create")) throw networkError;
    // Network failure — queue for later
    await enqueue("transaction", "/transactions", payload as unknown as Record<string, unknown>, clientId);
    return { transaction: null, queued: true, clientId };
  }
};

/**
 * Create a new transaction on the backend (original — direct only, no queue)
 * @param transactionData - Transaction data to send to the API
 * @returns Created transaction response
 */
export const createTransaction = async (
  transactionData: CreateTransactionPayload
): Promise<TransactionResponse> => {
  try {
    console.log("🔵 CREATING TRANSACTION:");
    console.log("  Transaction ID:", transactionData.transactionId);
    console.log("  Total:", transactionData.total);
    console.log("  Payment Method:", transactionData.paymentMethod);
    console.log("  Items Count:", transactionData.items.length);

    safeReactotron.display({
      name: "CREATE TRANSACTION",
      value: transactionData,
      preview: `Creating transaction ${transactionData.transactionId}`,
    });

    const response = await apiPost("/transactions", transactionData);

    if (!response.ok) {
      const errorText = await response.text();
      console.log("🔴 TRANSACTION ERROR:", errorText);

      safeReactotron.display({
        name: "TRANSACTION ERROR",
        value: { status: response.status, error: errorText },
        preview: "Transaction creation failed",
        important: true,
      });

      throw new Error(`Failed to create transaction: ${errorText}`);
    }

    const data = await response.json();
    console.log("🟢 TRANSACTION CREATED:", data.transactionId);

    safeReactotron.display({
      name: "TRANSACTION SUCCESS",
      value: data,
      preview: `Transaction ${data.transactionId} created successfully`,
    });

    return data;
  } catch (error) {
    console.error("Failed to create transaction:", error);
    throw error;
  }
};

/**
 * Fetch all transactions for the current tenant
 * @param filters - Optional filters (startDate, endDate, paymentMethod)
 * @returns List of transactions
 */
/**
 * Returns all pending (unsynced) transactions from the local queue,
 * shaped as TransactionResponse so they can be used in report computations.
 */
export async function getPendingTransactions(): Promise<(TransactionResponse & { pendingSync: true })[]> {
  const pending = await getPendingByType("transaction");
  const user = await getStoredUser();
  return pending.map((item) => buildLocalTransaction(item.clientId, item.payload, user));
}

export const getTransactions = async (
  filters?: {
    startDate?: string;
    endDate?: string;
    paymentMethod?: PaymentMethodType;
  }
): Promise<(TransactionResponse & { pendingSync?: boolean })[]> => {
  const params = new URLSearchParams();
  if (filters?.startDate) params.append("startDate", filters.startDate);
  if (filters?.endDate) params.append("endDate", filters.endDate);
  if (filters?.paymentMethod) params.append("paymentMethod", filters.paymentMethod);
  const queryString = params.toString();
  const endpoint = `/transactions${queryString ? `?${queryString}` : ""}`;

  const getPending = async () => {
    const pending = await getPendingByType("transaction");
    const user = await getStoredUser();
    return pending.map((item) => buildLocalTransaction(item.clientId, item.payload, user));
  };

  try {
    const response = await apiGet(endpoint);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data: TransactionResponse[] = await response.json();
    await cacheTransactions(data);
    const pending = await getPending();
    // De-duplicate by transactionId (the TXN… string) — both server responses and
    // pending items carry the same transactionId, unlike id (MongoDB ObjectId) vs
    // clientId (UUID) which are different types and never match.
    const serverTxnIds = new Set(data.map((t) => t.transactionId));
    const newPending = pending.filter((p) => !serverTxnIds.has(p.transactionId));
    return [...newPending, ...data].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  } catch {
    let cached = (await getCachedTransactions()) ?? [];
    // Apply date filter offline so yesterday's cache doesn't bleed into today's report
    if (filters?.startDate || filters?.endDate) {
      const start = filters.startDate ? new Date(filters.startDate).getTime() : -Infinity;
      const end = filters.endDate ? new Date(filters.endDate).getTime() : Infinity;
      cached = cached.filter((t: TransactionResponse) => {
        const ts = new Date(t.timestamp).getTime();
        return ts >= start && ts <= end;
      });
    }
    const pending = await getPending();
    const cachedTxnIds = new Set(cached.map((t: TransactionResponse) => t.transactionId));
    const newPending = pending.filter((p) => !cachedTxnIds.has(p.transactionId));
    return [...newPending, ...cached].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }
};

/**
 * Update transaction remarks
 * @param transactionId - Transaction ID to update
 * @param remarks - New remarks text
 * @returns Updated transaction
 */
export const updateTransactionRemarks = async (
  transactionId: string,
  remarks?: string
): Promise<TransactionResponse> => {
  try {
    console.log("🔵 UPDATING TRANSACTION REMARKS:", transactionId);

    safeReactotron.display({
      name: "UPDATE TRANSACTION REMARKS",
      value: { transactionId, remarks },
      preview: `Updating remarks for ${transactionId}`,
    });

    const response = await apiPatch(`/transactions/${transactionId}`, { remarks });

    if (!response.ok) {
      const errorText = await response.text();
      console.log("🔴 UPDATE TRANSACTION ERROR:", errorText);

      safeReactotron.display({
        name: "UPDATE TRANSACTION ERROR",
        value: { status: response.status, error: errorText },
        preview: "Failed to update transaction",
        important: true,
      });

      throw new Error(`Failed to update transaction: ${errorText}`);
    }

    const data = await response.json();
    console.log("🟢 TRANSACTION UPDATED:", data.transactionId);

    safeReactotron.display({
      name: "TRANSACTION UPDATED",
      value: data,
      preview: `Transaction ${data.transactionId} updated successfully`,
    });

    return data;
  } catch (error) {
    console.error("Failed to update transaction:", error);
    throw error;
  }
};

/**
 * Request void for a transaction
 * @param transactionId - Transaction ID to void
 * @param reason - Reason for voiding
 * @returns Updated transaction
 */
export const requestVoidTransaction = async (
  transactionId: string,
  reason: string
): Promise<TransactionResponse> => {
  try {
    console.log("🔵 REQUESTING VOID:", transactionId);

    safeReactotron.display({
      name: "REQUEST VOID",
      value: { transactionId, reason },
      preview: `Requesting void for ${transactionId}`,
    });

    const response = await apiPost(`/transactions/${transactionId}/void-request`, {
      reason,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log("🔴 VOID REQUEST ERROR:", errorText);

      safeReactotron.display({
        name: "VOID REQUEST ERROR",
        value: { status: response.status, error: errorText },
        preview: "Void request failed",
        important: true,
      });

      throw new Error(`Failed to request void: ${errorText}`);
    }

    const data = await response.json();
    console.log("🟢 VOID REQUEST SUBMITTED:", data.transactionId);

    safeReactotron.display({
      name: "VOID REQUEST SUCCESS",
      value: data,
      preview: `Void request submitted for ${data.transactionId}`,
    });

    return data;
  } catch (error) {
    console.error("Failed to request void:", error);
    throw error;
  }
};
