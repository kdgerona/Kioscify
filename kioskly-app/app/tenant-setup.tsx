import "../global.css";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Image,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useState } from "react";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTenant } from "../contexts/TenantContext";
import AppLogo from "../assets/images/logo-only.png";

export default function TenantSetup() {
  const [slug, setSlug] = useState("");
  const router = useRouter();
  const { fetchTenantBySlug, loading, error } = useTenant();

  const handleContinue = async () => {
    if (!slug.trim()) {
      return;
    }

    try {
      await fetchTenantBySlug(slug.trim().toLowerCase());
      // If successful, navigate to login
      router.replace("/");
    } catch (err) {
      // Error is handled by the context
      console.error("Failed to fetch tenant:", err);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
    >
      <SafeAreaView className="flex-1 bg-white">
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 32, paddingVertical: 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
        <View className="w-full max-w-md flex-1 justify-center self-center">
          <View className="flex-col items-center justify-center mb-6">
            <Image
              source={AppLogo}
              resizeMode="contain"
              className="w-64 h-64"
            />
            <Text className="text-3xl font-bold text-orange-600 mb-2 text-center mt-[-40] w-full">
              Welcome to Kioscify
            </Text>
            <Text className="text-gray-600 mb-8 text-center">
              Enter your store identifier to continue
            </Text>
          </View>
          <View className="mb-6">
            <Text className="text-sm font-semibold text-gray-700 mb-2">
              Store ID / Slug
            </Text>
            <TextInput
              className="w-full bg-gray-100 rounded-lg px-4 py-3 text-base"
              placeholder="e.g., my-store"
              value={slug}
              onChangeText={setSlug}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />
            <Text className="text-xs text-gray-500 mt-1">
              Ask your administrator for your store identifier
            </Text>
          </View>

          {error && (
            <View className="bg-red-100 border border-red-400 rounded-lg p-3 mb-4">
              <Text className="text-red-700 text-sm">{error}</Text>
            </View>
          )}

          <TouchableOpacity
            className={`w-full rounded-lg py-3 items-center ${
              loading || !slug.trim() ? "bg-gray-300" : "bg-orange-500"
            }`}
            onPress={handleContinue}
            disabled={loading || !slug.trim()}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white text-base font-semibold">
                Continue
              </Text>
            )}
          </TouchableOpacity>

          <View className="mt-8 p-4 bg-orange-50 rounded-lg">
            <Text className="text-sm font-semibold text-orange-800 mb-2">
              💡 What is a Store ID?
            </Text>
            <Text className="text-xs text-gray-600">
              Your Store ID (slug) is a unique identifier for your business.
              It&apos;s used to load your custom branding, theme, and settings.
              Contact your system administrator if you don&apos;t have this
              information.
            </Text>
          </View>
        </View>
      </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}
