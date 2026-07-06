import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useEffect, useState } from "react";
import { useTenant } from "@/contexts/TenantContext";

type HoldOrderPromptModalProps = {
  visible: boolean;
  isSubmitting?: boolean;
  onConfirm: (customerLabel?: string) => void;
  onCancel: () => void;
};

export default function HoldOrderPromptModal({
  visible,
  isSubmitting = false,
  onConfirm,
  onCancel,
}: HoldOrderPromptModalProps) {
  const [customerLabel, setCustomerLabel] = useState("");
  const { tenant, brand } = useTenant();
  const primaryColor = brand?.themeColors?.primary ?? tenant?.themeColors?.primary ?? "#ea580c";

  useEffect(() => {
    if (visible) setCustomerLabel("");
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <TouchableOpacity
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" }}
        activeOpacity={1}
        onPress={onCancel}
      >
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View
              style={{
                backgroundColor: "#fff",
                borderRadius: 12,
                padding: 20,
                width: 320,
                maxWidth: "90%",
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: "700", marginBottom: 4 }}>
                Save Cart
              </Text>
              <Text style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>
                Save this cart to finish later. Any staff member can load it.
              </Text>

              <Text style={{ fontSize: 12, fontWeight: "600", color: "#374151", marginBottom: 8 }}>
                Customer name (optional)
              </Text>
              <TextInput
                value={customerLabel}
                onChangeText={setCustomerLabel}
                placeholder="e.g. Customer A"
                autoFocus
                style={{
                  borderWidth: 1.5,
                  borderColor: "#d1d5db",
                  borderRadius: 8,
                  padding: 10,
                  fontSize: 15,
                  marginBottom: 20,
                }}
              />

              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity
                  onPress={onCancel}
                  disabled={isSubmitting}
                  style={{
                    flex: 1,
                    paddingVertical: 11,
                    borderRadius: 8,
                    borderWidth: 1.5,
                    borderColor: "#d1d5db",
                    alignItems: "center",
                  }}
                >
                  <Text style={{ fontWeight: "600", color: "#374151" }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => onConfirm(customerLabel.trim() || undefined)}
                  disabled={isSubmitting}
                  style={{
                    flex: 2,
                    paddingVertical: 11,
                    borderRadius: 8,
                    backgroundColor: isSubmitting ? "#d1d5db" : primaryColor,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ fontWeight: "700", color: "#000" }}>
                    {isSubmitting ? "Saving…" : "Save Cart"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </TouchableOpacity>
    </Modal>
  );
}
