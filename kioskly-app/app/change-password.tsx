import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import AppSafeAreaView from "../components/AppSafeAreaView";
import { useState } from "react";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { useTenant } from "../contexts/TenantContext";

interface PasswordFieldProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  show: boolean;
  onToggle: () => void;
  textColor: string;
}

function PasswordField({
  label,
  value,
  onChangeText,
  show,
  onToggle,
  textColor,
}: PasswordFieldProps) {
  return (
    <View className="mb-4">
      <Text className="text-sm font-medium mb-1" style={{ color: textColor }}>
        {label}
      </Text>
      <View className="flex-row items-center bg-gray-100 rounded-lg px-4">
        <TextInput
          className="flex-1 py-3 text-base"
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!show}
          autoCapitalize="none"
          autoCorrect={false}
          style={{ color: textColor }}
        />
        <TouchableOpacity onPress={onToggle}>
          <Ionicons
            name={show ? "eye-off-outline" : "eye-outline"}
            size={20}
            color="#6b7280"
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function ChangePasswordScreen() {
  const router = useRouter();
  const { changePassword, mustChangePassword, logout } = useAuth();
  const { tenant, brand } = useTenant();

  const primaryColor =
    brand?.themeColors?.primary ?? tenant?.themeColors?.primary ?? "#ea580c";
  const textColor =
    brand?.themeColors?.text ?? tenant?.themeColors?.text ?? "#1f2937";
  const backgroundColor =
    brand?.themeColors?.background ??
    tenant?.themeColors?.background ??
    "#ffffff";

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("All fields are required.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const wasForced = mustChangePassword;
      await changePassword(currentPassword, newPassword);
      setSuccess(true);
      setTimeout(() => {
        if (wasForced) {
          router.replace("/home" as any);
        } else {
          router.back();
        }
      }, 2000);
    } catch (err: any) {
      setError(err?.message || "Failed to change password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppSafeAreaView style={{ flex: 1, backgroundColor: primaryColor }}>
      {/* Decorative rings — matches login screen geometry */}
      <View style={{ position: "absolute", top: -96, left: -96, width: 384, height: 384, borderRadius: 192, borderWidth: 40, borderColor: "white", opacity: 0.1 }} />
      <View style={{ position: "absolute", bottom: -128, right: -128, width: 448, height: 448, borderRadius: 224, borderWidth: 50, borderColor: "white", opacity: 0.1 }} />
      <View style={{ position: "absolute", top: "50%", right: -64, width: 256, height: 256, borderRadius: 128, borderWidth: 30, borderColor: "white", opacity: 0.07 }} />

      {/* Back button */}
      {!mustChangePassword && (
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ position: "absolute", top: 16, left: 16, zIndex: 10, padding: 8 }}
        >
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, paddingVertical: 48 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View
            style={{
              width: "100%", maxWidth: 400, backgroundColor: "white",
              borderRadius: 24, padding: 24,
              shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 20,
              shadowOffset: { width: 0, height: 8 }, elevation: 8,
            }}
          >
            {/* Title */}
            <Text style={{ fontSize: 22, fontWeight: "700", color: "#111827", textAlign: "center", marginBottom: 4 }}>
              {mustChangePassword ? "Set New Password" : "Change Password"}
            </Text>
            {mustChangePassword && (
              <Text style={{ fontSize: 12, color: "#6b7280", textAlign: "center", marginBottom: 20 }}>
                You must set a new password before continuing
              </Text>
            )}
            <View style={{ height: mustChangePassword ? 0 : 20 }} />

            {success ? (
              <View style={{ alignItems: "center", paddingVertical: 32 }}>
                <Ionicons name="checkmark-circle" size={64} color="#16a34a" />
                <Text style={{ fontSize: 16, fontWeight: "600", color: "#15803d", marginTop: 16 }}>
                  Password changed successfully!
                </Text>
              </View>
            ) : (
              <>
                {error && (
                  <View style={{ backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fecaca", borderRadius: 10, padding: 12, marginBottom: 16 }}>
                    <Text style={{ color: "#dc2626", fontSize: 13 }}>{error}</Text>
                  </View>
                )}

                <PasswordField
                  label="Current Password"
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  show={showCurrent}
                  onToggle={() => setShowCurrent((v) => !v)}
                  textColor={textColor}
                />
                <PasswordField
                  label="New Password"
                  value={newPassword}
                  onChangeText={setNewPassword}
                  show={showNew}
                  onToggle={() => setShowNew((v) => !v)}
                  textColor={textColor}
                />
                <PasswordField
                  label="Confirm New Password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  show={showConfirm}
                  onToggle={() => setShowConfirm((v) => !v)}
                  textColor={textColor}
                />

                <Text style={{ fontSize: 12, color: "#9ca3af", marginBottom: 24 }}>
                  Min 10 characters · uppercase · lowercase · number · special character
                </Text>

                <TouchableOpacity
                  style={{ borderRadius: 10, paddingVertical: 12, alignItems: "center", backgroundColor: loading ? "#9ca3af" : primaryColor }}
                  onPress={handleSubmit}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={{ fontSize: 15, fontWeight: "600", color: "white" }}>
                      Change Password
                    </Text>
                  )}
                </TouchableOpacity>

                {mustChangePassword && (
                  <TouchableOpacity
                    style={{ marginTop: 10, paddingVertical: 12, alignItems: "center", borderRadius: 10 }}
                    onPress={async () => { await logout(); router.replace("/"); }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: "500", color: "#6b7280" }}>Cancel</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </AppSafeAreaView>
  );
}
