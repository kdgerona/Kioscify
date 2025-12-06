import { View, Text, TouchableOpacity, Modal, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { type Product, type Size, type Addon } from "../data/mockData";
import { useTenant } from "@/contexts/TenantContext";

type OrderItem = {
  id: string;
  product: Product;
  quantity: number;
  selectedSize?: Size;
  selectedAddons: Addon[];
};

type TransactionData = {
  transactionId: string;
  timestamp: Date;
  items: OrderItem[];
  subtotal: number;
  total: number;
  paymentMethod: "cash" | "online";
  cashReceived?: number;
  change?: number;
  referenceNumber?: string;
};

type TransactionSummaryProps = {
  visible: boolean;
  transaction: TransactionData | null;
  onNewOrder: () => void;
};

const formatDate = (date: Date): string => {
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "long",
    day: "numeric",
  };
  return date.toLocaleDateString("en-US", options);
};

const formatTime = (date: Date): string => {
  const options: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  };
  return date.toLocaleTimeString("en-US", options);
};

const calculateItemPrice = (item: OrderItem): number => {
  let price = item.product.price;
  if (item.selectedSize) {
    price += item.selectedSize.priceModifier;
  }
  item.selectedAddons.forEach((addon) => {
    price += addon.price;
  });
  return price;
};

export default function TransactionSummary({
  visible,
  transaction,
  onNewOrder,
}: TransactionSummaryProps) {
  const { tenant } = useTenant();
  const primaryColor = tenant?.themeColors?.primary || "#ea580c";
  const textColor = tenant?.themeColors?.text || "#1f2937";

  if (!transaction) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onNewOrder}
    >
      <SafeAreaView className="flex-1 bg-black/60 justify-center items-center p-2">
        <View className="bg-white rounded-2xl w-full max-w-2xl flex-1 my-2 shadow-2xl">
          {/* Success Header */}
          <LinearGradient
            colors={["#22c55e", "#16a34a"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ borderTopLeftRadius: 12, borderTopRightRadius: 12 }}
            className="px-6 py-3 items-center"
          >
            <View className="bg-white rounded-full w-12 h-12 items-center justify-center mb-2">
              <Text className="text-green-500 text-3xl">✓</Text>
            </View>
            <Text className="text-white text-lg font-bold">
              Payment Successful!
            </Text>
            <Text className="text-white text-xs">
              Transaction completed successfully
            </Text>
          </LinearGradient>

          <ScrollView
            className="flex-1 px-6 py-4"
            showsVerticalScrollIndicator={true}
          >
            {/* Transaction ID Section */}
            <View className="bg-gray-50 rounded-xl p-4 mb-4 border border-gray-200">
              <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Transaction ID
              </Text>
              <Text className="text-lg font-bold text-gray-900 mb-3">
                {transaction.transactionId}
              </Text>

              <View className="flex-row justify-between items-center">
                <View className="flex-1 mr-4">
                  <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    Date
                  </Text>
                  <Text className="text-sm font-semibold text-gray-800">
                    {formatDate(transaction.timestamp)}
                  </Text>
                </View>
                <View className="flex-1">
                  <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    Time
                  </Text>
                  <Text className="text-sm font-semibold text-gray-800">
                    {formatTime(transaction.timestamp)}
                  </Text>
                </View>
              </View>
            </View>

            {/* Order Items Section */}
            <View className="mb-4">
              <Text className="text-base font-bold text-gray-800 mb-3">
                Order Details
              </Text>

              <View className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                {transaction.items.map((item, index) => (
                  <View key={item.id}>
                    <View className="p-3">
                      <View className="flex-row justify-between items-start mb-2">
                        <View className="flex-1 mr-4">
                          <Text className="font-bold text-gray-900 text-base mb-1">
                            {item.product.name}
                          </Text>
                          {item.selectedSize && (
                            <Text className="text-sm text-gray-600">
                              Size: {item.selectedSize.name}
                              {item.selectedSize.volume &&
                                ` (${item.selectedSize.volume})`}
                            </Text>
                          )}
                          {item.selectedAddons.length > 0 && (
                            <Text className="text-sm text-gray-600">
                              Add-ons:{" "}
                              {item.selectedAddons
                                .map((a) => a.name)
                                .join(", ")}
                            </Text>
                          )}
                        </View>
                        <View className="items-end">
                          <Text className="text-sm text-gray-600 mb-1">
                            Qty: {item.quantity}
                          </Text>
                          <Text className="font-bold text-gray-900">
                            ₱
                            {(calculateItemPrice(item) * item.quantity).toFixed(
                              2
                            )}
                          </Text>
                        </View>
                      </View>

                      {/* Item price breakdown */}
                      <View className="bg-gray-50 rounded-lg p-2 mt-2">
                        <View className="flex-row justify-between mb-1">
                          <Text className="text-xs text-gray-600">
                            Base Price:
                          </Text>
                          <Text className="text-xs text-gray-800 font-medium">
                            ₱{item.product.price.toFixed(2)}
                          </Text>
                        </View>
                        {item.selectedSize &&
                          item.selectedSize.priceModifier > 0 && (
                            <View className="flex-row justify-between mb-1">
                              <Text className="text-xs text-gray-600">
                                Size ({item.selectedSize.name}):
                              </Text>
                              <Text className="text-xs text-gray-800 font-medium">
                                +₱{item.selectedSize.priceModifier.toFixed(2)}
                              </Text>
                            </View>
                          )}
                        {item.selectedAddons.map((addon) => (
                          <View
                            key={addon.id}
                            className="flex-row justify-between mb-1"
                          >
                            <Text className="text-xs text-gray-600">
                              {addon.name}:
                            </Text>
                            <Text className="text-xs text-gray-800 font-medium">
                              +₱{addon.price.toFixed(2)}
                            </Text>
                          </View>
                        ))}
                        <View className="border-t border-gray-300 pt-2 mt-1">
                          <View className="flex-row justify-between">
                            <Text className="text-xs font-semibold text-gray-700">
                              Unit Price:
                            </Text>
                            <Text className="text-xs font-bold text-gray-900">
                              ₱{calculateItemPrice(item).toFixed(2)}
                            </Text>
                          </View>
                        </View>
                      </View>
                    </View>

                    {index < transaction.items.length - 1 && (
                      <View className="border-b border-gray-200" />
                    )}
                  </View>
                ))}
              </View>
            </View>

            {/* Payment Summary Section */}
            <View
              className="p-4 mb-4 border-2 rounded-lg"
              style={{
                backgroundColor: `${primaryColor}10`,
                borderColor: `${primaryColor}80`,
              }}
            >
              <View
                className="flex-row justify-between items-center mb-3 pb-3 border-b"
                style={{ borderColor: `${primaryColor}80` }}
              >
                <Text
                  className="text-base font-semibold"
                  style={{ color: textColor }}
                >
                  Subtotal
                </Text>
                <Text
                  className="text-base font-semibold"
                  style={{ color: textColor }}
                >
                  ₱{transaction.subtotal.toFixed(2)}
                </Text>
              </View>

              <View className="flex-row justify-between items-center mb-3">
                <Text
                  className="text-lg font-bold"
                  style={{ color: textColor }}
                >
                  Total Amount
                </Text>
                <Text
                  className="text-xl font-bold"
                  style={{ color: textColor }}
                >
                  ₱{transaction.total.toFixed(2)}
                </Text>
              </View>

              {/* Payment Method Details */}
              <View className="bg-gray-100 rounded-lg p-3 mt-2">
                <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Payment Details
                </Text>

                <View className="flex-row justify-between items-center mb-2">
                  <Text className="text-sm font-medium text-gray-700">
                    Payment Method:
                  </Text>
                  <Text className="text-sm font-bold text-gray-900">
                    {transaction.paymentMethod === "cash"
                      ? "Cash Payment"
                      : "Online Transaction"}
                  </Text>
                </View>

                {transaction.paymentMethod === "cash" && (
                  <>
                    <View className="flex-row justify-between items-center mb-2">
                      <Text className="text-sm font-medium text-gray-700">
                        Cash Received:
                      </Text>
                      <Text className="text-sm font-semibold text-gray-900">
                        ₱{transaction.cashReceived?.toFixed(2)}
                      </Text>
                    </View>
                    <View className="bg-green-50 rounded-lg p-2 mt-2 border border-green-200">
                      <View className="flex-row justify-between items-center">
                        <Text className="text-sm font-bold text-green-800">
                          Change:
                        </Text>
                        <Text className="text-lg font-bold text-green-600">
                          ₱{transaction.change?.toFixed(2)}
                        </Text>
                      </View>
                    </View>
                  </>
                )}

                {transaction.paymentMethod === "online" && (
                  <View className="bg-blue-50 rounded-lg p-2 mt-2 border border-blue-200">
                    <Text className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1">
                      Reference Number
                    </Text>
                    <Text className="text-sm font-bold text-blue-900">
                      {transaction.referenceNumber}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* Thank You Message */}
            <View className="items-center py-3">
              <Text className="text-base font-bold text-gray-800 mb-1">
                Thank You for Your Purchase!
              </Text>
              <Text className="text-xs text-gray-600 text-center mb-4">
                Please keep this transaction ID for your records
              </Text>
            </View>
          </ScrollView>

          {/* Action Button */}
          <View className="px-6 py-4 border-t border-gray-200">
            <TouchableOpacity
              className="rounded-xl py-3 items-center shadow-lg"
              style={{ backgroundColor: primaryColor }}
              onPress={onNewOrder}
            >
              <Text
                className="text-base font-bold"
                style={{ color: textColor }}
              >
                Start New Order
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
