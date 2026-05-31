import "../ReactotronConfig";
import React, { useEffect } from "react";
import { View } from "react-native";
import { Stack } from "expo-router";
import { SafeAreaInsetsContext, useSafeAreaInsets } from "react-native-safe-area-context";
import { TenantProvider } from "../contexts/TenantContext";
import { AuthProvider } from "../contexts/AuthContext";
import { SyncProvider } from "../contexts/SyncContext";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { initDb } from "../lib/db";
import OfflineBanner from "../components/OfflineBanner";
import { useSync } from "../contexts/SyncContext";

// Inner component — must live inside SyncProvider to call useSync() and
// inside SafeAreaProvider to call useSafeAreaInsets().
function AppNavigator() {
  const { isOnline } = useSync();
  const insets = useSafeAreaInsets();

  // When offline, the banner consumes the top safe area (paddingTop: insets.top).
  // Override the context so the Stack's children don't double-add that padding.
  const stackInsets = isOnline ? insets : { ...insets, top: 0 };

  return (
    <View style={{ flex: 1 }}>
      <OfflineBanner />
      <SafeAreaInsetsContext.Provider value={stackInsets}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="tenant-setup" />
          <Stack.Screen name="store-picker" />
          <Stack.Screen name="home" />
          <Stack.Screen name="change-password" />
          <Stack.Screen name="transactions" />
        </Stack>
      </SafeAreaInsetsContext.Provider>
    </View>
  );
}

export default function RootLayout() {
  useEffect(() => {
    initDb();
  }, []);

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
