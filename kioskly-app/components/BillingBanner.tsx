import React, { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useBilling } from "../contexts/BillingContext";
import PayNowSheet from "./PayNowSheet";

/**
 * Billing banner shown just below each screen's header. The due banner gives
 * store admins "Pay now" and cashiers the contact-your-admin copy; it can be
 * collapsed for the session, never dismissed. The free-trial notice can be
 * closed until the next day.
 */
export default function BillingBanner() {
  const { me, trialBannerClosed, closeTrialBanner } = useBilling();
  const [collapsed, setCollapsed] = useState(false);
  const [payOpen, setPayOpen] = useState(false);

  if (me?.storeView.variant === "trial") {
    if (trialBannerClosed) return null;
    return (
      <View className="bg-blue-50 border-b border-blue-200 px-4 py-2 flex-row items-center gap-2">
        <Ionicons name="sparkles" size={16} color="#2563eb" />
        <View className="flex-1">
          <Text className="text-xs font-semibold text-gray-900">{me.storeView.title}</Text>
          <Text className="text-xs text-gray-700">{me.storeView.body}</Text>
        </View>
        <TouchableOpacity
          onPress={closeTrialBanner}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          className="p-1"
          accessibilityLabel="Close notice"
        >
          <Ionicons name="close" size={18} color="#6b7280" />
        </TouchableOpacity>
      </View>
    );
  }

  if (!me || me.storeView.variant !== "banner") return null;
  const view = me.storeView;

  return (
    <>
      <View className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex-row items-center gap-2">
        <Ionicons name="alert-circle" size={16} color="#d97706" />
        <View className="flex-1">
          <Text className="text-xs font-semibold text-gray-900">{view.title}</Text>
          {!collapsed && <Text className="text-xs text-gray-700">{view.body}</Text>}
        </View>
        {view.showPayAction && (
          // Sized for a thumb: a small target on phones needed several taps.
          // hitSlop extends the touch area past the visible button.
          <TouchableOpacity
            onPress={() => setPayOpen(true)}
            hitSlop={{ top: 10, bottom: 10, left: 8, right: 4 }}
            className="bg-red-600 rounded-md px-4 py-2.5"
          >
            <Text className="text-white text-sm font-semibold">Pay now</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={() => setCollapsed(c => !c)}
          hitSlop={{ top: 10, bottom: 10, left: 4, right: 10 }}
          className="p-1"
          accessibilityLabel={collapsed ? "Expand notice" : "Collapse notice"}
        >
          <Ionicons name={collapsed ? "chevron-down" : "chevron-up"} size={18} color="#6b7280" />
        </TouchableOpacity>
      </View>
      <PayNowSheet visible={payOpen} onClose={() => setPayOpen(false)} />
    </>
  );
}
