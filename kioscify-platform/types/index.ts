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
  themeColors?: ThemeColors;
  canCreateBrands: boolean;
  canOnboardStores: boolean;
  isActive: boolean;
  brandCount?: number;
  storeCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ThemeColors {
  primary?: string;
  secondary?: string;
  accent?: string;
  background?: string;
  text?: string;
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
  description?: string;
  logoUrl?: string;
  themeColors?: ThemeColors;
  companyId: string;
  isActive: boolean;
  storeCount?: number;
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
  brand?: { id: string; name: string; slug: string };
}

export interface PlatformStats {
  totalCompanies: number;
  totalBrands: number;
  totalStores: number;
  monthlyActiveStores: number;
}

export interface MaintenanceStatus {
  storePortalMaintenance: boolean;
  companyPortalMaintenance: boolean;
  mobileAppMaintenance: boolean;
}

export interface AuthResponse {
  accessToken: string;
  mustChangePassword?: boolean;
  user: User;
}

export interface OnboardAdminPayload {
  firstName: string;
  lastName: string;
  email: string;
  username: string;
}

export interface OnboardStorePayload {
  storeName: string;
  storeSlug: string;
  brandId: string;
  companyId: string;
  admin: OnboardAdminPayload;
}
