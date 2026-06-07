'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { Tenant, Brand, Company } from '@/types';

const STORE_SLUG_KEY = 'kioscify_store_slug';
const STORE_DATA_KEY = 'kioscify_store_data';
const BRAND_DATA_KEY = 'kioscify_brand_data';
const COMPANY_DATA_KEY = 'kioscify_company_data';

interface TenantContextType {
  tenant: Tenant | null;
  brand: Brand | null;
  company: Company | null;
  brandId: string | null;
  companyId: string | null;
  setTenant: (tenant: Tenant | null) => void;
  loading: boolean;
  error: string | null;
  fetchTenantBySlug: (slug: string) => Promise<void>;
  clearTenant: () => void;
  loadStoredTenant: () => Promise<void>;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export const TenantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tenant, setTenantState] = useState<Tenant | null>(null);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const setTenant = useCallback((t: Tenant | null) => {
    setTenantState(t);
    if (t) {
      if (t.brand) setBrand(t.brand);
      if (t.company) setCompany(t.company);
    } else {
      setBrand(null);
      setCompany(null);
    }
  }, []);

  const fetchTenantBySlug = useCallback(async (slug: string) => {
    setLoading(true);
    setError(null);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';
      const response = await fetch(`${apiUrl}/stores/slug/${slug}`);

      if (!response.ok) {
        throw new Error('Store not found. Please check the Store ID and try again.');
      }

      const data: Tenant = await response.json();
      setTenant(data);

      if (typeof window !== 'undefined') {
        localStorage.setItem(STORE_SLUG_KEY, slug);
        localStorage.setItem(STORE_DATA_KEY, JSON.stringify(data));
        if (data.brand) localStorage.setItem(BRAND_DATA_KEY, JSON.stringify(data.brand));
        if (data.company) localStorage.setItem(COMPANY_DATA_KEY, JSON.stringify(data.company));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch store');
      setTenant(null);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [setTenant]);

  const clearTenant = useCallback(() => {
    setTenant(null);
    setError(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORE_SLUG_KEY);
      localStorage.removeItem(STORE_DATA_KEY);
      localStorage.removeItem(BRAND_DATA_KEY);
      localStorage.removeItem(COMPANY_DATA_KEY);
    }
  }, [setTenant]);

  const loadStoredTenant = useCallback(async () => {
    if (typeof window === 'undefined') {
      setLoading(false);
      return;
    }
    try {
      const storedData = localStorage.getItem(STORE_DATA_KEY);
      if (storedData) {
        const parsed: Tenant = JSON.parse(storedData);
        setTenantState(parsed);

        const storedBrand = localStorage.getItem(BRAND_DATA_KEY);
        if (storedBrand) setBrand(JSON.parse(storedBrand));

        const storedCompany = localStorage.getItem(COMPANY_DATA_KEY);
        if (storedCompany) setCompany(JSON.parse(storedCompany));

        setLoading(false);
        return;
      }

      const storedSlug = localStorage.getItem(STORE_SLUG_KEY);
      if (storedSlug) {
        await fetchTenantBySlug(storedSlug);
      } else {
        setLoading(false);
      }
    } catch (err) {
      console.error('Failed to load stored store:', err);
      setLoading(false);
    }
  }, [fetchTenantBySlug]);

  useEffect(() => {
    loadStoredTenant();
  }, []);

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
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
};
