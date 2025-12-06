import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Reactotron from "../ReactotronConfig";

const TENANT_SLUG_KEY = "@kioskly:tenant_slug";

export interface ThemeColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  description?: string;
  logoUrl?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  themeColors?: ThemeColors;
  isActive: boolean;
}

interface TenantContextType {
  tenant: Tenant | null;
  setTenant: (tenant: Tenant | null) => void;
  loading: boolean;
  error: string | null;
  fetchTenantBySlug: (slug: string) => Promise<void>;
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
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTenantBySlug = useCallback(async (slug: string) => {
    setLoading(true);
    setError(null);
    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL;
      if (!apiUrl) {
        throw new Error(
          "API URL is not configured. Please set EXPO_PUBLIC_API_URL in your .env file"
        );
      }
      const response = await fetch(`${apiUrl}/tenants/slug/${slug}`);

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

      Reactotron.display({
        name: "TENANT LOADED",
        value: { id: tenantWithTheme.id, name: tenantWithTheme.name, slug: tenantWithTheme.slug },
        preview: `Loaded ${tenantWithTheme.name}`
      });

      setTenant(tenantWithTheme);

      // Store the slug in AsyncStorage for persistence
      await AsyncStorage.setItem(TENANT_SLUG_KEY, slug);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch tenant");
      setTenant(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const clearTenant = useCallback(async () => {
    setTenant(null);
    setError(null);
    // Clear the stored slug from AsyncStorage
    await AsyncStorage.removeItem(TENANT_SLUG_KEY);
  }, []);

  const loadStoredTenant = useCallback(async () => {
    try {
      const storedSlug = await AsyncStorage.getItem(TENANT_SLUG_KEY);
      if (storedSlug) {
        await fetchTenantBySlug(storedSlug);
      }
    } catch (err) {
      console.error("Failed to load stored tenant:", err);
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
        setTenant,
        loading,
        error,
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
