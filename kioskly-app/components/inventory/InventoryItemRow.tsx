import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { InventoryInput } from "./types";
import { ExpiryStatus, getItemWorstExpiryStatus } from "./inventoryUtils";

interface InventoryItemRowProps {
  item: InventoryInput;
  primaryColor: string;
  textColor: string;
  onPress: () => void;
}

const STATUS_DOT_COLORS: Record<ExpiryStatus | "none" | "uncounted", string> = {
  expired: "#ef4444",
  "expiring-soon": "#f97316",
  warning: "#eab308",
  ok: "#22c55e",
  uncounted: "#9ca3af",
  none: "#9ca3af",
};

export default function InventoryItemRow({
  item,
  primaryColor,
  textColor,
  onPress,
}: InventoryItemRowProps) {
  const isCounted = item.quantity.trim() !== "";
  const expiryStatus = getItemWorstExpiryStatus(item);

  const renderStatusIndicator = () => {
    if (isCounted) {
      if (!item.requiresExpirationDate) {
        return <Ionicons name="checkmark-circle" size={20} color="#22c55e" />;
      }
      const dotColor = STATUS_DOT_COLORS[expiryStatus];
      return (
        <View
          style={{
            width: 12,
            height: 12,
            borderRadius: 6,
            backgroundColor: dotColor,
          }}
        />
      );
    }

    // Not yet counted
    if (item.requiresExpirationDate) {
      // Hollow circle draws attention
      return (
        <View
          style={{
            width: 12,
            height: 12,
            borderRadius: 6,
            borderWidth: 2,
            borderColor: primaryColor,
          }}
        />
      );
    }
    return (
      <View
        style={{
          width: 12,
          height: 12,
          borderRadius: 6,
          backgroundColor: "#9ca3af",
        }}
      />
    );
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      className="bg-white flex-row items-center px-4 py-3 mb-2 rounded-lg border border-gray-200"
      activeOpacity={0.7}
    >
      <View className="mr-3 items-center justify-center" style={{ width: 20 }}>
        {renderStatusIndicator()}
      </View>

      <View className="flex-1">
        <Text
          className="text-sm font-semibold"
          style={{ color: textColor }}
          numberOfLines={1}
        >
          {item.name}
        </Text>
        <Text className="text-xs text-gray-500">{item.unit}</Text>
      </View>

      <View className="items-end mr-2">
        {isCounted ? (
          <Text className="text-sm font-bold" style={{ color: textColor }}>
            {item.quantity} {item.unit}
          </Text>
        ) : (
          item.previousQuantity !== null && (
            <Text className="text-xs text-gray-400">
              last: {item.previousQuantity}
            </Text>
          )
        )}
      </View>

      <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
    </TouchableOpacity>
  );
}
