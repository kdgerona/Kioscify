import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "../contexts/AuthContext";
import { useBilling } from "../contexts/BillingContext";
import { PayNowContent } from "../components/PayNowSheet";
import { formatPeso } from "../utils/billingFormat";
import { Ionicons } from "@expo/vector-icons";

// Catches a payment made elsewhere (store portal, another device, or a
// platform admin's Mark paid); the QR screen polls its own payment faster.
const STATUS_POLL_MS = 15_000;

export default function AccountStatus() {
  const router = useRouter();
  const { accountStatus, gracePeriodEndsAt, scopeName, logout, getAccountStatus } = useAuth();
  const { me } = useBilling();
  const [paying, setPaying] = useState(false);

  // A Store Admin who can switch the store back on by paying
  const canResubscribe = accountStatus === "SUBSCRIPTION_ENDED";

  // Paying switches the store back on server side; once account status reads
  // ACTIVE again, the root layout takes the kiosk back to /home.
  useEffect(() => {
    if (!canResubscribe) return;
    const timer = setInterval(() => getAccountStatus(), STATUS_POLL_MS);
    return () => clearInterval(timer);
  }, [canResubscribe, getAccountStatus]);

  const daysRemaining = gracePeriodEndsAt
    ? Math.max(
        0,
        Math.ceil(
          (new Date(gracePeriodEndsAt).getTime() - Date.now()) / 86400000
        )
      )
    : null;

  const handleLogout = async () => {
    await logout();
    router.replace("/");
  };

  if (canResubscribe) {
    const amount = me?.openInvoice?.amountCentavos ?? me?.plan?.priceCentavos ?? null;
    return (
      <SafeAreaView className="flex-1 bg-gray-50">
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingHorizontal: 24, paddingVertical: 32 }}>
          <View className="items-center">
            <View className="w-14 h-14 rounded-full bg-amber-50 items-center justify-center mb-5">
              <Ionicons name="warning-outline" size={28} color="#f59e0b" />
            </View>
            <Text className="text-xl font-semibold text-gray-900 text-center">
              Your subscription has ended.
            </Text>
          </View>

          {paying ? (
            <View className="mt-4">
              <PayNowContent onPaid={() => getAccountStatus()} />
              <TouchableOpacity className="mt-3 py-2" onPress={() => setPaying(false)}>
                <Text className="text-sm text-gray-500 text-center">Back</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View className="items-center">
              <Text className="text-sm text-gray-500 mt-2 text-center">
                {!me
                  ? "Loading your billing details…"
                  : amount != null
                    ? `Pay ${formatPeso(amount)} to resubscribe and reactivate ${scopeName ?? "your store"} right away.`
                    : `Resubscribe to reactivate ${scopeName ?? "your store"} right away.`}
              </Text>
              <TouchableOpacity
                className="mt-6 w-full flex-row items-center justify-center py-4 rounded-xl bg-primary"
                onPress={() => setPaying(true)}
              >
                <Ionicons name="refresh" size={20} color="#000" />
                <Text className="ml-2 text-base font-bold text-black">Resubscribe</Text>
              </TouchableOpacity>
              {daysRemaining !== null && daysRemaining > 0 && (
                <Text className="text-sm text-gray-500 mt-4 text-center">
                  {`To export your data instead, log in to the store portal on the web within ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}.`}
                </Text>
              )}
            </View>
          )}

          <TouchableOpacity
            className="mt-8 self-center px-6 py-3 rounded-xl border border-gray-300"
            onPress={handleLogout}
          >
            <Text className="text-base font-semibold text-gray-700">Sign Out</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="flex-1 items-center justify-center px-6">
        <View className="w-14 h-14 rounded-full bg-amber-50 items-center justify-center mb-5">
          <Ionicons name="warning-outline" size={28} color="#f59e0b" />
        </View>

        <Text className="text-xl font-semibold text-gray-900 text-center">
          Your subscription has ended
        </Text>

        {daysRemaining !== null ? (
          <Text className="text-sm text-gray-500 mt-2 text-center">
            {scopeName ? `${scopeName} has` : "Your account has"} read-only access for{" "}
            <Text className="font-semibold text-gray-900">
              {daysRemaining} day{daysRemaining === 1 ? "" : "s"}
            </Text>{" "}
            remaining before it is fully deactivated.
          </Text>
        ) : (
          <Text className="text-sm text-gray-500 mt-2 text-center">
            {"Your account currently has limited, read-only access."}
          </Text>
        )}

        <Text className="text-sm text-gray-500 mt-4 text-center">
          {"Log in to the store portal on the web to export your data."}
        </Text>

        <Text className="text-sm text-gray-500 mt-2 text-center">
          {"Email "}
          <Text className="font-semibold text-gray-700">support@kioscify.com</Text>
          {" to resubscribe."}
        </Text>

        <TouchableOpacity
          className="mt-8 px-6 py-3 rounded-xl border border-gray-300"
          onPress={handleLogout}
        >
          <Text className="text-base font-semibold text-gray-700">Sign Out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
