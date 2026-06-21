export const DISCOUNT_PERCENTAGES = [5, 10, 15, 20, 25, 50];

export type DiscountMode = "percentage" | "amount";

export type ItemDiscount = {
  mode: DiscountMode;
  percentage?: number;
  customAmount?: string;
  amount: number; // resolved flat ₱ amount, capped at baseAmount
};

export function computeDiscountAmount(
  baseAmount: number,
  mode: DiscountMode | null,
  percentage: number | null,
  customAmountText: string,
): number {
  if (mode === "percentage" && percentage !== null)
    return (baseAmount * percentage) / 100;
  if (mode === "amount")
    return Math.min(parseFloat(customAmountText) || 0, baseAmount);
  return 0;
}

export function getCombinedDiscount(transaction: {
  discountAmount?: number | null;
  items: { discountAmount?: number | null }[];
}): number {
  return (
    (transaction.discountAmount ?? 0) +
    transaction.items.reduce((s, i) => s + (i.discountAmount ?? 0), 0)
  );
}
