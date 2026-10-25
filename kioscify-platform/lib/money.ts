/** Centavos → "₱1,500.00" ("—" for null). Prices are stored as integer centavos. */
export function formatPeso(centavos: number | null | undefined): string {
  if (centavos == null) return '—';
  return `₱${(centavos / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "1,500.50" / "1500" → 150050 / 150000; null when not a positive amount. */
export function pesoToCentavos(input: string): number | null {
  const n = Number(input.replace(/[₱,\s]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

/** ISO instant → "Nov 16, 2026" in Manila time ("—" for null). */
export function formatManilaDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' });
}

/** ISO instant → "YYYY-MM-DD" (Manila calendar day) for <input type="date">. */
export function toManilaDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(new Date(iso).getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Today (Manila) + `days` → "YYYY-MM-DD". */
export function manilaDateInputFromToday(days: number): string {
  const now = new Date(Date.now() + 8 * 60 * 60 * 1000);
  now.setUTCDate(now.getUTCDate() + days);
  return now.toISOString().slice(0, 10);
}
