"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import {
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
} from "recharts";
import { TrendingUp, Download, Calendar, RefreshCw } from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import DateRangeSelector, { TimePeriod } from "@/components/DateRangeSelector";
import TransactionListModal from "@/components/TransactionListModal";
import ExpenseListModal from "@/components/ExpenseListModal";
import { Transaction, Expense } from "@/types";

interface AnalyticsData {
  period: {
    type: string;
    start: string;
    end: string;
  };
  sales: {
    totalAmount: number;
    transactionCount: number;
    averageTransaction: number;
    totalItemsSold: number;
    paymentMethodBreakdown: Record<string, { total: number; count: number }>;
    growth: number;
  };
  expenses: {
    totalAmount: number;
    expenseCount: number;
    averageExpense: number;
    categoryBreakdown: Record<string, { total: number; count: number }>;
  };
  summary: {
    grossProfit: number;
    profitMargin: number;
    netRevenue: number;
  };
  topProducts: Array<{
    productId: string;
    productName: string;
    quantity: number;
    revenue: number;
  }>;
  salesByDay: Array<{
    date: string;
    total: number;
    count: number;
  }>;
}

export default function ReportsPage() {
  const { tenant } = useTenant();
  const primaryColor = tenant?.themeColors?.primary || "#4f46e5";
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<TimePeriod>("daily");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [loadingExpenses, setLoadingExpenses] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string | null>(null);

  useEffect(() => {
    loadReportData();
  }, [period, startDate, endDate]);

  const loadReportData = async () => {
    try {
      setLoading(true);
      const params: {
        period?: TimePeriod;
        startDate?: string;
        endDate?: string;
      } = { period };

      if (period === "custom" && startDate && endDate) {
        // Convert YYYY-MM-DD to full datetime with start/end of day
        const start = new Date(startDate + 'T00:00:00');
        const end = new Date(endDate + 'T23:59:59.999');
        params.startDate = start.toISOString();
        params.endDate = end.toISOString();
      }

      const data = await api.getAnalytics(params);
      setAnalytics(data);
    } catch (error) {
      console.error("Failed to load report data:", error);
    } finally {
      setLoading(false);
    }
  };

  // Prepare payment method distribution
  const getPaymentMethodData = () => {
    if (!analytics) return [];

    const colors = {
      CASH: "#10b981",
      CARD: "#3b82f6",
      GCASH: "#8b5cf6",
      PAYMAYA: "#f59e0b",
      FOODPANDA: "#ec4899",
      ONLINE: "#6b7280",
    };

    return Object.entries(analytics.sales.paymentMethodBreakdown).map(
      ([method, data]) => ({
        name: method,
        value: data.count,
        color: colors[method as keyof typeof colors] || "#6b7280",
      })
    );
  };

  // Prepare expense category distribution
  const getExpenseCategoryData = () => {
    if (!analytics) return [];

    const colors = {
      SUPPLIES: "#ef4444",
      UTILITIES: "#f59e0b",
      MAINTENANCE: "#8b5cf6",
      SALARY: "#3b82f6",
      RENT: "#ec4899",
      OTHER: "#6b7280",
    };

    return Object.entries(analytics.expenses.categoryBreakdown).map(
      ([category, data]) => ({
        name: category,
        value: data.total,
        color: colors[category as keyof typeof colors] || "#6b7280",
      })
    );
  };

  // Prepare sales by day for charts
  const getSalesByDay = () => {
    if (!analytics) return [];

    return analytics.salesByDay.map((day) => ({
      date: new Date(day.date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      total: day.total,
      count: day.count,
    }));
  };

  const exportReport = () => {
    if (!analytics) return;

    const report = {
      generatedAt: new Date().toISOString(),
      period: analytics.period,
      sales: analytics.sales,
      expenses: analytics.expenses,
      summary: analytics.summary,
      topProducts: analytics.topProducts,
      salesByDay: analytics.salesByDay,
      paymentMethods: getPaymentMethodData(),
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json",
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
  };

  const loadTransactions = async () => {
    try {
      setLoadingTransactions(true);
      setSelectedPaymentMethod(null); // Reset filter when viewing all
      const params: { startDate?: string; endDate?: string } = {};

      if (period === "custom" && startDate && endDate) {
        // Convert YYYY-MM-DD to full datetime with start/end of day
        const start = new Date(startDate + 'T00:00:00');
        const end = new Date(endDate + 'T23:59:59.999');
        params.startDate = start.toISOString();
        params.endDate = end.toISOString();
      } else if (analytics?.period) {
        params.startDate = analytics.period.start;
        params.endDate = analytics.period.end;
      }

      const data = await api.getTransactions(params);
      setTransactions(data);
      setShowTransactionModal(true);
    } catch (error) {
      console.error("Failed to load transactions:", error);
    } finally {
      setLoadingTransactions(false);
    }
  };

  const loadExpenses = async () => {
    try {
      setLoadingExpenses(true);
      const params: { startDate?: string; endDate?: string } = {};

      if (period === "custom" && startDate && endDate) {
        // Convert YYYY-MM-DD to full datetime with start/end of day
        const start = new Date(startDate + 'T00:00:00');
        const end = new Date(endDate + 'T23:59:59.999');
        params.startDate = start.toISOString();
        params.endDate = end.toISOString();
      } else if (analytics?.period) {
        params.startDate = analytics.period.start;
        params.endDate = analytics.period.end;
      }

      const data = await api.getExpenses(params);
      setExpenses(data);
      setShowExpenseModal(true);
    } catch (error) {
      console.error("Failed to load expenses:", error);
    } finally {
      setLoadingExpenses(false);
    }
  };

  const loadTransactionsByPaymentMethod = async (paymentMethod: string) => {
    try {
      setLoadingTransactions(true);
      setSelectedPaymentMethod(paymentMethod);
      const params: { startDate?: string; endDate?: string } = {};

      if (period === "custom" && startDate && endDate) {
        // Convert YYYY-MM-DD to full datetime with start/end of day
        const start = new Date(startDate + 'T00:00:00');
        const end = new Date(endDate + 'T23:59:59.999');
        params.startDate = start.toISOString();
        params.endDate = end.toISOString();
      } else if (analytics?.period) {
        params.startDate = analytics.period.start;
        params.endDate = analytics.period.end;
      }

      const allTransactions = await api.getTransactions(params);
      // Filter transactions by payment method
      const filteredTransactions = allTransactions.filter(
        (t: Transaction) => t.paymentMethod === paymentMethod
      );
      setTransactions(filteredTransactions);
      setShowTransactionModal(true);
    } catch (error) {
      console.error("Failed to load transactions:", error);
    } finally {
      setLoadingTransactions(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-80 bg-gray-200 rounded"></div>
            <div className="h-80 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="p-8">
        <div className="text-center text-gray-600">No data available</div>
      </div>
    );
  }

  const salesByDay = getSalesByDay();
  const paymentMethodData = getPaymentMethodData();
  const expenseCategoryData = getExpenseCategoryData();

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Reports & Analytics
          </h1>
          <p className="text-gray-600 mt-2">
            Sales performance and business insights
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadReportData}
            className="p-2 rounded-lg border border-gray-300 bg-white text-gray-600 hover:text-gray-900 hover:border-gray-400 transition"
            title="Refresh report data"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          <button
            onClick={exportReport}
            style={{ backgroundColor: primaryColor }}
            className="flex items-center space-x-2 text-black px-4 py-2 rounded-lg transition hover:opacity-90"
          >
            <Download className="w-5 h-5" />
            <span>Export Report</span>
          </button>
        </div>
      </div>

      {/* Date Range Selector */}
      <DateRangeSelector
        period={period}
        onPeriodChange={setPeriod}
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
        primaryColor={primaryColor}
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-6 rounded-xl shadow-lg">
          <p className="text-blue-100 text-sm mb-2">Total Sales</p>
          <p className="text-3xl font-bold">
            {formatCurrency(analytics.sales.totalAmount)}
          </p>
          <p className="text-sm text-blue-100 mt-2">
            {analytics.sales.growth >= 0 ? "↑" : "↓"}{" "}
            {Math.abs(analytics.sales.growth).toFixed(1)}% from previous period
          </p>
        </div>

        <button
          onClick={loadTransactions}
          disabled={loadingTransactions}
          className="bg-gradient-to-br from-green-500 to-green-600 text-white p-6 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 text-left w-full cursor-pointer"
        >
          <p className="text-green-100 text-sm mb-2">
            Transactions{" "}
            {loadingTransactions ? "(Loading...)" : "(Click to view all)"}
          </p>
          <p className="text-3xl font-bold">
            {analytics.sales.transactionCount}
          </p>
          <p className="text-sm text-green-100 mt-2">Completed orders</p>
        </button>

        <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white p-6 rounded-xl shadow-lg">
          <p className="text-purple-100 text-sm mb-2">Avg. Order Value</p>
          <p className="text-3xl font-bold">
            {formatCurrency(analytics.sales.averageTransaction)}
          </p>
          <p className="text-sm text-purple-100 mt-2">Per transaction</p>
        </div>

        <div className="bg-gradient-to-br from-orange-500 to-orange-600 text-white p-6 rounded-xl shadow-lg">
          <p className="text-orange-100 text-sm mb-2">Gross Profit</p>
          <p className="text-3xl font-bold">
            {formatCurrency(analytics.summary.grossProfit)}
          </p>
          <p className="text-sm text-orange-100 mt-2">
            {analytics.summary.profitMargin.toFixed(1)}% margin
          </p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Sales Trend */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900">Sales Trend</h2>
            <Calendar className="w-5 h-5 text-gray-400" />
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={salesByDay}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="date"
                stroke="#6b7280"
                style={{ fontSize: "12px" }}
              />
              <YAxis stroke="#6b7280" style={{ fontSize: "12px" }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#fff",
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                  color: "#000",
                }}
                labelStyle={{ color: "#000" }}
                itemStyle={{ color: "#000" }}
                formatter={(value: number) => formatCurrency(value)}
              />
              <Line
                type="monotone"
                dataKey="total"
                stroke={primaryColor}
                strokeWidth={3}
                dot={{ fill: primaryColor, r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Payment Methods Distribution */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900">
              Payment Methods Distribution
            </h2>
            <TrendingUp className="w-5 h-5 text-gray-400" />
          </div>
          {paymentMethodData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={paymentMethodData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) =>
                    `${name} ${(percent * 100).toFixed(0)}%`
                  }
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {paymentMethodData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-gray-500">
              No payment data available
            </div>
          )}
        </div>
      </div>

      {/* Payment Method Breakdown */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-6">
          Sales by Payment Method
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Object.entries(analytics.sales.paymentMethodBreakdown).map(
            ([method, data]) => {
              const colors = {
                CASH: {
                  bg: "bg-green-50",
                  border: "border-green-200",
                  text: "text-green-700",
                  badge: "bg-green-100",
                },
                CARD: {
                  bg: "bg-blue-50",
                  border: "border-blue-200",
                  text: "text-blue-700",
                  badge: "bg-blue-100",
                },
                GCASH: {
                  bg: "bg-purple-50",
                  border: "border-purple-200",
                  text: "text-purple-700",
                  badge: "bg-purple-100",
                },
                PAYMAYA: {
                  bg: "bg-amber-50",
                  border: "border-amber-200",
                  text: "text-amber-700",
                  badge: "bg-amber-100",
                },
                ONLINE: {
                  bg: "bg-indigo-50",
                  border: "border-indigo-200",
                  text: "text-indigo-700",
                  badge: "bg-indigo-100",
                },
                FOODPANDA: {
                  bg: "bg-pink-50",
                  border: "border-pink-200",
                  text: "text-pink-700",
                  badge: "bg-pink-100",
                },
              };
              const color = colors[method as keyof typeof colors] || {
                bg: "bg-gray-50",
                border: "border-gray-200",
                text: "text-gray-700",
                badge: "bg-gray-100",
              };
              const percentage =
                analytics.sales.totalAmount > 0
                  ? (data.total / analytics.sales.totalAmount) * 100
                  : 0;

              return (
                <button
                  key={method}
                  onClick={() => loadTransactionsByPaymentMethod(method)}
                  disabled={loadingTransactions}
                  className={`${color.bg} border ${color.border} p-4 rounded-lg hover:shadow-lg transition-all duration-200 hover:scale-105 text-left w-full cursor-pointer`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-sm font-semibold ${color.text}`}>
                      {method} {loadingTransactions && selectedPaymentMethod === method ? "(Loading...)" : "(Click to view)"}
                    </span>
                    <span
                      className={`${color.badge} ${color.text} text-xs px-2 py-1 rounded-full font-medium`}
                    >
                      {percentage.toFixed(1)}%
                    </span>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <p className="text-xs text-gray-600 mb-1">Total Amount</p>
                      <p className={`text-2xl font-bold ${color.text}`}>
                        {formatCurrency(data.total)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600">Transactions</p>
                      <p className={`text-lg font-semibold ${color.text}`}>
                        {data.count}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600">Average</p>
                      <p className={`text-sm font-medium ${color.text}`}>
                        {formatCurrency(
                          data.count > 0 ? data.total / data.count : 0
                        )}
                      </p>
                    </div>
                  </div>
                </button>
              );
            }
          )}
        </div>
      </div>

      {/* Top Products Section */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-6">
          Top Selling Products
        </h2>
        {analytics.topProducts.length > 0 ? (
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Rank
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Product Name
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Quantity Sold
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Revenue
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Avg. Price
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    % of Total Sales
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {analytics.topProducts.map((product, index) => {
                  const percentage =
                    analytics.sales.totalAmount > 0
                      ? (product.revenue / analytics.sales.totalAmount) * 100
                      : 0;
                  const avgPrice =
                    product.quantity > 0
                      ? product.revenue / product.quantity
                      : 0;

                  return (
                    <tr
                      key={product.productId}
                      className="hover:bg-gray-50 transition"
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-white font-bold text-sm">
                          {index + 1}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-semibold text-gray-900">
                          {product.productName}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-blue-100 text-blue-800">
                          {product.quantity} units
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <span className="text-sm font-bold text-gray-900">
                          {formatCurrency(product.revenue)}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <span className="text-sm text-gray-600">
                          {formatCurrency(avgPrice)}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <div className="w-24 bg-gray-200 rounded-full h-2">
                            <div
                              className="h-2 rounded-full"
                              style={{
                                width: `${Math.min(percentage, 100)}%`,
                                backgroundColor: primaryColor,
                              }}
                            />
                          </div>
                          <span className="text-sm font-medium text-gray-700 min-w-[3rem]">
                            {percentage.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50 border-t border-gray-200">
                <tr>
                  <td
                    colSpan={2}
                    className="px-4 py-3 text-sm font-bold text-gray-900"
                  >
                    Total
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right">
                    <span className="text-sm font-bold text-gray-900">
                      {analytics.sales.totalItemsSold} units
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right">
                    <span className="text-sm font-bold text-gray-900">
                      {formatCurrency(analytics.sales.totalAmount)}
                    </span>
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="text-center py-12 text-gray-500">
            No product sales data available
          </div>
        )}
      </div>

      {/* Expenses Section */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Expenses</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          {/* Total Expenses Card */}
          <button
            onClick={loadExpenses}
            disabled={loadingExpenses}
            className="bg-gradient-to-br from-red-500 to-red-600 text-white p-6 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 text-left w-full cursor-pointer"
          >
            <p className="text-red-100 text-sm mb-2">
              Total Expenses{" "}
              {loadingExpenses ? "(Loading...)" : "(Click to view all)"}
            </p>
            <p className="text-3xl font-bold">
              {formatCurrency(analytics.expenses.totalAmount)}
            </p>
            <p className="text-sm text-red-100 mt-2">
              {analytics.expenses.expenseCount} expense(s)
            </p>
          </button>

          {/* Average Expense Card */}
          <div className="bg-gradient-to-br from-amber-500 to-amber-600 text-white p-6 rounded-xl shadow-lg">
            <p className="text-amber-100 text-sm mb-2">Avg. Expense</p>
            <p className="text-3xl font-bold">
              {formatCurrency(analytics.expenses.averageExpense)}
            </p>
            <p className="text-sm text-amber-100 mt-2">Per expense entry</p>
          </div>

          {/* Net Profit Card */}
          <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white p-6 rounded-xl shadow-lg">
            <p className="text-emerald-100 text-sm mb-2">Net Revenue</p>
            <p className="text-3xl font-bold">
              {formatCurrency(analytics.summary.netRevenue)}
            </p>
            <p className="text-sm text-emerald-100 mt-2">After expenses</p>
          </div>
        </div>

        {/* Expense Breakdown Chart */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h3 className="text-xl font-bold text-gray-900 mb-6">
            Expense Breakdown by Category
          </h3>
          {expenseCategoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={expenseCategoryData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent, value }) =>
                    `${name} ${formatCurrency(value)} (${(percent * 100).toFixed(0)}%)`
                  }
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {expenseCategoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-gray-500">
              No expense data available
            </div>
          )}
        </div>
      </div>

      {/* Daily Sales Bar Chart */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h2 className="text-xl font-bold text-gray-900 mb-6">
          Daily Sales & Quantity Overview
        </h2>
        <ResponsiveContainer width="100%" height={400}>
          <ComposedChart data={salesByDay}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="date"
              stroke="#6b7280"
              style={{ fontSize: "12px" }}
            />
            <YAxis
              yAxisId="left"
              stroke="#6b7280"
              style={{ fontSize: "12px" }}
              tickFormatter={(value) => `${formatCurrency(value)}`}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="#6b7280"
              style={{ fontSize: "12px" }}
              label={{
                value: "Quantity",
                angle: -90,
                position: "insideRight",
                style: { fontSize: "12px" },
              }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
              }}
              labelStyle={{ color: "#000" }}
              formatter={(value: number, name: string) => {
                if (name === "Revenue") return formatCurrency(value);
                return `${value} units`;
              }}
            />
            <Legend />
            <Bar
              yAxisId="left"
              dataKey="total"
              fill="#3b82f6"
              radius={[8, 8, 0, 0]}
              name="Revenue"
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="count"
              stroke="#10b981"
              strokeWidth={3}
              dot={{ fill: "#10b981", r: 4 }}
              name="Quantity Sold"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Transaction List Modal */}
      <TransactionListModal
        isOpen={showTransactionModal}
        onClose={() => {
          setShowTransactionModal(false);
          setSelectedPaymentMethod(null);
        }}
        transactions={transactions}
        primaryColor={primaryColor}
        title={selectedPaymentMethod ? `${selectedPaymentMethod} Transactions` : 'All Transactions'}
      />

      {/* Expense List Modal */}
      <ExpenseListModal
        isOpen={showExpenseModal}
        onClose={() => setShowExpenseModal(false)}
        expenses={expenses}
        primaryColor={primaryColor}
      />
    </div>
  );
}
