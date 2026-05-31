import "../ReactotronConfig";
import React, { useEffect } from "react";
import { View } from "react-native";
import { Stack } from "expo-router";
import { TenantProvider } from "../contexts/TenantContext";
import { AuthProvider } from "../contexts/AuthContext";
import { SyncProvider } from "../contexts/SyncContext";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { initDb } from "../lib/db";
import OfflineBanner from "../components/OfflineBanner";

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
      </Stack>
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
