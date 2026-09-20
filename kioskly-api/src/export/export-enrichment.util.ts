// ─────────────────────────────────────────────────────────────────────────────
// ID → human-readable name resolution for the CSV export. Pure functions —
// no DB access here; export.service.ts batch-fetches the lookup records
// (Users/Products/Sizes/Preferences/Addons/Categories/Menus) and these
// functions replace foreign-key id columns with the resolved name, and
// drop every column that isn't useful to a person reading the CSV:
// `tenantId` (redundant — the whole export is already scoped to one
// store), `tombstone` (the caller only ever fetches non-tombstoned rows,
// so it would just be a column of zeroes), `clientId` (an opaque
// device-generated sync token, not business data), and each row's own
// raw Mongo `id` — a row's identity is its content, not an ObjectId, and
// wherever another file needs to reference a row it links via a
// human-meaningful field instead (see export-csv.util.ts).
// ─────────────────────────────────────────────────────────────────────────────

export function buildIdNameMap(records: Array<{ id: string; name: string }>): Map<string, string> {
  return new Map(records.map((r) => [r.id, r.name]));
}

/** Prefers "First Last" when either name is set; falls back to username. */
export function buildUserDisplayNameMap(
  users: Array<{ id: string; username: string; firstName?: string | null; lastName?: string | null }>,
): Map<string, string> {
  return new Map(
    users.map((u) => {
      const fullName = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
      return [u.id, fullName || u.username];
    }),
  );
}

/** Falls back to the raw id (rather than blanking it) if a referenced record wasn't found — e.g. a hard-deleted row. */
function resolveName(map: Map<string, string>, id: string | null | undefined): string {
  if (!id) return '';
  return map.get(id) ?? id;
}

/**
 * Drops tombstoned (soft-deleted) rows before they'd become their own CSV
 * row. Only meaningful for models with a `tombstone` field (see
 * export.service.ts's call sites) — those queries could still return a
 * tombstoned row on purpose (e.g. InventoryItem, kept fetchable so a
 * historical record can still resolve its name), so the exclusion happens
 * here, right before that data becomes its own listing, not at every query.
 */
export function filterActive<T extends { tombstone?: number }>(rows: T[]): T[] {
  return rows.filter((r) => r.tombstone !== 1);
}

// ─── Company export: catalog rows carry menuId (+ Product also categoryId) ─

export function enrichCatalogRow<T extends { id?: string; menuId?: string | null; tombstone?: number }>(
  row: T,
  menuNames: Map<string, string>,
): Omit<T, 'id' | 'menuId' | 'tombstone'> & { menuName: string } {
  const { id: _id, menuId, tombstone: _tombstone, ...rest } = row;
  return { ...rest, menuName: resolveName(menuNames, menuId) };
}

export function enrichProduct<
  T extends { id?: string; menuId?: string | null; categoryId?: string | null; tombstone?: number },
>(
  row: T,
  menuNames: Map<string, string>,
  categoryNames: Map<string, string>,
): Omit<T, 'id' | 'menuId' | 'categoryId' | 'tombstone'> & { menuName: string; categoryName: string } {
  const { id: _id, menuId, categoryId, tombstone: _tombstone, ...rest } = row;
  return {
    ...rest,
    menuName: resolveName(menuNames, menuId),
    categoryName: resolveName(categoryNames, categoryId),
  };
}

// ─── Store export ───────────────────────────────────────────────────────────

interface TransactionItemAddonRefLike {
  addonId: string;
  [key: string]: unknown;
}

interface TransactionItemRefLike {
  id?: string;
  productId: string;
  sizeId: string | null;
  preferenceId: string | null;
  addons?: TransactionItemAddonRefLike[];
  [key: string]: unknown;
}

interface TransactionRefLike {
  id?: string;
  tenantId?: string;
  clientId?: string | null;
  userId: string;
  voidRequestedBy?: string | null;
  voidReviewedBy?: string | null;
  items?: TransactionItemRefLike[];
  [key: string]: unknown;
}

export function enrichTransactions(
  transactions: TransactionRefLike[],
  userNames: Map<string, string>,
  productNames: Map<string, string>,
  sizeNames: Map<string, string>,
  preferenceNames: Map<string, string>,
  addonNames: Map<string, string>,
) {
  return transactions.map((t) => {
    const {
      id: _id,
      tenantId: _tenantId,
      clientId: _clientId,
      userId,
      voidRequestedBy,
      voidReviewedBy,
      items,
      ...rest
    } = t;
    return {
      ...rest,
      submittedBy: resolveName(userNames, userId),
      voidRequestedBy: resolveName(userNames, voidRequestedBy),
      voidReviewedBy: resolveName(userNames, voidReviewedBy),
      items: (items ?? []).map((item) => {
        const { id: _itemId, productId, sizeId, preferenceId, addons, ...itemRest } = item;
        return {
          ...itemRest,
          productName: resolveName(productNames, productId),
          sizeName: resolveName(sizeNames, sizeId),
          preferenceName: resolveName(preferenceNames, preferenceId),
          addons: (addons ?? []).map((a) => ({ name: resolveName(addonNames, a.addonId) })),
        };
      }),
    };
  });
}

interface ExpenseRefLike {
  id?: string;
  tenantId?: string;
  clientId?: string | null;
  userId: string;
  voidRequestedBy?: string | null;
  voidReviewedBy?: string | null;
  receipt?: string | null;
  [key: string]: unknown;
}

export function enrichExpenses(expenses: ExpenseRefLike[], userNames: Map<string, string>) {
  return expenses.map((e) => {
    // `receipt` is a photo filename (e.g. "receipt-12345.jpg"), not data —
    // same "no pictures" rule as attendance's photoUrl.
    const {
      id: _id,
      tenantId: _tenantId,
      clientId: _clientId,
      userId,
      voidRequestedBy,
      voidReviewedBy,
      receipt: _receipt,
      ...rest
    } = e;
    return {
      ...rest,
      submittedBy: resolveName(userNames, userId),
      voidRequestedBy: resolveName(userNames, voidRequestedBy),
      voidReviewedBy: resolveName(userNames, voidReviewedBy),
    };
  });
}

interface InventoryRecordRefLike {
  id?: string;
  tenantId?: string;
  clientId?: string | null;
  userId: string;
  inventoryItemId: string;
  [key: string]: unknown;
}

export function enrichInventoryRecords(
  records: InventoryRecordRefLike[],
  userNames: Map<string, string>,
  itemNames: Map<string, string>,
) {
  return records.map((r) => {
    const { id: _id, tenantId: _tenantId, clientId: _clientId, userId, inventoryItemId, ...rest } = r;
    return {
      ...rest,
      submittedBy: resolveName(userNames, userId),
      itemName: resolveName(itemNames, inventoryItemId),
    };
  });
}

interface InventoryItemRefLike {
  id?: string;
  categoryId?: string | null;
  inventorySetupId?: string | null;
  tombstone?: number;
  [key: string]: unknown;
}

export function enrichInventoryItems(
  items: InventoryItemRefLike[],
  categoryNames: Map<string, string>,
  inventorySetupNames: Map<string, string>,
) {
  return items.map((i) => {
    const { id: _id, categoryId, inventorySetupId, tombstone: _tombstone, ...rest } = i;
    return {
      ...rest,
      categoryName: resolveName(categoryNames, categoryId),
      inventorySetupName: resolveName(inventorySetupNames, inventorySetupId),
    };
  });
}

interface SubmittedReportRefLike {
  id?: string;
  tenantId?: string;
  clientId?: string | null;
  userId: string;
  transactionIds?: string[];
  expenseIds?: string[];
  [key: string]: unknown;
}

/**
 * transactionRefNames/expenseRefNames map a Transaction/Expense's own `id`
 * to something a person recognizes (the transaction's own receipt-style
 * `transactionId`, an expense's `description`) — built from this same
 * store's already-fetched transactions/expenses, not a fresh query.
 */
export function enrichSubmittedReports<T extends SubmittedReportRefLike>(
  reports: T[],
  userNames: Map<string, string>,
  transactionRefNames: Map<string, string>,
  expenseRefNames: Map<string, string>,
) {
  return reports.map((r) => {
    const {
      id: _id,
      tenantId: _tenantId,
      clientId: _clientId,
      userId,
      transactionIds,
      expenseIds,
      ...rest
    } = r;
    return {
      ...rest,
      submittedBy: resolveName(userNames, userId),
      transactions: (transactionIds ?? []).map((id) => resolveName(transactionRefNames, id)),
      expenses: (expenseIds ?? []).map((id) => resolveName(expenseRefNames, id)),
    };
  });
}

interface SubmittedInventoryReportRefLike {
  id?: string;
  tenantId?: string;
  clientId?: string | null;
  userId: string;
  [key: string]: unknown;
}

// `id` is dropped here too — flattenSubmittedInventoryReports links its
// child item rows back to this report via `submittedAt` instead (kept,
// since it isn't destructured out below), never the raw Mongo id.
export function enrichSubmittedInventoryReportsTop<T extends SubmittedInventoryReportRefLike>(
  reports: T[],
  userNames: Map<string, string>,
) {
  return reports.map((r) => {
    const { id: _id, tenantId: _tenantId, clientId: _clientId, userId, ...rest } = r;
    return { ...rest, submittedByUser: resolveName(userNames, userId) };
  });
}

interface StaffTimeLogRefLike {
  id?: string;
  userId: string;
  [key: string]: unknown;
}

// `photoUrl` is deliberately never selected by the caller's Prisma query in
// the first place (not just stripped here) — this export is data only, no
// images, so the clock-in/out verification selfie never leaves the DB.
export function enrichStaffTimeLogs<T extends StaffTimeLogRefLike>(
  logs: T[],
  userNames: Map<string, string>,
) {
  return logs.map((l) => {
    const { id: _id, userId, ...rest } = l;
    return { ...rest, staffName: resolveName(userNames, userId) };
  });
}
