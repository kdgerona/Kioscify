import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Linking,
  useWindowDimensions,
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
  const [companySlug, setCompanySlug] = useState("");
  const [brandSlug, setBrandSlug] = useState("");
  const [slug, setSlug] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const router = useRouter();
  const { fetchTenantBySlug, loading, error } = useTenant();
  const [permission, requestPermission] = useCameraPermissions();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const handleContinue = async () => {
    if (!companySlug.trim() || !brandSlug.trim() || !slug.trim()) return;
    try {
      await fetchTenantBySlug(slug.trim().toLowerCase(), {
        companySlug: companySlug.trim().toLowerCase(),
        brandSlug: brandSlug.trim().toLowerCase(),
      });
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
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 32, paddingVertical: isLandscape ? 12 : 24 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        enableOnAndroid={true}
        enableAutomaticScroll={true}
        extraScrollHeight={20}
      >
        <View className="w-full max-w-md flex-1 justify-center self-center">
          <View style={{ alignItems: "center", marginBottom: isLandscape ? 8 : 24 }}>
            {!isLandscape && (
              <Image
                source={AppLogo}
                resizeMode="contain"
                style={{ width: 120, height: 120 }}
              />
            )}
            <Text style={{ fontSize: isLandscape ? 20 : 26, fontWeight: "700", color: "#ea580c", textAlign: "center", marginBottom: 4 }}>
              Welcome to Kioscify
            </Text>
            <Text style={{ color: "#4b5563", fontSize: 13, textAlign: "center", marginBottom: isLandscape ? 0 : 4 }}>
              Scan the QR code or enter your store details below
            </Text>
          </View>

          <TouchableOpacity
            style={{ marginBottom: isLandscape ? 8 : 16 }}
            className="w-full rounded-lg py-3 items-center border-2 border-orange-500"
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

          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: isLandscape ? 8 : 16 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: "#e5e7eb" }} />
            <Text style={{ marginHorizontal: 12, fontSize: 11, color: "#9ca3af" }}>or enter manually</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: "#e5e7eb" }} />
          </View>

          <View style={{ marginBottom: isLandscape ? 6 : 12 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 4 }}>
              Company Slug
            </Text>
            <TextInput
              style={{ backgroundColor: "#f3f4f6", borderRadius: 10, paddingHorizontal: 14, paddingVertical: isLandscape ? 8 : 12, fontSize: 14, color: "#111827" }}
              placeholder="e.g., your-company"
              value={companySlug}
              onChangeText={setCompanySlug}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />
          </View>

          <View style={{ marginBottom: isLandscape ? 6 : 12 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 4 }}>
              Brand Slug
            </Text>
            <TextInput
              style={{ backgroundColor: "#f3f4f6", borderRadius: 10, paddingHorizontal: 14, paddingVertical: isLandscape ? 8 : 12, fontSize: 14, color: "#111827" }}
              placeholder="e.g., your-brand"
              value={brandSlug}
              onChangeText={setBrandSlug}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />
          </View>

          <View style={{ marginBottom: isLandscape ? 8 : 16 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 4 }}>
              Store ID
            </Text>
            <TextInput
              style={{ backgroundColor: "#f3f4f6", borderRadius: 10, paddingHorizontal: 14, paddingVertical: isLandscape ? 8 : 12, fontSize: 14, color: "#111827" }}
              placeholder="e.g., my-store"
              value={slug}
              onChangeText={setSlug}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />
            <Text style={{ fontSize: 11, color: "#6b7280", marginTop: 3 }}>
              These are provided by your Kioscify platform administrator.
            </Text>
          </View>

          {(error || scanError) && (
            <View className="bg-red-100 border border-red-400 rounded-lg p-3 mb-4">
              <Text className="text-red-700 text-sm">{error || scanError}</Text>
            </View>
          )}

          <TouchableOpacity
            className={`w-full rounded-lg py-3 items-center ${
              loading || !slug.trim() || !companySlug.trim() || !brandSlug.trim() ? "bg-gray-300" : "bg-orange-500"
            }`}
            onPress={handleContinue}
            disabled={loading || !slug.trim() || !companySlug.trim() || !brandSlug.trim()}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white text-base font-semibold">
                Continue
              </Text>
            )}
          </TouchableOpacity>

        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}
