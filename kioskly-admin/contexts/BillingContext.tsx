"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { BillingMe } from "@/types";

interface BillingContextValue {
  me: BillingMe | null;
  /** The last fetch failed (me keeps the previous value, if any). */
  loadFailed: boolean;
  refresh: () => Promise<BillingMe | null>;
}

const BillingContext = createContext<BillingContextValue>({ me: null, loadFailed: false, refresh: async () => null });

const REFRESH_MS = 5 * 60_000;

/**
 * This store's billing status. Fails open: if it can't be fetched the
 * portal behaves exactly as without billing (no banner, no lock).
 */
export function BillingProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<BillingMe | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const next = await api.getBillingMe();
      setMe(next);
      setLoadFailed(false);
      return next;
    } catch {
      setLoadFailed(true);
      return null;
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = window.setInterval(refresh, REFRESH_MS);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  return <BillingContext.Provider value={{ me, loadFailed, refresh }}>{children}</BillingContext.Provider>;
}

export function useBilling() {
  return useContext(BillingContext);
}
