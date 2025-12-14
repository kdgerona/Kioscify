import { View, Text, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator, Modal, TextInput, KeyboardAvoidingView, Platform, Keyboard } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useState, useEffect, useCallback } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useTenant } from "../contexts/TenantContext";
import { useAuth } from "../contexts/AuthContext";
import { getTransactions, updateTransactionRemarks, TransactionResponse } from "../services/transactionService";

export default function Transactions() {
  const router = useRouter();
  const { tenant } = useTenant();
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<TransactionResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRemarksModal, setShowRemarksModal] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionResponse | null>(null);
  const [remarksInput, setRemarksInput] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  // Listen to keyboard show/hide events
  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', () => {
      setIsKeyboardVisible(true);
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      setIsKeyboardVisible(false);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const getTodayDateRange = () => {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

    return {
      startDate: startOfDay.toISOString(),
      endDate: endOfDay.toISOString(),
    };
  };

  const fetchTransactionsCallback = useCallback(async () => {
    try {
      setError(null);
      const { startDate, endDate } = getTodayDateRange();
      const data = await getTransactions({ startDate, endDate });
      setTransactions(data);
    } catch (err) {
      console.error("Failed to fetch transactions:", err);
      setError(err instanceof Error ? err.message : "Failed to load transactions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!tenant || !user) {
      router.replace("/");
      return;
    }
    fetchTransactionsCallback();
  }, [tenant, user, router, fetchTransactionsCallback]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchTransactionsCallback();
    setRefreshing(false);
  };

  if (!tenant || !user) {
    return null;
  }

  const primaryColor = tenant.themeColors?.primary || "#ea580c";
  const textColor = tenant.themeColors?.text || "#1f2937";
  const backgroundColor = tenant.themeColors?.background || "#ffffff";

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatCurrency = (amount: number) => {
    return `₱${amount.toFixed(2)}`;
  };

  const openRemarksModal = (transaction: TransactionResponse) => {
    setSelectedTransaction(transaction);
    setRemarksInput(transaction.remarks || "");
    setShowRemarksModal(true);
  };

  const closeRemarksModal = () => {
    setShowRemarksModal(false);
    setSelectedTransaction(null);
    setRemarksInput("");
  };

  const handleUpdateRemarks = async () => {
    if (!selectedTransaction) return;

    setIsUpdating(true);
    try {
      const updated = await updateTransactionRemarks(
        selectedTransaction.id,
        remarksInput.trim() || undefined
      );

      // Update the transaction in the list
      setTransactions(
        transactions.map((t) => (t.id === updated.id ? updated : t))
      );

      closeRemarksModal();
    } catch (err) {
      console.error("Failed to update remarks:", err);
      alert("Failed to update remarks. Please try again.");
    } finally {
      setIsUpdating(false);
    }
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
            Recent Transactions
          </Text>
        </View>
      </View>

      {/* Content */}
      <View className="flex-1 px-4 py-4">
        {loading ? (
          <View className="flex-1 justify-center items-center">
            <ActivityIndicator size="large" color={primaryColor} />
            <Text className="mt-4 text-gray-600">Loading transactions...</Text>
          </View>
        ) : error ? (
          <View className="flex-1 justify-center items-center">
            <Text className="text-red-600 text-center mb-4">{error}</Text>
            <TouchableOpacity
              className="bg-gray-800 rounded-lg px-6 py-3"
              onPress={fetchTransactionsCallback}
            >
              <Text className="text-white font-semibold">Retry</Text>
            </TouchableOpacity>
          </View>
        ) : transactions.length === 0 ? (
          <View className="flex-1 justify-center items-center px-6">
            <Text className="text-gray-600 text-center text-lg font-semibold">
              No recent transactions yet
            </Text>
            <Text className="text-gray-500 text-center mt-2">
              Transactions from today will appear here
            </Text>
          </View>
        ) : (
          <ScrollView
            className="flex-1"
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
          >
            {transactions.map((transaction, index) => (
              <View key={transaction.id}>
              <View
                className="bg-white rounded-lg p-4 shadow-sm border border-gray-200"
              >
                {/* Transaction Header */}
                <View className="flex-row justify-between items-start mb-3">
                  <View className="flex-1">
                    <Text className="text-lg font-bold" style={{ color: textColor }}>
                      {transaction.transactionId}
                    </Text>
                    <Text className="text-sm text-gray-600 mt-1">
                      {formatDate(transaction.timestamp)}
                    </Text>
                    <Text className="text-sm text-gray-600">
                      Cashier: {transaction.user.email}
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-xl font-bold" style={{ color: textColor }}>
                      {formatCurrency(transaction.total)}
                    </Text>
                    <View
                      className="px-3 py-1 rounded-full mt-1"
                      style={{
                        backgroundColor:
                          transaction.paymentMethod === "CASH"
                            ? "#86efac"
                            : "#93c5fd",
                      }}
                    >
                      <Text className="text-xs font-semibold text-gray-800">
                        {transaction.paymentMethod}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Transaction Items */}
                <View className="border-t border-gray-200 pt-3">
                  <Text className="text-sm font-semibold text-gray-700 mb-2">
                    Items:
                  </Text>
                  {transaction.items.map((item) => (
                    <View key={item.id} className="flex-row justify-between mb-2">
                      <View className="flex-1">
                        <Text className="text-sm" style={{ color: textColor }}>
                          {item.quantity}x {item.product.name}
                          {item.size && ` (${item.size.name})`}
                        </Text>
                        {item.addons && item.addons.length > 0 && (
                          <Text className="text-xs text-gray-500 ml-4">
                            + {item.addons.map((a) => a.name).join(", ")}
                          </Text>
                        )}
                      </View>
                      <Text className="text-sm font-semibold" style={{ color: textColor }}>
                        {formatCurrency(item.subtotal)}
                      </Text>
                    </View>
                  ))}
                </View>

                {/* Payment Details */}
                {transaction.paymentMethod === "CASH" && transaction.cashReceived && (
                  <View className="border-t border-gray-200 pt-3 mt-2">
                    <View className="flex-row justify-between">
                      <Text className="text-sm text-gray-600">Cash Received:</Text>
                      <Text className="text-sm font-semibold" style={{ color: textColor }}>
                        {formatCurrency(transaction.cashReceived)}
                      </Text>
                    </View>
                    {transaction.change !== undefined && transaction.change > 0 && (
                      <View className="flex-row justify-between mt-1">
                        <Text className="text-sm text-gray-600">Change:</Text>
                        <Text className="text-sm font-semibold" style={{ color: textColor }}>
                          {formatCurrency(transaction.change)}
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                {transaction.paymentMethod === "ONLINE" && transaction.referenceNumber && (
                  <View className="border-t border-gray-200 pt-3 mt-2">
                    <View className="flex-row justify-between">
                      <Text className="text-sm text-gray-600">Reference Number:</Text>
                      <Text className="text-sm font-semibold" style={{ color: textColor }}>
                        {transaction.referenceNumber}
                      </Text>
                    </View>
                  </View>
                )}

                {/* Remarks */}
                <View className="border-t border-gray-200 pt-3 mt-2">
                  <View className="flex-row justify-between items-center mb-2">
                    <Text className="text-sm font-semibold text-gray-700">
                      Remarks:
                    </Text>
                    <TouchableOpacity
                      onPress={() => openRemarksModal(transaction)}
                      className="px-3 py-1 rounded-lg flex-row items-center gap-1"
                    >
                      <Ionicons
                        name={transaction.remarks ? "pencil" : "add-circle-outline"}
                        size={16}
                        color={textColor}
                      />
                      <Text className="text-xs font-semibold" style={{ color: textColor }}>
                        {transaction.remarks ? "Edit" : "Add"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {transaction.remarks ? (
                    <View className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                      <Text className="text-sm" style={{ color: textColor }}>
                        {transaction.remarks}
                      </Text>
                    </View>
                  ) : (
                    <Text className="text-xs text-gray-500 italic">
                      No remarks added
                    </Text>
                  )}
                </View>
              </View>

              {/* Black Dashed Divider */}
              {index < transactions.length - 1 && (
                <View className="border-b border-dashed border-black my-3" />
              )}
            </View>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Remarks Modal */}
      <Modal
        visible={showRemarksModal}
        transparent
        animationType="slide"
        onRequestClose={closeRemarksModal}
      >
        <View className="flex-1 bg-black/50 justify-center items-center px-4">
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "padding"}
            style={{ width: '100%', maxWidth: 512 }}
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
                    {selectedTransaction?.remarks ? "Edit Remarks" : "Add Remarks"}
                  </Text>
                  <TouchableOpacity
                    onPress={closeRemarksModal}
                    className="w-11 h-11 items-center justify-center rounded-full"
                    style={{ backgroundColor: `${textColor}15` }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Text className="text-3xl font-bold leading-none" style={{ color: textColor }}>
                      ×
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Modal Body */}
                <ScrollView 
                  className="px-6 py-6"
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                <Text className="text-sm font-semibold text-gray-700 mb-2">
                  Transaction: {selectedTransaction?.transactionId}
                </Text>
                <TextInput
                  className="bg-gray-100 rounded-lg px-4 py-3 text-base border-2 border-gray-200 mb-4"
                  placeholder="Add notes (e.g., corrections, special requests)"
                  value={remarksInput}
                  onChangeText={setRemarksInput}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                  autoFocus
                />
                <Text className="text-xs text-gray-500 mb-4">
                  Use this to document any mistakes or special circumstances
                </Text>

                {/* Action Buttons */}
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    className="flex-1 bg-gray-200 rounded-lg py-3 items-center"
                    onPress={closeRemarksModal}
                    disabled={isUpdating}
                  >
                    <Text className="font-semibold text-gray-800">Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    className="flex-1 rounded-lg py-3 items-center"
                    style={{
                      backgroundColor: isUpdating ? `${primaryColor}80` : primaryColor,
                    }}
                    onPress={handleUpdateRemarks}
                    disabled={isUpdating}
                  >
                    <Text className="font-semibold" style={{ color: textColor }}>
                      {isUpdating ? "Saving..." : "Save"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
