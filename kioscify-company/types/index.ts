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
  brandId?: string;
  tenantId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  categoryId: string;
  category?: Category;
  imageUrl?: string;
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
  brandId?: string;
  tenantId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Addon {
  id: string;
  name: string;
  price: number;
  brandId?: string;
  tenantId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryBrandTemplate {
  id: string;
  name: string;
  unit: string;
  category?: string;
  minStockLevel?: number;
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
