import { View, Text, TouchableOpacity, Modal, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTenant } from "@/contexts/TenantContext";
import type { HeldOrder } from "../app/home";

type HeldOrdersModalProps = {
  visible: boolean;
  heldOrders: HeldOrder[];
  isLoading?: boolean;
  error?: string | null;
  onResume: (heldOrder: HeldOrder) => void;
  onDiscard: (heldOrder: HeldOrder) => void;
  onClose: () => void;
};

// Held orders older than this get a visual warning to prompt staff cleanup —
// there's no backend expiry/cron for v1, this is purely a client-side nudge.
const STALE_THRESHOLD_MINUTES = 240;

const formatSavedAt = (createdAt: string): { label: string; isStale: boolean } => {
  const date = new Date(createdAt);
  const ageMinutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  const label = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return { label, isStale: ageMinutes >= STALE_THRESHOLD_MINUTES };
};

export default function HeldOrdersModal({
  visible,
  heldOrders,
  isLoading = false,
  error = null,
  onResume,
  onDiscard,
  onClose,
}: HeldOrdersModalProps) {
  const { tenant, brand } = useTenant();
  const primaryColor = brand?.themeColors?.primary ?? tenant?.themeColors?.primary ?? "#ea580c";

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
        <SafeAreaView
          edges={["bottom"]}
          style={{
            backgroundColor: "#fff",
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            maxHeight: "80%",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              padding: 16,
              borderBottomWidth: 1,
              borderBottomColor: "#f3f4f6",
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: "700" }}>Saved Carts</Text>
            <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
              <Ionicons name="close" size={24} color="#374151" />
            </TouchableOpacity>
          </View>

          {error && (
            <Text style={{ color: "#dc2626", paddingHorizontal: 16, paddingTop: 12 }}>{error}</Text>
          )}

          {isLoading ? (
            <View style={{ padding: 32, alignItems: "center" }}>
              <ActivityIndicator size="large" color="#EA580C" />
            </View>
          ) : heldOrders.length === 0 ? (
            <View style={{ padding: 32, alignItems: "center" }}>
              <Ionicons name="albums-outline" size={40} color="#d1d5db" />
              <Text style={{ color: "#6b7280", marginTop: 8 }}>No saved carts</Text>
            </View>
          ) : (
            <ScrollView style={{ padding: 16 }} contentContainerStyle={{ paddingBottom: 16 }}>
              {heldOrders.map((heldOrder) => {
                const { label: savedAtLabel, isStale } = formatSavedAt(heldOrder.createdAt);
                const heldByName = heldOrder.heldBy.firstName || heldOrder.heldBy.username;
                return (
                  <View
                    key={heldOrder.id}
                    style={{
                      borderWidth: 1,
                      borderColor: "#e5e7eb",
                      borderRadius: 10,
                      padding: 12,
                      marginBottom: 10,
                    }}
                  >
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text style={{ fontWeight: "700", fontSize: 15, color: "#111827" }}>
                        {heldOrder.customerLabel || "Walk-in"}
                      </Text>
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: "600",
                          color: isStale ? "#dc2626" : "#9ca3af",
                        }}
                      >
                        {savedAtLabel}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>
                      {heldOrder.itemCount} item{heldOrder.itemCount === 1 ? "" : "s"} · ₱
                      {heldOrder.total.toFixed(2)} · saved by {heldByName}
                    </Text>
                    <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                      <TouchableOpacity
                        onPress={() => onDiscard(heldOrder)}
                        style={{
                          flex: 1,
                          paddingVertical: 9,
                          borderRadius: 8,
                          borderWidth: 1.5,
                          borderColor: "#d1d5db",
                          alignItems: "center",
                        }}
                      >
                        <Text style={{ fontWeight: "600", color: "#374151" }}>Discard</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => onResume(heldOrder)}
                        style={{
                          flex: 2,
                          paddingVertical: 9,
                          borderRadius: 8,
                          backgroundColor: primaryColor,
                          alignItems: "center",
                        }}
                      >
                        <Text style={{ fontWeight: "700", color: "#000" }}>Load Cart</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
}
