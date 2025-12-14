import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { DailyReportResponse } from "../services/reportService";

interface DailyReportModalProps {
  visible: boolean;
  onClose: () => void;
  report: DailyReportResponse | null;
  isLoading: boolean;
  error: string | null;
  primaryColor: string;
  textColor: string;
}

export default function DailyReportModal({
  visible,
  onClose,
  report,
  isLoading,
  error,
  primaryColor,
  textColor,
}: DailyReportModalProps) {
  const formatCurrency = (amount: number) => {
    return `₱${amount.toFixed(2)}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-black/50 justify-center items-center px-4">
        <View className="w-full max-w-2xl bg-white rounded-lg max-h-5/6">
          {/* Modal Header */}
          <View
            className="px-6 py-4 rounded-t-lg flex-row justify-between items-center"
            style={{ backgroundColor: primaryColor }}
          >
            <View className="flex-1">
              <Text className="text-xl font-bold" style={{ color: textColor }}>
                Daily Sales Report
              </Text>
              {report && (
                <Text className="text-sm mt-1" style={{ color: textColor }}>
                  {formatDate(report.date)}
                </Text>
              )}
            </View>
            <TouchableOpacity
              onPress={onClose}
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
          <ScrollView className="px-6 py-6">
            {isLoading ? (
              <View className="py-12 items-center justify-center">
                <ActivityIndicator size="large" color={primaryColor} />
                <Text className="mt-4 text-gray-600">Generating report...</Text>
              </View>
            ) : error ? (
              <View className="py-12 items-center justify-center">
                <Ionicons name="alert-circle" size={48} color="#ef4444" />
                <Text className="mt-4 text-red-600 text-center">{error}</Text>
              </View>
            ) : report ? (
              <View>
                {/* Summary Section */}
                <View className="bg-gradient-to-r from-green-50 to-green-100 rounded-lg p-4 mb-6 border-2 border-green-200">
                  <Text className="text-lg font-bold mb-3 text-green-900">
                    📊 Summary
                  </Text>
                  <View className="space-y-2">
                    <View className="flex-row justify-between items-center py-2">
                      <Text className="text-base font-semibold text-green-800">
                        Gross Profit:
                      </Text>
                      <Text
                        className="text-xl font-bold"
                        style={{
                          color:
                            report.summary.grossProfit >= 0
                              ? "#059669"
                              : "#dc2626",
                        }}
                      >
                        {formatCurrency(report.summary.grossProfit)}
                      </Text>
                    </View>
                    <View className="flex-row justify-between items-center py-2">
                      <Text className="text-base font-semibold text-green-800">
                        Profit Margin:
                      </Text>
                      <Text className="text-lg font-bold text-green-900">
                        {report.summary.profitMargin.toFixed(2)}%
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Sales Section */}
                <View className="bg-blue-50 rounded-lg p-4 mb-6 border border-blue-200">
                  <Text className="text-lg font-bold mb-3 text-blue-900">
                    💰 Sales
                  </Text>
                  <View className="space-y-2">
                    <View className="flex-row justify-between items-center py-2 border-b border-blue-200">
                      <Text className="text-base text-blue-800">
                        Total Sales:
                      </Text>
                      <Text
                        className="text-xl font-bold"
                        style={{ color: textColor }}
                      >
                        {formatCurrency(report.sales.totalAmount)}
                      </Text>
                    </View>
                    <View className="flex-row justify-between items-center py-2">
                      <Text className="text-sm text-blue-700">
                        Transactions:
                      </Text>
                      <Text className="text-base font-semibold text-blue-900">
                        {report.sales.transactionCount}
                      </Text>
                    </View>
                    <View className="flex-row justify-between items-center py-2">
                      <Text className="text-sm text-blue-700">
                        Items Sold:
                      </Text>
                      <Text className="text-base font-semibold text-blue-900">
                        {report.sales.totalItemsSold}
                      </Text>
                    </View>
                    <View className="flex-row justify-between items-center py-2">
                      <Text className="text-sm text-blue-700">
                        Avg Transaction:
                      </Text>
                      <Text className="text-base font-semibold text-blue-900">
                        {formatCurrency(report.sales.averageTransaction)}
                      </Text>
                    </View>

                    {/* Payment Method Breakdown */}
                    {Object.keys(report.sales.paymentMethodBreakdown).length >
                      0 && (
                      <View className="mt-4 pt-4 border-t border-blue-200">
                        <Text className="text-sm font-bold mb-2 text-blue-900">
                          Payment Methods:
                        </Text>
                        {Object.entries(report.sales.paymentMethodBreakdown).map(
                          ([method, data]) => (
                            <View
                              key={method}
                              className="flex-row justify-between items-center py-1"
                            >
                              <Text className="text-sm text-blue-700">
                                {method} ({data.count}):
                              </Text>
                              <Text className="text-sm font-semibold text-blue-900">
                                {formatCurrency(data.total)}
                              </Text>
                            </View>
                          )
                        )}
                      </View>
                    )}
                  </View>
                </View>

                {/* Expenses Section */}
                <View className="bg-red-50 rounded-lg p-4 mb-6 border border-red-200">
                  <Text className="text-lg font-bold mb-3 text-red-900">
                    💸 Expenses
                  </Text>
                  <View className="space-y-2">
                    <View className="flex-row justify-between items-center py-2 border-b border-red-200">
                      <Text className="text-base text-red-800">
                        Total Expenses:
                      </Text>
                      <Text
                        className="text-xl font-bold"
                        style={{ color: textColor }}
                      >
                        {formatCurrency(report.expenses.totalAmount)}
                      </Text>
                    </View>
                    <View className="flex-row justify-between items-center py-2">
                      <Text className="text-sm text-red-700">
                        Expense Count:
                      </Text>
                      <Text className="text-base font-semibold text-red-900">
                        {report.expenses.expenseCount}
                      </Text>
                    </View>
                    {report.expenses.expenseCount > 0 && (
                      <View className="flex-row justify-between items-center py-2">
                        <Text className="text-sm text-red-700">
                          Avg Expense:
                        </Text>
                        <Text className="text-base font-semibold text-red-900">
                          {formatCurrency(report.expenses.averageExpense)}
                        </Text>
                      </View>
                    )}

                    {/* Expense Category Breakdown */}
                    {Object.keys(report.expenses.categoryBreakdown).length >
                      0 && (
                      <View className="mt-4 pt-4 border-t border-red-200">
                        <Text className="text-sm font-bold mb-2 text-red-900">
                          Categories:
                        </Text>
                        {Object.entries(report.expenses.categoryBreakdown).map(
                          ([category, data]) => (
                            <View
                              key={category}
                              className="flex-row justify-between items-center py-1"
                            >
                              <Text className="text-sm text-red-700">
                                {category} ({data.count}):
                              </Text>
                              <Text className="text-sm font-semibold text-red-900">
                                {formatCurrency(data.total)}
                              </Text>
                            </View>
                          )
                        )}
                      </View>
                    )}
                  </View>
                </View>
              </View>
            ) : null}
          </ScrollView>

          {/* Modal Footer */}
          <View className="px-6 py-4 border-t border-gray-200">
            <TouchableOpacity
              className="rounded-lg py-3 items-center"
              style={{ backgroundColor: primaryColor }}
              onPress={onClose}
            >
              <Text className="font-semibold text-lg" style={{ color: textColor }}>
                Close
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
