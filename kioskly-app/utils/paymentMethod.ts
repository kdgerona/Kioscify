export function getPaymentMethodLabel(method: string): string {
  const labels: Record<string, string> = {
    CASH: "Cash",
    GCASH: "GCash",
    PAYMAYA: "Maya",
    ONLINE: "Online",
    FOODPANDA: "FoodPanda",
    GRAB: "Grab",
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
    default:
      return { backgroundColor: "#e5e7eb", textColor: "#374151" };
  }
}
