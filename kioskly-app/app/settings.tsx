import { View, Text, TouchableOpacity } from "react-native";
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

  const items: { label: string; icon: React.ComponentProps<typeof Ionicons>["name"]; route: Href }[] = [
    { label: "Change Password", icon: "key-outline", route: "/change-password" },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: "white" }}>
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", padding: 24, paddingTop: 32, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 16, padding: 4 }}>
          <Ionicons name="arrow-back" size={24} color={textColor} />
        </TouchableOpacity>
        <Text style={{ fontSize: 22, fontWeight: "700", color: textColor }}>Settings</Text>
      </View>

      {/* Items */}
      <View style={{ paddingHorizontal: 24, paddingTop: 16 }}>
        {items.map((item) => (
          <TouchableOpacity
            key={item.route as string}
            onPress={() => router.push(item.route)}
            style={{
              flexDirection: "row", alignItems: "center", justifyContent: "space-between",
              paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: "#f3f4f6",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              <Ionicons name={item.icon} size={22} color={primaryColor} />
              <Text style={{ fontSize: 15, color: textColor }}>{item.label}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}
