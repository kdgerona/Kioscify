import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Image,
} from "react-native";
import { useState, useEffect } from "react";
import { useRouter, Href } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTenant } from "../contexts/TenantContext";
import { useAuth } from "../contexts/AuthContext";
import { Ionicons } from "@expo/vector-icons";
import LogoWithAppName from "../assets/images/logo-with-appname.png";
import { showSuccessToast, showErrorToast } from "../utils/toast";

interface StoreOption {
  id: string;
  name: string;
  slug: string;
  brandId?: string;
  companyId?: string;
  brand?: { name: string; themeColors?: { primary: string }; logoUrl?: string } | null;
  company?: { name: string; logoUrl?: string } | null;
}

function resolveLogoUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const apiBase =
    process.env.EXPO_PUBLIC_STORAGE_URL ||
    process.env.EXPO_PUBLIC_API_URL?.replace("/api/v1", "") ||
    "http://localhost:3000";
  try {
    const path = raw.startsWith("http") ? new URL(raw).pathname : raw;
    return `${apiBase}${path}`;
  } catch {
    return raw;
  }
}

export default function StorePicker() {
  const router = useRouter();
  const { fetchTenantBySlug } = useTenant();
  const { token, logout } = useAuth();
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
      if (!resp.ok) throw new Error("Failed to switch store");
      const data = await resp.json();
      await AsyncStorage.setItem("@kioscify:auth_token", data.accessToken);
      await fetchTenantBySlug(store.slug);
      showSuccessToast("Store switched");
      router.replace("/home" as Href);
    } catch {
      showErrorToast("Failed to switch store. Please try again.");
    } finally {
      setSwitching(null);
    }
  };

  if (stores.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "white" }}>
        <ActivityIndicator size="large" color="#ea580c" />
      </View>
    );
  }

  const primaryColor = stores[0]?.brand?.themeColors?.primary ?? "#ea580c";
  const headerLogoUri = resolveLogoUrl(stores[0]?.brand?.logoUrl ?? stores[0]?.company?.logoUrl);
  const brandName = stores[0]?.brand?.name ?? null;

  return (
    <View style={{ flex: 1, backgroundColor: primaryColor }}>
      {/* Decorative rings — matches login screen geometry */}
      <View style={{ position: "absolute", top: -96, left: -96, width: 384, height: 384, borderRadius: 192, borderWidth: 40, borderColor: "white", opacity: 0.1 }} />
      <View style={{ position: "absolute", bottom: -128, right: -128, width: 448, height: 448, borderRadius: 224, borderWidth: 50, borderColor: "white", opacity: 0.1 }} />
      <View style={{ position: "absolute", top: "50%", right: -64, width: 256, height: 256, borderRadius: 128, borderWidth: 30, borderColor: "white", opacity: 0.07 }} />
      <View style={{ position: "absolute", bottom: 96, left: 32, width: 128, height: 128, borderRadius: 64, backgroundColor: "white", opacity: 0.1 }} />

      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 24,
          paddingVertical: 56,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Brand logo */}
        <View
          style={{
            width: 88, height: 88, backgroundColor: "white", borderRadius: 20,
            alignItems: "center", justifyContent: "center", marginBottom: 14,
            shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 10,
            shadowOffset: { width: 0, height: 4 }, elevation: 6,
          }}
        >
          {headerLogoUri ? (
            <Image source={{ uri: headerLogoUri }} style={{ width: 64, height: 64 }} resizeMode="contain" />
          ) : (
            <Image source={LogoWithAppName} style={{ width: 64, height: 64 }} resizeMode="contain" />
          )}
        </View>

        {brandName && (
          <Text style={{ color: "white", fontSize: 20, fontWeight: "700", marginBottom: 4, textAlign: "center" }}>
            {brandName}
          </Text>
        )}
        <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, marginBottom: 28, textAlign: "center" }}>
          Choose a store to manage
        </Text>

        {/* White card */}
        <View
          style={{
            width: "100%", maxWidth: 420, backgroundColor: "white",
            borderRadius: 24, overflow: "hidden",
            shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 20,
            shadowOffset: { width: 0, height: 8 }, elevation: 8,
          }}
        >
          <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: "#111827" }}>Select a Store</Text>
            <Text style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>
              You manage {stores.length} store{stores.length !== 1 ? "s" : ""}. Choose which one to open.
            </Text>
          </View>

          {stores.map((store, index) => {
            const storeColor = store.brand?.themeColors?.primary ?? primaryColor;
            const logoUri = resolveLogoUrl(store.brand?.logoUrl ?? store.company?.logoUrl);
            const isLoading = switching === store.id;
            const isLast = index === stores.length - 1;

            return (
              <TouchableOpacity
                key={store.id}
                onPress={() => handleSelectStore(store)}
                disabled={!!switching}
                activeOpacity={0.7}
                style={{
                  flexDirection: "row", alignItems: "center", gap: 12,
                  paddingHorizontal: 20, paddingVertical: 14,
                  borderTopWidth: 1, borderTopColor: "#f3f4f6",
                  borderBottomLeftRadius: isLast ? 24 : 0,
                  borderBottomRightRadius: isLast ? 24 : 0,
                }}
              >
                {/* Accent bar */}
                <View style={{ width: 3, alignSelf: "stretch", borderRadius: 99, backgroundColor: storeColor }} />

                {/* Logo / avatar */}
                {logoUri ? (
                  <Image
                    source={{ uri: logoUri }}
                    style={{ width: 48, height: 48, borderRadius: 12 }}
                    resizeMode="cover"
                  />
                ) : (
                  <View
                    style={{
                      width: 48, height: 48, borderRadius: 12,
                      backgroundColor: storeColor,
                      alignItems: "center", justifyContent: "center",
                    }}
                  >
                    <Text style={{ color: "white", fontWeight: "700", fontSize: 18 }}>
                      {store.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}

                {/* Store name + brand */}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: "600", fontSize: 15, color: "#111827" }} numberOfLines={1}>
                    {store.name}
                  </Text>
                  {store.brand && (
                    <Text style={{ fontSize: 12, color: "#6b7280", marginTop: 1 }} numberOfLines={1}>
                      {store.brand.name}
                    </Text>
                  )}
                </View>

                {/* Trailing */}
                {isLoading ? (
                  <ActivityIndicator size="small" color={storeColor} />
                ) : (
                  <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Cancel */}
        <TouchableOpacity
          style={{ marginTop: 16, paddingVertical: 12, paddingHorizontal: 32, alignItems: "center" }}
          onPress={async () => { await logout(); router.replace("/"); }}
        >
          <Text style={{ fontSize: 14, fontWeight: "500", color: "rgba(255,255,255,0.8)" }}>Cancel</Text>
        </TouchableOpacity>

        {/* Powered by Kioscify */}
        <View
          style={{
            flexDirection: "row", alignItems: "center", gap: 8, marginTop: 32,
            backgroundColor: "white", borderRadius: 999,
            paddingHorizontal: 12, paddingVertical: 6,
            borderWidth: 1, borderColor: "rgba(0,0,0,0.08)",
          }}
        >
          <Image source={LogoWithAppName} style={{ width: 20, height: 20 }} resizeMode="contain" />
          <Text style={{ fontSize: 11, color: "#9ca3af" }}>
            Powered by <Text style={{ fontWeight: "600", color: "#6b7280" }}>Kioscify</Text>
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
