"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import {
  FileText,
  Search,
  Filter,
  Eye,
  X,
  RefreshCw,
  User,
} from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import { DatePicker } from "@/components/ui/date-picker";
import type { SubmittedReport } from "@/types";

export default function SubmittedReportsPage() {
  const { tenant } = useTenant();
  const primaryColor = tenant?.themeColors?.primary || "#4f46e5";
  const [reports, setReports] = useState<SubmittedReport[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [isFiltering, setIsFiltering] = useState(false);
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [selectedReport, setSelectedReport] = useState<SubmittedReport | null>(
    null
  );
  const [loadingDetails, setLoadingDetails] = useState(false);

  const clearFilters = () => {
    setStartDate(undefined);
    setEndDate(undefined);
  };

  const loadReportDetails = async (reportId: string) => {
    try {
      setLoadingDetails(true);
      const fullReport = await api.getSubmittedReportById(reportId);
      setSelectedReport(fullReport);
    } catch (error) {
      console.error("Failed to load report details:", error);
    } finally {
      setLoadingDetails(false);
    }
  };

  const loadReports = useCallback(
    async (isInitial = false) => {
      try {
        if (isInitial) {
          setInitialLoading(true);
        } else {
          setIsFiltering(true);
        }

        const params: {
          startDate?: string;
          endDate?: string;
        } = {};

        if (startDate) {
          const start = new Date(startDate);
          start.setHours(0, 0, 0, 0);
          params.startDate = start.toISOString();
        }
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          params.endDate = end.toISOString();
        }

        const data = await api.getSubmittedReports(params);
        setReports(data);
      } catch (error) {
        console.error("Failed to load submitted reports:", error);
      } finally {
        setInitialLoading(false);
        setIsFiltering(false);
      }
    },
    [startDate, endDate]
  );

  useEffect(() => {
    loadReports(true);
  }, [loadReports]);

  if (initialLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-16 bg-gray-200 rounded"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Submitted Reports</h1>
        <p className="text-sm sm:text-base text-gray-600 mt-2">
          View all submitted daily sales reports
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200 mb-6">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <DatePicker
              date={startDate}
              onDateChange={setStartDate}
              placeholder="Submission start date"
            />
          </div>
          <div className="flex-1">
            <DatePicker
              date={endDate}
              onDateChange={setEndDate}
              placeholder="Submission end date"
            />
          </div>
          <button
            onClick={() => loadReports(false)}
            className="p-2 rounded-lg border border-gray-300 bg-white text-gray-600 hover:text-gray-900 hover:border-gray-400 transition"
            title="Refresh reports"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          {(startDate || endDate) && (
            <button
              onClick={clearFilters}
              className="text-gray-600 hover:text-gray-900 p-2 rounded-lg border border-gray-300 hover:border-gray-400 transition"
              title="Clear filters"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Reports Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden relative">
        {isFiltering && (
          <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-10">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        )}
        {reports.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Report Date
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Submitted At
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Submitted By
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Total Sales
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Gross Profit
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {reports.map((report) => (
                  <tr key={report.id} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <FileText className="w-4 h-4 text-gray-400" />
                        <span className="text-sm font-medium text-gray-900">
                          {report.reportDate}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {formatDateTime(report.submittedAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {report.user?.email || report.user?.username || "N/A"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-bold text-gray-900">
                        {formatCurrency(report.salesSnapshot.totalAmount)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`text-sm font-bold ${
                          report.summarySnapshot.grossProfit >= 0
                            ? "text-green-600"
                            : "text-red-600"
                        }`}
                      >
                        {formatCurrency(report.summarySnapshot.grossProfit)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <button
                        onClick={() => loadReportDetails(report.id)}
                        className="text-black hover:opacity-70 transition"
                        disabled={loadingDetails}
                      >
                        <Eye className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No submitted reports found</p>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {(selectedReport || loadingDetails) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900">
                  Report Details
                </h2>
                <button
                  onClick={() => setSelectedReport(null)}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  ×
                </button>
              </div>
            </div>

            {loadingDetails ? (
              <div className="p-12 flex flex-col items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
                <p className="text-gray-600">Loading report details...</p>
              </div>
            ) : selectedReport ? (
              <div className="p-6 space-y-6">
                {/* Metadata */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Report Date</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {selectedReport.reportDate}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Submitted At</p>
                    <p className="text-sm text-gray-900">
                      {formatDateTime(selectedReport.submittedAt)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Submitted By</p>
                    <p className="text-sm text-gray-900">
                      {selectedReport.user?.email ||
                        selectedReport.user?.username}{" "}
                      ({selectedReport.user?.role})
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Period Covered</p>
                    <p className="text-xs text-gray-700">
                      {new Date(selectedReport.periodStart).toLocaleString()} -{" "}
                      {new Date(selectedReport.periodEnd).toLocaleString()}
                    </p>
                  </div>
                </div>

                {/* Summary */}
                <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white p-6 rounded-xl">
                  <h3 className="text-lg font-bold mb-4">Summary</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-emerald-100 text-sm">Gross Profit</p>
                      <p className="text-2xl font-bold">
                        {formatCurrency(
                          selectedReport.summarySnapshot.grossProfit
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-emerald-100 text-sm">Profit Margin</p>
                      <p className="text-2xl font-bold">
                        {selectedReport.summarySnapshot.profitMargin.toFixed(2)}
                        %
                      </p>
                    </div>
                    <div>
                      <p className="text-emerald-100 text-sm">Net Revenue</p>
                      <p className="text-2xl font-bold">
                        {formatCurrency(
                          selectedReport.summarySnapshot.netRevenue
                        )}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Sales Snapshot */}
                <div className="bg-blue-50 p-6 rounded-xl border-2 border-blue-200">
                  <h3 className="text-lg font-bold text-blue-900 mb-4">
                    Sales
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-blue-700">Total Amount</p>
                      <p className="text-xl font-bold text-blue-900">
                        {formatCurrency(
                          selectedReport.salesSnapshot.totalAmount
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-blue-700">Transactions</p>
                      <p className="text-xl font-bold text-blue-900">
                        {selectedReport.salesSnapshot.transactionCount}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-blue-700">Avg Transaction</p>
                      <p className="text-lg font-semibold text-blue-900">
                        {formatCurrency(
                          selectedReport.salesSnapshot.averageTransaction
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-blue-700">Items Sold</p>
                      <p className="text-lg font-semibold text-blue-900">
                        {selectedReport.salesSnapshot.totalItemsSold}
                      </p>
                    </div>
                  </div>

                  {/* Payment Method Breakdown */}
                  <div className="mt-4 pt-4 border-t border-blue-300">
                    <p className="text-sm font-bold text-blue-900 mb-2">
                      Payment Methods
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(
                        selectedReport.salesSnapshot
                          .paymentMethodBreakdown as Record<
                          string,
                          { total: number; count: number }
                        >
                      ).map(([method, data]) => (
                        <div key={method} className="bg-white p-3 rounded-lg">
                          <p className="text-xs text-gray-600">{method}</p>
                          <p className="text-sm font-bold text-gray-900">
                            {formatCurrency(data.total)}
                          </p>
                          <p className="text-xs text-gray-500">
                            {data.count} transactions
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Expenses Snapshot */}
                <div className="bg-red-50 p-6 rounded-xl border-2 border-red-200">
                  <h3 className="text-lg font-bold text-red-900 mb-4">
                    Expenses
                  </h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-sm text-red-700">Total Amount</p>
                      <p className="text-xl font-bold text-red-900">
                        {formatCurrency(
                          selectedReport.expensesSnapshot.totalAmount
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-red-700">Count</p>
                      <p className="text-xl font-bold text-red-900">
                        {selectedReport.expensesSnapshot.expenseCount}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-red-700">Avg Expense</p>
                      <p className="text-lg font-semibold text-red-900">
                        {formatCurrency(
                          selectedReport.expensesSnapshot.averageExpense
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Category Breakdown */}
                  <div className="mt-4 pt-4 border-t border-red-300">
                    <p className="text-sm font-bold text-red-900 mb-2">
                      Categories
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(
                        selectedReport.expensesSnapshot
                          .categoryBreakdown as Record<
                          string,
                          { total: number; count: number }
                        >
                      ).map(([category, data]) => (
                        <div key={category} className="bg-white p-3 rounded-lg">
                          <p className="text-xs text-gray-600">{category}</p>
                          <p className="text-sm font-bold text-gray-900">
                            {formatCurrency(data.total)}
                          </p>
                          <p className="text-xs text-gray-500">
                            {data.count} expenses
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Transaction Details */}
                <div className="bg-gray-50 p-6 rounded-xl">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">
                    Transactions (
                    {selectedReport.transactions?.length ||
                      selectedReport.transactionIds.length}
                    )
                  </h3>
                  {selectedReport.transactions &&
                  selectedReport.transactions.length > 0 ? (
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {selectedReport.transactions.map((transaction) => (
                        <div
                          key={transaction.id}
                          className="bg-white p-4 rounded-lg border border-gray-200"
                        >
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <p className="text-sm font-semibold text-gray-900">
                                Transaction #{transaction.transactionId}
                              </p>
                              <p className="text-xs text-gray-500">
                                {formatDateTime(transaction.timestamp)}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-lg font-bold text-gray-900">
                                {formatCurrency(transaction.total)}
                              </p>
                              <p className="text-xs text-gray-600">
                                {transaction.paymentMethod}
                              </p>
                            </div>
                          </div>
                          {transaction.items &&
                            transaction.items.length > 0 && (
                              <div className="mt-2 pt-2 border-t border-gray-100">
                                <p className="text-xs font-semibold text-gray-700 mb-1">
                                  Items:
                                </p>
                                <ul className="space-y-1">
                                  {transaction.items.map((item) => (
                                    <li
                                      key={item.id}
                                      className="text-xs text-gray-600"
                                    >
                                      {item.quantity}x{" "}
                                      {item.product?.name || "Product"}
                                      {item.size && ` (${item.size.name})`}
                                      {item.addons &&
                                        item.addons.length > 0 && (
                                          <span className="text-gray-500">
                                            {" "}
                                            +{" "}
                                            {item.addons
                                              .map((a) => a.addon.name)
                                              .join(", ")}
                                          </span>
                                        )}
                                      <span className="float-right">
                                        {formatCurrency(item.subtotal)}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">
                      No transactions found
                    </p>
                  )}
                </div>

                {/* Expense Details */}
                <div className="bg-gray-50 p-6 rounded-xl">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">
                    Expenses (
                    {selectedReport.expenses?.length ||
                      selectedReport.expenseIds.length}
                    )
                  </h3>
                  {selectedReport.expenses &&
                  selectedReport.expenses.length > 0 ? (
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {selectedReport.expenses.map((expense) => (
                        <div
                          key={expense.id}
                          className="bg-white p-4 rounded-lg border border-gray-200"
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <p className="text-sm font-semibold text-gray-900">
                                {expense.description}
                              </p>
                              <p className="text-xs text-gray-500 mt-1">
                                {formatDateTime(expense.date)}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                                  {expense.category}
                                </span>
                                {expense.user && (
                                  <span className="text-xs text-gray-500">
                                    by{" "}
                                    {expense.user.username ||
                                      expense.user.email}
                                  </span>
                                )}
                              </div>
                              {expense.notes && (
                                <p className="text-xs text-sm sm:text-base text-gray-600 mt-2 italic">
                                  {expense.notes}
                                </p>
                              )}
                            </div>
                            <div className="text-right ml-4">
                              <p className="text-lg font-bold text-red-600">
                                {formatCurrency(expense.amount)}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No expenses found</p>
                  )}
                </div>

                {/* Notes */}
                {selectedReport.notes && (
                  <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
                    <p className="text-sm font-semibold text-yellow-800 mb-1">
                      Notes:
                    </p>
                    <p className="text-sm text-yellow-900">
                      {selectedReport.notes}
                    </p>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
