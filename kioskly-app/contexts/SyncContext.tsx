/**
 * SyncContext — wraps the sync engine, listens for connectivity changes,
 * triggers sync on reconnect, and exposes pending count to the UI.
 *
 * Connectivity is detected by pinging the API /health endpoint since
 * @react-native-community/netinfo is not installed.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
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

  const checkOnline = useCallback(async (): Promise<boolean> => {
    if (!apiUrl) return false;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const resp = await fetch(`${apiUrl.replace("/api/v1", "")}/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return resp.ok;
    } catch {
      return false;
    }
  }, [apiUrl]);

  const triggerSync = useCallback(async () => {
    if (!token || isSyncing) return;
    const online = await checkOnline();
    setIsOnline(online);
    if (!online) return;

    setIsSyncing(true);
    try {
      await syncAll(token, apiUrl);
      await pruneQueue();
      const count = await getPendingCount();
      setPendingCount(count);
    } finally {
      setIsSyncing(false);
    }
  }, [token, apiUrl, isSyncing, checkOnline]);

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

  // Poll every 30 seconds while app is active
  useEffect(() => {
    const interval = setInterval(async () => {
      if (AppState.currentState === "active") {
        await triggerSync();
      }
    }, 30000);
    return () => clearInterval(interval);
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
