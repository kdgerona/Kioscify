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
  // No longer part of the store's current inventory setup, but preserved
  // (and still fully recordable) because the store has recorded stock for
  // it — see InventoryService.findAllItems on the API.
  isLegacy: boolean;
}
