'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Company } from '@/types';

interface CompanyContextValue {
  company: Company | null;
  refetchCompany: () => Promise<void>;
}

const CompanyContext = createContext<CompanyContextValue>({
  company: null,
  refetchCompany: async () => {},
});

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const [company, setCompany] = useState<Company | null>(null);

  const refetchCompany = useCallback(async () => {
    try {
      const data = await api.getMyCompany();
      setCompany(data);
    } catch {
      // silent — layout handles auth redirect
    }
  }, []);

  useEffect(() => {
    refetchCompany();
  }, [refetchCompany]);

  return (
    <CompanyContext.Provider value={{ company, refetchCompany }}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  return useContext(CompanyContext);
}
