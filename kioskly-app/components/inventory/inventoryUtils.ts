import { ExpirationBatchInput, InventoryInput } from "./types";

export type ExpiryStatus = "expired" | "expiring-soon" | "warning" | "ok";

export const generateBatchId = (): string =>
  `batch_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

export const calculateTotalFromBatches = (batches: ExpirationBatchInput[]): number =>
  batches.reduce((sum, batch) => {
    const qty = parseFloat(batch.quantity);
    return sum + (isNaN(qty) ? 0 : qty);
  }, 0);

export const getExpirationStatus = (
  expirationDate: Date | null,
  warningDays: number = 7
): { status: ExpiryStatus; daysLeft: number | null } => {
  if (!expirationDate) return { status: "ok", daysLeft: null };

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const expDate = new Date(expirationDate);
  expDate.setHours(0, 0, 0, 0);

  const daysLeft = Math.ceil(
    (expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysLeft < 0) return { status: "expired", daysLeft };
  if (daysLeft <= 3) return { status: "expiring-soon", daysLeft };
  if (daysLeft <= warningDays) return { status: "warning", daysLeft };
  return { status: "ok", daysLeft };
};

// Returns the worst expiry status across all batches for a given item.
// Returns "none" for non-expiry items, "uncounted" if the item has no quantity yet.
export const getItemWorstExpiryStatus = (
  item: InventoryInput
): ExpiryStatus | "none" | "uncounted" => {
  if (!item.requiresExpirationDate) return "none";
  if (!item.quantity || item.quantity.trim() === "") return "uncounted";

  let worst: ExpiryStatus = "ok";
  for (const batch of item.batches) {
    if (!batch.quantity || batch.quantity.trim() === "") continue;
    const { status } = getExpirationStatus(
      batch.expirationDate,
      item.expirationWarningDays
    );
    if (status === "expired") return "expired";
    if (status === "expiring-soon") worst = "expiring-soon";
    else if (status === "warning" && worst !== "expiring-soon") worst = "warning";
  }
  return worst;
};

export const formatDate = (date: Date | null): string => {
  if (!date) return "Set date";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

// Category is now a real display name set by the brand admin (e.g. "Cold
// Drinks"), not a fixed code-style enum value (e.g. "MAINS") — shown as-is,
// no case transformation needed.
export const getCategoryLabel = (category: string): string =>
  category?.trim() || "Uncategorized";
