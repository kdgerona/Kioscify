export interface ExpirationBatchInput {
  id: string;
  quantity: string;
  expirationDate: Date | null;
}

export interface InventoryInput {
  id: string;
  name: string;
  // Category is a plain name string here (flattened server-side from the
  // structured Category relation) — see LatestInventoryItem.category.
  category: string;
  unit: string;
  minStockLevel?: number;
  quantity: string;
  previousQuantity: number | null;
  requiresExpirationDate?: boolean;
  expirationWarningDays?: number;
  batches: ExpirationBatchInput[];
}
