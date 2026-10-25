/** Centavos → "₱1,500.00" ("—" for null). */
export function formatPeso(centavos: number | null | undefined): string {
  if (centavos == null) return "—";
  return `₱${(centavos / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "1,500.50" → 150050; null when not a positive amount. */
export function pesoToCentavos(input: string): number | null {
  const n = Number(input.replace(/[₱,\s]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

/** ISO instant → "Nov 16, 2026" in Manila time ("—" for null). */
export function formatManilaDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" });
}

/** Billing periods are stored with an exclusive end; show the last covered day. */
export function formatPeriod(start: string, endExclusive: string): string {
  return `${formatManilaDate(start)} – ${formatManilaDate(new Date(new Date(endExclusive).getTime() - 1).toISOString())}`;
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = { QRPH: "QRPH", MANUAL: "Manual", PREPAID: "Prepaid" };
