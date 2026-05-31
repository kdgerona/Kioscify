import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import { useAuth } from "./AuthContext";
import { syncAll, getPendingCount, pruneQueue, onQueueChange } from "../services/syncEngine";

interface SyncContextType {
  pendingCount: number;
  isOnline: boolean;
  isSyncing: boolean;
  triggerSync: () => Promise<void>;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

export const SyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const appState = useRef(AppState.currentState);
  const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? "";

  // Load initial pending count and subscribe to queue changes
  useEffect(() => {
    getPendingCount().then(setPendingCount);
    return onQueueChange(setPendingCount);
  }, []);

  // Holds the in-flight sync promise so multiple callers can await the same run.
  const syncPromiseRef = useRef<Promise<void> | null>(null);

  const triggerSync = useCallback(async (): Promise<void> => {
    if (!token) return;
    // If a sync is already running, return the same promise so the caller can
    // await its completion instead of starting (and losing) a second run.
    if (syncPromiseRef.current) return syncPromiseRef.current;
    const promise = (async () => {
      setIsSyncing(true);
      try {
        await syncAll(token, apiUrl);
        await pruneQueue();
        const count = await getPendingCount();
        setPendingCount(count);
      } finally {
        setIsSyncing(false);
        syncPromiseRef.current = null;
      }
    })();
    syncPromiseRef.current = promise;
    return promise;
  }, [token, apiUrl]);

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
    <SyncContext.Provider value={{ pendingCount, isOnline, isSyncing, triggerSync }}>
      {children}
    </SyncContext.Provider>
  );
};

export const useSync = (): SyncContextType => {
  const context = useContext(SyncContext);
  if (!context) throw new Error("useSync must be used within a SyncProvider");
  return context;
};
