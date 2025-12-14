export interface Tenant {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  themeColors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  tenantId: string;
  username: string;
  email?: string;
  role: 'ADMIN' | 'CASHIER';
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Size {
  id: string;
  tenantId: string;
  name: string;
  priceModifier: number;
  createdAt: string;
  updatedAt: string;
}

export interface Addon {
  id: string;
  tenantId: string;
  name: string;
  price: number;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  tenantId: string;
  categoryId: string;
  name: string;
  description?: string;
  basePrice: number;
  imageUrl?: string;
  available: boolean;
  category?: Category;
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
  addons?: Addon[];
}

export interface Transaction {
  id: string;
  transactionId: string;
  tenantId: string;
  userId: string;
  subtotal: number;
  total: number;
  paymentMethod: 'CASH' | 'CARD' | 'GCASH' | 'PAYMAYA' | 'ONLINE';
  cashReceived?: number | null;
  change?: number | null;
  referenceNumber?: string | null;
  remarks?: string | null;
  timestamp: string;
  paymentStatus?: 'PENDING' | 'COMPLETED' | 'FAILED';
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
  tenantId?: string;
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
  name: string;
  category: string;
  unit: string;
  description?: string;
  minStockLevel?: number;
  createdAt: string;
  updatedAt: string;
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
