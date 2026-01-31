import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState, useEffect } from "react";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  createExpense,
  getExpenses,
  requestVoidExpense,
  ExpenseResponse,
  CreateExpensePayload,
  ExpenseCategory,
} from "@/services/expenseService";
import ExpenseModal from "@/components/ExpenseModal";

export default function ExpensesScreen() {
  const [expenses, setExpenses] = useState<ExpenseResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [isSubmittingVoid, setIsSubmittingVoid] = useState(false);
  const [selectedVoidExpense, setSelectedVoidExpense] =
    useState<ExpenseResponse | null>(null);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

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

  const { tenant } = useTenant();
  const { user } = useAuth();
  const primaryColor = tenant?.themeColors?.primary || "#ea580c";
  const textColor = tenant?.themeColors?.text || "#1f2937";
  const backgroundColor = tenant?.themeColors?.background || "#ffffff";

  useEffect(() => {
    if (!tenant || !user) {
      router.replace("/");
      return;
    }
    loadExpenses();
  }, [tenant, user, router]);

  const getTodayDateRange = () => {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

    return {
      startDate: startOfDay.toISOString(),
      endDate: endOfDay.toISOString(),
    };
  };

  const loadExpenses = async () => {
    try {
      setError(null);
      const { startDate, endDate } = getTodayDateRange();
      const data = await getExpenses({ startDate, endDate });
      setExpenses(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load expenses");
      console.error("Error loading expenses:", err);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadExpenses();
    setRefreshing(false);
  };

  if (!tenant || !user) {
    return null;
  }

  const handleAddExpense = async (expenseData: CreateExpensePayload) => {
    try {
      setIsSubmitting(true);
      await createExpense(expenseData);
      setIsModalVisible(false);
      await loadExpenses(); // Reload the list
    } catch (err) {
      throw err; // Let the modal handle the error display
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  const formatCurrency = (amount: number) => {
    return `₱${amount.toFixed(2)}`;
  };

  const getCategoryLabel = (category: ExpenseCategory) => {
    return category
      .split("_")
      .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
      .join(" ");
  };

  const openVoidModal = (expense: ExpenseResponse) => {
    // Validate void status
    if (expense.voidStatus === "APPROVED") {
      alert("This expense is already voided.");
      return;
    }
    if (expense.voidStatus === "PENDING") {
      alert("A void request is already pending for this expense.");
      return;
    }

    setSelectedVoidExpense(expense);
    setVoidReason("");
    setShowVoidModal(true);
  };

  const closeVoidModal = () => {
    setShowVoidModal(false);
    setSelectedVoidExpense(null);
    setVoidReason("");
  };

  const handleSubmitVoid = async () => {
    if (!selectedVoidExpense) return;

    if (voidReason.trim().length < 10) {
      alert("Please provide a reason of at least 10 characters.");
      return;
    }

    setIsSubmittingVoid(true);
    try {
      const updated = await requestVoidExpense(
        selectedVoidExpense.id,
        voidReason.trim()
      );

      // Update the expense in the list
      setExpenses(
        expenses.map((e) => (e.id === updated.id ? updated : e))
      );

      closeVoidModal();
      alert("Void request submitted successfully!");
    } catch (err) {
      console.error("Failed to submit void request:", err);
      alert("Failed to submit void request. Please try again.");
    } finally {
      setIsSubmittingVoid(false);
    }
  };

  const getVoidStatusBadge = (voidStatus?: string) => {
    if (!voidStatus || voidStatus === "NONE") return null;

    const statusConfig = {
      PENDING: { label: "Void Pending", color: "bg-yellow-500" },
      APPROVED: { label: "VOIDED", color: "bg-red-500" },
      REJECTED: { label: "Void Rejected", color: "bg-gray-500" },
    };

    const config = statusConfig[voidStatus as keyof typeof statusConfig];
    if (!config) return null;

    return (
      <View className={`${config.color} px-2 py-1 rounded-md ml-2`}>
        <Text className="text-white text-xs font-semibold">{config.label}</Text>
      </View>
    );
  };

  return (
    <SafeAreaView className="w-full h-full bg-gray-50">
      {/* Header */}
      <View
        className="px-6 py-4 flex-row justify-between items-center"
        style={{ backgroundColor: backgroundColor }}
      >
        <View className="flex-row items-center">
          <TouchableOpacity
            onPress={() => router.back()}
            className="mr-4 p-2"
          >
            <Ionicons name="arrow-back" size={24} color={textColor} />
          </TouchableOpacity>
          <Text className="text-2xl font-bold" style={{ color: textColor }}>
            Expenses
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => setIsModalVisible(true)}
          className="bg-gray-800 px-3 py-2 rounded-lg flex-row items-center"
        >
          <Ionicons name="add-circle-outline" size={18} color="white" />
          <Text className="text-white font-semibold ml-1.5">Add</Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <View className="flex-1 px-4 py-4">
        {loading ? (
          <View className="flex-1 justify-center items-center">
            <ActivityIndicator size="large" color={primaryColor} />
            <Text className="mt-4 text-gray-600">Loading expenses...</Text>
          </View>
        ) : error ? (
          <View className="flex-1 justify-center items-center">
            <Text className="text-red-600 text-center mb-4">{error}</Text>
            <TouchableOpacity
              className="bg-gray-800 rounded-lg px-6 py-3"
              onPress={loadExpenses}
            >
              <Text className="text-white font-semibold">Retry</Text>
            </TouchableOpacity>
          </View>
        ) : expenses.length === 0 ? (
          <View className="flex-1 justify-center items-center px-6">
            <Text className="text-gray-600 text-center text-lg font-semibold">
              No expenses recorded yet
            </Text>
            <Text className="text-gray-500 text-center mt-2">
              Expenses from today will appear here
            </Text>
          </View>
        ) : (
          <ScrollView
            className="flex-1"
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
          >
            {expenses.map((expense, index) => (
              <View key={expense.id}>
              <View
                className="bg-white rounded-lg p-4 shadow-sm border border-gray-200"
              >
                {/* Expense Header */}
                <View className="flex-row justify-between items-start mb-3">
                  <View className="flex-1">
                    <Text className="text-lg font-bold" style={{ color: textColor }}>
                      {expense.description}
                    </Text>
                    <Text className="text-sm text-gray-600 mt-1">
                      {formatDate(expense.date)}
                    </Text>
                    <Text className="text-sm text-gray-600">
                      Added by: {expense.user.username}
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-xl font-bold" style={{ color: textColor }}>
                      {formatCurrency(expense.amount)}
                    </Text>
                    <View className="flex-row items-center mt-1">
                      <View
                        className="px-3 py-1 rounded-full"
                        style={{
                          backgroundColor: primaryColor,
                        }}
                      >
                        <Text className="text-xs font-semibold" style={{ color: textColor }}>
                          {getCategoryLabel(expense.category)}
                        </Text>
                      </View>
                      {getVoidStatusBadge(expense.voidStatus)}
                    </View>
                  </View>
                </View>

                {/* Notes */}
                {expense.notes && (
                  <View className="border-t border-gray-200 pt-3">
                    <Text className="text-sm font-semibold text-gray-700 mb-2">
                      Notes:
                    </Text>
                    <View className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                      <Text className="text-sm" style={{ color: textColor }}>
                        {expense.notes}
                      </Text>
                    </View>
                  </View>
                )}

                {/* Void Information */}
                {expense.voidStatus &&
                  expense.voidStatus !== "NONE" && (
                    <View className="border-t border-gray-200 pt-3 mt-2">
                      <View className="bg-red-50 border border-red-200 rounded-lg p-3">
                        <Text className="text-sm font-semibold text-red-800 mb-2">
                          Void Status: {expense.voidStatus}
                        </Text>
                        {expense.voidReason && (
                          <View className="mb-2">
                            <Text className="text-xs text-gray-600 font-semibold">
                              Reason:
                            </Text>
                            <Text className="text-xs text-gray-700 mt-1">
                              {expense.voidReason}
                            </Text>
                          </View>
                        )}
                        {expense.voidRequester && (
                          <Text className="text-xs text-gray-600">
                            Requested by: {expense.voidRequester.email}
                          </Text>
                        )}
                        {expense.voidRequestedAt && (
                          <Text className="text-xs text-gray-600">
                            Requested:{" "}
                            {formatDate(expense.voidRequestedAt)}
                          </Text>
                        )}
                        {expense.voidReviewer && (
                          <Text className="text-xs text-gray-600 mt-1">
                            Reviewed by: {expense.voidReviewer.email}
                          </Text>
                        )}
                        {expense.voidReviewedAt && (
                          <Text className="text-xs text-gray-600">
                            Reviewed: {formatDate(expense.voidReviewedAt)}
                          </Text>
                        )}
                        {expense.voidStatus === "REJECTED" &&
                          expense.voidRejectionReason && (
                            <View className="mt-2 pt-2 border-t border-red-300">
                              <Text className="text-xs text-gray-600 font-semibold">
                                Rejection Reason:
                              </Text>
                              <Text className="text-xs text-gray-700 mt-1">
                                {expense.voidRejectionReason}
                              </Text>
                            </View>
                          )}
                      </View>
                    </View>
                  )}

                {/* Request Void Button */}
                {(!expense.voidStatus ||
                  expense.voidStatus === "NONE" ||
                  expense.voidStatus === "REJECTED") && (
                  <View className="border-t border-gray-200 pt-3 mt-2">
                    <TouchableOpacity
                      onPress={() => openVoidModal(expense)}
                      className="flex-row items-center justify-center self-start px-3 py-1.5 rounded-md"
                      style={{ backgroundColor: "#ef4444" }}
                    >
                      <Ionicons
                        name="close-circle-outline"
                        size={16}
                        color="white"
                      />
                      <Text className="text-white text-sm ml-1.5">
                        Request Void
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* Black Dashed Divider */}
              {index < expenses.length - 1 && (
                <View className="border-b border-dashed border-black my-3" />
              )}
            </View>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Add Expense Modal */}
      <ExpenseModal
        visible={isModalVisible}
        onClose={() => setIsModalVisible(false)}
        onSubmit={handleAddExpense}
        isLoading={isSubmitting}
      />

      {/* Void Request Modal */}
      <Modal
        visible={showVoidModal}
        transparent
        animationType="slide"
        onRequestClose={closeVoidModal}
      >
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === "ios" ? "padding" : "padding"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
        >
          <View className="flex-1 bg-black/50 justify-center items-center px-4">
            <View
              className="w-full bg-white rounded-lg"
              style={{
                maxWidth: 512,
                maxHeight: isKeyboardVisible ? "70%" : "85%",
              }}
            >
              {/* Modal Header */}
              <View
                className="px-6 py-4 rounded-t-lg flex-row justify-between items-center"
                style={{ backgroundColor: "#fee2e2" }}
              >
                <Text
                  className="text-xl font-bold"
                  style={{ color: textColor }}
                >
                  Request Void
                </Text>
                <TouchableOpacity
                  onPress={closeVoidModal}
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

              {/* Modal Body */}
              <ScrollView
                className="flex-shrink"
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={true}
                bounces={true}
              >
                <View className="px-6 py-4">
                  {selectedVoidExpense && (
                    <View className="mb-4 bg-gray-50 rounded-lg p-3">
                      <Text className="text-sm text-gray-600 mb-1">
                        Expense: {selectedVoidExpense.description}
                      </Text>
                      <Text className="text-sm text-gray-600">
                        Amount: {formatCurrency(selectedVoidExpense.amount)}
                      </Text>
                    </View>
                  )}

                  <View className="mb-4">
                    <Text
                      className="text-sm font-semibold mb-2"
                      style={{ color: textColor }}
                    >
                      Reason for Void (minimum 10 characters)
                    </Text>
                    <TextInput
                      className="bg-gray-100 rounded-lg px-4 py-3 text-base border-2 border-gray-200"
                      style={{ color: textColor, minHeight: 120 }}
                      placeholder="Enter reason for voiding this expense..."
                      placeholderTextColor="#9ca3af"
                      value={voidReason}
                      onChangeText={setVoidReason}
                      multiline
                      numberOfLines={5}
                      textAlignVertical="top"
                      autoFocus
                    />
                    <Text className="text-xs text-gray-500 mt-2">
                      {voidReason.length} / 10 characters minimum
                    </Text>
                  </View>
                </View>
              </ScrollView>

              {/* Action Buttons - Fixed at bottom */}
              <View className="px-6 py-4 border-t border-gray-200 bg-white rounded-b-lg">
                <View className="flex-row gap-3">
                  <TouchableOpacity
                    onPress={closeVoidModal}
                    className="flex-1 bg-gray-200 rounded-lg py-3 items-center"
                    disabled={isSubmittingVoid}
                  >
                    <Text className="text-gray-700 font-semibold">Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleSubmitVoid}
                    className="flex-1 rounded-lg py-3 items-center"
                    style={{
                      backgroundColor:
                        voidReason.trim().length >= 10 && !isSubmittingVoid
                          ? "#ef4444"
                          : "#d1d5db",
                    }}
                    disabled={voidReason.trim().length < 10 || isSubmittingVoid}
                  >
                    {isSubmittingVoid ? (
                      <ActivityIndicator color="white" />
                    ) : (
                      <Text className="text-white font-semibold">
                        Submit Request
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}
