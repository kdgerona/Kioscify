import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import { useAuth } from "./AuthContext";
import {
  syncAll,
  getPendingCount,
  getFailedCount,
  resetFailedItems,
  pruneQueue,
  onQueueChange,
} from "../services/syncEngine";

interface SyncContextType {
  pendingCount: number;
  failedCount: number;
  isOnline: boolean;
  isSyncing: boolean;
  triggerSync: () => Promise<void>;
  retryFailed: () => Promise<void>;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

export const SyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const appState = useRef(AppState.currentState);
  const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? "";

  const refreshCounts = useCallback(async () => {
    const [pending, failed] = await Promise.all([getPendingCount(), getFailedCount()]);
    setPendingCount(pending);
    setFailedCount(failed);
  }, []);

  useEffect(() => {
    refreshCounts();
    return onQueueChange(() => refreshCounts());
  }, [refreshCounts]);

  // Holds the in-flight sync promise so multiple callers can await the same run.
  const syncPromiseRef = useRef<Promise<void> | null>(null);

  const triggerSync = useCallback(async (): Promise<void> => {
    if (!token) return;
    if (syncPromiseRef.current) return syncPromiseRef.current;
    const promise = (async () => {
      setIsSyncing(true);
      try {
        await syncAll(token, apiUrl);
        await pruneQueue();
        await refreshCounts();
      } finally {
        setIsSyncing(false);
        syncPromiseRef.current = null;
      }
    })();
    syncPromiseRef.current = promise;
    return promise;
  }, [token, apiUrl, refreshCounts]);

  const retryFailed = useCallback(async (): Promise<void> => {
    await resetFailedItems();
    await triggerSync();
  }, [triggerSync]);

  // System-level connectivity detection via netinfo
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const connected = !!state.isConnected && state.isInternetReachable !== false;
      setIsOnline(connected);
      if (connected && token) {
        triggerSync();
      }
    });
    return unsubscribe;
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync when app comes to foreground
  useEffect(() => {
    const sub = AppState.addEventListener("change", async (next: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && next === "active") {
        await triggerSync();
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, [triggerSync]);

  // Initial sync on mount when token is available
  useEffect(() => {
    if (token) triggerSync();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SyncContext.Provider value={{ pendingCount, failedCount, isOnline, isSyncing, triggerSync, retryFailed }}>
      {children}
    </SyncContext.Provider>
  );
};

export const useSync = (): SyncContextType => {
  const context = useContext(SyncContext);
  if (!context) throw new Error("useSync must be used within a SyncProvider");
  return context;
};
