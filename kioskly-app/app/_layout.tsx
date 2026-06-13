import "../ReactotronConfig";
import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { Stack } from "expo-router";
import { TenantProvider } from "../contexts/TenantContext";
import { AuthProvider } from "../contexts/AuthContext";
import { SyncProvider } from "../contexts/SyncContext";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { initDb } from "../lib/db";
import OfflineBanner from "../components/OfflineBanner";
import { getApiUrl } from "../utils/api";
import MaintenanceScreen from "../components/MaintenanceScreen";

// Inner component — must live inside SyncProvider to call useSync() via OfflineBanner.
function AppNavigator() {
  return (
    <View style={{ flex: 1 }}>
      <OfflineBanner />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="tenant-setup" />
        <Stack.Screen name="store-picker" />
        <Stack.Screen name="home" />
        <Stack.Screen name="change-password" />
        <Stack.Screen name="transactions" />
        <Stack.Screen name="shift-report" />
      </Stack>
    </View>
  );
}

export default function RootLayout() {
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let apiUrl: string;
    try {
      apiUrl = getApiUrl();
    } catch {
      // EXPO_PUBLIC_API_URL not set — fail open
      setChecking(false);
      return;
    }
    Promise.all([
      fetch(`${apiUrl}/platform/maintenance-status`)
        .then((r) => r.json())
        .then((data: { mobileAppMaintenance?: boolean }) => {
          if (data.mobileAppMaintenance) setMaintenanceMode(true);
        })
        .catch(() => {}), // fail open
      initDb(),
    ]).finally(() => setChecking(false));
  }, []);

  if (checking) return null;

  if (maintenanceMode) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <MaintenanceScreen />
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <TenantProvider>
        <AuthProvider>
          <SyncProvider>
            <AppNavigator />
          </SyncProvider>
        </AuthProvider>
      </TenantProvider>
    </GestureHandlerRootView>
  );
}
