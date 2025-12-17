"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import {
  TrendingUp,
  Receipt,
  DollarSign,
  Package,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
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
}

export default function DashboardPage() {
  const { tenant } = useTenant();
  const primaryColor = tenant?.themeColors?.primary || "#4f46e5";
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [dailyAnalytics, setDailyAnalytics] = useState<AnalyticsData | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [loadingExpenses, setLoadingExpenses] = useState(false);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const [monthlyData, dailyData] = await Promise.all([
        api.getAnalytics({ period: "monthly" }),
        api.getAnalytics({ period: "daily" }),
      ]);
      setAnalytics(monthlyData);
      setDailyAnalytics(dailyData);
    } catch (error) {
      console.error("Failed to load dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadTransactions = async () => {
    try {
      setLoadingTransactions(true);
      const params: { startDate?: string; endDate?: string } = {};

      if (analytics?.period) {
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

      if (analytics?.period) {
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

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 bg-gray-200 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const growth = analytics?.sales?.growth ?? 0;

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Welcome back! 👋</h1>
        <p className="text-gray-600 mt-2">
          {tenant?.name || "Your Business"} - Overview and statistics
        </p>
      </div>

      {/* Today's Overview */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">
          Today's Overview
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Today's Sales */}
          <div className="bg-gradient-to-br from-cyan-500 to-cyan-600 text-white p-6 rounded-xl shadow-lg">
            <p className="text-cyan-100 text-sm mb-2">Today's Sales</p>
            <p className="text-3xl font-bold">
              {formatCurrency(dailyAnalytics?.sales?.totalAmount || 0)}
            </p>
            <p className="text-sm text-cyan-100 mt-2">
              {dailyAnalytics?.sales?.transactionCount || 0} transaction(s)
            </p>
          </div>

          {/* Today's Expenses */}
          <div className="bg-gradient-to-br from-rose-500 to-rose-600 text-white p-6 rounded-xl shadow-lg">
            <p className="text-rose-100 text-sm mb-2">Today's Expenses</p>
            <p className="text-3xl font-bold">
              {formatCurrency(dailyAnalytics?.expenses?.totalAmount || 0)}
            </p>
            <p className="text-sm text-rose-100 mt-2">
              {dailyAnalytics?.expenses?.expenseCount || 0} expense(s)
            </p>
          </div>

          {/* Today's Net */}
          <div className="bg-gradient-to-br from-teal-500 to-teal-600 text-white p-6 rounded-xl shadow-lg">
            <p className="text-teal-100 text-sm mb-2">Today's Net Revenue</p>
            <p className="text-3xl font-bold">
              {formatCurrency(dailyAnalytics?.summary?.netRevenue || 0)}
            </p>
            <p className="text-sm text-teal-100 mt-2">After expenses</p>
          </div>
        </div>
      </div>

      {/* Monthly Stats Cards */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">
          Monthly Overview
        </h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* Monthly Total Sales */}
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-6 rounded-xl shadow-lg">
          <p className="text-blue-100 text-sm mb-2">Monthly Sales</p>
          <p className="text-3xl font-bold">
            {formatCurrency(analytics?.sales?.totalAmount || 0)}
          </p>
          <p className="text-sm text-blue-100 mt-2">
            {growth >= 0 ? "↑" : "↓"} {Math.abs(growth).toFixed(1)}% from
            previous month
          </p>
        </div>

        {/* Monthly Transactions - Clickable */}
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
            {analytics?.sales?.transactionCount || 0}
          </p>
          <p className="text-sm text-green-100 mt-2">This month</p>
        </button>

        {/* Average Order */}
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white p-6 rounded-xl shadow-lg">
          <p className="text-purple-100 text-sm mb-2">Avg. Order Value</p>
          <p className="text-3xl font-bold">
            {formatCurrency(analytics?.sales?.averageTransaction || 0)}
          </p>
          <p className="text-sm text-purple-100 mt-2">Per transaction</p>
        </div>

        {/* Products Sold */}
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 text-white p-6 rounded-xl shadow-lg">
          <p className="text-orange-100 text-sm mb-2">Products Sold</p>
          <p className="text-3xl font-bold">
            {analytics?.sales?.totalItemsSold || 0}
          </p>
          <p className="text-sm text-orange-100 mt-2">This month</p>
        </div>
      </div>

      {/* Monthly Financial Overview */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">
          Monthly Financial Overview
        </h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Monthly Total Expenses - Clickable */}
        <button
          onClick={loadExpenses}
          disabled={loadingExpenses}
          className="bg-gradient-to-br from-red-500 to-red-600 text-white p-6 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 text-left w-full cursor-pointer"
        >
          <p className="text-red-100 text-sm mb-2">
            Monthly Expenses{" "}
            {loadingExpenses ? "(Loading...)" : "(Click to view all)"}
          </p>
          <p className="text-3xl font-bold">
            {formatCurrency(analytics?.expenses?.totalAmount || 0)}
          </p>
          <p className="text-sm text-red-100 mt-2">
            {analytics?.expenses?.expenseCount || 0} expense(s)
          </p>
        </button>

        {/* Monthly Gross Profit */}
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white p-6 rounded-xl shadow-lg">
          <p className="text-emerald-100 text-sm mb-2">Monthly Gross Profit</p>
          <p className="text-3xl font-bold">
            {formatCurrency(analytics?.summary?.grossProfit || 0)}
          </p>
          <p className="text-sm text-emerald-100 mt-2">
            {analytics?.summary?.profitMargin?.toFixed(1) || 0}% margin
          </p>
        </div>

        {/* Monthly Net Revenue */}
        <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 text-white p-6 rounded-xl shadow-lg">
          <p className="text-indigo-100 text-sm mb-2">Monthly Net Revenue</p>
          <p className="text-3xl font-bold">
            {formatCurrency(analytics?.summary?.netRevenue || 0)}
          </p>
          <p className="text-sm text-indigo-100 mt-2">After expenses</p>
        </div>
      </div>

      {/* Top Products */}
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
        <h2 className="text-xl font-bold text-gray-900 mb-6">
          Top Selling Products
        </h2>

        {analytics?.topProducts && analytics.topProducts.length > 0 ? (
          <div className="overflow-x-auto">
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
                {analytics.topProducts.slice(0, 5).map((product, index) => {
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
          <div className="text-center py-12">
            <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No sales data available yet</p>
          </div>
        )}
      </div>

      {/* Transaction List Modal */}
      <TransactionListModal
        isOpen={showTransactionModal}
        onClose={() => setShowTransactionModal(false)}
        transactions={transactions}
        primaryColor={primaryColor}
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
