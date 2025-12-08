import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  TextInput,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState, useEffect } from "react";
import { useTenant } from "@/contexts/TenantContext";
import {
  ExpenseCategory,
  CreateExpensePayload,
} from "@/services/expenseService";
import "@/global.css";

type ExpenseModalProps = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (expenseData: CreateExpensePayload) => Promise<void>;
  isLoading?: boolean;
};

const EXPENSE_CATEGORIES = [
  { value: ExpenseCategory.SUPPLIES, label: "Supplies" },
  { value: ExpenseCategory.UTILITIES, label: "Utilities" },
  { value: ExpenseCategory.RENT, label: "Rent" },
  { value: ExpenseCategory.SALARIES, label: "Salaries" },
  { value: ExpenseCategory.MARKETING, label: "Marketing" },
  { value: ExpenseCategory.MAINTENANCE, label: "Maintenance" },
  { value: ExpenseCategory.TRANSPORTATION, label: "Transportation" },
  { value: ExpenseCategory.MISCELLANEOUS, label: "Miscellaneous" },
];

export default function ExpenseModal({
  visible,
  onClose,
  onSubmit,
  isLoading = false,
}: ExpenseModalProps) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<ExpenseCategory | null>(null);
  const [notes, setNotes] = useState("");
  const [validationError, setValidationError] = useState("");
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  const { tenant } = useTenant();
  const primaryColor = tenant?.themeColors?.primary || "#ea580c";
  const textColor = tenant?.themeColors?.text || "#1f2937";

  // Reset form when modal is closed
  useEffect(() => {
    if (!visible) {
      resetForm();
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
    setDescription("");
    setAmount("");
    setCategory(null);
    setNotes("");
    setValidationError("");
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const validateAndSubmit = async () => {
    setValidationError("");

    if (!description.trim()) {
      setValidationError("Please enter a description");
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      setValidationError("Please enter a valid amount");
      return;
    }

    if (!category) {
      setValidationError("Please select a category");
      return;
    }

    const expenseData: CreateExpensePayload = {
      description: description.trim(),
      amount: parsedAmount,
      category,
      notes: notes.trim() || undefined,
    };

    try {
      await onSubmit(expenseData);
      resetForm();
    } catch (error) {
      setValidationError(
        error instanceof Error ? error.message : "Failed to create expense"
      );
    }
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
          style={{ width: "100%", maxWidth: 512 }}
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
          enabled={isKeyboardVisible}
        >
          <View className="w-full max-w-lg bg-white rounded-lg max-h-full">
            {/* Modal Header */}
            <View
              className="px-6 py-4 rounded-t-lg flex-row justify-between items-center"
              style={{ backgroundColor: primaryColor }}
            >
              <Text className="text-xl font-bold" style={{ color: textColor }}>
                Add Expense
              </Text>
              <TouchableOpacity
                onPress={handleClose}
                className="w-8 h-8 rounded-full items-center justify-center"
                style={{ backgroundColor: `${textColor}15` }}
                disabled={isLoading}
              >
                <Text
                  className="text-xl font-bold"
                  style={{ color: textColor }}
                >
                  ×
                </Text>
              </TouchableOpacity>
            </View>

            {/* Modal Content */}
            <ScrollView
              className="px-6 py-4"
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Description Input */}
              <View className="mb-4">
                <Text
                  className="text-base font-semibold mb-2"
                  style={{ color: textColor }}
                >
                  Description *
                </Text>
                <TextInput
                  className="border border-gray-300 rounded-lg px-4 py-3 text-base"
                  placeholder="e.g., Purchased paper cups and lids"
                  value={description}
                  onChangeText={setDescription}
                  editable={!isLoading}
                />
              </View>

              {/* Amount Input */}
              <View className="mb-4">
                <Text
                  className="text-base font-semibold mb-2"
                  style={{ color: textColor }}
                >
                  Amount *
                </Text>
                <TextInput
                  className="border border-gray-300 rounded-lg px-4 py-3 text-base"
                  placeholder="0.00"
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                  editable={!isLoading}
                />
              </View>

              {/* Category Selection */}
              <View className="mb-4">
                <Text
                  className="text-base font-semibold mb-2"
                  style={{ color: textColor }}
                >
                  Category *
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {EXPENSE_CATEGORIES.map((cat) => (
                    <TouchableOpacity
                      key={cat.value}
                      onPress={() => setCategory(cat.value)}
                      disabled={isLoading}
                      className={`px-4 py-2 rounded-lg border ${
                        category === cat.value
                          ? "border-transparent"
                          : "border-gray-300 bg-gray-50"
                      }`}
                      style={
                        category === cat.value
                          ? { backgroundColor: primaryColor }
                          : undefined
                      }
                    >
                      <Text
                        className="text-sm font-medium"
                        style={{
                          color: category === cat.value ? textColor : "#374151",
                        }}
                      >
                        {cat.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Notes Input */}
              <View className="mb-4">
                <Text
                  className="text-base font-semibold mb-2"
                  style={{ color: textColor }}
                >
                  Notes (Optional)
                </Text>
                <TextInput
                  className="border border-gray-300 rounded-lg px-4 py-3 text-base"
                  placeholder="Additional details..."
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  editable={!isLoading}
                />
              </View>

              {/* Validation Error */}
              {validationError && (
                <View className="mb-4 p-3 bg-red-50 rounded-lg">
                  <Text className="text-red-600 text-sm">
                    {validationError}
                  </Text>
                </View>
              )}
            </ScrollView>

            {/* Modal Footer */}
            <View className="px-6 py-4 border-t border-gray-200 flex-row justify-end gap-3">
              <TouchableOpacity
                onPress={handleClose}
                className="px-6 py-3 rounded-lg bg-gray-200"
                disabled={isLoading}
              >
                <Text className="text-gray-800 font-semibold text-base">
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={validateAndSubmit}
                className="px-6 py-3 rounded-lg"
                style={{
                  backgroundColor: isLoading
                    ? `${primaryColor}80`
                    : primaryColor,
                }}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color={textColor} />
                ) : (
                  <Text
                    className="font-semibold text-base"
                    style={{ color: textColor }}
                  >
                    Add Expense
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
