import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  TextInput,
  ScrollView,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState, useEffect } from "react";
import { useTenant } from "@/contexts/TenantContext";

export type PaymentMethod =
  | "cash"
  | "gcash"
  | "paymaya"
  | "online"
  | "foodpanda"
  | "grab"
  | null;

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
  discountAmount?: number;
};

const DISCOUNT_PERCENTAGES = [5, 10, 15, 20, 25, 50];

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
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [discountPercentage, setDiscountPercentage] = useState<number | null>(null);
  const [customDiscountAmount, setCustomDiscountAmount] = useState("");
  const [discountMode, setDiscountMode] = useState<"percentage" | "amount" | null>(null);

  const { tenant, brand } = useTenant();
  const primaryColor = brand?.themeColors?.primary ?? tenant?.themeColors?.primary ?? "#ea580c";
  const textColor = brand?.themeColors?.text ?? tenant?.themeColors?.text ?? "#1f2937";
  const backgroundColor = brand?.themeColors?.background ?? tenant?.themeColors?.background ?? "#ffffff";

  // Reset form when modal is closed (visible changes to false)
  useEffect(() => {
    if (!visible) {
      setPaymentMethod(null);
      setCashReceived("");
      setReferenceNumber("");
      setRemarks("");
      setValidationError("");
      setDiscountPercentage(null);
      setCustomDiscountAmount("");
      setDiscountMode(null);
    }
  }, [visible]);

  // Listen to keyboard show/hide events
  useEffect(() => {
    const showSubscription = Keyboard.addListener("keyboardDidShow", () => {
      setIsKeyboardVisible(true);
    });
    const hideSubscription = Keyboard.addListener("keyboardDidHide", () => {
      setIsKeyboardVisible(false);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const resetForm = () => {
    setPaymentMethod(null);
    setCashReceived("");
    setReferenceNumber("");
    setRemarks("");
    setValidationError("");
    setDiscountPercentage(null);
    setCustomDiscountAmount("");
    setDiscountMode(null);
  };

  const computedDiscount = (): number => {
    if (discountMode === "percentage" && discountPercentage !== null) {
      return totalAmount * discountPercentage / 100;
    }
    if (discountMode === "amount") {
      return Math.min(parseFloat(customDiscountAmount) || 0, totalAmount);
    }
    return 0;
  };

  const finalTotal = totalAmount - computedDiscount();

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
    return Math.max(0, received - finalTotal);
  };

  const handlePercentageChipPress = (pct: number) => {
    setDiscountMode("percentage");
    setDiscountPercentage(pct);
    setCustomDiscountAmount("");
  };

  const handleAmountInput = (text: string) => {
    setDiscountMode("amount");
    setCustomDiscountAmount(text);
    setDiscountPercentage(null);
  };

  const handleClearDiscount = () => {
    setDiscountMode(null);
    setDiscountPercentage(null);
    setCustomDiscountAmount("");
  };

  const isDiscountActive = computedDiscount() > 0;

  const discountLabel = (): string => {
    if (discountMode === "percentage" && discountPercentage !== null) {
      return `${discountPercentage}%`;
    }
    if (discountMode === "amount") {
      return `₱${(parseFloat(customDiscountAmount) || 0).toFixed(2)}`;
    }
    return "";
  };

  const validateAndSubmit = () => {
    setValidationError("");

    if (!paymentMethod) {
      setValidationError("Please select a payment method");
      return;
    }

    const discount = computedDiscount();

    if (paymentMethod === "cash") {
      const received = parseFloat(cashReceived);

      if (!cashReceived || isNaN(received)) {
        setValidationError("Please enter the cash amount received");
        return;
      }

      if (received < finalTotal) {
        setValidationError("Cash received is less than the total amount");
        return;
      }

      const change = received - finalTotal;
      onCheckoutComplete(paymentMethod, {
        method: "cash",
        cashReceived: received,
        change,
        remarks: remarks.trim() || undefined,
        ...(discount > 0 && { discountAmount: discount }),
      });
    } else {
      // gcash, paymaya, online, foodpanda, grab - all require reference number
      if (!referenceNumber.trim()) {
        setValidationError("Please enter the transaction reference number");
        return;
      }

      onCheckoutComplete(paymentMethod, {
        method: paymentMethod,
        referenceNumber: referenceNumber.trim(),
        remarks: remarks.trim() || undefined,
        ...(discount > 0 && { discountAmount: discount }),
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
      <SafeAreaView className="flex-1 bg-black/50 justify-center items-center px-4">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "padding"}
          style={{ width: "100%", maxWidth: 800 }}
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
          enabled={isKeyboardVisible}
        >
          <View
            className="w-full bg-white rounded-lg"
            style={{ maxHeight: "95%" }}
          >
            {/* Modal Header */}
            <View
              className="px-6 py-4 rounded-t-lg flex-row justify-between items-center"
              style={{ backgroundColor: backgroundColor }}
            >
              <View className="flex flex-row items-center justify-center">
                {paymentMethod && (
                  <TouchableOpacity onPress={handleBack} className="mr-3">
                    <Text className="text-black text-2xl font-bold mb-3">
                      ←
                    </Text>
                  </TouchableOpacity>
                )}
                <Text
                  className="text-xl font-bold"
                  style={{ color: textColor }}
                >
                  Checkout
                </Text>
              </View>
              <TouchableOpacity
                onPress={handleClose}
                className="w-11 h-11 items-center justify-center rounded-full"
                style={{ backgroundColor: `${textColor}15` }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text
                  className="text-3xl font-bold leading-none"
                  style={{ color: textColor }}
                >
                  ×
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              className={`px-6 ${isKeyboardVisible ? "py-2" : "py-4"}`}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={true}
              contentContainerStyle={{ paddingBottom: 20 }}
            >
              {/* Total Amount Display */}
              <View
                className="border-2 rounded-lg p-4 mb-4"
                style={{
                  backgroundColor: `${primaryColor}10`,
                  borderColor: `${primaryColor}80`,
                }}
              >
                {isDiscountActive ? (
                  <>
                    <View className="flex-row justify-between items-center mb-1">
                      <Text
                        className="text-base font-medium"
                        style={{ color: textColor }}
                      >
                        Subtotal:
                      </Text>
                      <Text
                        className="text-base font-medium"
                        style={{ color: textColor }}
                      >
                        ₱{totalAmount.toFixed(2)}
                      </Text>
                    </View>
                    <View className="flex-row justify-between items-center mb-2">
                      <Text className="text-base font-medium text-red-600">
                        Discount ({discountLabel()}):
                      </Text>
                      <Text className="text-base font-medium text-red-600">
                        -₱{computedDiscount().toFixed(2)}
                      </Text>
                    </View>
                    <View
                      className="border-t mb-2"
                      style={{ borderColor: `${primaryColor}40` }}
                    />
                    <View className="flex-row justify-between items-center">
                      <Text
                        className="text-lg font-bold"
                        style={{ color: textColor }}
                      >
                        Total Due:
                      </Text>
                      <Text
                        className="text-2xl font-bold"
                        style={{ color: textColor }}
                      >
                        ₱{finalTotal.toFixed(2)}
                      </Text>
                    </View>
                  </>
                ) : (
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
                      ₱{finalTotal.toFixed(2)}
                    </Text>
                  </View>
                )}
              </View>

              {/* Discount Section — editable before payment method is selected */}
              {!paymentMethod && (
                <View className="mb-4">
                  <Text className="text-sm font-semibold text-gray-700 mb-2">
                    Discount
                  </Text>

                  {/* Percentage chips + inline amount input in one wrapping row */}
                  <View className="flex-row flex-wrap items-center">
                    {DISCOUNT_PERCENTAGES.map((pct) => {
                      const isActive = discountMode === "percentage" && discountPercentage === pct;
                      return (
                        <TouchableOpacity
                          key={pct}
                          className="mr-2 mb-2 px-3 py-1.5 rounded-full border"
                          style={{
                            backgroundColor: isActive ? primaryColor : "#f3f4f6",
                            borderColor: isActive ? primaryColor : "#e5e7eb",
                          }}
                          onPress={() => handlePercentageChipPress(pct)}
                        >
                          <Text
                            className="text-sm font-semibold"
                            style={{ color: isActive ? "#ffffff" : textColor }}
                          >
                            {pct}%
                          </Text>
                        </TouchableOpacity>
                      );
                    })}

                    {/* Inline manual amount — styled like a chip */}
                    <View
                      className="mr-2 mb-2 px-3 rounded-full border flex-row items-center"
                      style={{
                        backgroundColor: discountMode === "amount" ? `${primaryColor}15` : "#f3f4f6",
                        borderColor: discountMode === "amount" ? primaryColor : "#e5e7eb",
                        paddingVertical: 6,
                      }}
                    >
                      <Text
                        className="text-sm font-semibold"
                        style={{ color: discountMode === "amount" ? primaryColor : "#9ca3af" }}
                      >
                        ₱
                      </Text>
                      <TextInput
                        style={{
                          width: 64,
                          fontSize: 14,
                          fontWeight: "600",
                          color: discountMode === "amount" ? textColor : "#6b7280",
                          padding: 0,
                          marginLeft: 2,
                        }}
                        placeholder="0.00"
                        placeholderTextColor="#9ca3af"
                        value={customDiscountAmount}
                        onChangeText={handleAmountInput}
                        keyboardType="decimal-pad"
                      />
                    </View>

                    {/* Clear — only when discount is active */}
                    {isDiscountActive && (
                      <TouchableOpacity className="mb-2" onPress={handleClearDiscount}>
                        <Text className="text-sm text-red-500 font-medium">Clear</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              )}

              {/* Locked discount summary — shown after payment method selected, only if discount active */}
              {paymentMethod && isDiscountActive && (
                <View className="mb-3">
                  <Text className="text-xs text-gray-500">
                    Discount applied: -₱{computedDiscount().toFixed(2)} ({discountLabel()})
                  </Text>
                </View>
              )}

              {/* Payment Method Selection */}
              {!paymentMethod && (
                <View>
                  <Text className="text-lg font-bold mb-3 text-gray-800">
                    Select Payment Method
                  </Text>

                  <View className="flex-row flex-wrap -mx-1.5">
                    <View className="w-1/2 px-1.5 mb-2.5">
                      <TouchableOpacity
                        className="bg-green-500 rounded-lg py-4 px-3 items-center shadow-sm"
                        onPress={() => handlePaymentMethodSelect("cash")}
                      >
                        <Text className="text-white text-xl font-bold mb-1">
                          Cash
                        </Text>
                        <Text className="text-green-50 text-xs text-center">
                          Receive cash
                        </Text>
                      </TouchableOpacity>
                    </View>

                    <View className="w-1/2 px-1.5 mb-2.5">
                      <TouchableOpacity
                        className="bg-gray-600 rounded-lg py-4 px-3 items-center shadow-sm"
                        onPress={() => handlePaymentMethodSelect("online")}
                      >
                        <Text className="text-white text-xl font-bold mb-1">
                          Online
                        </Text>
                        <Text className="text-gray-200 text-xs text-center">
                          Bank/E-wallet
                        </Text>
                      </TouchableOpacity>
                    </View>

                    <View className="w-1/2 px-1.5 mb-2.5">
                      <TouchableOpacity
                        className="bg-blue-600 rounded-lg py-4 px-3 items-center shadow-sm"
                        onPress={() => handlePaymentMethodSelect("gcash")}
                      >
                        <Text className="text-white text-xl font-bold mb-1">
                          GCash
                        </Text>
                        <Text className="text-blue-100 text-xs text-center">
                          Mobile wallet
                        </Text>
                      </TouchableOpacity>
                    </View>

                    <View className="w-1/2 px-1.5 mb-2.5">
                      <TouchableOpacity
                        className="rounded-lg py-4 px-3 items-center shadow-sm"
                        style={{ backgroundColor: "#202122" }}
                        onPress={() => handlePaymentMethodSelect("paymaya")}
                      >
                        <Text className="text-xl font-bold mb-1" style={{ color: "#50B16B" }}>
                          Maya
                        </Text>
                        <Text className="text-xs text-center" style={{ color: "#50B16B", opacity: 0.8 }}>
                          Maya wallet
                        </Text>
                      </TouchableOpacity>
                    </View>

                    <View className="w-1/2 px-1.5 mb-2.5">
                      <TouchableOpacity
                        className="bg-pink-500 rounded-lg py-4 px-3 items-center shadow-sm"
                        onPress={() => handlePaymentMethodSelect("foodpanda")}
                      >
                        <Text className="text-white text-xl font-bold mb-1">
                          FoodPanda
                        </Text>
                        <Text className="text-pink-100 text-xs text-center">
                          Delivery order
                        </Text>
                      </TouchableOpacity>
                    </View>

                    <View className="w-1/2 px-1.5 mb-2.5">
                      <TouchableOpacity
                        className="rounded-lg py-4 px-3 items-center shadow-sm"
                        style={{ backgroundColor: "#00B14F" }}
                        onPress={() => handlePaymentMethodSelect("grab")}
                      >
                        <Text className="text-white text-xl font-bold mb-1">
                          Grab
                        </Text>
                        <Text className="text-white text-xs text-center opacity-80">
                          Delivery order
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
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
                    <View className="flex-row">
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
                        onPress={() => setCashReceived(finalTotal.toString())}
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
                          ₱{finalTotal.toFixed(2)}
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

              {/* Non-Cash Payment Form */}
              {paymentMethod && paymentMethod !== "cash" && (
                <View>
                  <Text className="text-lg font-bold mb-4 text-gray-800">
                    {paymentMethod === "gcash" && "GCash Payment"}
                    {paymentMethod === "paymaya" && "Maya Payment"}
                    {paymentMethod === "online" && "Online Transaction"}
                    {paymentMethod === "foodpanda" && "FoodPanda Delivery"}
                    {paymentMethod === "grab" && "Grab Delivery"}
                  </Text>

                  <View className="mb-4">
                    <Text className="text-sm font-semibold text-gray-700 mb-2">
                      Reference / Order Number
                    </Text>
                    <TextInput
                      className="bg-gray-100 rounded-lg px-4 py-4 text-lg border-2 border-gray-200"
                      placeholder={
                        paymentMethod === "gcash"
                          ? "Enter GCash reference number"
                          : paymentMethod === "paymaya"
                            ? "Enter Maya reference number"
                            : paymentMethod === "foodpanda"
                              ? "Enter FoodPanda order number"
                              : paymentMethod === "grab"
                                ? "Enter Grab order number"
                                : "Enter transaction reference number"
                      }
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
                    {paymentMethod === "gcash" && (
                      <Text className="text-xs text-gray-600">
                        Enter the GCash reference number from the payment
                        confirmation.
                      </Text>
                    )}
                    {paymentMethod === "paymaya" && (
                      <Text className="text-xs text-gray-600">
                        Enter the Maya reference number from the payment
                        confirmation.
                      </Text>
                    )}
                    {paymentMethod === "foodpanda" && (
                      <Text className="text-xs text-gray-600">
                        Enter the FoodPanda order number for delivery tracking.
                      </Text>
                    )}
                    {paymentMethod === "grab" && (
                      <Text className="text-xs text-gray-600">
                        Enter the Grab order number for delivery tracking.
                      </Text>
                    )}
                    {paymentMethod === "online" && (
                      <Text className="text-xs text-gray-600">
                        Supported: Bank Transfer and other online payment
                        methods.
                      </Text>
                    )}
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
                    numberOfLines={1}
                  >
                    {isLoading ? "Processing..." : "Complete Payment"}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
