import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import AppSafeAreaView from "../components/AppSafeAreaView";
import { useRouter } from "expo-router";
import { useState, useEffect, useCallback, useRef } from "react";
import { useFocusEffect } from "expo-router";
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
  getPendingTransactions,
  TransactionResponse,
} from "../services/transactionService";
import {
  getExpenses,
  getPendingExpenses,
  ExpenseResponse,
} from "../services/expenseService";
import { enqueue } from "../services/syncEngine";
import { useSync } from "../contexts/SyncContext";
import { getPaymentMethodLabel, getPaymentMethodBadgeStyle } from "../utils/paymentMethod";
import LastSubmissionBanner from "../components/LastSubmissionBanner";

// Build a DailyReportResponse from locally cached transactions and expenses.
// Used when the API is unreachable so staff can still view and submit the report.
function computeLocalReport(
  txns: (TransactionResponse & { pendingSync?: boolean })[],
  exps: (ExpenseResponse & { pendingSync?: boolean })[],
  date: string,
  startDate: string,
  endDate: string,
): DailyReportResponse {
  const activeTxns = txns.filter((t) => t.voidStatus !== "APPROVED");
  const totalSales = activeTxns.reduce((s, t) => s + t.total, 0);
  const txnCount = activeTxns.length;
  const totalItemsSold = activeTxns.reduce(
    (s, t) => s + (t.items ?? []).reduce((si, i) => si + i.quantity, 0),
    0,
  );
  const paymentBreakdown: Record<string, { total: number; count: number }> = {};
  activeTxns.forEach((t) => {
    const m = t.paymentMethod;
    if (!paymentBreakdown[m]) paymentBreakdown[m] = { total: 0, count: 0 };
    paymentBreakdown[m].total += t.total;
    paymentBreakdown[m].count += 1;
  });

  const activeExps = exps.filter((e) => e.voidStatus !== "APPROVED");
  const totalExpenses = activeExps.reduce((s, e) => s + e.amount, 0);
  const expCount = activeExps.length;
  const categoryBreakdown: Record<string, { total: number; count: number }> = {};
  activeExps.forEach((e) => {
    const c = e.category as string;
    if (!categoryBreakdown[c]) categoryBreakdown[c] = { total: 0, count: 0 };
    categoryBreakdown[c].total += e.amount;
    categoryBreakdown[c].count += 1;
  });

  const grossProfit = totalSales - totalExpenses;
  return {
    date,
    period: { start: startDate, end: endDate },
    sales: {
      totalAmount: totalSales,
      transactionCount: txnCount,
      averageTransaction: txnCount > 0 ? totalSales / txnCount : 0,
      totalItemsSold,
      paymentMethodBreakdown: paymentBreakdown,
    },
    expenses: {
      totalAmount: totalExpenses,
      expenseCount: expCount,
      averageExpense: expCount > 0 ? totalExpenses / expCount : 0,
      categoryBreakdown,
    },
    summary: {
      grossProfit,
      profitMargin: totalSales > 0 ? (grossProfit / totalSales) * 100 : 0,
      netRevenue: totalSales,
    },
  };
}

export default function DailyReport() {
  const router = useRouter();
  const { tenant, brand } = useTenant();
  const { isOnline, triggerSync } = useSync();
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

  // Tracks the calendar date of the last data load.
  const lastFetchedDate = useRef<string | null>(null);

  // Always points to the latest version of the fetch fn so useFocusEffect
  // doesn't need to re-subscribe when dependencies change (avoids stale closures).
  const fetchRef = useRef<() => void>(() => {});

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

      const [txns, exps, stats] = await Promise.all([
        getTransactions({ startDate, endDate }),
        getExpenses({ startDate, endDate }),
        getDailyReportStats(),
      ]);

      setTransactions(txns);
      setExpenses(exps);
      setReportStats(stats);

      let report: DailyReportResponse;
      try {
        report = await getDailyReport(today);
      } catch (err) {
        if (!isOnline) {
          const [pendingTxns, pendingExps] = await Promise.all([
            getPendingTransactions(),
            getPendingExpenses(),
          ]);
          const txnIds = new Set(txns.map((t) => t.id));
          const expIds = new Set(exps.map((e) => e.id));
          const allTxns = [...pendingTxns.filter((t) => !txnIds.has(t.id)), ...txns];
          const allExps = [...pendingExps.filter((e) => !expIds.has(e.id)), ...exps];
          report = computeLocalReport(allTxns, allExps, today, startDate, endDate);
        } else {
          throw err;
        }
      }
      setReportData(report);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report");
    } finally {
      setIsLoading(false);
      setStatsLoading(false);
    }
  };

  // Keep ref current on every render so useFocusEffect always calls latest version.
  fetchRef.current = fetchReportData;

  // Re-fetch when auth changes (login/logout).
  useEffect(() => {
    if (!tenant || !user) {
      lastFetchedDate.current = null; // force re-fetch on next login
      return;
    }
    lastFetchedDate.current = null; // force re-fetch when user/tenant changes
    fetchRef.current();
  }, [tenant, user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh when screen comes into focus AND the calendar date has changed.
  // This handles the overnight edge case: if the app is left open past midnight
  // the data updates automatically the next time the user visits this screen.
  useFocusEffect(
    useCallback(() => {
      const today = new Date().toISOString().split("T")[0];
      if (lastFetchedDate.current !== today) {
        lastFetchedDate.current = today;
        fetchRef.current();
      }
    }, []),
  );

  if (!tenant || !user) {
    return null;
  }

  const primaryColor = brand?.themeColors?.primary ?? tenant.themeColors?.primary ?? "#ea580c";
  const textColor = brand?.themeColors?.text ?? tenant.themeColors?.text ?? "#1f2937";
  const backgroundColor = brand?.themeColors?.background ?? tenant.themeColors?.background ?? "#ffffff";

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

    // Capture submission time immediately — preserved through the offline queue.
    const submittedAt = new Date().toISOString();

    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(false);

    let workingTransactions = transactions;
    let workingExpenses = expenses;
    let workingReport = reportData;

    const pendingTxns = transactions.filter((t) => (t as any).pendingSync);
    const pendingExps = expenses.filter((e) => (e as any).pendingSync);

    // Online with pending items: push them to the server first so the submitted
    // report captures every transaction the staff recorded today.
    if (isOnline && (pendingTxns.length > 0 || pendingExps.length > 0)) {
      await triggerSync();
      const today = new Date().toISOString().split("T")[0];
      const { startDate, endDate } = getTodayDateRange();
      const [freshTxns, freshExps] = await Promise.all([
        getTransactions({ startDate, endDate }),
        getExpenses({ startDate, endDate }),
      ]);
      workingTransactions = freshTxns;
      workingExpenses = freshExps;
      setTransactions(freshTxns);
      setExpenses(freshExps);
      try {
        workingReport = await getDailyReport(today);
        setReportData(workingReport);
      } catch {
        // Server report unavailable after sync — compute locally from fresh data
        const { startDate: sd, endDate: ed } = getTodayDateRange();
        workingReport = computeLocalReport(freshTxns, freshExps, today, sd, ed);
      }
    }

    // Separate synced items (have server IDs) from any that still couldn't sync.
    // Pending clientIds are stored in the queue payload so the sync engine can
    // resolve them to real server IDs when the report eventually goes online.
    const syncedTransactionIds = workingTransactions
      .filter((t) => !(t as any).pendingSync)
      .map((t) => t.id);
    const pendingTransactionClientIds = workingTransactions
      .filter((t) => (t as any).pendingSync)
      .map((t) => t.id);
    const syncedExpenseIds = workingExpenses
      .filter((e) => !(e as any).pendingSync)
      .map((e) => e.id);
    const pendingExpenseClientIds = workingExpenses
      .filter((e) => (e as any).pendingSync)
      .map((e) => e.id);

    // workingReport already counts all transactions correctly:
    //   online path  → fresh server report (all transactions synced)
    //   offline path → computeLocalReport (includes pending in totals)
    const submitData = {
      reportDate: workingReport.date,
      periodStart: workingReport.period.start,
      periodEnd: workingReport.period.end,
      salesSnapshot: {
        totalAmount: workingReport.sales.totalAmount,
        transactionCount: workingReport.sales.transactionCount,
        averageTransaction: workingReport.sales.averageTransaction,
        totalItemsSold: workingReport.sales.totalItemsSold,
        paymentMethodBreakdown: workingReport.sales.paymentMethodBreakdown,
      },
      expensesSnapshot: {
        totalAmount: workingReport.expenses.totalAmount,
        expenseCount: workingReport.expenses.expenseCount,
        averageExpense: workingReport.expenses.averageExpense,
        categoryBreakdown: workingReport.expenses.categoryBreakdown,
      },
      summarySnapshot: {
        grossProfit: workingReport.summary.grossProfit,
        profitMargin: workingReport.summary.profitMargin,
        netRevenue: workingReport.summary.netRevenue,
      },
      transactionIds: syncedTransactionIds,
      expenseIds: syncedExpenseIds,
      submittedAt,
    };

    try {
      await submitReport(submitData);
      const updatedStats = await getDailyReportStats();
      if (updatedStats) setReportStats(updatedStats);
      setSubmitSuccess(true);
      setTimeout(() => setSubmitSuccess(false), 3000);
    } catch {
      // Network failure — queue for later. Include pending clientIds so the
      // sync engine can resolve them to server IDs at the time of sync.
      await enqueue(
        "submitted_report",
        "/submitted-reports",
        {
          ...submitData,
          ...(pendingTransactionClientIds.length > 0 && { pendingTransactionClientIds }),
          ...(pendingExpenseClientIds.length > 0 && { pendingExpenseClientIds }),
        } as unknown as Record<string, unknown>,
      );
      Alert.alert(
        "Report Saved",
        "You're offline. The report has been saved and will sync automatically once you're back online.",
        [{ text: "OK" }],
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AppSafeAreaView className="w-full h-full bg-gray-50">
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
        {!isLoading && reportData && (
          <TouchableOpacity
            onPress={handleSubmitReport}
            disabled={isSubmitting}
            className="ml-2 px-4 py-2 rounded-lg"
            style={{
              backgroundColor: isSubmitting ? "#9ca3af" : primaryColor,
              opacity: isSubmitting ? 0.7 : 1,
            }}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <View className="flex-row items-center">
                <Ionicons name="cloud-upload" size={20} color="#000000" />
                <Text className="text-black font-semibold ml-2">Submit Report</Text>
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

        {/* Success/Queued/Error Toast */}
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
              className="mt-4 rounded-lg px-6 py-3"
              style={{ backgroundColor: primaryColor }}
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
                            {(transaction as any).discountAmount != null && (transaction as any).discountAmount > 0 && (
                              <Text className="text-xs text-gray-400 line-through">
                                {formatCurrency(transaction.subtotal)}
                              </Text>
                            )}
                            <Text
                              className="text-lg font-bold"
                              style={{ color: textColor }}
                            >
                              {formatCurrency(transaction.total)}
                            </Text>
                            <View
                              className="px-2 py-1 rounded-full mt-1"
                              style={{ backgroundColor: getPaymentMethodBadgeStyle(transaction.paymentMethod).backgroundColor }}
                            >
                              <Text
                                className="text-xs font-semibold"
                                style={{ color: getPaymentMethodBadgeStyle(transaction.paymentMethod).textColor }}
                              >
                                {getPaymentMethodLabel(transaction.paymentMethod)}
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

                        {/* Discount breakdown — only when a discount was applied */}
                        {(transaction as any).discountAmount != null && (transaction as any).discountAmount > 0 && (
                          <View className="mt-2 bg-gray-50 rounded-lg px-3 py-2">
                            <View className="flex-row justify-between">
                              <Text className="text-xs text-gray-500">Subtotal:</Text>
                              <Text className="text-xs text-gray-500">{formatCurrency(transaction.subtotal)}</Text>
                            </View>
                            <View className="flex-row justify-between mt-0.5">
                              <Text className="text-xs text-red-500">Discount:</Text>
                              <Text className="text-xs text-red-500">-{formatCurrency((transaction as any).discountAmount)}</Text>
                            </View>
                            <View className="flex-row justify-between mt-0.5 border-t border-gray-200 pt-1">
                              <Text className="text-xs font-semibold text-gray-700">Total:</Text>
                              <Text className="text-xs font-semibold text-gray-700">{formatCurrency(transaction.total)}</Text>
                            </View>
                          </View>
                        )}

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
    </AppSafeAreaView>
  );
}
