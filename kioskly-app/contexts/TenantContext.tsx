import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { safeReactotron } from "../utils/reactotron";

const TENANT_SLUG_KEY = "@kioscify:store_slug";
const BRAND_DATA_KEY = "@kioscify:brand_data";
const COMPANY_DATA_KEY = "@kioscify:company_data";

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
  enabledDeliveryPlatforms?: string[];
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
  description?: string;
  logoUrl?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  themeColors?: ThemeColors;
  isActive: boolean;
  brand?: Brand;
  company?: Company;
}

interface TenantContextType {
  tenant: Tenant | null;
  brand: Brand | null;
  company: Company | null;
  brandId: string | null;
  companyId: string | null;
  setTenant: (tenant: Tenant | null) => void;
  loading: boolean;
  error: string | null;
  initializing: boolean;
  fetchTenantBySlug: (slug: string, options?: { companySlug?: string; brandSlug?: string }) => Promise<void>;
  clearTenant: () => Promise<void>;
  loadStoredTenant: () => Promise<void>;
}

const defaultTheme: ThemeColors = {
  primary: "#ea580c",
  secondary: "#fb923c",
  accent: "#fdba74",
  background: "#ffffff",
  text: "#1f2937",
};

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export const TenantProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [initializing, setInitializing] = useState<boolean>(true);

  const fetchTenantBySlug = useCallback(async (
    slug: string,
    options?: { companySlug?: string; brandSlug?: string },
  ) => {
    setLoading(true);
    setError(null);
    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL;
      if (!apiUrl) {
        throw new Error(
          "API URL is not configured. Please set EXPO_PUBLIC_API_URL in your .env file"
        );
      }
      const params = new URLSearchParams();
      if (options?.companySlug) params.set('companySlug', options.companySlug);
      if (options?.brandSlug) params.set('brandSlug', options.brandSlug);
      const query = params.toString() ? `?${params.toString()}` : '';
      const response = await fetch(`${apiUrl}/stores/slug/${slug}${query}`);

      if (!response.ok) {
        throw new Error("Tenant not found");
      }
      const data = await response.json();

      // Apply default theme colors if none provided
      const tenantWithTheme = {
        ...data,
        themeColors: data.themeColors || defaultTheme,
      };

      console.log("🟢 TENANT LOADED:", {
        id: tenantWithTheme.id,
        name: tenantWithTheme.name,
        slug: tenantWithTheme.slug,
      });

      safeReactotron.display({
        name: "TENANT LOADED",
        value: { id: tenantWithTheme.id, name: tenantWithTheme.name, slug: tenantWithTheme.slug },
        preview: `Loaded ${tenantWithTheme.name}`
      });

      setTenant(tenantWithTheme);

      // Store brand and company data
      if (tenantWithTheme.brand) {
        setBrand(tenantWithTheme.brand);
        await AsyncStorage.setItem(BRAND_DATA_KEY, JSON.stringify(tenantWithTheme.brand));
      }
      if (tenantWithTheme.company) {
        setCompany(tenantWithTheme.company);
        await AsyncStorage.setItem(COMPANY_DATA_KEY, JSON.stringify(tenantWithTheme.company));
      }

      await AsyncStorage.setItem(TENANT_SLUG_KEY, slug);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch tenant");
      setTenant(null);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const clearTenant = useCallback(async () => {
    setTenant(null);
    setBrand(null);
    setCompany(null);
    setError(null);
    await AsyncStorage.multiRemove([TENANT_SLUG_KEY, BRAND_DATA_KEY, COMPANY_DATA_KEY]);
  }, []);

  const loadStoredTenant = useCallback(async () => {
    try {
      const [[, storedSlug], [, storedBrand], [, storedCompany]] =
        await AsyncStorage.multiGet([TENANT_SLUG_KEY, BRAND_DATA_KEY, COMPANY_DATA_KEY]);
      if (storedSlug) {
        const brandData = storedBrand ? JSON.parse(storedBrand) : null;
        const companyData = storedCompany ? JSON.parse(storedCompany) : null;
        await fetchTenantBySlug(storedSlug, {
          companySlug: companyData?.slug,
          brandSlug: brandData?.slug,
        });
      }
    } catch (err) {
      console.error("Failed to load stored tenant:", err);
    } finally {
      setInitializing(false);
    }
  }, [fetchTenantBySlug]);

  // Auto-load tenant from storage on mount
  useEffect(() => {
    loadStoredTenant();
  }, [loadStoredTenant]);

  return (
    <TenantContext.Provider
      value={{
        tenant,
        brand,
        company,
        brandId: brand?.id ?? tenant?.brandId ?? null,
        companyId: company?.id ?? tenant?.companyId ?? null,
        setTenant,
        loading,
        error,
        initializing,
        fetchTenantBySlug,
        clearTenant,
        loadStoredTenant,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
};

export const useTenant = (): TenantContextType => {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error("useTenant must be used within a TenantProvider");
  }
  return context;
};
