import { apiPost, apiGet, apiPatch } from "../utils/api";
import { safeReactotron } from "../utils/reactotron";

interface TransactionItemAddon {
  addonId: string;
}

interface TransactionItem {
  productId: string;
  quantity: number;
  sizeId?: string;
  subtotal: number;
  addons?: TransactionItemAddon[];
}

export type PaymentMethodType = "CASH" | "CARD" | "GCASH" | "PAYMAYA" | "ONLINE";

interface CreateTransactionPayload {
  transactionId: string;
  subtotal: number;
  total: number;
  paymentMethod: PaymentMethodType;
  cashReceived?: number;
  change?: number;
  referenceNumber?: string;
  remarks?: string;
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
    email: string;
    role: string;
  };
  subtotal: number;
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
    email: string;
    role: string;
  };
  voidReviewer?: {
    id: string;
    username: string;
    email: string;
    role: string;
  };
}

/**
 * Create a new transaction on the backend
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
export const getTransactions = async (
  filters?: {
    startDate?: string;
    endDate?: string;
    paymentMethod?: PaymentMethodType;
  }
): Promise<TransactionResponse[]> => {
  try {
    const params = new URLSearchParams();
    if (filters?.startDate) params.append("startDate", filters.startDate);
    if (filters?.endDate) params.append("endDate", filters.endDate);
    if (filters?.paymentMethod) params.append("paymentMethod", filters.paymentMethod);

    const queryString = params.toString();
    const endpoint = `/transactions${queryString ? `?${queryString}` : ""}`;

    console.log("🔵 FETCHING TRANSACTIONS:", endpoint);

    safeReactotron.display({
      name: "FETCH TRANSACTIONS",
      value: { endpoint, filters },
      preview: "Fetching transactions from API",
    });

    const response = await apiGet(endpoint);

    if (!response.ok) {
      const errorText = await response.text();
      console.log("🔴 FETCH TRANSACTIONS ERROR:", errorText);

      safeReactotron.display({
        name: "FETCH TRANSACTIONS ERROR",
        value: { status: response.status, error: errorText },
        preview: "Failed to fetch transactions",
        important: true,
      });

      throw new Error(`Failed to fetch transactions: ${errorText}`);
    }

    const data = await response.json();
    console.log("🟢 TRANSACTIONS FETCHED:", data.length, "transactions");

    safeReactotron.display({
      name: "TRANSACTIONS FETCHED",
      value: { count: data.length },
      preview: `Fetched ${data.length} transactions`,
    });

    return data;
  } catch (error) {
    console.error("Failed to fetch transactions:", error);
    throw error;
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
