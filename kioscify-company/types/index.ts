export interface User {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
  isFirstLogin: boolean;
  mustChangePassword: boolean;
  companyId?: string;
  brandId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Company {
  id: string;
  name: string;
  slug: string;
  description?: string;
  logoUrl?: string;
  contactEmail?: string;
  canCreateBrands: boolean;
  canOnboardStores: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
  description?: string;
  logoUrl?: string;
  companyId: string;
  company?: {
    slug: string;
    canOnboardStores: boolean;
  };
  themeColors?: {
    primary?: string;
    secondary?: string;
    accent?: string;
    background?: string;
    text?: string;
  };
  enabledDeliveryPlatforms?: string[];
  isActive: boolean;
  storeCount?: number;
  productCount?: number;
  inventoryItemCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Store {
  id: string;
  name: string;
  slug: string;
  brandId: string;
  companyId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  type: 'PRODUCT' | 'INVENTORY';
  description?: string;
  sequenceNo?: number;
  brandId?: string;
  tenantId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  foodpandaPrice?: number | null;
  grabPrice?: number | null;
  categoryId: string;
  category?: Category;
  image?: string;
  sizes?: Size[];
  addons?: Addon[];
  brandId?: string;
  tenantId?: string;
  isAvailable: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Size {
  id: string;
  name: string;
  priceModifier: number;
  foodpandaPrice?: number | null;
  grabPrice?: number | null;
  brandId?: string;
  tenantId?: string;
  sequenceNo?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Addon {
  id: string;
  name: string;
  price: number;
  foodpandaPrice?: number | null;
  grabPrice?: number | null;
  brandId?: string;
  tenantId?: string;
  sequenceNo?: number;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryBrandTemplate {
  id: string;
  name: string;
  unit: string;
  category?: string;
  description?: string;
  minStockLevel?: number;
  requiresExpirationDate?: boolean;
  expirationWarningDays?: number;
  brandId: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  accessToken: string;
  mustChangePassword?: boolean;
  user: User;
}

export interface CompanyUserCreatePayload {
  firstName: string;
  lastName: string;
  email: string;
  username: string;
}

export interface AnalyticsOverview {
  totalBrands: number;
  totalStores: number;
  activeStores: number;
}

export interface TopBrandItem {
  brandId: string;
  brandName: string;
  totalRevenue: number;
  storeCount: number;
  transactionCount: number;
}

export interface TopProductItem {
  productId: string;
  productName: string;
  unitsSold: number;
  totalRevenue: number;
}

export interface TopStoreItem {
  storeId: string;
  storeName: string;
  brandId: string;
  brandName: string;
  totalRevenue: number;
  transactionCount: number;
}

export interface GrowthDataPoint {
  date: string;
  storeCount: number;
  brandCount: number;
}
