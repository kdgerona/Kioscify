export function getPaymentMethodLabel(method: string): string {
  const labels: Record<string, string> = {
    CASH: "Cash",
    GCASH: "GCash",
    PAYMAYA: "Maya",
    ONLINE: "Online",
    FOODPANDA: "FoodPanda",
    GRAB: "Grab",
    SPLIT: "Split Payment",
  };
  return labels[method] ?? method;
}

export function getPaymentMethodBadgeStyle(method: string): {
  backgroundColor: string;
  textColor: string;
} {
  switch (method) {
    case "CASH":
      return { backgroundColor: "#bbf7d0", textColor: "#166534" };
    case "GCASH":
      return { backgroundColor: "#bfdbfe", textColor: "#1e40af" };
    case "PAYMAYA":
      return { backgroundColor: "#202122", textColor: "#50B16B" };
    case "ONLINE":
      return { backgroundColor: "#e5e7eb", textColor: "#374151" };
    case "FOODPANDA":
      return { backgroundColor: "#fbcfe8", textColor: "#9d174d" };
    case "GRAB":
      return { backgroundColor: "rgba(0,177,79,0.15)", textColor: "#007835" };
    case "SPLIT":
      return { backgroundColor: "#ddd6fe", textColor: "#5b21b6" };
    default:
      return { backgroundColor: "#e5e7eb", textColor: "#374151" };
  }
}

// Shared by daily-report.tsx and shift-report.tsx's offline (locally-computed)
// paths, and by reports.service.ts on the backend for the online path — all
// three must attribute a SPLIT transaction's legs to their own method bucket
// identically, or online vs. offline reports for the same day will disagree.
export function buildPaymentMethodBreakdown(
  transactions: { paymentMethod: string; total: number; payments?: { method: string; amount: number }[] }[],
): Record<string, { total: number; count: number }> {
  const breakdown: Record<string, { total: number; count: number }> = {};
  for (const t of transactions) {
    if (t.paymentMethod === "SPLIT" && t.payments && t.payments.length > 0) {
      for (const split of t.payments) {
        if (!breakdown[split.method]) breakdown[split.method] = { total: 0, count: 0 };
        breakdown[split.method].total += split.amount;
        breakdown[split.method].count += 1;
      }
      continue;
    }
    if (!breakdown[t.paymentMethod]) breakdown[t.paymentMethod] = { total: 0, count: 0 };
    breakdown[t.paymentMethod].total += t.total;
    breakdown[t.paymentMethod].count += 1;
  }
  return breakdown;
}
