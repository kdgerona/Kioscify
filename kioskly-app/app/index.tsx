import {
  View,
  Image,
  TextInput,
  TouchableOpacity,
  Text,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useState, useEffect } from "react";
import { useRouter, Href } from "expo-router";
import { useTenant } from "../contexts/TenantContext";
import { useAuth } from "../contexts/AuthContext";
import LogoWithAppName from "../assets/images/logo-with-appname.png";
import KioscifyLogo from "../assets/images/logo-only.png";
import { Ionicons } from "@expo/vector-icons";

export default function Index() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<"login" | "change-store">("login");
  const [newStoreSlug, setNewStoreSlug] = useState("");
  const [changeStoreLoading, setChangeStoreLoading] = useState(false);
  const [changeStoreError, setChangeStoreError] = useState("");

  const router = useRouter();
  const { tenant, brand, company, clearTenant, fetchTenantBySlug, initializing: tenantInitializing } = useTenant();
  const { user, login, loading, error, clearError, initializing: authInitializing } = useAuth();

  useEffect(() => {
    if (tenantInitializing || authInitializing) return;
    if (!tenant) {
      const timer = setTimeout(() => { router.replace("/tenant-setup" as Href); }, 0);
      return () => clearTimeout(timer);
    }
    if (tenant && user) {
      const timer = setTimeout(() => { router.replace("/home" as Href); }, 0);
      return () => clearTimeout(timer);
    }
  }, [tenant, user, tenantInitializing, authInitializing, router]);

  useEffect(() => {
    if (error) clearError();
  }, [username, password]);

  const handleLogin = async () => {
    if (!tenant?.id) {
      Alert.alert("Error", "No tenant selected. Please restart the app.");
      return;
    }
    if (!username.trim()) {
      Alert.alert("Validation Error", "Please enter your username");
      return;
    }
    if (!password.trim()) {
      Alert.alert("Validation Error", "Please enter your password");
      return;
    }
    try {
      await login(username, password, tenant.slug);
      const storesRaw = await (
        await import("@react-native-async-storage/async-storage")
      ).default.getItem("@kioscify:accessible_stores");
      const stores = storesRaw ? JSON.parse(storesRaw) : [];
      if (stores.length > 1) {
        router.replace("/store-picker" as Href);
        return;
      }
      router.replace("/home");
    } catch {
      Alert.alert("Login Failed", error || "Invalid credentials. Please try again.");
    }
  };

  const handleChangeStore = async () => {
    if (!newStoreSlug.trim()) return;
    setChangeStoreLoading(true);
    setChangeStoreError("");
    try {
      await fetchTenantBySlug(newStoreSlug.trim().toLowerCase(), {
        companySlug: company?.slug,
        brandSlug: brand?.slug,
      });
      setMode("login");
      setNewStoreSlug("");
    } catch {
      setChangeStoreError("Store not found. Please check the Store ID.");
    } finally {
      setChangeStoreLoading(false);
    }
  };

  const handleChangeCompanyBrand = async () => {
    await clearTenant();
    router.replace("/tenant-setup" as Href);
  };

  if (tenantInitializing || authInitializing) {
    return (
      <View style={{ flex: 1, backgroundColor: "white", justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#ea580c" />
        <Text style={{ marginTop: 16, color: "#4b5563" }}>Loading...</Text>
      </View>
    );
  }

  if (!tenant) return null;

  const primaryColor =
    brand?.themeColors?.primary ?? tenant.themeColors?.primary ?? "#ea580c";
  const apiBase =
    process.env.EXPO_PUBLIC_API_URL?.replace("/api/v1", "") ||
    "http://localhost:3000";
  const rawLogoUri = company?.logoUrl ?? brand?.logoUrl ?? tenant?.logoUrl ?? null;
  const resolvedLogoUri = rawLogoUri
    ? rawLogoUri.startsWith("http")
      ? rawLogoUri
      : `${apiBase}${rawLogoUri}`
    : null;

  return (
    <View style={{ flex: 1, backgroundColor: primaryColor }}>
      {/* Decorative rings — match web Store Portal left panel geometry */}
      <View
        style={{
          position: "absolute", top: -96, left: -96,
          width: 384, height: 384, borderRadius: 192,
          borderWidth: 40, borderColor: "white", opacity: 0.1,
        }}
      />
      <View
        style={{
          position: "absolute", bottom: -128, right: -128,
          width: 448, height: 448, borderRadius: 224,
          borderWidth: 50, borderColor: "white", opacity: 0.1,
        }}
      />
      <View
        style={{
          position: "absolute", top: "45%", right: -64,
          width: 256, height: 256, borderRadius: 128,
          borderWidth: 30, borderColor: "white", opacity: 0.07,
        }}
      />
      <View
        style={{
          position: "absolute", bottom: 96, left: 32,
          width: 128, height: 128, borderRadius: 64,
          backgroundColor: "white", opacity: 0.1,
        }}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 32,
            paddingVertical: 48,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          <View
            style={{
              width: 96, height: 96, backgroundColor: "white",
              borderRadius: 20, alignItems: "center", justifyContent: "center",
              marginBottom: 12,
              shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 10,
              shadowOffset: { width: 0, height: 4 }, elevation: 6,
            }}
          >
            {resolvedLogoUri ? (
              <Image
                source={{ uri: resolvedLogoUri }}
                style={{ width: 72, height: 72 }}
                resizeMode="contain"
              />
            ) : (
              <Image
                source={LogoWithAppName}
                style={{ width: 72, height: 72 }}
                resizeMode="contain"
              />
            )}
          </View>

          <Text
            style={{
              color: "white", fontSize: 18, fontWeight: "700",
              marginBottom: 24, textAlign: "center",
            }}
          >
            {tenant.name}
          </Text>

          {/* White card */}
          <View
            style={{
              width: "100%", maxWidth: 400, backgroundColor: "white",
              borderRadius: 24, padding: 24,
              shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 20,
              shadowOffset: { width: 0, height: 8 }, elevation: 8,
            }}
          >
            {mode === "login" ? (
              <>
                <Text
                  style={{ fontSize: 22, fontWeight: "700", color: "#111827", marginBottom: 20 }}
                >
                  Welcome back
                </Text>

                {error ? (
                  <View
                    style={{
                      backgroundColor: "#fef2f2", borderWidth: 1,
                      borderColor: "#fecaca", borderRadius: 10,
                      padding: 12, marginBottom: 16,
                    }}
                  >
                    <Text style={{ color: "#dc2626", fontSize: 13 }}>{error}</Text>
                  </View>
                ) : null}

                <View style={{ marginBottom: 16 }}>
                  <Text
                    style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 }}
                  >
                    Username
                  </Text>
                  <TextInput
                    style={{
                      backgroundColor: "#f9fafb", borderWidth: 1,
                      borderColor: "#e5e7eb", borderRadius: 12,
                      paddingHorizontal: 16, paddingVertical: 12,
                      fontSize: 15, color: "#111827",
                    }}
                    value={username}
                    onChangeText={setUsername}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="username"
                    editable={!loading}
                  />
                </View>

                <View style={{ marginBottom: 24 }}>
                  <Text
                    style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 }}
                  >
                    Password
                  </Text>
                  <View style={{ position: "relative" }}>
                    <TextInput
                      style={{
                        backgroundColor: "#f9fafb", borderWidth: 1,
                        borderColor: "#e5e7eb", borderRadius: 12,
                        paddingHorizontal: 16, paddingVertical: 12,
                        paddingRight: 48, fontSize: 15, color: "#111827",
                      }}
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="current-password"
                      editable={!loading}
                      onSubmitEditing={handleLogin}
                    />
                    <TouchableOpacity
                      style={{
                        position: "absolute", right: 14,
                        top: 0, bottom: 0, justifyContent: "center",
                      }}
                      onPress={() => setShowPassword(!showPassword)}
                      disabled={loading}
                    >
                      <Ionicons
                        name={showPassword ? "eye-off" : "eye"}
                        size={20}
                        color="#9ca3af"
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                <TouchableOpacity
                  style={{
                    backgroundColor: loading ? "#9ca3af" : primaryColor,
                    borderRadius: 12, paddingVertical: 14, alignItems: "center",
                  }}
                  onPress={handleLogin}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text style={{ color: "white", fontWeight: "700", fontSize: 15 }}>
                      Sign In
                    </Text>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text
                  style={{ fontSize: 18, fontWeight: "700", color: "#111827", marginBottom: 4 }}
                >
                  Change Store
                </Text>
                <Text style={{ fontSize: 13, color: "#6b7280", marginBottom: 20 }}>
                  Enter a store ID within {brand?.name ?? "your brand"}
                </Text>

                {changeStoreError ? (
                  <View
                    style={{
                      backgroundColor: "#fef2f2", borderWidth: 1,
                      borderColor: "#fecaca", borderRadius: 10,
                      padding: 12, marginBottom: 16,
                    }}
                  >
                    <Text style={{ color: "#dc2626", fontSize: 13 }}>
                      {changeStoreError}
                    </Text>
                  </View>
                ) : null}

                <View style={{ marginBottom: 20 }}>
                  <Text
                    style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 }}
                  >
                    Store ID
                  </Text>
                  <TextInput
                    style={{
                      backgroundColor: "#f9fafb", borderWidth: 1,
                      borderColor: "#e5e7eb", borderRadius: 12,
                      paddingHorizontal: 16, paddingVertical: 12,
                      fontSize: 15, color: "#111827",
                    }}
                    value={newStoreSlug}
                    onChangeText={setNewStoreSlug}
                    placeholder={tenant?.slug ?? "store-id"}
                    placeholderTextColor="#9ca3af"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!changeStoreLoading}
                    onSubmitEditing={handleChangeStore}
                  />
                </View>

                <TouchableOpacity
                  style={{
                    backgroundColor:
                      changeStoreLoading || !newStoreSlug.trim()
                        ? "#9ca3af"
                        : primaryColor,
                    borderRadius: 12, paddingVertical: 14,
                    alignItems: "center", marginBottom: 12,
                  }}
                  onPress={handleChangeStore}
                  disabled={changeStoreLoading || !newStoreSlug.trim()}
                >
                  {changeStoreLoading ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text style={{ color: "white", fontWeight: "700", fontSize: 15 }}>
                      Confirm
                    </Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={{ alignItems: "center", paddingVertical: 8 }}
                  onPress={() => {
                    setMode("login");
                    setNewStoreSlug("");
                    setChangeStoreError("");
                  }}
                >
                  <Text style={{ color: "#6b7280", fontSize: 14 }}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* Below-card actions — only visible in login mode */}
          {mode === "login" && (
            <>
              <TouchableOpacity
                style={{ marginTop: 20, paddingVertical: 8 }}
                onPress={() => { setMode("change-store"); setChangeStoreError(""); }}
                disabled={loading}
              >
                <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 14 }}>
                  Change Store
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{ marginTop: 8, paddingVertical: 4 }}
                onPress={handleChangeCompanyBrand}
                disabled={loading}
              >
                <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>
                  Change Company / Brand
                </Text>
              </TouchableOpacity>
            </>
          )}

          {/* Powered by Kioscify */}
          <View
            style={{
              flexDirection: "row", alignItems: "center", gap: 8,
              marginTop: 32, backgroundColor: "rgba(255,255,255,0.15)",
              borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8,
            }}
          >
            <Image
              source={KioscifyLogo}
              style={{ width: 24, height: 24 }}
              resizeMode="contain"
            />
            <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 12 }}>
              Powered by{" "}
              <Text style={{ fontWeight: "700" }}>Kioscify</Text>
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
