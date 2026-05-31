import React from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSync } from "../contexts/SyncContext";

export default function OfflineBanner() {
  const { isOnline, pendingCount } = useSync();
  const insets = useSafeAreaInsets();

  if (isOnline) return null;

  return (
    <View
      style={{ paddingTop: insets.top, backgroundColor: "#1f2937" }}
      className="px-4 pb-2 flex-row items-center justify-center gap-2"
    >
      <Ionicons name="cloud-offline-outline" size={14} color="#f9fafb" />
      <Text className="text-gray-100 text-xs font-medium">
        {pendingCount > 0
          ? `Offline — ${pendingCount} pending ${pendingCount === 1 ? "change" : "changes"}`
          : "Offline mode"}
      </Text>
    </View>
  );
}
