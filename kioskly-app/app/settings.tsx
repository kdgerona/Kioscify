import { View, Text, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTenant } from "../contexts/TenantContext";

export default function SettingsScreen() {
  const router = useRouter();
  const { tenant, brand } = useTenant();

  const primaryColor =
    brand?.themeColors?.primary ?? tenant?.themeColors?.primary ?? "#ea580c";
  const textColor =
    brand?.themeColors?.text ?? tenant?.themeColors?.text ?? "#1f2937";
  const backgroundColor =
    brand?.themeColors?.background ?? tenant?.themeColors?.background ?? "#ffffff";

  const items: { label: string; icon: React.ComponentProps<typeof Ionicons>["name"]; route: Href }[] = [
    { label: "Change Password", icon: "key-outline", route: "/change-password" },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#f9fafb" }}>
      {/* Header */}
      <View
        className="px-6 py-4 flex-row justify-between items-center"
        style={{ backgroundColor }}
      >
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="mr-4 p-2">
            <Ionicons name="arrow-back" size={24} color={textColor} />
          </TouchableOpacity>
          <Text className="text-2xl font-bold" style={{ color: textColor }}>
            Settings
          </Text>
        </View>
      </View>

      {/* Items */}
      <View className="px-6 pt-4">
        {items.map((item) => (
          <TouchableOpacity
            key={item.route as string}
            onPress={() => router.push(item.route)}
            className="flex-row items-center justify-between py-4"
            style={{ borderBottomWidth: 1, borderBottomColor: "#f3f4f6" }}
          >
            <View className="flex-row items-center" style={{ gap: 14 }}>
              <Ionicons name={item.icon} size={22} color={primaryColor} />
              <Text style={{ fontSize: 15, color: textColor }}>{item.label}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}
