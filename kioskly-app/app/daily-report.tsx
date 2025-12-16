import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useState, useEffect } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useTenant } from "../contexts/TenantContext";
import { useAuth } from "../contexts/AuthContext";
import {
  getDailyReport,
  submitReport,
  DailyReportResponse,
  getDailyReportStats,
  DailyReportStats,
} from "../services/reportService";
import {
  getTransactions,
  TransactionResponse,
} from "../services/transactionService";
import {
  getExpenses,
  ExpenseResponse,
} from "../services/expenseService";
import LastSubmissionBanner from "../components/LastSubmissionBanner";

export default function DailyReport() {
  const router = useRouter();
  const { tenant } = useTenant();
  const { user } = useAuth();
  const [reportData, setReportData] = useState<DailyReportResponse | null>(
    null
  );
  const [transactions, setTransactions] = useState<TransactionResponse[]>([]);
  const [expenses, setExpenses] = useState<ExpenseResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [reportStats, setReportStats] = useState<DailyReportStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

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

  useEffect(() => {
    const fetchReportData = async () => {
      if (!tenant || !user) {
        router.replace("/");
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const today = new Date().toISOString().split("T")[0];
        const { startDate, endDate } = getTodayDateRange();

        // Fetch report data, transactions, expenses, and stats in parallel
        const [report, txns, exps, stats] = await Promise.all([
          getDailyReport(today),
          getTransactions({ startDate, endDate }),
          getExpenses({ startDate, endDate }),
          getDailyReportStats().catch((err) => {
            console.warn("Failed to fetch stats:", err);
            return null; // Non-blocking
          }),
        ]);

        setReportData(report);
        setTransactions(txns);
        setExpenses(exps);
        setReportStats(stats);
      } catch (err) {
        console.error("Failed to fetch report data:", err);
        setError(
          err instanceof Error ? err.message : "Failed to load report"
        );
      } finally {
        setIsLoading(false);
        setStatsLoading(false);
      }
    };

    fetchReportData();
  }, [tenant, user, router]);

  if (!tenant || !user) {
    return null;
  }

  const primaryColor = tenant.themeColors?.primary || "#ea580c";
  const textColor = tenant.themeColors?.text || "#1f2937";
  const backgroundColor = tenant.themeColors?.background || "#ffffff";

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

  const formatTransactionTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleSubmitReport = async () => {
    if (!reportData || !user) return;

    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(false);

    try {
      const submitData = {
        reportDate: reportData.date,
        periodStart: reportData.period.start,
        periodEnd: reportData.period.end,
        salesSnapshot: {
          totalAmount: reportData.sales.totalAmount,
          transactionCount: reportData.sales.transactionCount,
          averageTransaction: reportData.sales.averageTransaction,
          totalItemsSold: reportData.sales.totalItemsSold,
          paymentMethodBreakdown: reportData.sales.paymentMethodBreakdown,
        },
        expensesSnapshot: {
          totalAmount: reportData.expenses.totalAmount,
          expenseCount: reportData.expenses.expenseCount,
          averageExpense: reportData.expenses.averageExpense,
          categoryBreakdown: reportData.expenses.categoryBreakdown,
        },
        summarySnapshot: {
          grossProfit: reportData.summary.grossProfit,
          profitMargin: reportData.summary.profitMargin,
          netRevenue: reportData.summary.netRevenue,
        },
        transactionIds: transactions.map((t) => t.id),
        expenseIds: expenses.map((e) => e.id),
      };

      await submitReport(submitData);

      // Refresh stats to show updated last submission
      const updatedStats = await getDailyReportStats().catch(() => null);
      if (updatedStats) {
        setReportStats(updatedStats);
      }

      setSubmitSuccess(true);
      setTimeout(() => setSubmitSuccess(false), 3000);
    } catch (err) {
      console.error("Failed to submit report:", err);
      setSubmitError(
        err instanceof Error ? err.message : "Failed to submit report"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="w-full h-full bg-gray-50">
      {/* Header */}
      <View
        className="px-6 py-4 flex-row justify-between items-center"
        style={{ backgroundColor: backgroundColor }}
      >
        <View className="flex-row items-center flex-1">
          <TouchableOpacity onPress={() => router.back()} className="mr-4 p-2">
            <Ionicons name="arrow-back" size={24} color={textColor} />
          </TouchableOpacity>
          <View className="flex-1">
            <Text className="text-2xl font-bold" style={{ color: textColor }}>
              Daily Sales Report
            </Text>
            {reportData && (
              <Text className="text-sm mt-1" style={{ color: textColor }}>
                {formatDate(reportData.date)}
              </Text>
            )}
          </View>
        </View>
        {/* Submit Button */}
        {!isLoading && !error && reportData && (
          <TouchableOpacity
            onPress={handleSubmitReport}
            disabled={isSubmitting}
            className="ml-2 px-4 py-2 rounded-lg"
            style={{
              backgroundColor: isSubmitting ? "#9ca3af" : "#000000",
              opacity: isSubmitting ? 0.7 : 1,
            }}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <View className="flex-row items-center">
                <Ionicons name="cloud-upload" size={20} color="#ffffff" />
                <Text className="text-white font-semibold ml-2">Submit Report</Text>
              </View>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Content */}
      <ScrollView className="flex-1 px-4 py-4">
        {/* Last Submission Banner */}
        <LastSubmissionBanner
          lastSubmission={reportStats?.lastSubmission || null}
          isLoading={statsLoading}
          primaryColor={primaryColor}
          textColor={textColor}
        />

        {/* Success/Error Toast */}
        {submitSuccess && (
          <View className="mb-4 bg-green-100 border-2 border-green-500 rounded-lg p-4 flex-row items-center">
            <Ionicons name="checkmark-circle" size={24} color="#10b981" />
            <Text className="ml-3 text-green-800 font-semibold flex-1">
              Report submitted successfully!
            </Text>
          </View>
        )}
        {submitError && (
          <View className="mb-4 bg-red-100 border-2 border-red-500 rounded-lg p-4">
            <View className="flex-row items-start">
              <Ionicons name="alert-circle" size={24} color="#ef4444" />
              <View className="ml-3 flex-1">
                <Text className="text-red-800 font-semibold">
                  Submission Failed
                </Text>
                <Text className="text-red-700 mt-1">{submitError}</Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={() => setSubmitError(null)}
              className="mt-3 bg-red-200 rounded-lg px-4 py-2 self-start"
            >
              <Text className="text-red-800 font-semibold">Dismiss</Text>
            </TouchableOpacity>
          </View>
        )}

        {isLoading ? (
          <View className="py-12 items-center justify-center">
            <ActivityIndicator size="large" color={primaryColor} />
            <Text className="mt-4 text-gray-600">Generating report...</Text>
          </View>
        ) : error ? (
          <View className="py-12 items-center justify-center">
            <Ionicons name="alert-circle" size={48} color="#ef4444" />
            <Text className="mt-4 text-red-600 text-center">{error}</Text>
            <TouchableOpacity
              className="mt-4 bg-gray-800 rounded-lg px-6 py-3"
              onPress={() => router.back()}
            >
              <Text className="text-white font-semibold">Go Back</Text>
            </TouchableOpacity>
          </View>
        ) : reportData ? (
          <View>
            {/* Summary Section */}
            <View
              className="rounded-lg p-5 mb-6"
              style={{
                backgroundColor:
                  reportData.summary.grossProfit >= 0 ? "#d1fae5" : "#fee2e2",
                borderWidth: 2,
                borderColor:
                  reportData.summary.grossProfit >= 0 ? "#10b981" : "#ef4444",
              }}
            >
              <Text className="text-xl font-bold mb-4 text-gray-900">
                📊 Summary
              </Text>
              <View className="space-y-3">
                <View className="flex-row justify-between items-center py-3">
                  <Text className="text-lg font-semibold text-gray-800">
                    Gross Profit:
                  </Text>
                  <Text
                    className="text-2xl font-bold"
                    style={{
                      color:
                        reportData.summary.grossProfit >= 0
                          ? "#059669"
                          : "#dc2626",
                    }}
                  >
                    {formatCurrency(reportData.summary.grossProfit)}
                  </Text>
                </View>
              </View>
            </View>

            {/* Sales Section */}
            <View className="bg-blue-50 rounded-lg p-5 mb-6 border-2 border-blue-300">
              <Text className="text-xl font-bold mb-4 text-blue-900">
                💰 Sales
              </Text>
              <View className="space-y-3">
                <View className="flex-row justify-between items-center py-3 border-b-2 border-blue-400">
                  <Text className="text-lg font-semibold text-blue-800">
                    Total Sales:
                  </Text>
                  <Text
                    className="text-2xl font-bold"
                    style={{ color: textColor }}
                  >
                    {formatCurrency(reportData.sales.totalAmount)}
                  </Text>
                </View>

                {/* Payment Method Breakdown */}
                {Object.keys(reportData.sales.paymentMethodBreakdown).length >
                  0 && (
                  <View className="mt-3">
                    <Text className="text-base font-bold mb-3 text-blue-900">
                      Payment Method Breakdown:
                    </Text>
                    {Object.entries(reportData.sales.paymentMethodBreakdown).map(
                      ([method, data]) => (
                        <View
                          key={method}
                          className="flex-row justify-between items-center py-3 px-4 bg-white rounded-lg mb-2 border border-blue-200"
                        >
                          <View className="flex-1">
                            <Text className="text-base font-semibold text-blue-900">
                              {method}
                            </Text>
                            <Text className="text-xs text-blue-600 mt-1">
                              {data.count} {data.count === 1 ? 'transaction' : 'transactions'}
                            </Text>
                          </View>
                          <Text className="text-lg font-bold text-blue-900">
                            {formatCurrency(data.total)}
                          </Text>
                        </View>
                      )
                    )}
                  </View>
                )}

                <View className="border-t-2 border-blue-400 pt-3 mt-3">
                  <View className="flex-row justify-between items-center py-2">
                    <Text className="text-base text-blue-700">
                      Total Transactions:
                    </Text>
                    <Text className="text-lg font-semibold text-blue-900">
                      {reportData.sales.transactionCount}
                    </Text>
                  </View>
                  <View className="flex-row justify-between items-center py-2">
                    <Text className="text-base text-blue-700">Items Sold:</Text>
                    <Text className="text-lg font-semibold text-blue-900">
                      {reportData.sales.totalItemsSold}
                    </Text>
                  </View>
                  <View className="flex-row justify-between items-center py-2">
                    <Text className="text-base text-blue-700">
                      Avg Transaction:
                    </Text>
                    <Text className="text-lg font-semibold text-blue-900">
                      {formatCurrency(reportData.sales.averageTransaction)}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Expenses Section */}
            <View className="bg-red-50 rounded-lg p-5 mb-6 border-2 border-red-300">
              <Text className="text-xl font-bold mb-4 text-red-900">
                💸 Expenses
              </Text>
              <View className="space-y-3">
                <View className="flex-row justify-between items-center py-3 border-b border-red-300">
                  <Text className="text-lg font-semibold text-red-800">
                    Total Expenses:
                  </Text>
                  <Text
                    className="text-2xl font-bold"
                    style={{ color: textColor }}
                  >
                    {formatCurrency(reportData.expenses.totalAmount)}
                  </Text>
                </View>
                <View className="flex-row justify-between items-center py-2">
                  <Text className="text-base text-red-700">
                    Expense Count:
                  </Text>
                  <Text className="text-lg font-semibold text-red-900">
                    {reportData.expenses.expenseCount}
                  </Text>
                </View>
                {reportData.expenses.expenseCount > 0 && (
                  <View className="flex-row justify-between items-center py-2">
                    <Text className="text-base text-red-700">
                      Avg Expense:
                    </Text>
                    <Text className="text-lg font-semibold text-red-900">
                      {formatCurrency(reportData.expenses.averageExpense)}
                    </Text>
                  </View>
                )}

                {/* Expense Category Breakdown */}
                {Object.keys(reportData.expenses.categoryBreakdown).length >
                  0 && (
                  <View className="mt-4 pt-4 border-t border-red-300">
                    <Text className="text-base font-bold mb-3 text-red-900">
                      Categories:
                    </Text>
                    {Object.entries(reportData.expenses.categoryBreakdown).map(
                      ([category, data]) => (
                        <View
                          key={category}
                          className="flex-row justify-between items-center py-2 px-3 bg-white rounded-lg mb-2"
                        >
                          <Text className="text-base text-red-700">
                            {category} ({data.count}):
                          </Text>
                          <Text className="text-base font-semibold text-red-900">
                            {formatCurrency(data.total)}
                          </Text>
                        </View>
                      )
                    )}
                  </View>
                )}
              </View>
            </View>

            {/* Transactions List */}
            <View className="bg-white rounded-lg p-5 mb-6 border-2 border-gray-300">
              <Text className="text-xl font-bold mb-4 text-gray-900">
                📋 Transactions ({transactions.length})
              </Text>

              {transactions.length === 0 ? (
                <View className="py-8 items-center">
                  <Text className="text-gray-500 text-center">
                    No transactions for today
                  </Text>
                </View>
              ) : (
                <View>
                  {transactions.map((transaction, index) => (
                    <View key={transaction.id}>
                      <View className="py-3">
                        {/* Transaction Header */}
                        <View className="flex-row justify-between items-start mb-2">
                          <View className="flex-1">
                            <Text
                              className="text-base font-bold"
                              style={{ color: textColor }}
                            >
                              {transaction.transactionId}
                            </Text>
                            <Text className="text-sm text-gray-600 mt-1">
                              {formatTransactionTime(transaction.timestamp)}
                            </Text>
                            <Text className="text-xs text-gray-500">
                              {transaction.user.email}
                            </Text>
                          </View>
                          <View className="items-end">
                            <Text
                              className="text-lg font-bold"
                              style={{ color: textColor }}
                            >
                              {formatCurrency(transaction.total)}
                            </Text>
                            <View
                              className="px-2 py-1 rounded-full mt-1"
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
                        <View className="mt-2 bg-gray-50 rounded-lg p-3">
                          {transaction.items.map((item) => (
                            <View
                              key={item.id}
                              className="flex-row justify-between mb-1"
                            >
                              <View className="flex-1">
                                <Text className="text-sm text-gray-700">
                                  {item.quantity}x {item.product.name}
                                  {item.size && ` (${item.size.name})`}
                                </Text>
                                {item.addons && item.addons.length > 0 && (
                                  <Text className="text-xs text-gray-500 ml-2">
                                    + {item.addons.map((a) => a.name).join(", ")}
                                  </Text>
                                )}
                              </View>
                              <Text className="text-sm font-semibold text-gray-700">
                                {formatCurrency(item.subtotal)}
                              </Text>
                            </View>
                          ))}
                        </View>

                        {/* Remarks if present */}
                        {transaction.remarks && (
                          <View className="mt-2 bg-yellow-50 border border-yellow-200 rounded-lg p-2">
                            <Text className="text-xs font-semibold text-yellow-800">
                              Note: {transaction.remarks}
                            </Text>
                          </View>
                        )}
                      </View>

                      {/* Divider */}
                      {index < transactions.length - 1 && (
                        <View className="border-b border-dashed border-gray-300 my-2" />
                      )}
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Expenses List */}
            <View className="bg-white rounded-lg p-5 mb-6 border-2 border-gray-300">
              <Text className="text-xl font-bold mb-4 text-gray-900">
                💸 Expense Records ({expenses.length})
              </Text>

              {expenses.length === 0 ? (
                <View className="py-8 items-center">
                  <Text className="text-gray-500 text-center">
                    No expenses recorded for today
                  </Text>
                </View>
              ) : (
                <View>
                  {expenses.map((expense, index) => (
                    <View key={expense.id}>
                      <View className="py-3">
                        {/* Expense Header */}
                        <View className="flex-row justify-between items-start mb-2">
                          <View className="flex-1 mr-3">
                            <Text
                              className="text-base font-bold"
                              style={{ color: textColor }}
                            >
                              {expense.description}
                            </Text>
                            <View className="flex-row items-center mt-1">
                              <View
                                className="px-2 py-1 rounded-full"
                                style={{ backgroundColor: "#fef3c7" }}
                              >
                                <Text className="text-xs font-semibold text-yellow-800">
                                  {expense.category}
                                </Text>
                              </View>
                            </View>
                            <Text className="text-xs text-gray-500 mt-1">
                              Recorded by: {expense.user.email}
                            </Text>
                          </View>
                          <View className="items-end">
                            <Text
                              className="text-lg font-bold text-red-600"
                              style={{ color: "#dc2626" }}
                            >
                              {formatCurrency(expense.amount)}
                            </Text>
                          </View>
                        </View>

                        {/* Notes if present */}
                        {expense.notes && (
                          <View className="mt-2 bg-gray-50 rounded-lg p-3">
                            <Text className="text-xs font-semibold text-gray-700 mb-1">
                              Notes:
                            </Text>
                            <Text className="text-sm text-gray-600">
                              {expense.notes}
                            </Text>
                          </View>
                        )}

                        {/* Receipt indicator */}
                        {expense.receipt && (
                          <View className="mt-2 flex-row items-center">
                            <Ionicons name="receipt" size={14} color="#6b7280" />
                            <Text className="text-xs text-gray-500 ml-1">
                              Receipt attached
                            </Text>
                          </View>
                        )}
                      </View>

                      {/* Divider */}
                      {index < expenses.length - 1 && (
                        <View className="border-b border-dashed border-gray-300 my-2" />
                      )}
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
