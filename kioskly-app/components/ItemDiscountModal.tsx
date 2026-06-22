import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useState, useEffect } from "react";
import {
  DISCOUNT_PERCENTAGES,
  DiscountMode,
  ItemDiscount,
  computeDiscountAmount,
} from "@/utils/discount";

type ItemDiscountModalProps = {
  visible: boolean;
  baseLineTotal: number;
  initialDiscount?: ItemDiscount;
  onApply: (discount: ItemDiscount) => void;
  onClear: () => void;
  onClose: () => void;
};

export default function ItemDiscountModal({
  visible,
  baseLineTotal,
  initialDiscount,
  onApply,
  onClear,
  onClose,
}: ItemDiscountModalProps) {
  const [discountMode, setDiscountMode] = useState<DiscountMode | null>(null);
  const [discountPercentage, setDiscountPercentage] = useState<number | null>(null);
  const [customDiscountAmount, setCustomDiscountAmount] = useState("");

  useEffect(() => {
    if (visible) {
      if (initialDiscount) {
        setDiscountMode(initialDiscount.mode);
        setDiscountPercentage(initialDiscount.percentage ?? null);
        setCustomDiscountAmount(initialDiscount.customAmount ?? "");
      } else {
        setDiscountMode(null);
        setDiscountPercentage(null);
        setCustomDiscountAmount("");
      }
    }
  }, [visible, initialDiscount]);

  const computedAmount = computeDiscountAmount(
    baseLineTotal,
    discountMode,
    discountPercentage,
    customDiscountAmount,
  );

  const newLineTotal = baseLineTotal - computedAmount;

  const handleApply = () => {
    if (computedAmount <= 0) return;
    onApply({
      mode: discountMode!,
      percentage: discountMode === "percentage" ? discountPercentage ?? undefined : undefined,
      customAmount: discountMode === "amount" ? customDiscountAmount : undefined,
      amount: computedAmount,
    });
  };

  const handleClear = () => {
    setDiscountMode(null);
    setDiscountPercentage(null);
    setCustomDiscountAmount("");
    onClear();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" }}
        activeOpacity={1}
        onPress={onClose}
      >
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View
              style={{
                backgroundColor: "#fff",
                borderRadius: 12,
                padding: 20,
                width: 340,
                maxWidth: "90%",
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: "700", marginBottom: 4 }}>
                Item Discount
              </Text>
              <Text style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>
                Regular total: ₱{baseLineTotal.toFixed(2)}
              </Text>

              {/* Percentage chips */}
              <Text style={{ fontSize: 12, fontWeight: "600", color: "#374151", marginBottom: 8 }}>
                Percentage
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                {DISCOUNT_PERCENTAGES.map((pct) => {
                  const active = discountMode === "percentage" && discountPercentage === pct;
                  return (
                    <TouchableOpacity
                      key={pct}
                      onPress={() => {
                        setDiscountMode("percentage");
                        setDiscountPercentage(pct);
                        setCustomDiscountAmount("");
                      }}
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 7,
                        borderRadius: 20,
                        borderWidth: 1.5,
                        borderColor: active ? "#FF9B00" : "#d1d5db",
                        backgroundColor: active ? "#FF9B0015" : "#f9fafb",
                      }}
                    >
                      <Text style={{ fontWeight: "600", color: active ? "#FF9B00" : "#374151" }}>
                        {pct}%
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Custom flat amount */}
              <Text style={{ fontSize: 12, fontWeight: "600", color: "#374151", marginBottom: 8 }}>
                Custom Amount (₱)
              </Text>
              <TextInput
                value={customDiscountAmount}
                onChangeText={(v) => {
                  setCustomDiscountAmount(v);
                  setDiscountMode("amount");
                  setDiscountPercentage(null);
                }}
                keyboardType="decimal-pad"
                placeholder="0.00"
                style={{
                  borderWidth: 1.5,
                  borderColor: discountMode === "amount" ? "#FF9B00" : "#d1d5db",
                  borderRadius: 8,
                  padding: 10,
                  fontSize: 15,
                  marginBottom: 16,
                }}
              />

              {/* Preview */}
              {computedAmount > 0 && (
                <View
                  style={{
                    backgroundColor: "#f0fdf4",
                    borderRadius: 8,
                    padding: 10,
                    marginBottom: 16,
                  }}
                >
                  <Text style={{ fontSize: 13, color: "#15803d" }}>
                    Discount: -₱{computedAmount.toFixed(2)}
                  </Text>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: "#15803d" }}>
                    New line total: ₱{newLineTotal.toFixed(2)}
                  </Text>
                </View>
              )}

              {/* Actions */}
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity
                  onPress={handleClear}
                  style={{
                    flex: 1,
                    paddingVertical: 11,
                    borderRadius: 8,
                    borderWidth: 1.5,
                    borderColor: "#d1d5db",
                    alignItems: "center",
                  }}
                >
                  <Text style={{ fontWeight: "600", color: "#374151" }}>Clear</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleApply}
                  disabled={computedAmount <= 0}
                  style={{
                    flex: 2,
                    paddingVertical: 11,
                    borderRadius: 8,
                    backgroundColor: computedAmount > 0 ? "#FF9B00" : "#d1d5db",
                    alignItems: "center",
                  }}
                >
                  <Text style={{ fontWeight: "700", color: "#fff" }}>Apply Discount</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </TouchableOpacity>
    </Modal>
  );
}
