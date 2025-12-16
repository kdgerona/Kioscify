import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, Href } from "expo-router";
import { useState, useEffect, useCallback } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useTenant } from "../contexts/TenantContext";
import { useAuth } from "../contexts/AuthContext";
import {
  getTransactions,
  updateTransactionRemarks,
  requestVoidTransaction,
  TransactionResponse,
} from "../services/transactionService";

export default function Transactions() {
  const router = useRouter();
  const { tenant } = useTenant();
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<TransactionResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRemarksModal, setShowRemarksModal] = useState(false);
  const [selectedTransaction, setSelectedTransaction] =
    useState<TransactionResponse | null>(null);
  const [remarksInput, setRemarksInput] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [isSubmittingVoid, setIsSubmittingVoid] = useState(false);
  const [selectedVoidTransaction, setSelectedVoidTransaction] =
    useState<TransactionResponse | null>(null);

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

  const getTodayDateRange = () => {
    const today = new Date();
    const startOfDay = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );
    const endOfDay = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
      23,
      59,
      59,
      999
    );

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
      setError(
        err instanceof Error ? err.message : "Failed to load transactions"
      );
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
      hour12: true,
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

  const openVoidModal = (transaction: TransactionResponse) => {
    // Validate void status
    if (transaction.voidStatus === "APPROVED") {
      alert("This transaction is already voided.");
      return;
    }
    if (transaction.voidStatus === "PENDING") {
      alert("A void request is already pending for this transaction.");
      return;
    }

    setSelectedVoidTransaction(transaction);
    setVoidReason("");
    setShowVoidModal(true);
  };

  const closeVoidModal = () => {
    setShowVoidModal(false);
    setSelectedVoidTransaction(null);
    setVoidReason("");
  };

  const handleSubmitVoid = async () => {
    if (!selectedVoidTransaction) return;

    if (voidReason.trim().length < 10) {
      alert("Please provide a reason of at least 10 characters.");
      return;
    }

    setIsSubmittingVoid(true);
    try {
      const updated = await requestVoidTransaction(
        selectedVoidTransaction.id,
        voidReason.trim()
      );

      // Update the transaction in the list
      setTransactions(
        transactions.map((t) => (t.id === updated.id ? updated : t))
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

  const handleGenerateReport = () => {
    router.push("/daily-report" as Href);
  };

  return (
    <SafeAreaView className="w-full h-full bg-gray-50">
      {/* Header */}
      <View
        className="px-6 py-4 flex-row justify-between items-center"
        style={{ backgroundColor: backgroundColor }}
      >
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="mr-4 p-2">
            <Ionicons name="arrow-back" size={24} color={textColor} />
          </TouchableOpacity>
          <Text className="text-2xl font-bold" style={{ color: textColor }}>
            Daily Sales
          </Text>
        </View>
        <TouchableOpacity
          className="flex-row items-center rounded-lg px-3 py-2"
          style={{ backgroundColor: "#000000" }}
          onPress={handleGenerateReport}
        >
          <Ionicons name="document-text" size={18} color="#ffffff" />
          <Text className="font-semibold text-white ml-1.5">Report</Text>
        </TouchableOpacity>
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
              No sales today yet
            </Text>
            <Text className="text-gray-500 text-center mt-2">
              Today&apos;s transactions will appear here
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
                <View className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
                  {/* Transaction Header */}
                  <View className="flex-row justify-between items-start mb-3">
                    <View className="flex-1">
                      <Text
                        className="text-lg font-bold"
                        style={{ color: textColor }}
                      >
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
                      <Text
                        className="text-xl font-bold"
                        style={{ color: textColor }}
                      >
                        {formatCurrency(transaction.total)}
                      </Text>
                      <View className="flex-row items-center mt-1">
                        <View
                          className="px-3 py-1 rounded-full"
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
                        {getVoidStatusBadge(transaction.voidStatus)}
                      </View>
                    </View>
                  </View>

                  {/* Transaction Items */}
                  <View className="border-t border-gray-200 pt-3">
                    <Text className="text-sm font-semibold text-gray-700 mb-2">
                      Items:
                    </Text>
                    {transaction.items.map((item) => (
                      <View
                        key={item.id}
                        className="flex-row justify-between mb-2"
                      >
                        <View className="flex-1">
                          <Text
                            className="text-sm"
                            style={{ color: textColor }}
                          >
                            {item.quantity}x {item.product.name}
                            {item.size && ` (${item.size.name})`}
                          </Text>
                          {item.addons && item.addons.length > 0 && (
                            <Text className="text-xs text-gray-500 ml-4">
                              + {item.addons.map((a) => a.name).join(", ")}
                            </Text>
                          )}
                        </View>
                        <Text
                          className="text-sm font-semibold"
                          style={{ color: textColor }}
                        >
                          {formatCurrency(item.subtotal)}
                        </Text>
                      </View>
                    ))}
                  </View>

                  {/* Payment Details */}
                  {transaction.paymentMethod === "CASH" &&
                    transaction.cashReceived && (
                      <View className="border-t border-gray-200 pt-3 mt-2">
                        <View className="flex-row justify-between">
                          <Text className="text-sm text-gray-600">
                            Cash Received:
                          </Text>
                          <Text
                            className="text-sm font-semibold"
                            style={{ color: textColor }}
                          >
                            {formatCurrency(transaction.cashReceived)}
                          </Text>
                        </View>
                        {transaction.change !== undefined &&
                          transaction.change > 0 && (
                            <View className="flex-row justify-between mt-1">
                              <Text className="text-sm text-gray-600">
                                Change:
                              </Text>
                              <Text
                                className="text-sm font-semibold"
                                style={{ color: textColor }}
                              >
                                {formatCurrency(transaction.change)}
                              </Text>
                            </View>
                          )}
                      </View>
                    )}

                  {transaction.paymentMethod === "ONLINE" &&
                    transaction.referenceNumber && (
                      <View className="border-t border-gray-200 pt-3 mt-2">
                        <View className="flex-row justify-between">
                          <Text className="text-sm text-gray-600">
                            Reference Number:
                          </Text>
                          <Text
                            className="text-sm font-semibold"
                            style={{ color: textColor }}
                          >
                            {transaction.referenceNumber}
                          </Text>
                        </View>
                      </View>
                    )}

                  {/* Void Information */}
                  {transaction.voidStatus &&
                    transaction.voidStatus !== "NONE" && (
                      <View className="border-t border-gray-200 pt-3 mt-2">
                        <View className="bg-red-50 border border-red-200 rounded-lg p-3">
                          <Text className="text-sm font-semibold text-red-800 mb-2">
                            Void Status: {transaction.voidStatus}
                          </Text>
                          {transaction.voidReason && (
                            <View className="mb-2">
                              <Text className="text-xs text-gray-600 font-semibold">
                                Reason:
                              </Text>
                              <Text className="text-xs text-gray-700 mt-1">
                                {transaction.voidReason}
                              </Text>
                            </View>
                          )}
                          {transaction.voidRequester && (
                            <Text className="text-xs text-gray-600">
                              Requested by: {transaction.voidRequester.email}
                            </Text>
                          )}
                          {transaction.voidRequestedAt && (
                            <Text className="text-xs text-gray-600">
                              Requested:{" "}
                              {formatDate(transaction.voidRequestedAt)}
                            </Text>
                          )}
                          {transaction.voidReviewer && (
                            <Text className="text-xs text-gray-600 mt-1">
                              Reviewed by: {transaction.voidReviewer.email}
                            </Text>
                          )}
                          {transaction.voidReviewedAt && (
                            <Text className="text-xs text-gray-600">
                              Reviewed: {formatDate(transaction.voidReviewedAt)}
                            </Text>
                          )}
                          {transaction.voidStatus === "REJECTED" &&
                            transaction.voidRejectionReason && (
                              <View className="mt-2 pt-2 border-t border-red-300">
                                <Text className="text-xs text-gray-600 font-semibold">
                                  Rejection Reason:
                                </Text>
                                <Text className="text-xs text-gray-700 mt-1">
                                  {transaction.voidRejectionReason}
                                </Text>
                              </View>
                            )}
                        </View>
                      </View>
                    )}

                  {/* Request Void Button */}
                  {(!transaction.voidStatus ||
                    transaction.voidStatus === "NONE" ||
                    transaction.voidStatus === "REJECTED") && (
                    <View className="border-t border-gray-200 pt-3 mt-2">
                      <TouchableOpacity
                        onPress={() => openVoidModal(transaction)}
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
                          name={
                            transaction.remarks
                              ? "pencil"
                              : "add-circle-outline"
                          }
                          size={16}
                          color={textColor}
                        />
                        <Text
                          className="text-xs font-semibold"
                          style={{ color: textColor }}
                        >
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
                <Text
                  className="text-xl font-bold"
                  style={{ color: textColor }}
                >
                  {selectedTransaction?.remarks
                    ? "Edit Remarks"
                    : "Add Remarks"}
                </Text>
                <TouchableOpacity
                  onPress={closeRemarksModal}
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
                      backgroundColor: isUpdating
                        ? `${primaryColor}80`
                        : primaryColor,
                    }}
                    onPress={handleUpdateRemarks}
                    disabled={isUpdating}
                  >
                    <Text
                      className="font-semibold"
                      style={{ color: textColor }}
                    >
                      {isUpdating ? "Saving..." : "Save"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Void Request Modal */}
      <Modal
        visible={showVoidModal}
        transparent
        animationType="slide"
        onRequestClose={closeVoidModal}
      >
        <View className="flex-1 bg-black/50 justify-end">
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            className="w-full"
          >
            <View className="bg-white rounded-t-3xl p-6 shadow-xl">
              <View className="flex-row justify-between items-center mb-4">
                <Text
                  className="text-xl font-bold"
                  style={{ color: textColor }}
                >
                  Request Void
                </Text>
                <TouchableOpacity onPress={closeVoidModal}>
                  <Ionicons name="close" size={28} color={textColor} />
                </TouchableOpacity>
              </View>

              {selectedVoidTransaction && (
                <View className="mb-4">
                  <Text className="text-sm text-gray-600 mb-1">
                    Transaction: {selectedVoidTransaction.transactionId}
                  </Text>
                  <Text className="text-sm text-gray-600">
                    Amount: {formatCurrency(selectedVoidTransaction.total)}
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
                  className="border border-gray-300 rounded-lg p-3 text-base"
                  style={{ color: textColor, minHeight: 100 }}
                  placeholder="Enter reason for voiding this transaction..."
                  placeholderTextColor="#9ca3af"
                  value={voidReason}
                  onChangeText={setVoidReason}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
                <Text className="text-xs text-gray-500 mt-1">
                  {voidReason.length} / 10 characters minimum
                </Text>
              </View>

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
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
