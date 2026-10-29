import "../ReactotronConfig";
import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { Stack, usePathname, useRouter, Href } from "expo-router";
import { TenantProvider } from "../contexts/TenantContext";
import { AuthProvider, useAuth } from "../contexts/AuthContext";
import { SyncProvider } from "../contexts/SyncContext";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { initDb } from "../lib/db";
import OfflineBanner from "../components/OfflineBanner";
import { getApiUrl } from "../utils/api";
import MaintenanceScreen from "../components/MaintenanceScreen";
import { AppUpdateProvider } from "../contexts/AppUpdateContext";
import UpdateDialog from "../components/UpdateDialog";
import Toast from "react-native-toast-message";
import { BillingProvider, useBilling } from "../contexts/BillingContext";
import ReminderModal from "../components/ReminderModal";
import PaymentSuccessModal from "../components/PaymentSuccessModal";

// Inner component — must live inside SyncProvider to call useSync() via OfflineBanner.
function AppNavigator() {
  const { accountStatus, user } = useAuth();
  const { effectiveStatus, checkoutInProgress } = useBilling();
  const pathname = usePathname();
  const router = useRouter();
  // SUBSCRIPTION_LOCKED is a billing lock, handled below — not a deactivation.
  const deactivationGated = !!accountStatus && accountStatus !== "ACTIVE" && accountStatus !== "SUBSCRIPTION_LOCKED";

  // Post-auth account-status gate — redirects to the blocked screen whenever
  // the logged-in user's account isn't ACTIVE, and back to /home once it is
  // again (e.g. after reactivation). Uses setTimeout(..., 0) to ensure the
  // router is mounted, mirroring the existing auth-redirect pattern in
  // app/home.tsx.
  useEffect(() => {
    if (deactivationGated && pathname !== "/account-status") {
      const timer = setTimeout(() => {
        router.replace("/account-status" as Href);
      }, 0);
      return () => clearTimeout(timer);
    }
    if (accountStatus && !deactivationGated && pathname === "/account-status") {
      const timer = setTimeout(() => {
        router.replace("/home" as Href);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [accountStatus, deactivationGated, pathname, router]);

  // Subscription lock: applied on launch, foreground, navigation and after
  // the current sale — never in the middle of a checkout. Deactivation wins.
  const billingLocked = !!user && !deactivationGated && effectiveStatus === "LOCKED";
  useEffect(() => {
    if (billingLocked && !checkoutInProgress && pathname !== "/subscription-overdue") {
      const timer = setTimeout(() => router.replace("/subscription-overdue" as Href), 0);
      return () => clearTimeout(timer);
    }
    if (!billingLocked && pathname === "/subscription-overdue") {
      const timer = setTimeout(() => router.replace((user ? "/home" : "/") as Href), 0);
      return () => clearTimeout(timer);
    }
  }, [billingLocked, checkoutInProgress, pathname, router, user]);

  return (
    <View style={{ flex: 1 }}>
      <OfflineBanner />
      <ReminderModal />
      <PaymentSuccessModal />
      <UpdateDialog />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="tenant-setup" />
        <Stack.Screen name="store-picker" />
        <Stack.Screen name="home" />
        <Stack.Screen name="change-password" />
        <Stack.Screen name="transactions" />
        <Stack.Screen name="shift-report" />
        <Stack.Screen name="subscription-overdue" />
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
        <Toast />
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <TenantProvider>
        <AuthProvider>
          <SyncProvider>
            <BillingProvider>
              <AppUpdateProvider>
                <AppNavigator />
              </AppUpdateProvider>
            </BillingProvider>
          </SyncProvider>
        </AuthProvider>
      </TenantProvider>
      <Toast />
    </GestureHandlerRootView>
  );
}
