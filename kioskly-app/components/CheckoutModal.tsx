import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  TextInput,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState, useEffect } from "react";
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
  isLoading?: boolean;
  error?: string | null;
};

type PaymentDetails = {
  method: PaymentMethod;
  cashReceived?: number;
  change?: number;
  referenceNumber?: string;
  remarks?: string;
};

export default function CheckoutModal({
  visible,
  totalAmount,
  onClose,
  onCheckoutComplete,
  isLoading = false,
  error = null,
}: CheckoutModalProps) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(null);
  const [cashReceived, setCashReceived] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [remarks, setRemarks] = useState("");
  const [validationError, setValidationError] = useState("");

  const { tenant } = useTenant();
  const primaryColor = tenant?.themeColors?.primary || "#ea580c";
  const textColor = tenant?.themeColors?.text || "#1f2937";

  // Reset form when modal is closed (visible changes to false)
  useEffect(() => {
    if (!visible) {
      setPaymentMethod(null);
      setCashReceived("");
      setReferenceNumber("");
      setRemarks("");
      setValidationError("");
    }
  }, [visible]);

  const resetForm = () => {
    setPaymentMethod(null);
    setCashReceived("");
    setReferenceNumber("");
    setRemarks("");
    setValidationError("");
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handlePaymentMethodSelect = (method: PaymentMethod) => {
    setPaymentMethod(method);
    setValidationError("");
  };

  const calculateChange = (): number => {
    const received = parseFloat(cashReceived);
    if (isNaN(received)) return 0;
    return Math.max(0, received - totalAmount);
  };

  const validateAndSubmit = () => {
    setValidationError("");

    if (!paymentMethod) {
      setValidationError("Please select a payment method");
      return;
    }

    if (paymentMethod === "cash") {
      const received = parseFloat(cashReceived);

      if (!cashReceived || isNaN(received)) {
        setValidationError("Please enter the cash amount received");
        return;
      }

      if (received < totalAmount) {
        setValidationError("Cash received is less than the total amount");
        return;
      }

      const change = calculateChange();
      onCheckoutComplete(paymentMethod, {
        method: "cash",
        cashReceived: received,
        change,
        remarks: remarks.trim() || undefined,
      });
    } else if (paymentMethod === "online") {
      if (!referenceNumber.trim()) {
        setValidationError("Please enter the transaction reference number");
        return;
      }

      onCheckoutComplete(paymentMethod, {
        method: "online",
        referenceNumber: referenceNumber.trim(),
        remarks: remarks.trim() || undefined,
      });
    }

    // Don't reset form here - let parent component handle it after API success
    // resetForm();
  };

  const handleBack = () => {
    setPaymentMethod(null);
    setValidationError("");
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
            <TouchableOpacity
              onPress={handleClose}
              className="w-11 h-11 items-center justify-center rounded-full"
              style={{ backgroundColor: `${textColor}15` }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text className="text-3xl font-bold leading-none" style={{ color: textColor }}>
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
                      setValidationError("");
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
                      setValidationError("");
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

            {/* Remarks/Notes Field - Optional for all payment methods */}
            {paymentMethod && (
              <View className="mb-4">
                <Text className="text-sm font-semibold text-gray-700 mb-2">
                  Remarks (Optional)
                </Text>
                <TextInput
                  className="bg-gray-100 rounded-lg px-4 py-3 text-base border-2 border-gray-200"
                  placeholder="Add notes (e.g., corrections, special requests)"
                  value={remarks}
                  onChangeText={setRemarks}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
                <Text className="text-xs text-gray-500 mt-1">
                  Use this to document any mistakes or special circumstances
                </Text>
              </View>
            )}

            {/* Error Messages */}
            {(validationError || error) && (
              <View className="bg-red-50 border border-red-300 rounded-lg p-4 mb-4">
                <Text className="text-red-700 font-semibold">
                  {validationError || error}
                </Text>
              </View>
            )}
          </ScrollView>

          {/* Modal Footer */}
          {paymentMethod && (
            <View className="px-6 py-4 border-t border-gray-200">
              <TouchableOpacity
                className="rounded-lg py-4 items-center"
                style={{
                  backgroundColor: isLoading
                    ? `${primaryColor}80`
                    : primaryColor,
                }}
                onPress={validateAndSubmit}
                disabled={isLoading}
              >
                <Text
                  className="text-lg font-bold"
                  style={{ color: textColor }}
                >
                  {isLoading ? "Processing..." : "Complete Payment"}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}
