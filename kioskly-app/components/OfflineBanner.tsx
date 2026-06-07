import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSync } from "../contexts/SyncContext";

export default function OfflineBanner() {
  const { isOnline, pendingCount, failedCount, retryFailed, isSyncing } = useSync();
  const insets = useSafeAreaInsets();

  if (!isOnline) {
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

  if (failedCount > 0) {
    return (
      <View
        style={{ paddingTop: insets.top, backgroundColor: "#7f1d1d" }}
        className="px-4 pb-2 flex-row items-center justify-between gap-2"
      >
        <View className="flex-row items-center gap-2">
          <Ionicons name="warning-outline" size={14} color="#fca5a5" />
          <Text className="text-red-200 text-xs font-medium">
            {failedCount} {failedCount === 1 ? "record" : "records"} failed to sync
          </Text>
        </View>
        <TouchableOpacity onPress={retryFailed} disabled={isSyncing} className={`px-2 py-1 ${isSyncing ? "opacity-50" : ""}`}>
          <Text className="text-red-200 text-xs font-semibold underline">
            {isSyncing ? "Retrying…" : "Retry"}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return null;
}
