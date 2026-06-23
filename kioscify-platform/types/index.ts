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
  company?: {
    slug: string;
    canOnboardStores: boolean;
  };
  enabledDeliveryPlatforms?: string[];
  preferenceLabel?: string;
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
  enabledDeliveryPlatforms?: string[];
  priceTier?: PriceTier;
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

export interface AppRelease {
  id: string;
  versionCode: number;
  versionName: string;
  apkPath: string;
  apkUrl: string;
  fileSize: number;
  checksumSha256: string;
  releaseNotes: string[];
  forceUpdate: boolean;
  status: 'DRAFT' | 'PUBLISHED';
  uploadedById?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PriceTier {
  id: string;
  name: string;
  isDefault: boolean;
  brandId: string;
}

export interface ProductPriceTier {
  tierId: string;
  price: number;
  foodpandaPrice?: number | null;
  grabPrice?: number | null;
}

export interface SizePriceTier {
  tierId: string;
  priceModifier: number;
  foodpandaPrice?: number | null;
  grabPrice?: number | null;
}

export interface AddonPriceTier {
  tierId: string;
  price: number;
  foodpandaPrice?: number | null;
  grabPrice?: number | null;
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
  preferences?: Preference[];
  priceTiers?: ProductPriceTier[];
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
  priceTiers?: SizePriceTier[];
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
  priceTiers?: AddonPriceTier[];
  brandId?: string;
  tenantId?: string;
  sequenceNo?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Preference {
  id: string;
  name: string;
  isDefault?: boolean;
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
