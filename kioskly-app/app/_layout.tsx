import "../ReactotronConfig";
import React from "react";
import { Stack } from "expo-router";
import { TenantProvider } from "../contexts/TenantContext";
import { AuthProvider } from "../contexts/AuthContext";
import { GestureHandlerRootView } from "react-native-gesture-handler";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <TenantProvider>
        <AuthProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="tenant-setup" />
            <Stack.Screen name="home" />
            <Stack.Screen name="transactions" />
          </Stack>
        </AuthProvider>
      </TenantProvider>
    </GestureHandlerRootView>
  );
}
