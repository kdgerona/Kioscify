export interface ThemeColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
}

export interface Brand {
  id: string;
  companyId: string;
  name: string;
  slug: string;
  logoUrl?: string;
  themeColors?: ThemeColors;
  isActive: boolean;
}

export interface Company {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
}

export interface Tenant {
  id: string;
  brandId?: string;
  companyId?: string;
  name: string;
  slug: string;
  logoUrl?: string;
  themeColors?: ThemeColors;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  brand?: Brand;
  company?: Company;
}

export interface StoreRef {
  id: string;
  name: string;
  slug: string;
}

export interface User {
  id: string;
  tenantId?: string;
  companyId?: string;
  brandId?: string;
  username: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  role: "STORE_ADMIN" | "CASHIER" | "ADMIN" | "COMPANY_ADMIN" | "PLATFORM_ADMIN";
  isActive?: boolean;
  isFirstLogin?: boolean;
  createdAt: string;
  updatedAt: string;
  isAssigned?: boolean;
  assignedRole?: "STORE_ADMIN" | "CASHIER";
  primaryStore?: StoreRef;
}

export interface AssignableUser {
  id: string;
  username: string;
  firstName?: string;
  lastName?: string;
  role: "STORE_ADMIN" | "CASHIER" | "ADMIN";
  primaryStore?: StoreRef;
  brandName?: string;
}

export interface StoreAccess {
  id: string;
  tenantId: string;
  role: "STORE_ADMIN" | "CASHIER";
  isActive: boolean;
  tenant: StoreRef;
}

export interface Category {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  sequenceNo?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Size {
  id: string;
  tenantId: string;
  name: string;
  priceModifier: number;
  foodpandaPrice?: number | null;
  grabPrice?: number | null;
  volume?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Addon {
  id: string;
  tenantId: string;
  name: string;
  price: number;
  foodpandaPrice?: number | null;
  grabPrice?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  tenantId: string;
  categoryId: string;
  name: string;
  price: number;
  foodpandaPrice?: number | null;
  grabPrice?: number | null;
  image?: string;
  category?: Category;
  sizes?: Size[];
  addons?: Addon[];
  createdAt: string;
  updatedAt: string;
}

export interface TransactionItem {
  id: string;
  transactionId?: string;
  productId: string;
  sizeId?: string;
  quantity: number;
  subtotal: number;
  product?: Product;
  size?: Size;
  addons?: { addon: Addon }[];
}

export interface Transaction {
  id: string;
  transactionId: string;
  tenantId: string;
  userId: string;
  subtotal: number;
  discountAmount?: number | null;
  total: number;
  paymentMethod: "CASH" | "GCASH" | "PAYMAYA" | "ONLINE" | "FOODPANDA" | "GRAB";
  cashReceived?: number | null;
  change?: number | null;
  referenceNumber?: string | null;
  remarks?: string | null;
  timestamp: string;
  paymentStatus?: "PENDING" | "COMPLETED" | "FAILED";
  voidStatus?: "NONE" | "PENDING" | "APPROVED" | "REJECTED";
  voidReason?: string | null;
  voidRequestedBy?: string | null;
  voidRequestedAt?: string | null;
  voidReviewedBy?: string | null;
  voidReviewedAt?: string | null;
  voidRejectionReason?: string | null;
  voidRequester?: User;
  voidReviewer?: User;
  items?: TransactionItem[];
  user?: User;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  accessToken: string;
  user: User;
  tenant?: Tenant;
}

export interface LoginCredentials {
  username: string;
  password: string;
  storeSlug: string;
  companySlug?: string;
}

export interface StoreUserCreatePayload {
  firstName: string;
  lastName: string;
  email: string;
  username: string;
  role: "STORE_ADMIN" | "CASHIER";
}

export interface TimeOfDayData {
  hour: number;
  count: number;
  totalRevenue: number;
}

export interface ApiError {
  message: string;
  statusCode: number;
  error?: string;
}

// Inventory types
export interface InventoryItem {
  id: string;
  tenantId: string;
  templateId?: string;
  name: string;
  category: string;
  unit: string;
  description?: string;
  minStockLevel?: number;
  minStockLevelCustomized?: boolean;
  requiresExpirationDate?: boolean;
  expirationWarningDays?: number;
  expirationWarningDaysCustomized?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ExpirationBatch {
  quantity: number;
  expirationDate?: string;
}

export interface InventoryRecord {
  id: string;
  tenantId: string;
  inventoryItemId: string;
  userId: string;
  quantity: number;
  date: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  inventoryItem?: InventoryItem;
  user?: User;
}

export interface LatestInventoryItem extends InventoryItem {
  latestQuantity?: number;
  latestRecordDate?: string;
  previousQuantity?: number;
}

export interface InventoryStats {
  totalItems: number;
  lowStockCount: number;
  itemsWithoutRecords: number;
  lowStockItems: Array<{
    id: string;
    name: string;
    category: string;
    latestQuantity: number;
    minStockLevel: number;
  }>;
}

// Expense types
export interface Expense {
  id: string;
  tenantId: string;
  userId: string;
  description: string;
  amount: number;
  category:
    | "SUPPLIES"
    | "UTILITIES"
    | "RENT"
    | "SALARIES"
    | "MARKETING"
    | "MAINTENANCE"
    | "TRANSPORTATION"
    | "MISCELLANEOUS";
  date: string;
  receipt?: string;
  notes?: string;
  voidStatus?: "NONE" | "PENDING" | "APPROVED" | "REJECTED";
  voidReason?: string | null;
  voidRequestedBy?: string | null;
  voidRequestedAt?: string | null;
  voidReviewedBy?: string | null;
  voidReviewedAt?: string | null;
  voidRejectionReason?: string | null;
  voidRequester?: User;
  voidReviewer?: User;
  createdAt: string;
  updatedAt: string;
  user?: User;
}

// Submitted Reports types
export interface SalesSnapshot {
  totalAmount: number;
  transactionCount: number;
  averageTransaction: number;
  totalItemsSold: number;
  paymentMethodBreakdown: Record<string, { total: number; count: number }>;
}

export interface ExpensesSnapshot {
  totalAmount: number;
  expenseCount: number;
  averageExpense: number;
  categoryBreakdown: Record<string, { total: number; count: number }>;
}

export interface SummarySnapshot {
  grossProfit: number;
  profitMargin: number;
  netRevenue: number;
}

export interface SubmittedReport {
  id: string;
  tenantId: string;
  userId: string;
  reportDate: string;
  submittedAt: string;
  periodStart: string;
  periodEnd: string;
  salesSnapshot: SalesSnapshot;
  expensesSnapshot: ExpensesSnapshot;
  summarySnapshot: SummarySnapshot;
  transactionIds: string[];
  expenseIds: string[];
  transactions?: Transaction[];
  expenses?: Expense[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
  user?: User;
}
