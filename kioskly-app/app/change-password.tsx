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
  const { changePassword, mustChangePassword } = useAuth();
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
    <AppSafeAreaView className="w-full h-full bg-gray-50">
      {/* Header */}
      <View
        className="px-6 py-4 flex-row items-center"
        style={{ backgroundColor }}
      >
        {!mustChangePassword && (
          <TouchableOpacity onPress={() => router.back()} className="mr-4 p-2">
            <Ionicons name="arrow-back" size={24} color={textColor} />
          </TouchableOpacity>
        )}
        <View>
          <Text className="text-2xl font-bold" style={{ color: textColor }}>
            {mustChangePassword ? "Set New Password" : "Change Password"}
          </Text>
          {mustChangePassword && (
            <Text
              className="text-xs mt-0.5"
              style={{ color: textColor, opacity: 0.6 }}
            >
              You must set a new password before continuing
            </Text>
          )}
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, padding: 24 }}
          keyboardShouldPersistTaps="handled"
          className="bg-white"
        >
          {success ? (
            <View className="flex-1 items-center justify-center">
              <Ionicons name="checkmark-circle" size={64} color="#16a34a" />
              <Text className="text-lg font-semibold text-green-700 mt-4">
                Password changed successfully!
              </Text>
            </View>
          ) : (
            <>
              {error && (
                <View className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
                  <Text className="text-sm text-red-600">{error}</Text>
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

              <Text className="text-xs text-gray-400 mb-6">
                Min 10 characters · uppercase · lowercase · number · special
                character
              </Text>

              <TouchableOpacity
                className="w-full rounded-lg py-3 items-center"
                style={{ backgroundColor: loading ? "#9ca3af" : primaryColor }}
                onPress={handleSubmit}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text className="text-base font-semibold text-white">
                    Change Password
                  </Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </AppSafeAreaView>
  );
}
