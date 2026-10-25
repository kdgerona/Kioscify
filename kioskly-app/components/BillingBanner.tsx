import React, { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useBilling } from "../contexts/BillingContext";
import PayNowSheet from "./PayNowSheet";

/**
 * Due banner shown just below each screen's header. Store admins
 * get "Pay now"; cashiers get the contact-your-admin copy. It can be
 * collapsed for the session, never dismissed.
 */
export default function BillingBanner() {
  const { me } = useBilling();
  const [collapsed, setCollapsed] = useState(false);
  const [payOpen, setPayOpen] = useState(false);

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
          <TouchableOpacity onPress={() => setPayOpen(true)} className="bg-red-600 rounded-md px-3 py-1.5">
            <Text className="text-white text-xs font-semibold">Pay now</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={() => setCollapsed(c => !c)} accessibilityLabel={collapsed ? "Expand notice" : "Collapse notice"}>
          <Ionicons name={collapsed ? "chevron-down" : "chevron-up"} size={16} color="#6b7280" />
        </TouchableOpacity>
      </View>
      <PayNowSheet visible={payOpen} onClose={() => setPayOpen(false)} />
    </>
  );
}
