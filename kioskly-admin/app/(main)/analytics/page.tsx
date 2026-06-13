"use client";

import React, { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { formatCurrency, getPaymentMethodLabel } from "@/lib/utils";
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
import CashSummaryModal from "@/components/CashSummaryModal";
import { Transaction, Expense, TimeOfDayData } from "@/types";

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
    categoryName?: string;
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
  const { tenant, brand } = useTenant();
  const primaryColor =
    brand?.themeColors?.primary ?? tenant?.themeColors?.primary ?? "#ea580c";
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const isInitialLoad = useRef(true);
  const [period, setPeriod] = useState<TimePeriod>(() => {
    if (typeof window === "undefined") return "daily";
    return (localStorage.getItem("analytics_period") as TimePeriod) ?? "daily";
  });
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [hourlyData, setHourlyData] = useState<TimeOfDayData[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [loadingExpenses, setLoadingExpenses] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<
    string | null
  >(null);
  const [showCashSummaryModal, setShowCashSummaryModal] = useState(false);
  const [cashSummaryExpenses, setCashSummaryExpenses] = useState<Expense[]>([]);
  const [loadingCashSummary, setLoadingCashSummary] = useState(false);

  useEffect(() => {
    loadReportData();
  }, [period, startDate, endDate]);

  useEffect(() => {
    localStorage.setItem("analytics_period", period);
  }, [period]);

  const dayStart = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const dayEnd = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

  const computeDateRange = (
    p: TimePeriod,
  ): { startDate: string; endDate: string } => {
    const now = new Date();
    switch (p) {
      case "daily":
        return {
          startDate: dayStart(now).toISOString(),
          endDate: dayEnd(now).toISOString(),
        };
      case "yesterday": {
        const y = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() - 1,
        );
        return {
          startDate: dayStart(y).toISOString(),
          endDate: dayEnd(y).toISOString(),
        };
      }
      case "weekly": {
        const dow = now.getDay();
        const diff = dow === 0 ? 6 : dow - 1;
        const mon = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() - diff,
        );
        return {
          startDate: dayStart(mon).toISOString(),
          endDate: dayEnd(now).toISOString(),
        };
      }
      case "monthly": {
        const first = new Date(now.getFullYear(), now.getMonth(), 1);
        return {
          startDate: dayStart(first).toISOString(),
          endDate: dayEnd(now).toISOString(),
        };
      }
      case "yearly": {
        const jan1 = new Date(now.getFullYear(), 0, 1);
        return {
          startDate: dayStart(jan1).toISOString(),
          endDate: dayEnd(now).toISOString(),
        };
      }
      default:
        return {
          startDate: dayStart(now).toISOString(),
          endDate: dayEnd(now).toISOString(),
        };
    }
  };

  const loadReportData = async () => {
    try {
      setLoading(true);

      if (period === "custom" && (!startDate || !endDate)) {
        setLoading(false);
        return;
      }

      const params: {
        period?: TimePeriod;
        startDate?: string;
        endDate?: string;
      } = { period };

      if (period === "custom") {
        params.startDate = dayStart(
          new Date(startDate + "T00:00:00"),
        ).toISOString();
        params.endDate = dayEnd(new Date(endDate + "T00:00:00")).toISOString();
      } else {
        const range = computeDateRange(period);
        params.startDate = range.startDate;
        params.endDate = range.endDate;
      }

      const data = await api.getAnalytics(params);
      setAnalytics(data);
      isInitialLoad.current = false;

      try {
        const hourly = await api.getTimeOfDayTrends(
          data.period.start,
          data.period.end,
        );
        setHourlyData(hourly.hourlyBreakdown);
      } catch {
        setHourlyData([]);
      }
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
      GCASH: "#2563eb",
      PAYMAYA: "#202122",
      FOODPANDA: "#ec4899",
      ONLINE: "#6b7280",
      GRAB: "#00B14F",
    };

    return Object.entries(analytics.sales.paymentMethodBreakdown).map(
      ([method, data]) => ({
        name: getPaymentMethodLabel(method),
        value: data.count,
        color: colors[method as keyof typeof colors] || "#6b7280",
      }),
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
      }),
    );
  };

  const formatHour = (h: number) => {
    if (h === 0) return "12am";
    if (h < 12) return `${h}am`;
    if (h === 12) return "12pm";
    return `${h - 12}pm`;
  };

  const getHourlyChartData = () =>
    hourlyData.map((h) => ({
      hour: formatHour(h.hour),
      revenue: h.totalRevenue,
      count: h.count,
    }));

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

  const getSalesByDayOfWeek = () => {
    if (!analytics) return [];

    const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const acc: Record<number, { totalRevenue: number; count: number }> = {};
    for (let i = 0; i < 7; i++) acc[i] = { totalRevenue: 0, count: 0 };

    analytics.salesByDay.forEach(({ date, total, count }) => {
      const dow = new Date(date + "T00:00:00").getDay(); // local time avoids UTC day-shift
      acc[dow].totalRevenue += total;
      acc[dow].count += count;
    });

    // Order Mon → Sun (business-week convention)
    return [1, 2, 3, 4, 5, 6, 0].map((dow) => ({
      day: DAY_NAMES[dow],
      totalRevenue: acc[dow].totalRevenue,
      count: acc[dow].count,
      aov: acc[dow].count > 0 ? acc[dow].totalRevenue / acc[dow].count : 0,
    }));
  };

  const exportReport = () => {
    if (!analytics) return;

    // Helper function to escape CSV values
    const escapeCSV = (value: any): string => {
      if (value === null || value === undefined) return "";
      const stringValue = String(value);
      if (
        stringValue.includes(",") ||
        stringValue.includes('"') ||
        stringValue.includes("\n")
      ) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    };

    // Build CSV content
    const csvLines: string[] = [];

    // Report Header
    const businessName = tenant?.name || "Business";
    csvLines.push(`${businessName} (Business Report)`);
    csvLines.push(`Generated At,${new Date().toLocaleString()}`);
    csvLines.push(`Period Type,${analytics.period.type}`);
    csvLines.push(
      `Start Date,${new Date(analytics.period.start).toLocaleString()}`,
    );
    csvLines.push(
      `End Date,${new Date(analytics.period.end).toLocaleString()}`,
    );
    csvLines.push("");

    // Summary Section
    csvLines.push("SUMMARY");
    csvLines.push("Metric,Value");
    csvLines.push(`Total Sales,${formatCurrency(analytics.sales.totalAmount)}`);
    csvLines.push(`Total Transactions,${analytics.sales.transactionCount}`);
    csvLines.push(
      `Average Transaction,${formatCurrency(analytics.sales.averageTransaction)}`,
    );
    csvLines.push(`Total Items Sold,${analytics.sales.totalItemsSold}`);
    csvLines.push(`Sales Growth,${analytics.sales.growth.toFixed(2)}%`);
    csvLines.push(
      `Total Expenses,${formatCurrency(analytics.expenses.totalAmount)}`,
    );
    csvLines.push(`Expense Count,${analytics.expenses.expenseCount}`);
    csvLines.push(
      `Average Expense,${formatCurrency(analytics.expenses.averageExpense)}`,
    );
    csvLines.push(
      `Gross Profit,${formatCurrency(analytics.summary.grossProfit)}`,
    );
    csvLines.push(
      `Profit Margin,${analytics.summary.profitMargin.toFixed(2)}%`,
    );
    csvLines.push(
      `Net Revenue,${formatCurrency(analytics.summary.netRevenue)}`,
    );
    csvLines.push("");

    // Payment Methods Section
    csvLines.push("SALES BY PAYMENT METHOD");
    csvLines.push(
      "Payment Method,Total Amount,Transaction Count,Average Amount,Percentage",
    );
    Object.entries(analytics.sales.paymentMethodBreakdown).forEach(
      ([method, data]) => {
        const percentage =
          analytics.sales.totalAmount > 0
            ? ((data.total / analytics.sales.totalAmount) * 100).toFixed(2)
            : "0.00";
        const average =
          data.count > 0 ? (data.total / data.count).toFixed(2) : "0.00";
        csvLines.push(
          `${method},${data.total.toFixed(2)},${data.count},${average},${percentage}%`,
        );
      },
    );
    csvLines.push("");

    // Expense Categories Section
    csvLines.push("EXPENSES BY CATEGORY");
    csvLines.push("Category,Total Amount,Expense Count,Percentage");
    Object.entries(analytics.expenses.categoryBreakdown).forEach(
      ([category, data]) => {
        const percentage =
          analytics.expenses.totalAmount > 0
            ? ((data.total / analytics.expenses.totalAmount) * 100).toFixed(2)
            : "0.00";
        csvLines.push(
          `${category},${data.total.toFixed(2)},${data.count},${percentage}%`,
        );
      },
    );
    csvLines.push("");

    // Top Products Section
    csvLines.push("TOP SELLING PRODUCTS");
    csvLines.push(
      "Rank,Product Name,Category,Quantity Sold,Revenue,Average Price,% of Total Sales",
    );
    analytics.topProducts.forEach((product, index) => {
      const percentage =
        analytics.sales.totalAmount > 0
          ? ((product.revenue / analytics.sales.totalAmount) * 100).toFixed(2)
          : "0.00";
      const avgPrice =
        product.quantity > 0
          ? (product.revenue / product.quantity).toFixed(2)
          : "0.00";
      csvLines.push(
        `${index + 1},${escapeCSV(product.productName)},${escapeCSV(product.categoryName || "N/A")},${product.quantity},${product.revenue.toFixed(2)},${avgPrice},${percentage}%`,
      );
    });
    csvLines.push("");

    // Sales by Day Section
    csvLines.push("DAILY SALES");
    csvLines.push("Date,Total Sales,Transaction Count,Average Order Value");
    analytics.salesByDay.forEach((day) => {
      const avgOrderValue =
        day.count > 0 ? (day.total / day.count).toFixed(2) : "0.00";
      const formattedDate = new Date(day.date).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
      csvLines.push(
        `${formattedDate},${day.total.toFixed(2)},${day.count},${avgOrderValue}`,
      );
    });

    // Create and download CSV file
    const csvContent = csvLines.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    // Create filename with business name and date
    const sanitizedBusinessName = businessName
      .replace(/[^a-z0-9]+/gi, "-") // Replace non-alphanumeric characters with single hyphen
      .replace(/^-+|-+$/g, "") // Remove leading/trailing hyphens
      .toLowerCase();
    const dateStr = new Date().toISOString().split("T")[0];
    a.download = `${sanitizedBusinessName}-business-report-${dateStr}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const loadTransactions = async () => {
    try {
      setLoadingTransactions(true);
      setSelectedPaymentMethod(null); // Reset filter when viewing all
      const params: { startDate?: string; endDate?: string } = {};

      if (period === "custom" && startDate && endDate) {
        // Convert YYYY-MM-DD to full datetime with start/end of day
        const start = new Date(startDate + "T00:00:00");
        const end = new Date(endDate + "T23:59:59.999");
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
        const start = new Date(startDate + "T00:00:00");
        const end = new Date(endDate + "T23:59:59.999");
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
        const start = new Date(startDate + "T00:00:00");
        const end = new Date(endDate + "T23:59:59.999");
        params.startDate = start.toISOString();
        params.endDate = end.toISOString();
      } else if (analytics?.period) {
        params.startDate = analytics.period.start;
        params.endDate = analytics.period.end;
      }

      const allTransactions = await api.getTransactions(params);
      // Filter transactions by payment method
      const filteredTransactions = allTransactions.filter(
        (t: Transaction) => t.paymentMethod === paymentMethod,
      );
      setTransactions(filteredTransactions);
      setShowTransactionModal(true);
    } catch (error) {
      console.error("Failed to load transactions:", error);
    } finally {
      setLoadingTransactions(false);
    }
  };

  const loadCashSummary = async () => {
    try {
      setLoadingCashSummary(true);
      const params: { startDate?: string; endDate?: string } = {};

      if (period === "custom" && startDate && endDate) {
        params.startDate = new Date(startDate + "T00:00:00").toISOString();
        params.endDate = new Date(endDate + "T23:59:59.999").toISOString();
      } else if (analytics?.period) {
        params.startDate = analytics.period.start;
        params.endDate = analytics.period.end;
      }

      const data = await api.getExpenses(params);
      setCashSummaryExpenses(data);
      setShowCashSummaryModal(true);
    } catch (error) {
      console.error("Failed to load cash summary:", error);
    } finally {
      setLoadingCashSummary(false);
    }
  };

  if (loading && isInitialLoad.current) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
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
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="text-center text-gray-600">No data available</div>
      </div>
    );
  }

  const salesByDay = getSalesByDay();
  const paymentMethodData = getPaymentMethodData();
  const expenseCategoryData = getExpenseCategoryData();
  const hourlyChartData = getHourlyChartData();
  const peakHour = hourlyChartData.reduce(
    (max, h) => (h.revenue > max.revenue ? h : max),
    { hour: "", revenue: 0, count: 0 },
  );
  const salesByDayOfWeek = getSalesByDayOfWeek();
  const peakDay = salesByDayOfWeek.reduce(
    (max, d) => (d.totalRevenue > max.totalRevenue ? d : max),
    { day: "", totalRevenue: 0, count: 0, aov: 0 },
  );

  const DayOfWeekTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: Array<{ dataKey: string; value: number }>;
    label?: string;
  }) => {
    if (!active || !payload?.length) return null;
    const revenue =
      payload.find((p) => p.dataKey === "totalRevenue")?.value ?? 0;
    const count = payload.find((p) => p.dataKey === "count")?.value ?? 0;
    const aov = count > 0 ? revenue / count : 0;
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
        <p className="font-semibold text-gray-900 mb-2">{label}</p>
        <p className="text-sm text-gray-700">
          Revenue: {formatCurrency(revenue)}
        </p>
        <p className="text-sm text-gray-700">Transactions: {count}</p>
        <p className="text-sm text-gray-700">
          Avg. Order: {formatCurrency(aov)}
        </p>
      </div>
    );
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 sm:mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            Analytics
          </h1>
          <p className="text-sm sm:text-base text-gray-600 mt-2">
            Sales performance and business insights
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={loadReportData}
            disabled={loading}
            className="p-2 rounded-lg border border-gray-300 bg-white text-gray-600 hover:text-gray-900 hover:border-gray-400 transition disabled:opacity-50"
            title="Refresh report data"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={exportReport}
            style={{ backgroundColor: primaryColor }}
            className="flex items-center justify-center gap-2 text-black px-3 sm:px-4 py-2 rounded-lg transition hover:opacity-90 whitespace-nowrap"
          >
            <Download className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="text-sm sm:text-base">Export Report</span>
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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6 sm:mb-8">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-6 rounded-xl shadow-lg">
          <p className="text-blue-100 text-sm mb-2">Total Sales</p>
          <p className="text-xl lg:text-2xl font-bold break-all">
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
          <p className="text-xl lg:text-2xl font-bold">
            {analytics.sales.transactionCount}
          </p>
          <p className="text-sm text-green-100 mt-2">Completed orders</p>
        </button>

        <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white p-6 rounded-xl shadow-lg">
          <p className="text-purple-100 text-sm mb-2">Avg. Order Value</p>
          <p className="text-xl lg:text-2xl font-bold break-all">
            {formatCurrency(analytics.sales.averageTransaction)}
          </p>
          <p className="text-sm text-purple-100 mt-2">Per transaction</p>
        </div>

        <div className="bg-gradient-to-br from-orange-500 to-orange-600 text-white p-6 rounded-xl shadow-lg">
          <p className="text-orange-100 text-sm mb-2">Gross Profit</p>
          <p className="text-xl lg:text-2xl font-bold break-all">
            {formatCurrency(analytics.summary.grossProfit)}
          </p>
          <p className="text-sm text-orange-100 mt-2">
            {analytics.summary.profitMargin.toFixed(1)}% margin
          </p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6 sm:mb-8">
        {/* Sales Trend */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-xl font-bold text-gray-900">Sales Trend</h2>
            <Calendar className="w-5 h-5 text-gray-400" />
          </div>
          <p className="text-sm text-gray-500 mb-6">
            Daily revenue totals over the selected period.
          </p>
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
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-xl font-bold text-gray-900">
              Payment Methods Distribution
            </h2>
            <TrendingUp className="w-5 h-5 text-gray-400" />
          </div>
          <p className="text-sm text-gray-500 mb-6">
            Share of transaction count by payment type.
          </p>
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
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mb-6 sm:mb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-1">
          Sales by Payment Method
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          Revenue and transaction count per payment channel. Click any card to
          filter transactions.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Object.entries(analytics.sales.paymentMethodBreakdown).map(
            ([method, data]) => {
              type CardColors = {
                bg: string;
                border: string;
                text: string;
                badge: string;
                cardStyle?: React.CSSProperties;
                textStyle?: React.CSSProperties;
                badgeStyle?: React.CSSProperties;
              };
              const colors: Record<string, CardColors> = {
                CASH: {
                  bg: "bg-green-50",
                  border: "border-green-200",
                  text: "text-green-700",
                  badge: "bg-green-100",
                },
                GCASH: {
                  bg: "bg-blue-50",
                  border: "border-blue-200",
                  text: "text-blue-700",
                  badge: "bg-blue-100",
                },
                PAYMAYA: {
                  bg: "",
                  border: "",
                  text: "",
                  badge: "",
                  cardStyle: {
                    backgroundColor: "#202122",
                    borderColor: "#3a3b3c",
                  },
                  textStyle: { color: "#50B16B" },
                  badgeStyle: { backgroundColor: "#2d2f30", color: "#50B16B" },
                },
                ONLINE: {
                  bg: "bg-gray-50",
                  border: "border-gray-200",
                  text: "text-gray-700",
                  badge: "bg-gray-100",
                },
                FOODPANDA: {
                  bg: "bg-pink-50",
                  border: "border-pink-200",
                  text: "text-pink-700",
                  badge: "bg-pink-100",
                },
                GRAB: {
                  bg: "",
                  border: "",
                  text: "",
                  badge: "",
                  cardStyle: {
                    backgroundColor: "rgba(0,177,79,0.08)",
                    borderColor: "#00B14F",
                  },
                  textStyle: { color: "#007835" },
                  badgeStyle: {
                    backgroundColor: "rgba(0,177,79,0.18)",
                    color: "#007835",
                  },
                },
              };
              const color: CardColors = colors[method] ?? {
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
                  style={color.cardStyle}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span
                      className={`text-sm font-semibold ${color.text}`}
                      style={color.textStyle}
                    >
                      {getPaymentMethodLabel(method)}{" "}
                      {loadingTransactions && selectedPaymentMethod === method
                        ? "(Loading...)"
                        : "(Click to view)"}
                    </span>
                    <span
                      className={`${color.badge} ${color.text} text-xs px-2 py-1 rounded-full font-medium`}
                      style={color.badgeStyle}
                    >
                      {percentage.toFixed(1)}%
                    </span>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <p className="text-xs text-gray-600 mb-1">Total Amount</p>
                      <p
                        className={`text-2xl font-bold ${color.text}`}
                        style={color.textStyle}
                      >
                        {formatCurrency(data.total)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600">Transactions</p>
                      <p
                        className={`text-lg font-semibold ${color.text}`}
                        style={color.textStyle}
                      >
                        {data.count}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600">Average</p>
                      <p
                        className={`text-sm font-medium ${color.text}`}
                        style={color.textStyle}
                      >
                        {formatCurrency(
                          data.count > 0 ? data.total / data.count : 0,
                        )}
                      </p>
                    </div>
                  </div>
                </button>
              );
            },
          )}
        </div>
      </div>

      {/* Top Products Section */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mb-6 sm:mb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-1">
          Top Selling Products
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          Ranked by revenue within the selected period.
        </p>
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
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Category
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
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-600">
                          {product.categoryName || "N/A"}
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
                    colSpan={3}
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
      <div className="mb-6 sm:mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Expenses</h2>
        <p className="text-sm text-gray-500 mb-6">
          Total outflows logged for the selected period.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
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
            <p className="text-2xl sm:text-3xl font-bold">
              {formatCurrency(analytics.expenses.totalAmount)}
            </p>
            <p className="text-sm text-red-100 mt-2">
              {analytics.expenses.expenseCount} expense(s)
            </p>
          </button>

          {/* Average Expense Card */}
          <div className="bg-gradient-to-br from-amber-500 to-amber-600 text-white p-6 rounded-xl shadow-lg">
            <p className="text-amber-100 text-sm mb-2">Avg. Expense</p>
            <p className="text-2xl sm:text-3xl font-bold">
              {formatCurrency(analytics.expenses.averageExpense)}
            </p>
            <p className="text-sm text-amber-100 mt-2">Per expense entry</p>
          </div>

          {/* Net Revenue Card */}
          <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white p-6 rounded-xl shadow-lg">
            <p className="text-emerald-100 text-sm mb-2">Net Revenue</p>
            <p className="text-2xl sm:text-3xl font-bold">
              {formatCurrency(analytics.summary.netRevenue)}
            </p>
            <p className="text-sm text-emerald-100 mt-2">After expenses</p>
          </div>

          {/* Net Cash Card */}
          {(() => {
            const cashSales = analytics.sales.paymentMethodBreakdown["CASH"]?.total ?? 0;
            const netCash = cashSales - analytics.expenses.totalAmount;
            return (
              <button
                onClick={loadCashSummary}
                disabled={loadingCashSummary}
                className="bg-gradient-to-br from-green-500 to-green-600 text-white p-6 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 text-left w-full cursor-pointer"
              >
                <p className="text-green-100 text-sm mb-2">
                  Net Cash{" "}
                  {loadingCashSummary ? "(Loading...)" : "(Click to view)"}
                </p>
                <p className={`text-2xl sm:text-3xl font-bold ${netCash < 0 ? "text-red-200" : ""}`}>
                  {formatCurrency(netCash)}
                </p>
                <p className="text-sm text-green-100 mt-2">Cash sales minus expenses</p>
              </button>
            );
          })()}
        </div>

        {/* Expense Breakdown Chart */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h3 className="text-xl font-bold text-gray-900 mb-1">
            Expense Breakdown by Category
          </h3>
          <p className="text-sm text-gray-500 mb-6">
            Total spend distributed across expense categories.
          </p>
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
        <h2 className="text-xl font-bold text-gray-900 mb-1">
          Daily Sales & Quantity Overview
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          Revenue bars show daily totals; the line tracks number of items sold.
        </p>
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

      {/* Sales by Time of Day */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mt-6 sm:mt-8">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xl font-bold text-gray-900">
            Sales by Time of Day
          </h2>
          <TrendingUp className="w-5 h-5 text-gray-400" />
        </div>
        {peakHour.revenue > 0 && (
          <p className="text-sm text-gray-500 mb-6">
            Peak hour:{" "}
            <span className="font-semibold text-black">{peakHour.hour}</span> —{" "}
            {formatCurrency(peakHour.revenue)} across {peakHour.count}{" "}
            transaction{peakHour.count !== 1 ? "s" : ""}
          </p>
        )}
        {hourlyChartData.some((h) => h.revenue > 0) ? (
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart
              data={hourlyChartData}
              margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="hour"
                stroke="#6b7280"
                style={{ fontSize: "11px" }}
                interval={0}
                tick={{ fontSize: 11 }}
              />
              <YAxis
                yAxisId="left"
                stroke="#6b7280"
                style={{ fontSize: "11px" }}
                tickFormatter={(v) => formatCurrency(v)}
                width={72}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="#6b7280"
                style={{ fontSize: "11px" }}
                allowDecimals={false}
                width={36}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#fff",
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                }}
                labelStyle={{ color: "#000", fontWeight: 600 }}
                formatter={(value: number, name: string) =>
                  name === "Revenue" ? formatCurrency(value) : `${value} txn`
                }
              />
              <Legend />
              <Bar
                yAxisId="left"
                dataKey="revenue"
                name="Revenue"
                radius={[4, 4, 0, 0]}
                fill={primaryColor}
                opacity={0.85}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="count"
                name="Transactions"
                stroke="#6b7280"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[320px] flex items-center justify-center text-gray-500">
            No sales data available for this period
          </div>
        )}
      </div>

      {/* Sales by Day of Week */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mt-6 sm:mt-8">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xl font-bold text-gray-900">
            Sales by Day of Week
          </h2>
          <TrendingUp className="w-5 h-5 text-gray-400" />
        </div>
        {peakDay.totalRevenue > 0 && (
          <p className="text-sm text-gray-500 mb-6">
            Busiest day:{" "}
            <span className="font-semibold text-black">{peakDay.day}</span> —{" "}
            {formatCurrency(peakDay.totalRevenue)} across {peakDay.count}{" "}
            transaction{peakDay.count !== 1 ? "s" : ""}
          </p>
        )}
        {salesByDayOfWeek.some((d) => d.totalRevenue > 0) ? (
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart
              data={salesByDayOfWeek}
              margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="day"
                stroke="#6b7280"
                style={{ fontSize: "11px" }}
              />
              <YAxis
                yAxisId="left"
                stroke="#6b7280"
                style={{ fontSize: "11px" }}
                tickFormatter={(v) => formatCurrency(v)}
                width={72}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="#6b7280"
                style={{ fontSize: "11px" }}
                allowDecimals={false}
                width={36}
              />
              <Tooltip content={<DayOfWeekTooltip />} />
              <Legend />
              <Bar
                yAxisId="left"
                dataKey="totalRevenue"
                name="Revenue"
                radius={[4, 4, 0, 0]}
                fill={primaryColor}
                opacity={0.85}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="count"
                name="Transactions"
                stroke="#6b7280"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[320px] flex items-center justify-center text-gray-500">
            No sales data available for this period
          </div>
        )}
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
        title={
          selectedPaymentMethod
            ? `${selectedPaymentMethod} Transactions`
            : "All Transactions"
        }
      />

      {/* Expense List Modal */}
      <ExpenseListModal
        isOpen={showExpenseModal}
        onClose={() => setShowExpenseModal(false)}
        expenses={expenses}
        primaryColor={primaryColor}
      />

      {/* Cash Summary Modal */}
      <CashSummaryModal
        isOpen={showCashSummaryModal}
        onClose={() => setShowCashSummaryModal(false)}
        cashSales={analytics.sales.paymentMethodBreakdown["CASH"]?.total ?? 0}
        expenses={cashSummaryExpenses}
        title="Cash Summary"
      />
    </div>
  );
}
