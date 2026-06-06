import React from "react";
import { View, Text, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function MaintenanceScreen() {
  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="flex-1 items-center justify-center px-6">
        <Image
          source={require("../assets/images/logo-with-appname.png")}
          className="w-32 h-32"
          resizeMode="contain"
        />
        <Text className="text-xl font-semibold text-gray-900 mt-6 text-center">
          {"We're currently under maintenance"}
        </Text>
        <Text className="text-sm text-gray-500 mt-2 text-center">
          {"We'll be back shortly. Thank you for your patience."}
        </Text>
      </View>
    </SafeAreaView>
  );
}
