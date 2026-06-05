import { View, Text, TextInput, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ExpirationBatchInput } from "./types";
import { getExpirationStatus, formatDate } from "./inventoryUtils";

interface BatchRowProps {
  batch: ExpirationBatchInput;
  index: number;
  showRemove: boolean;
  warningDays?: number;
  textColor: string;
  primaryColor: string;
  error?: string | null;
  onQuantityChange: (value: string) => void;
  onDatePress: () => void;
  onClearDate: () => void;
  onRemove: () => void;
}

const BG_COLORS: Record<string, string> = {
  expired: "#fee2e2",
  "expiring-soon": "#ffedd5",
  warning: "#fef3c7",
  ok: "#f9fafb",
};

const BORDER_COLORS: Record<string, string> = {
  expired: "#fca5a5",
  "expiring-soon": "#fdba74",
  warning: "#fcd34d",
  ok: "#e5e7eb",
};

export default function BatchRow({
  batch,
  index,
  showRemove,
  warningDays,
  textColor,
  primaryColor,
  error,
  onQuantityChange,
  onDatePress,
  onClearDate,
  onRemove,
}: BatchRowProps) {
  const { status, daysLeft } = getExpirationStatus(
    batch.expirationDate,
    warningDays
  );

  const getStatusLine = (): { text: string; color: string } | null => {
    if (status === "expired") return { text: "● Expired", color: "#ef4444" };
    if (status === "expiring-soon" && daysLeft !== null)
      return {
        text: `● ${daysLeft} day${daysLeft !== 1 ? "s" : ""} left`,
        color: "#f97316",
      };
    if (status === "warning" && daysLeft !== null)
      return {
        text: `● ${daysLeft} day${daysLeft !== 1 ? "s" : ""} left`,
        color: "#eab308",
      };
    return null;
  };

  const statusLine = getStatusLine();

  return (
    <View
      className="mb-3 p-3 rounded-lg border"
      style={{
        backgroundColor: BG_COLORS[status] ?? "#f9fafb",
        borderColor: BORDER_COLORS[status] ?? "#e5e7eb",
      }}
    >
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-xs text-gray-500 font-medium">
          Batch {index + 1}
        </Text>
        {showRemove && (
          <TouchableOpacity
            onPress={onRemove}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close-circle" size={18} color="#ef4444" />
          </TouchableOpacity>
        )}
      </View>

      <View className="flex-row gap-2">
        <View className="flex-1">
          <TextInput
            className="border border-gray-300 rounded-lg px-3 py-2 text-center font-semibold bg-white"
            placeholder="Qty"
            keyboardType="decimal-pad"
            value={batch.quantity}
            onChangeText={(v) => onQuantityChange(v.replace(/[^0-9.]/g, ""))}
            style={{ color: textColor }}
          />
        </View>

        <View className="flex-1 flex-row items-center border border-gray-300 rounded-lg bg-white overflow-hidden">
          <TouchableOpacity onPress={onDatePress} className="flex-1 px-2 py-2">
            <Text
              className="text-center text-xs"
              style={{ color: batch.expirationDate ? textColor : "#9ca3af" }}
              numberOfLines={1}
            >
              {formatDate(batch.expirationDate)}
            </Text>
          </TouchableOpacity>
          {batch.expirationDate && (
            <TouchableOpacity onPress={onClearDate} className="pr-2">
              <Ionicons name="close-circle" size={14} color="#9ca3af" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {statusLine && (
        <Text className="text-xs mt-1" style={{ color: statusLine.color }}>
          {statusLine.text}
        </Text>
      )}

      {error && (
        <Text className="text-xs text-red-500 mt-1">{error}</Text>
      )}
    </View>
  );
}
