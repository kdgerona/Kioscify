import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  TextInput,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState } from "react";
import { useTenant } from "@/contexts/TenantContext";

type PaymentMethod = "cash" | "online" | null;

type CheckoutModalProps = {
  visible: boolean;
  totalAmount: number;
  onClose: () => void;
  onCheckoutComplete: (
    paymentMethod: PaymentMethod,
    details: PaymentDetails
  ) => void;
};

type PaymentDetails = {
  method: PaymentMethod;
  cashReceived?: number;
  change?: number;
  referenceNumber?: string;
};

export default function CheckoutModal({
  visible,
  totalAmount,
  onClose,
  onCheckoutComplete,
}: CheckoutModalProps) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(null);
  const [cashReceived, setCashReceived] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [error, setError] = useState("");

  const { tenant } = useTenant();
  const primaryColor = tenant?.themeColors?.primary || "#ea580c";
  const textColor = tenant?.themeColors?.text || "#1f2937";

  const resetForm = () => {
    setPaymentMethod(null);
    setCashReceived("");
    setReferenceNumber("");
    setError("");
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handlePaymentMethodSelect = (method: PaymentMethod) => {
    setPaymentMethod(method);
    setError("");
  };

  const calculateChange = (): number => {
    const received = parseFloat(cashReceived);
    if (isNaN(received)) return 0;
    return Math.max(0, received - totalAmount);
  };

  const validateAndSubmit = () => {
    setError("");

    if (!paymentMethod) {
      setError("Please select a payment method");
      return;
    }

    if (paymentMethod === "cash") {
      const received = parseFloat(cashReceived);

      if (!cashReceived || isNaN(received)) {
        setError("Please enter the cash amount received");
        return;
      }

      if (received < totalAmount) {
        setError("Cash received is less than the total amount");
        return;
      }

      const change = calculateChange();
      onCheckoutComplete(paymentMethod, {
        method: "cash",
        cashReceived: received,
        change,
      });
    } else if (paymentMethod === "online") {
      if (!referenceNumber.trim()) {
        setError("Please enter the transaction reference number");
        return;
      }

      onCheckoutComplete(paymentMethod, {
        method: "online",
        referenceNumber: referenceNumber.trim(),
      });
    }

    resetForm();
  };

  const handleBack = () => {
    setPaymentMethod(null);
    setError("");
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <SafeAreaView className="flex-1 bg-black/50 justify-center items-center">
        <View className="bg-white rounded-lg w-11/12 max-w-lg">
          {/* Modal Header */}
          <View
            className="px-6 py-4 rounded-t-lg flex-row justify-between items-center"
            style={{ backgroundColor: primaryColor }}
          >
            <View className="flex flex-row items-center justify-center">
              {paymentMethod && (
                <TouchableOpacity onPress={handleBack} className="mr-3">
                  <Text className="text-black text-2xl font-bold mb-3">←</Text>
                </TouchableOpacity>
              )}
              <Text className="text-xl font-bold" style={{ color: textColor }}>
                Checkout
              </Text>
            </View>
            <TouchableOpacity onPress={handleClose}>
              <Text className="text-2xl font-bold" style={{ color: textColor }}>
                ×
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView className="px-6 py-6">
            {/* Total Amount Display */}
            <View
              className="border-2 rounded-lg p-4 mb-6"
              style={{
                backgroundColor: `${primaryColor}10`,
                borderColor: `${primaryColor}80`,
              }}
            >
              <View className="flex-row justify-between items-center">
                <Text
                  className="text-lg font-semibold"
                  style={{ color: textColor }}
                >
                  Total Due:
                </Text>
                <Text
                  className="text-2xl font-bold"
                  style={{ color: textColor }}
                >
                  ₱{totalAmount.toFixed(2)}
                </Text>
              </View>
            </View>

            {/* Payment Method Selection */}
            {!paymentMethod && (
              <View>
                <Text className="text-lg font-bold mb-4 text-gray-800">
                  Select Payment Method
                </Text>

                <TouchableOpacity
                  className="bg-green-500 rounded-lg p-6 mb-3 items-center shadow-sm"
                  onPress={() => handlePaymentMethodSelect("cash")}
                >
                  <Text className="text-white text-xl font-bold mb-1">
                    Cash Payment
                  </Text>
                  <Text className="text-green-50 text-sm">
                    Receive cash and provide change
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  className="bg-blue-500 rounded-lg p-6 items-center shadow-sm"
                  onPress={() => handlePaymentMethodSelect("online")}
                >
                  <Text className="text-white text-xl font-bold mb-1">
                    Online Transaction
                  </Text>
                  <Text className="text-blue-50 text-sm">
                    GCash, PayMaya, Bank Transfer, etc.
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Cash Payment Form */}
            {paymentMethod === "cash" && (
              <View>
                <Text
                  className="text-lg font-bold mb-4"
                  style={{ color: textColor }}
                >
                  Cash Payment
                </Text>

                <View className="mb-4">
                  <Text
                    className="text-sm font-semibold"
                    style={{ color: textColor }}
                  >
                    Cash Received
                  </Text>
                  <TextInput
                    className="bg-gray-100 rounded-lg px-4 py-4 text-lg border-2 border-gray-200"
                    placeholder="Enter amount"
                    value={cashReceived}
                    onChangeText={(text) => {
                      setCashReceived(text);
                      setError("");
                    }}
                    keyboardType="decimal-pad"
                    autoFocus
                  />
                </View>

                {/* Quick amount buttons */}
                <View className="mb-4">
                  <Text
                    className="text-sm font-semibold"
                    style={{ color: textColor }}
                  >
                    Quick Select
                  </Text>
                  <View className="flex-row flex-wrap">
                    {[100, 200, 500, 1000].map((amount) => (
                      <TouchableOpacity
                        key={amount}
                        className="bg-gray-200 rounded-lg px-4 py-2 mr-2 mb-2"
                        onPress={() => setCashReceived(amount.toString())}
                      >
                        <Text className="font-semibold text-gray-800">
                          ₱{amount}
                        </Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity
                      className="rounded-lg px-4 py-2 mb-2"
                      style={{ backgroundColor: `${primaryColor}50` }}
                      onPress={() => setCashReceived(totalAmount.toString())}
                    >
                      <Text
                        className="font-semibold"
                        style={{ color: textColor }}
                      >
                        Exact Amount
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Change calculation display */}
                {cashReceived && !isNaN(parseFloat(cashReceived)) && (
                  <View className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4 mb-4">
                    <View className="flex-row justify-between items-center mb-2">
                      <Text className="text-gray-700 font-medium">Due:</Text>
                      <Text className="text-gray-900 font-semibold">
                        ₱{totalAmount.toFixed(2)}
                      </Text>
                    </View>
                    <View className="flex-row justify-between items-center mb-2">
                      <Text className="text-gray-700 font-medium">
                        Cash Received:
                      </Text>
                      <Text className="text-gray-900 font-semibold">
                        ₱{parseFloat(cashReceived).toFixed(2)}
                      </Text>
                    </View>
                    <View className="border-t border-blue-300 pt-2 mt-2">
                      <View className="flex-row justify-between items-center">
                        <Text className="text-lg font-bold text-gray-800">
                          Change:
                        </Text>
                        <Text
                          className={`text-2xl font-bold ${
                            calculateChange() >= 0
                              ? "text-green-600"
                              : "text-red-600"
                          }`}
                        >
                          ₱{calculateChange().toFixed(2)}
                        </Text>
                      </View>
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* Online Transaction Form */}
            {paymentMethod === "online" && (
              <View>
                <Text className="text-lg font-bold mb-4 text-gray-800">
                  Online Transaction
                </Text>

                <View className="mb-4">
                  <Text className="text-sm font-semibold text-gray-700 mb-2">
                    Reference Number
                  </Text>
                  <TextInput
                    className="bg-gray-100 rounded-lg px-4 py-4 text-lg border-2 border-gray-200"
                    placeholder="Enter transaction reference number"
                    value={referenceNumber}
                    onChangeText={(text) => {
                      setReferenceNumber(text);
                      setError("");
                    }}
                    autoFocus
                    autoCapitalize="characters"
                  />
                </View>

                <View className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <Text className="text-sm text-gray-700 mb-2">
                    Please ensure you have received the payment confirmation
                    before proceeding.
                  </Text>
                  <Text className="text-xs text-gray-600">
                    Supported: GCash, PayMaya, Bank Transfer, and other online
                    payment methods.
                  </Text>
                </View>
              </View>
            )}

            {/* Error Message */}
            {error && (
              <View className="bg-red-50 border border-red-300 rounded-lg p-4 mb-4">
                <Text className="text-red-700 font-semibold">{error}</Text>
              </View>
            )}
          </ScrollView>

          {/* Modal Footer */}
          {paymentMethod && (
            <View className="px-6 py-4 border-t border-gray-200">
              <TouchableOpacity
                className="rounded-lg py-4 items-center"
                style={{ backgroundColor: primaryColor }}
                onPress={validateAndSubmit}
              >
                <Text
                  className="text-lg font-bold"
                  style={{ color: textColor }}
                >
                  Complete Payment
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}
