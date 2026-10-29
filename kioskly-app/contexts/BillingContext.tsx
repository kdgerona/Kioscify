import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "./AuthContext";
import { apiRequest } from "../utils/api";
import { setBillingLockedHandler } from "../utils/billingEvents";
import { effectiveBillingStatus } from "../utils/billingStatus";

export const BILLING_CACHE_KEY = "@kioscify:billing_status";
const REFRESH_MS = 5 * 60_000;

export type BillingStatus = "EXEMPT" | "NOT_ACTIVATED" | "TRIAL" | "ACTIVE" | "DUE" | "LOCKED";

export interface StoreView {
  variant: "none" | "banner" | "lock";
  title: string;
  body: string;
  showPayAction: boolean;
}

export interface BillingMe {
  status: {
    status: BillingStatus;
    amountCentavos: number | null;
    dueAt: string | null;
    graceEndsAt: string | null;
    daysLeft: number | null;
    openInvoiceId: string | null;
    verificationPending: boolean;
    upcomingDueAt?: string | null;
    daysUntilDue?: number | null;
    enforcement: boolean;
  };
  storeView: StoreView;
  canPay: boolean;
  pendingReminder: { id: string; offsetDays: number; title: string; body: string } | null;
  pollSeconds: number;
  openInvoice: { id: string; number: string; amountCentavos: number; dueAt: string } | null;
  /** The store's subscription; the price is also used for Resubscribe when nothing is open yet */
  plan?: {
    billingEnabled?: boolean | null;
    priceCentavos: number | null;
    trialEndsAt?: string | null;
    paidThroughAt?: string | null;
    nextBillingAt?: string | null;
  } | null;
  cache: {
    status: BillingStatus;
    dueAt: string | null;
    graceEndsAt: string | null;
    enforcement: boolean;
    validUntil: string | null;
  };
}

/** A payment that just went through, for the app-level "Payment successful" notice. */
export interface PaymentSuccess {
  invoiceId: string;
  invoiceNumber: string;
  amountCentavos: number;
}

interface CachedBilling {
  me: BillingMe;
  fetchedAt: string;
  tenantId: string | null;
}

interface BillingContextType {
  me: BillingMe | null;
  /** True when `me` came from the device cache because the API was unreachable. */
  fromCache: boolean;
  /** Server status when online; the offline lock policy applied to the cache otherwise. */
  effectiveStatus: BillingStatus | null;
  refresh: () => Promise<BillingMe | null>;
  checkoutInProgress: boolean;
  setCheckoutInProgress: (value: boolean) => void;
  paymentSuccess: PaymentSuccess | null;
  /** Raises the notice. The pay screen often goes away right after (banner hides, store unlocks). */
  announcePayment: (payment: PaymentSuccess) => void;
  dismissPaymentSuccess: () => void;
}

const BillingContext = createContext<BillingContextType>({
  me: null,
  fromCache: false,
  effectiveStatus: null,
  refresh: async () => null,
  checkoutInProgress: false,
  setCheckoutInProgress: () => {},
  paymentSuccess: null,
  announcePayment: () => {},
  dismissPaymentSuccess: () => {},
});

/**
 * This store's billing status, refreshed on login, foreground and every
 * 5 minutes, and cached on the device so the kiosk can apply the offline
 * lock policy. Fails open: with nothing fetched and nothing cached the app
 * behaves exactly as without billing.
 */
export const BillingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, user, initializing, accountStatus } = useAuth();
  const [me, setMe] = useState<BillingMe | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [checkoutInProgress, setCheckoutInProgress] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState<PaymentSuccess | null>(null);
  const dismissPaymentSuccess = useCallback(() => setPaymentSuccess(null), []);
  const [now, setNow] = useState(() => new Date());
  const tenantId = user?.tenantId ?? null;
  const tenantRef = useRef(tenantId);
  tenantRef.current = tenantId;

  const loadCache = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(BILLING_CACHE_KEY);
      if (!raw) return null;
      const cached = JSON.parse(raw) as CachedBilling;
      return cached.tenantId === tenantRef.current ? cached : null;
    } catch {
      return null;
    }
  }, []);

  const refresh = useCallback(async (): Promise<BillingMe | null> => {
    if (!token) return null;
    // A response for a store the user has since switched away from is dropped,
    // so it can neither show nor be cached under the new store.
    const requestTenant = tenantRef.current;
    const fallBackToCache = async () => {
      const cached = await loadCache();
      if (tenantRef.current !== requestTenant) return null;
      if (cached) {
        setMe(cached.me);
        setFromCache(true);
      }
      return cached?.me ?? null;
    };
    try {
      const res = await apiRequest("/billing/me");
      // A server error is as good as offline: apply the offline policy to the cache.
      if (res.status >= 500) return fallBackToCache();
      if (!res.ok) return null;
      const next = (await res.json()) as BillingMe;
      if (tenantRef.current !== requestTenant) return null;
      setMe(next);
      setFromCache(false);
      const cached: CachedBilling = { me: next, fetchedAt: new Date().toISOString(), tenantId: requestTenant };
      AsyncStorage.setItem(BILLING_CACHE_KEY, JSON.stringify(cached)).catch(() => {});
      return next;
    } catch {
      // Offline: fall back to the last status this device saw for this store.
      return fallBackToCache();
    }
  }, [token, loadCache]);

  // Login / store switch / logout. On a cold start the token is null until
  // loadStoredAuth() restores it — the cache must survive that window, or a
  // kiosk that is offline past grace would unlock simply by restarting.
  useEffect(() => {
    if (!token) {
      setMe(null);
      setFromCache(false);
      setPaymentSuccess(null);
      if (!initializing) AsyncStorage.removeItem(BILLING_CACHE_KEY).catch(() => {});
      return;
    }
    refresh();
  }, [token, tenantId, initializing, refresh]);

  // A store switch: never show the previous store's status, even briefly.
  const prevTenant = useRef(tenantId);
  useEffect(() => {
    if (prevTenant.current === tenantId) return;
    prevTenant.current = tenantId;
    setMe(null);
    setFromCache(false);
    setPaymentSuccess(null);
  }, [tenantId]);

  // Login / account-status said the subscription is locked: fetch the details.
  useEffect(() => {
    if (accountStatus === "SUBSCRIPTION_LOCKED") refresh();
  }, [accountStatus, refresh]);

  useEffect(() => {
    if (!token) return;
    const interval = setInterval(refresh, REFRESH_MS);
    const sub = AppState.addEventListener("change", state => {
      if (state === "active") refresh();
    });
    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [token, refresh]);

  // While running on the cache, re-evaluate the offline lock every minute.
  useEffect(() => {
    if (!fromCache) return;
    const tick = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(tick);
  }, [fromCache]);

  useEffect(() => {
    setBillingLockedHandler(() => {
      refresh();
    });
    return () => setBillingLockedHandler(null);
  }, [refresh]);

  return (
    <BillingContext.Provider
      value={{
        me,
        fromCache,
        effectiveStatus: effectiveBillingStatus(me, fromCache, now, accountStatus === "SUBSCRIPTION_LOCKED"),
        refresh,
        checkoutInProgress,
        setCheckoutInProgress,
        paymentSuccess,
        announcePayment: setPaymentSuccess,
        dismissPaymentSuccess,
      }}
    >
      {children}
    </BillingContext.Provider>
  );
};

export const useBilling = () => useContext(BillingContext);
