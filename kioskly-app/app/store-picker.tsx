import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
} from "react-native";
import { useState, useEffect } from "react";
import { useRouter, Href } from "expo-router";
import AppSafeAreaView from "../components/AppSafeAreaView";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTenant } from "../contexts/TenantContext";
import { useAuth } from "../contexts/AuthContext";

interface StoreOption {
  id: string;
  name: string;
  slug: string;
  brandId?: string;
  companyId?: string;
  brand?: { name: string; themeColors?: { primary: string }; logoUrl?: string } | null;
  company?: { name: string; logoUrl?: string } | null;
}

export default function StorePicker() {
  const router = useRouter();
  const { fetchTenantBySlug } = useTenant();
  const { token } = useAuth();
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [switching, setSwitching] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem("@kioscify:accessible_stores").then((raw) => {
      if (raw) setStores(JSON.parse(raw));
    });
  }, []);

  const handleSelectStore = async (store: StoreOption) => {
    if (!token) return;
    setSwitching(store.id);
    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL;
      const resp = await fetch(`${apiUrl}/auth/switch-store`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ targetStoreId: store.id }),
      });

      if (!resp.ok) {
        throw new Error("Failed to switch store");
      }

      const data = await resp.json();

      // Update token
      await AsyncStorage.setItem("@kioscify:auth_token", data.accessToken);

      // Load the selected store's tenant data
      await fetchTenantBySlug(store.slug);

      router.replace("/home" as Href);
    } catch (err) {
      Alert.alert("Error", "Failed to switch store. Please try again.");
    } finally {
      setSwitching(null);
    }
  };

  if (stores.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#ea580c" />
      </View>
    );
  }

  return (
    <AppSafeAreaView className="flex-1 bg-gray-50">
      <View className="px-6 py-6 bg-white border-b border-gray-100">
        <Text className="text-2xl font-bold text-gray-900">Select a Store</Text>
        <Text className="text-sm text-gray-500 mt-1">
          You manage {stores.length} stores. Choose which one to open.
        </Text>
      </View>

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {stores.map((store) => {
          const primaryColor = store.brand?.themeColors?.primary ?? "#4f46e5";
          const isLoading = switching === store.id;

          return (
            <TouchableOpacity
              key={store.id}
              onPress={() => handleSelectStore(store)}
              disabled={!!switching}
              className="bg-white border-b border-gray-100 px-6 py-4 flex-row items-center gap-4 active:bg-gray-50"
            >
              {/* Color avatar */}
              <View
                className="w-12 h-12 rounded-full items-center justify-center flex-shrink-0"
                style={{ backgroundColor: primaryColor }}
              >
                <Text className="text-white font-bold text-lg">
                  {store.name.charAt(0).toUpperCase()}
                </Text>
              </View>

              <View className="flex-1">
                <Text className="font-semibold text-gray-900 text-base">{store.name}</Text>
                {store.brand && (
                  <Text className="text-sm text-gray-500">{store.brand.name}</Text>
                )}
              </View>

              {isLoading ? (
                <ActivityIndicator size="small" color={primaryColor} />
              ) : (
                <Text className="text-gray-400 text-lg">›</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View className="px-6 py-4 bg-white border-t border-gray-100 items-center">
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "white", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: "#f3f4f6", shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 }}>
          <Image source={require("../assets/images/logo-with-appname.png")} style={{ width: 20, height: 20 }} resizeMode="contain" />
          <Text style={{ fontSize: 11, color: "#9ca3af" }}>Powered by <Text style={{ fontWeight: "600", color: "#4b5563" }}>Kioscify</Text></Text>
        </View>
      </View>
    </AppSafeAreaView>
  );
}
