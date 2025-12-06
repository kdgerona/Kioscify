import { apiPost } from "../utils/api";
import Reactotron from "../ReactotronConfig";

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

interface CreateTransactionPayload {
  transactionId: string;
  subtotal: number;
  total: number;
  paymentMethod: "CASH" | "ONLINE";
  cashReceived?: number;
  change?: number;
  referenceNumber?: string;
  items: TransactionItem[];
}

export interface TransactionResponse {
  id: string;
  transactionId: string;
  tenantId: string;
  userId: string;
  subtotal: number;
  total: number;
  paymentMethod: string;
  cashReceived?: number;
  change?: number;
  referenceNumber?: string;
  createdAt: string;
  items: any[];
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

    Reactotron.display({
      name: "CREATE TRANSACTION",
      value: transactionData,
      preview: `Creating transaction ${transactionData.transactionId}`,
    });

    const response = await apiPost("/transactions", transactionData);

    if (!response.ok) {
      const errorText = await response.text();
      console.log("🔴 TRANSACTION ERROR:", errorText);

      Reactotron.display({
        name: "TRANSACTION ERROR",
        value: { status: response.status, error: errorText },
        preview: "Transaction creation failed",
        important: true,
      });

      throw new Error(`Failed to create transaction: ${errorText}`);
    }

    const data = await response.json();
    console.log("🟢 TRANSACTION CREATED:", data.transactionId);

    Reactotron.display({
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
