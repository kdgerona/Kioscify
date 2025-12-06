import "../ReactotronConfig";
import React from "react";
import { Stack } from "expo-router";
import { TenantProvider } from "../contexts/TenantContext";
import { AuthProvider } from "../contexts/AuthContext";

export default function RootLayout() {
  return (
    <TenantProvider>
      <AuthProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="tenant-setup" />
          <Stack.Screen name="home" />
        </Stack>
      </AuthProvider>
    </TenantProvider>
  );
}
