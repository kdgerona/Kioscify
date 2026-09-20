// ─────────────────────────────────────────────────────────────────────────────
// CSV serialization for the data export feature. No external CSV library —
// every dataset here is either a flat array of records or has at most one
// level of nested array that's worth splitting into a linked child file
// (Transaction.items, SubmittedInventoryReport.items). Split files are
// joined back together by a human-meaningful field (a transaction's own
// receipt code, a report's submittedAt timestamp) rather than a raw Mongo
// id — see flattenTransactions/flattenSubmittedInventoryReports.
// ─────────────────────────────────────────────────────────────────────────────

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    if (value.every((v) => v === null || v === undefined || typeof v !== 'object')) {
      return value.join('; ');
    }
    return JSON.stringify(value);
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function escapeCsvField(raw: string): string {
  if (/[",\n\r]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

/**
 * Converts an array of flat records into CSV text. Columns are the union of
 * every row's keys, in first-seen order, so an occasional nullable/optional
 * field on some rows doesn't drop a column — empty cell instead.
 */
export function toCsv(rows: Array<Record<string, unknown>>): string {
  const columns: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }
  }
  if (columns.length === 0) return '';

  const header = columns.map(escapeCsvField).join(',');
  const lines = rows.map((row) =>
    columns.map((col) => escapeCsvField(csvCell(row[col]))).join(','),
  );
  return [header, ...lines].join('\r\n') + '\r\n';
}

/** Converts a single flat record into a 2-column (field,value) CSV — for singleton objects like company-info/brand-info. */
export function toKeyValueCsv(record: Record<string, unknown>): string {
  const lines = Object.entries(record).map(
    ([key, value]) => `${escapeCsvField(key)},${escapeCsvField(csvCell(value))}`,
  );
  return ['field,value', ...lines].join('\r\n') + '\r\n';
}

// ─── Transactions: split into transactions.csv + transaction-items.csv ────

interface TransactionItemAddonLike {
  name?: string;
  [key: string]: unknown;
}

interface TransactionItemLike {
  productId: string;
  quantity: number;
  sizeId: string | null;
  preferenceId: string | null;
  subtotal: number;
  discountAmount: number | null;
  createdAt: Date;
  addons?: TransactionItemAddonLike[];
  [key: string]: unknown;
}

interface TransactionLike {
  // The transaction's own human-facing receipt code (e.g. "TXN178...") —
  // NOT the Mongo `id`. This is what links transaction-items.csv rows back
  // to their parent, so a person can visually match the two files without
  // ever seeing a raw ObjectId.
  transactionId: string;
  items?: TransactionItemLike[];
  [key: string]: unknown;
}

export function flattenTransactions(transactions: TransactionLike[]): {
  transactionsCsv: string;
  itemsCsv: string;
} {
  const transactionRows = transactions.map(({ items: _items, ...rest }) => rest);

  const itemRows = transactions.flatMap((t) =>
    (t.items ?? []).map((item) => {
      const { addons, ...itemRest } = item;
      return {
        transactionId: t.transactionId,
        ...itemRest,
        addonNames: (addons ?? []).map((a) => a.name).join('; '),
      };
    }),
  );

  return {
    transactionsCsv: toCsv(transactionRows),
    itemsCsv: toCsv(itemRows),
  };
}

// ─── Submitted (sales) reports: flatten the three snapshot composites ─────

// paymentMethodBreakdown / categoryBreakdown are keyed by a finite set of
// enum-like values (payment method, expense category) — the exact key set
// isn't fixed at compile time, so it can't become its own CSV columns, but
// the VALUE shape is always {total, count} (see ReportsService.
// buildPaymentMethodBreakdown / the expense category reduce). Format as a
// readable "KEY: total (count)" list instead of raw JSON.
function formatCountedBreakdown(
  breakdown: Record<string, { total: number; count: number }> | null | undefined,
): string {
  if (!breakdown) return '';
  return Object.entries(breakdown)
    .map(([key, v]) => `${key}: ${v.total} (${v.count})`)
    .join('; ');
}

// salesByProduct is already a well-shaped array (ReportsService's
// `productMap`), not dynamic-keyed — format each entry instead of
// JSON-stringifying the array.
function formatProductBreakdown(
  products:
    | Array<{ productName: string; sizeName?: string | null; quantity: number; amount: number }>
    | null
    | undefined,
): string {
  if (!products || products.length === 0) return '';
  return products
    .map((p) => `${p.productName}${p.sizeName ? ` (${p.sizeName})` : ''}: qty ${p.quantity}, amount ${p.amount}`)
    .join('; ');
}

interface SalesSnapshotLike {
  totalAmount: number;
  transactionCount: number;
  averageTransaction: number;
  totalItemsSold: number;
  paymentMethodBreakdown: Record<string, { total: number; count: number }> | null | undefined;
  salesByProduct?: Array<{ productName: string; sizeName?: string | null; quantity: number; amount: number }> | null;
}

interface ExpensesSnapshotLike {
  totalAmount: number;
  expenseCount: number;
  averageExpense: number;
  categoryBreakdown: Record<string, { total: number; count: number }> | null | undefined;
}

interface SummarySnapshotLike {
  grossProfit: number;
  profitMargin: number;
  netRevenue: number;
}

interface SubmittedReportLike {
  salesSnapshot: SalesSnapshotLike;
  expensesSnapshot: ExpensesSnapshotLike;
  summarySnapshot: SummarySnapshotLike;
  [key: string]: unknown;
}

export function flattenSubmittedReports(reports: SubmittedReportLike[]): string {
  const rows = reports.map((r) => {
    const { salesSnapshot, expensesSnapshot, summarySnapshot, ...rest } = r;
    return {
      ...rest,
      salesTotalAmount: salesSnapshot.totalAmount,
      salesTransactionCount: salesSnapshot.transactionCount,
      salesAverageTransaction: salesSnapshot.averageTransaction,
      salesTotalItemsSold: salesSnapshot.totalItemsSold,
      salesPaymentMethodBreakdown: formatCountedBreakdown(salesSnapshot.paymentMethodBreakdown),
      salesByProduct: formatProductBreakdown(salesSnapshot.salesByProduct),
      expensesTotalAmount: expensesSnapshot.totalAmount,
      expensesExpenseCount: expensesSnapshot.expenseCount,
      expensesAverageExpense: expensesSnapshot.averageExpense,
      expensesCategoryBreakdown: formatCountedBreakdown(expensesSnapshot.categoryBreakdown),
      summaryGrossProfit: summarySnapshot.grossProfit,
      summaryProfitMargin: summarySnapshot.profitMargin,
      summaryNetRevenue: summarySnapshot.netRevenue,
    };
  });
  return toCsv(rows);
}

// ─── Submitted inventory reports: split into reports + item rows ──────────

interface ExpirationBatchLike {
  quantity: number;
  expirationDate?: Date | null;
}

interface InventoryItemSnapshotLike {
  inventoryItemId: string;
  itemName: string;
  category: string;
  unit: string;
  quantity: number;
  previousQuantity?: number | null;
  minStockLevel?: number | null;
  recordDate: Date;
  requiresExpirationDate?: boolean | null;
  expirationWarningDays?: number | null;
  expirationBatches?: ExpirationBatchLike[];
  [key: string]: unknown;
}

interface SubmittedInventoryReportLike {
  // Links submitted-inventory-report-items.csv rows back to this report —
  // a precise timestamp (effectively unique per report) rather than the
  // raw Mongo `id`, so no ObjectId needs to appear in either file.
  submittedAt: Date;
  inventorySnapshot: {
    items: InventoryItemSnapshotLike[];
    totalItems: number;
    submittedBy: string;
  };
  [key: string]: unknown;
}

export function flattenSubmittedInventoryReports(
  reports: SubmittedInventoryReportLike[],
): { reportsCsv: string; itemsCsv: string } {
  const reportRows = reports.map(({ inventorySnapshot, ...rest }) => ({
    ...rest,
    totalItems: inventorySnapshot.totalItems,
    submittedBy: inventorySnapshot.submittedBy,
  }));

  const itemRows = reports.flatMap((r) =>
    r.inventorySnapshot.items.map((item) => {
      // inventoryItemId dropped — itemName (right below) already identifies
      // the item; keeping both would just reintroduce a raw id column.
      const { inventoryItemId: _inventoryItemId, expirationBatches, ...itemRest } = item;
      return {
        reportSubmittedAt: r.submittedAt,
        ...itemRest,
        expirationBatches: (expirationBatches ?? [])
          .map((b) => `${b.quantity}@${b.expirationDate ? new Date(b.expirationDate).toISOString() : 'none'}`)
          .join('; '),
      };
    }),
  );

  return {
    reportsCsv: toCsv(reportRows),
    itemsCsv: toCsv(itemRows),
  };
}
