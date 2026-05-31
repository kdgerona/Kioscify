import React from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSync } from "../contexts/SyncContext";

export default function OfflineBanner() {
  const { isOnline, pendingCount } = useSync();

  if (isOnline) return null;

  return (
    <View className="bg-gray-800 px-4 py-2 flex-row items-center justify-center gap-2">
      <Ionicons name="cloud-offline-outline" size={14} color="#f9fafb" />
      <Text className="text-gray-100 text-xs font-medium">
        {pendingCount > 0
          ? `Offline — ${pendingCount} pending ${pendingCount === 1 ? "change" : "changes"}`
          : "Offline mode"}
      </Text>
    </View>
  );
}
