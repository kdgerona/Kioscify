import { InventoryCategory } from "@/services/inventoryService";

export interface ExpirationBatchInput {
  id: string;
  quantity: string;
  expirationDate: Date | null;
}

export interface InventoryInput {
  id: string;
  name: string;
  category: InventoryCategory;
  unit: string;
  minStockLevel?: number;
  quantity: string;
  previousQuantity: number | null;
  requiresExpirationDate?: boolean;
  expirationWarningDays?: number;
  batches: ExpirationBatchInput[];
}
