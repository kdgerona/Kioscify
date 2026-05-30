import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { useTenant } from "../contexts/TenantContext";
import { useAuth } from "../contexts/AuthContext";

function Section({ title }: { title: string }) {
  return (
    <Text style={{ fontSize: 11, fontWeight: "600", color: "#9ca3af", letterSpacing: 0.8, textTransform: "uppercase", marginTop: 24, marginBottom: 6, paddingHorizontal: 20 }}>
      {title}
    </Text>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ComponentProps<typeof Ionicons>["name"]; label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 12, gap: 14, borderBottomWidth: 1, borderBottomColor: "#f3f4f6", backgroundColor: "white" }}>
      <Ionicons name={icon} size={18} color="#9ca3af" />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 11, color: "#9ca3af", marginBottom: 1 }}>{label}</Text>
        <Text style={{ fontSize: 14, color: "#111827" }}>{value}</Text>
      </View>
    </View>
  );
}

function NavRow({ icon, label, route, color, router }: { icon: React.ComponentProps<typeof Ionicons>["name"]; label: string; route: Href; color: string; router: ReturnType<typeof useRouter> }) {
  return (
    <TouchableOpacity
      onPress={() => router.push(route)}
      style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#f3f4f6", backgroundColor: "white" }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <Ionicons name={icon} size={18} color={color} />
        <Text style={{ fontSize: 15, color: "#111827" }}>{label}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color="#d1d5db" />
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const { tenant, brand, company } = useTenant();
  const { user } = useAuth();

  const primaryColor = brand?.themeColors?.primary ?? tenant?.themeColors?.primary ?? "#ea580c";
  const textColor = brand?.themeColors?.text ?? tenant?.themeColors?.text ?? "#1f2937";
  const backgroundColor = brand?.themeColors?.background ?? tenant?.themeColors?.background ?? "#ffffff";

  const appVersion = Constants.expoConfig?.version ?? "1.0.0";

  const roleLabel: Record<string, string> = {
    STORE_ADMIN: "Store Admin",
    CASHIER: "Cashier",
    ADMIN: "Admin",
    COMPANY_ADMIN: "Company Admin",
    PLATFORM_ADMIN: "Platform Admin",
  };

  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#f3f4f6" }}>
      {/* Header */}
      <View className="px-6 py-4 flex-row items-center" style={{ backgroundColor }}>
        <TouchableOpacity onPress={() => router.back()} className="mr-4 p-2">
          <Ionicons name="arrow-back" size={24} color={textColor} />
        </TouchableOpacity>
        <Text className="text-2xl font-bold" style={{ color: textColor }}>Settings</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Account */}
        <Section title="Account" />
        <InfoRow icon="person-outline" label="Name" value={fullName} />
        <InfoRow icon="at-outline" label="Username" value={user?.username} />
        <InfoRow icon="mail-outline" label="Email" value={user?.email} />
        <InfoRow icon="shield-checkmark-outline" label="Role" value={user?.role ? roleLabel[user.role] ?? user.role : null} />
        <NavRow icon="key-outline" label="Change Password" route="/change-password" color={primaryColor} router={router} />

        {/* Business */}
        <Section title="Business" />
        {company && <InfoRow icon="business-outline" label="Company" value={company.name} />}
        {brand && <InfoRow icon="pricetag-outline" label="Brand" value={brand.name} />}
        <InfoRow icon="storefront-outline" label="Store" value={tenant?.name} />
        <InfoRow icon="location-outline" label="Address" value={tenant?.address} />
        <InfoRow icon="call-outline" label="Contact" value={tenant?.contactPhone} />
        <InfoRow icon="mail-outline" label="Store Email" value={tenant?.contactEmail} />

        {/* App */}
        <Section title="App" />
        <InfoRow icon="information-circle-outline" label="Version" value={appVersion} />

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
