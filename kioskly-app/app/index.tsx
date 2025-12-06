import "../global.css";
import {
  View,
  Image,
  TextInput,
  TouchableOpacity,
  Text,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useState, useEffect } from "react";
import { useRouter, Href } from "expo-router";
import { useTenant } from "../contexts/TenantContext";
import { useAuth } from "../contexts/AuthContext";
import LogoWithAppName from "../assets/images/logo-with-appname.png";

export default function Index() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const router = useRouter();
  const { tenant, clearTenant } = useTenant();
  const { login, loading, error, clearError } = useAuth();

  useEffect(() => {
    // If no tenant is set, redirect to tenant setup
    // Use setTimeout to ensure router is mounted
    if (!tenant) {
      const timer = setTimeout(() => {
        router.replace("/tenant-setup" as Href);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [tenant, router]);

  useEffect(() => {
    // Clear any previous errors when inputs change
    if (error) {
      clearError();
    }
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
      await login(username, password, tenant.id);
      // Navigate to home page after successful login
      router.replace("/home");
    } catch {
      // Error is already set in auth context and displayed below the form
      // Alert for better UX
      Alert.alert(
        "Login Failed",
        error || "Invalid credentials. Please try again."
      );
    }
  };

  if (!tenant) {
    return null; // Will redirect to tenant-setup
  }

  const primaryColor = tenant.themeColors?.primary || "#ea580c";
  const textColor = tenant.themeColors?.text || "#1f2937";
  const logoUri = tenant.logoUrl ? tenant?.logoUrl : null;

  return (
    <View className="w-full h-full justify-center items-center bg-white px-8">
      {logoUri ? (
        <Image
          source={{ uri: logoUri }}
          className="w-64 h-64 mb-8"
          resizeMode="contain"
        />
      ) : (
        <Image source={LogoWithAppName} className="w-64 h-64 mb-8" />
      )}

      <Text className="text-3xl font-bold mb-2" style={{ color: textColor }}>
        {tenant.name}
      </Text>

      <View className="w-full max-w-md mt-4">
        <TextInput
          className="w-full bg-gray-100 rounded-lg px-4 py-3 mb-4 text-base"
          placeholder="Username"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!loading}
        />

        <TextInput
          className="w-full bg-gray-100 rounded-lg px-4 py-3 mb-2 text-base"
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          editable={!loading}
          onSubmitEditing={handleLogin}
        />

        {error && (
          <View className="mb-4 px-3 py-2 bg-red-50 rounded-lg border border-red-200">
            <Text className="text-sm text-red-600">{error}</Text>
          </View>
        )}

        <TouchableOpacity
          className="w-full rounded-lg py-3 items-center mb-4"
          style={{
            backgroundColor: loading ? "#9ca3af" : primaryColor,
          }}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text
              className="text-base font-semibold"
              style={{ color: textColor }}
            >
              Login
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          className="items-center"
          onPress={async () => {
            await clearTenant();
            router.push("/tenant-setup" as Href);
          }}
          disabled={loading}
        >
          <Text
            className="text-sm"
            style={{ color: loading ? "#d1d5db" : `${textColor}80` }}
          >
            Change Store
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
