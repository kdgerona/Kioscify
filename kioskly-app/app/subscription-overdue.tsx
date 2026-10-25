import "../global.css";
import React, { useEffect } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { useBilling } from "../contexts/BillingContext";
import { PayNowContent } from "../components/PayNowSheet";
import { formatManilaDate, formatPeso } from "../utils/billingFormat";

/**
 * Full-screen subscription lock. Store admins can pay right here (QR Ph or
 * the fallback bank QR); cashiers are told to contact their store admin.
 * Polls so the kiosk unlocks soon after payment.
 */
export default function SubscriptionOverdueScreen() {
  const { logout } = useAuth();
  const { me, refresh, fromCache } = useBilling();

  useEffect(() => {
    const seconds = Math.max(10, me?.pollSeconds ?? 30);
    const timer = setInterval(refresh, seconds * 1000);
    return () => clearInterval(timer);
  }, [me?.pollSeconds, refresh]);

  const canPay = !!me?.canPay && !me.status.verificationPending;
  const body = me?.canPay
    ? me?.storeView.body ||
      (me ? `${formatPeso(me.status.amountCentavos)} was due on ${formatManilaDate(me.status.dueAt)}.` : "")
    : "Your store's subscription is overdue. Please contact your store admin.";

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }}>
        <View className="bg-white rounded-2xl border border-gray-200 p-6 gap-4 w-full max-w-md self-center">
          <View className="items-center gap-2">
            <View className="w-14 h-14 rounded-full bg-red-50 items-center justify-center">
              <Ionicons name="lock-closed" size={28} color="#ef4444" />
            </View>
            <Text className="text-xl font-semibold text-gray-900 text-center">
              {me?.storeView.title || "Subscription overdue"}
            </Text>
            <Text className="text-sm text-gray-600 text-center">{body}</Text>
            {fromCache && (
              <Text className="text-xs text-gray-400 text-center">
                You're offline. Connect to the internet — the kiosk unlocks as soon as the payment is confirmed.
              </Text>
            )}
          </View>

          {canPay && !fromCache && <PayNowContent onPaid={refresh} />}

          <TouchableOpacity onPress={logout} className="flex-row items-center justify-center gap-2 py-3 border-t border-gray-200">
            <Ionicons name="log-out-outline" size={18} color="#6b7280" />
            <Text className="text-gray-600">Log out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
