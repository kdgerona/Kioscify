import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Linking,
  useWindowDimensions,
  ScrollView,
} from "react-native";
import { useState } from "react";
import { useRouter } from "expo-router";
import AppSafeAreaView from "../components/AppSafeAreaView";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useTenant } from "../contexts/TenantContext";
import AppLogo from "../assets/images/logo-only.png";

const ORANGE = "#ea580c";

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
      if (payload.v !== 1 || !payload.company || !payload.brand || !payload.store) {
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
          <AppSafeAreaView style={{ flex: 1, justifyContent: "space-between", alignItems: "center", padding: 24 }}>
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
          </AppSafeAreaView>
        </CameraView>
      </View>
    );
  }

  // ── Form content (shared between portrait stacked and landscape right panel) ──
  const formContent = (
    <>
      <Text style={{ fontSize: 22, fontWeight: "800", color: "#111827", marginBottom: 4 }}>
        Get Started
      </Text>
      <Text style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>
        Scan the QR code or enter your store details below
      </Text>

      <TouchableOpacity
        onPress={handleScanPress}
        disabled={loading}
        style={{
          borderWidth: 2, borderColor: ORANGE, borderRadius: 10,
          paddingVertical: 12, alignItems: "center", marginBottom: 12,
        }}
      >
        <Text style={{ color: ORANGE, fontSize: 15, fontWeight: "700" }}>
          Scan QR Code
        </Text>
      </TouchableOpacity>

      {permission && !permission.granted && !permission.canAskAgain && (
        <View style={{ backgroundColor: "#fff7ed", borderWidth: 1, borderColor: "#fed7aa", borderRadius: 10, padding: 12, marginBottom: 12 }}>
          <Text style={{ color: "#9a3412", fontSize: 12, textAlign: "center" }}>
            Camera access is required to scan QR codes.{" "}
            <Text style={{ fontWeight: "700", textDecorationLine: "underline" }} onPress={() => Linking.openSettings()}>
              Enable in Settings
            </Text>
            {" "}or use manual entry below.
          </Text>
        </View>
      )}

      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: "#e5e7eb" }} />
        <Text style={{ marginHorizontal: 10, fontSize: 11, color: "#9ca3af" }}>or enter manually</Text>
        <View style={{ flex: 1, height: 1, backgroundColor: "#e5e7eb" }} />
      </View>

      <View style={{ marginBottom: 8 }}>
        <Text style={{ fontSize: 12, fontWeight: "600", color: "#374151", marginBottom: 4 }}>Company Slug</Text>
        <TextInput
          style={{ backgroundColor: "#f3f4f6", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: "#111827" }}
          placeholder="e.g., your-company"
          placeholderTextColor="#9ca3af"
          value={companySlug}
          onChangeText={setCompanySlug}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!loading}
        />
      </View>

      <View style={{ marginBottom: 8 }}>
        <Text style={{ fontSize: 12, fontWeight: "600", color: "#374151", marginBottom: 4 }}>Brand Slug</Text>
        <TextInput
          style={{ backgroundColor: "#f3f4f6", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: "#111827" }}
          placeholder="e.g., your-brand"
          placeholderTextColor="#9ca3af"
          value={brandSlug}
          onChangeText={setBrandSlug}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!loading}
        />
      </View>

      <View style={{ marginBottom: 12 }}>
        <Text style={{ fontSize: 12, fontWeight: "600", color: "#374151", marginBottom: 4 }}>Store ID</Text>
        <TextInput
          style={{ backgroundColor: "#f3f4f6", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: "#111827" }}
          placeholder="e.g., my-store"
          placeholderTextColor="#9ca3af"
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
        <View style={{ backgroundColor: "#fee2e2", borderWidth: 1, borderColor: "#fca5a5", borderRadius: 10, padding: 10, marginBottom: 10 }}>
          <Text style={{ color: "#dc2626", fontSize: 13 }}>{error || scanError}</Text>
        </View>
      )}

      <TouchableOpacity
        onPress={handleContinue}
        disabled={loading || !slug.trim() || !companySlug.trim() || !brandSlug.trim()}
        style={{
          backgroundColor: loading || !slug.trim() || !companySlug.trim() || !brandSlug.trim() ? "#d1d5db" : ORANGE,
          borderRadius: 10, paddingVertical: 13, alignItems: "center",
        }}
      >
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={{ color: "white", fontSize: 15, fontWeight: "700" }}>Continue</Text>
        )}
      </TouchableOpacity>
    </>
  );

  // ── LANDSCAPE: split screen ──────────────────────────────────────────────────
  if (isLandscape) {
    return (
      <View style={{ flex: 1, flexDirection: "row" }}>
        {/* Left panel — Kioscify branding */}
        <View style={{ width: "40%", backgroundColor: ORANGE, overflow: "hidden" }}>
          {/* Decorative rings */}
          <View style={{ position: "absolute", top: -60, left: -60, width: 240, height: 240, borderRadius: 120, borderWidth: 30, borderColor: "white", opacity: 0.1 }} />
          <View style={{ position: "absolute", bottom: -80, right: -80, width: 280, height: 280, borderRadius: 140, borderWidth: 35, borderColor: "white", opacity: 0.1 }} />
          <View style={{ position: "absolute", bottom: 40, left: 16, width: 80, height: 80, borderRadius: 40, backgroundColor: "white", opacity: 0.1 }} />

          <AppSafeAreaView style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
            <View style={{ width: 80, height: 80, backgroundColor: "white", borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 16, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 8, elevation: 4 }}>
              <Image source={AppLogo} style={{ width: 60, height: 60 }} resizeMode="contain" />
            </View>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              style={{ color: "white", fontSize: 20, fontWeight: "800", textAlign: "center", marginBottom: 6 }}
            >
              Welcome to Kioscify
            </Text>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              style={{ color: "rgba(255,255,255,0.75)", fontSize: 12, textAlign: "center" }}
            >
              Smart Store Management & Monitoring Platform
            </Text>
          </AppSafeAreaView>
        </View>

        {/* Right panel — form */}
        <View style={{ flex: 1, backgroundColor: "white" }}>
          <KeyboardAwareScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            enableOnAndroid
            enableAutomaticScroll
            extraScrollHeight={20}
          >
            <View style={{ maxWidth: 360, width: "100%", alignSelf: "center" }}>
              {formContent}
            </View>
          </KeyboardAwareScrollView>
        </View>
      </View>
    );
  }

  // ── PORTRAIT: stacked layout ─────────────────────────────────────────────────
  return (
    <AppSafeAreaView style={{ flex: 1, backgroundColor: "white" }}>
      <KeyboardAwareScrollView
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 32, paddingVertical: 24 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        enableOnAndroid
        enableAutomaticScroll
        extraScrollHeight={20}
      >
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <Image source={AppLogo} style={{ width: 120, height: 120 }} resizeMode="contain" />
          <Text style={{ fontSize: 26, fontWeight: "800", color: ORANGE, textAlign: "center", marginBottom: 20, marginTop: 8 }}>
            Welcome to Kioscify
          </Text>

          <View style={{ width: "100%" }}>
            {formContent}
          </View>
        </View>
      </KeyboardAwareScrollView>
    </AppSafeAreaView>
  );
}
