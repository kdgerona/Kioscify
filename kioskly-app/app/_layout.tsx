import "../ReactotronConfig";
import React, { useEffect } from "react";
import { Stack } from "expo-router";
import { TenantProvider } from "../contexts/TenantContext";
import { AuthProvider } from "../contexts/AuthContext";
import { SyncProvider } from "../contexts/SyncContext";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { initDb } from "../lib/db";

export default function RootLayout() {
  useEffect(() => {
    initDb();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <TenantProvider>
        <AuthProvider>
          <SyncProvider>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="tenant-setup" />
              <Stack.Screen name="store-picker" />
              <Stack.Screen name="home" />
              <Stack.Screen name="change-password" />
              <Stack.Screen name="transactions" />
            </Stack>
          </SyncProvider>
        </AuthProvider>
      </TenantProvider>
    </GestureHandlerRootView>
  );
}
