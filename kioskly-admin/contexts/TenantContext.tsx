'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { Tenant } from '@/types';

const TENANT_SLUG_KEY = 'kioskly_tenant_slug';
const TENANT_DATA_KEY = 'kioskly_tenant_data';

interface TenantContextType {
  tenant: Tenant | null;
  setTenant: (tenant: Tenant | null) => void;
  loading: boolean;
  error: string | null;
  fetchTenantBySlug: (slug: string) => Promise<void>;
  clearTenant: () => void;
  loadStoredTenant: () => Promise<void>;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export const TenantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTenantBySlug = useCallback(async (slug: string) => {
    setLoading(true);
    setError(null);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
      const response = await fetch(`${apiUrl}/tenants/slug/${slug}`);

      if (!response.ok) {
        throw new Error('Tenant not found. Please check the store ID and try again.');
      }

      const data = await response.json();
      setTenant(data);

      // Store both slug and full tenant data in localStorage for persistence
      if (typeof window !== 'undefined') {
        localStorage.setItem(TENANT_SLUG_KEY, slug);
        localStorage.setItem(TENANT_DATA_KEY, JSON.stringify(data));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch tenant');
      setTenant(null);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const clearTenant = useCallback(() => {
    setTenant(null);
    setError(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(TENANT_SLUG_KEY);
      localStorage.removeItem(TENANT_DATA_KEY);
    }
  }, []);

  const loadStoredTenant = useCallback(async () => {
    if (typeof window === 'undefined') {
      setLoading(false);
      return;
    }

    try {
      // First try to load from stored tenant data (instant)
      const storedTenantData = localStorage.getItem(TENANT_DATA_KEY);
      if (storedTenantData) {
        const parsedTenant = JSON.parse(storedTenantData);
        setTenant(parsedTenant);
        setLoading(false);
        console.log('✅ Tenant loaded from cache:', parsedTenant.name);
        return;
      }

      // Fallback: fetch by slug if only slug is stored
      const storedSlug = localStorage.getItem(TENANT_SLUG_KEY);
      if (storedSlug) {
        console.log('🔄 Fetching tenant by slug:', storedSlug);
        await fetchTenantBySlug(storedSlug);
      } else {
        setLoading(false);
      }
    } catch (err) {
      console.error('Failed to load stored tenant:', err);
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
