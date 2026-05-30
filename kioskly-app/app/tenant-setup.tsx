import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Linking,
} from "react-native";
import { useState } from "react";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useTenant } from "../contexts/TenantContext";
import AppLogo from "../assets/images/logo-only.png";

interface QRPayload {
  v: number;
  company: string;
  brand: string;
  store: string;
}

export default function TenantSetup() {
  const [slug, setSlug] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const router = useRouter();
  const { fetchTenantBySlug, loading, error } = useTenant();
  const [permission, requestPermission] = useCameraPermissions();

  const handleContinue = async () => {
    if (!slug.trim()) return;
    try {
      await fetchTenantBySlug(slug.trim().toLowerCase());
      router.replace("/");
    } catch (err) {
      console.error("Failed to fetch tenant:", err);
    }
  };

  const handleScanPress = async () => {
    setScanError("");
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) return;
    }
    setScanning(true);
  };

  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    setScanning(false);
    setScanError("");
    try {
      const payload: QRPayload = JSON.parse(data);
      if (
        payload.v !== 1 ||
        !payload.company ||
        !payload.brand ||
        !payload.store
      ) {
        setScanError("Invalid QR code. Please use manual entry below.");
        return;
      }
      await fetchTenantBySlug(payload.store, {
        companySlug: payload.company,
        brandSlug: payload.brand,
      });
      router.replace("/");
    } catch {
      setScanError("Could not read QR code. Please try again or use manual entry below.");
    }
  };

  if (scanning) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        <CameraView
          style={{ flex: 1 }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={handleBarCodeScanned}
        >
          <SafeAreaView style={{ flex: 1, justifyContent: "space-between", alignItems: "center", padding: 24 }}>
            <Text style={{ color: "white", fontSize: 16, fontWeight: "600", textAlign: "center", marginTop: 16 }}>
              Point the camera at a Kioscify store QR code
            </Text>
            <View style={{ width: 240, height: 240, borderWidth: 2, borderColor: "white", borderRadius: 16, opacity: 0.8 }} />
            <TouchableOpacity
              onPress={() => setScanning(false)}
              style={{ paddingVertical: 12, paddingHorizontal: 32, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 8, marginBottom: 16 }}
            >
              <Text style={{ color: "white", fontWeight: "600" }}>Cancel</Text>
            </TouchableOpacity>
          </SafeAreaView>
        </CameraView>
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAwareScrollView
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 32, paddingVertical: 24 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        enableOnAndroid={true}
        enableAutomaticScroll={true}
        extraScrollHeight={20}
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

          <TouchableOpacity
            className="w-full rounded-lg py-3 items-center mb-4 border-2 border-orange-500"
            onPress={handleScanPress}
            disabled={loading}
          >
            <Text className="text-orange-500 text-base font-semibold">
              Scan QR Code
            </Text>
          </TouchableOpacity>

          {permission && !permission.granted && !permission.canAskAgain && (
            <View className="mb-4 p-3 bg-orange-50 rounded-lg border border-orange-200">
              <Text className="text-sm text-orange-800 text-center">
                Camera access is required to scan QR codes.{" "}
                <Text
                  className="font-semibold underline"
                  onPress={() => Linking.openSettings()}
                >
                  Enable in Settings
                </Text>
                {" "}or use manual entry below.
              </Text>
            </View>
          )}

          <View className="flex-row items-center mb-4">
            <View className="flex-1 h-px bg-gray-200" />
            <Text className="mx-3 text-xs text-gray-400">or enter manually</Text>
            <View className="flex-1 h-px bg-gray-200" />
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

          {(error || scanError) && (
            <View className="bg-red-100 border border-red-400 rounded-lg p-3 mb-4">
              <Text className="text-red-700 text-sm">{error || scanError}</Text>
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
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}
