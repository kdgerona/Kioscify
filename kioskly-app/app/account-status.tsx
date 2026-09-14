import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "../contexts/AuthContext";
import { Ionicons } from "@expo/vector-icons";

export default function AccountStatus() {
  const router = useRouter();
  const { accountStatus, gracePeriodEndsAt, scopeName, logout } = useAuth();

  const daysRemaining = gracePeriodEndsAt
    ? Math.max(
        0,
        Math.ceil(
          (new Date(gracePeriodEndsAt).getTime() - Date.now()) / 86400000
        )
      )
    : null;

  const isDeactivated = accountStatus === "DEACTIVATED";

  const handleLogout = async () => {
    await logout();
    router.replace("/");
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="flex-1 items-center justify-center px-6">
        <View className="w-20 h-20 rounded-full bg-red-50 items-center justify-center mb-6">
          <Ionicons name="alert-circle-outline" size={44} color="#dc2626" />
        </View>

        <Text className="text-xl font-semibold text-gray-900 text-center">
          {scopeName ? `${scopeName} has been deactivated` : "This account has been deactivated"}
        </Text>

        {isDeactivated ? (
          <Text className="text-sm text-gray-500 mt-2 text-center">
            {"The grace period has ended and this account can no longer be used."}
          </Text>
        ) : (
          <Text className="text-sm text-gray-500 mt-2 text-center">
            {daysRemaining !== null
              ? `${daysRemaining} day${daysRemaining === 1 ? "" : "s"} remaining before access is fully removed.`
              : "This account is in its grace period."}
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
