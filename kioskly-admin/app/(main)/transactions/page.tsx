"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { hasPrivilege } from "@/lib/privileges";
import { api } from "@/lib/api";
import {
  formatCurrency,
  formatDateTime,
  formatUserName,
  getPaymentMethodLabel,
  getPaymentStatusLabel,
  getPaymentStatusColor,
  getCombinedDiscount,
  getErrorMessage,
} from "@/lib/utils";
import {
  Receipt,
  Search,
  Filter,
  Download,
  Eye,
  X,
  RefreshCw,
} from "lucide-react";
import type { Transaction } from "@/types";
import { useTenant } from "@/contexts/TenantContext";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export default function TransactionsPage() {
  const router = useRouter();
  const { tenant, brand } = useTenant();
  const primaryColor = brand?.themeColors?.primary ?? tenant?.themeColors?.primary ?? "#ea580c";
  const activeTabColor = "#1f2937";

  const canWrite = hasPrivilege('transactions', 'write');

  useEffect(() => {
    if (!hasPrivilege('transactions', 'read')) router.replace('/dashboard');
  }, [router]);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [isFiltering, setIsFiltering] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [filterMethod, setFilterMethod] = useState<string>("ALL");
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [selectedTransaction, setSelectedTransaction] =
    useState<Transaction | null>(null);

  // Void request state
  const [showVoidRequests, setShowVoidRequests] = useState(false);
  const [voidRequests, setVoidRequests] = useState<Transaction[]>([]);
  const [loadingVoidRequests, setLoadingVoidRequests] = useState(false);
  const [voidStatusFilter, setVoidStatusFilter] = useState<
    "PENDING" | "APPROVED" | "REJECTED" | "ALL"
  >("PENDING");
  const [selectedVoidRequest, setSelectedVoidRequest] =
    useState<Transaction | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [isProcessingVoid, setIsProcessingVoid] = useState(false);

  // Request void state (from transaction detail)
  const [showVoidRequestForm, setShowVoidRequestForm] = useState(false);
  const [voidRequestReason, setVoidRequestReason] = useState("");
  const [isSubmittingVoidRequest, setIsSubmittingVoidRequest] = useState(false);

  // Debounce search term to avoid too many API calls
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const isFirstTransactionLoad = useRef(true);

  const clearDates = () => {
    setStartDate(undefined);
    setEndDate(undefined);
  };

  const loadTransactions = useCallback(
    async (isInitial = false) => {
      try {
        if (isInitial) {
          setInitialLoading(true);
        } else {
          setIsFiltering(true);
        }

        const params: {
          search?: string;
          paymentStatus?: string;
          paymentMethod?: string;
          startDate?: string;
          endDate?: string;
        } = {};

        if (debouncedSearchTerm) {
          params.search = debouncedSearchTerm;
        }
        if (filterStatus !== "ALL") {
          params.paymentStatus = filterStatus;
        }
        if (filterMethod !== "ALL") {
          params.paymentMethod = filterMethod;
        }
        if (startDate) {
          // Set to start of day
          const start = new Date(startDate);
          start.setHours(0, 0, 0, 0);
          params.startDate = start.toISOString();
        }
        if (endDate) {
          // Set to end of day to include all transactions on the end date
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          params.endDate = end.toISOString();
        }

        const data = await api.getTransactions(params);
        setTransactions(data);
      } catch (error) {
        console.error("Failed to load transactions:", error);
      } finally {
        setInitialLoading(false);
        setIsFiltering(false);
      }
    },
    [debouncedSearchTerm, filterStatus, filterMethod, startDate, endDate]
  );

  // First call shows full skeleton; subsequent filter/search changes use the subtle indicator
  useEffect(() => {
    const isInitial = isFirstTransactionLoad.current;
    isFirstTransactionLoad.current = false;
    loadTransactions(isInitial);
  }, [loadTransactions]);

  // Load void requests
  const loadVoidRequests = useCallback(async () => {
    try {
      setLoadingVoidRequests(true);
      const requests = await api.getVoidRequests({
        status: voidStatusFilter,
      });
      setVoidRequests(requests);
    } catch (error) {
      console.error("Failed to load void requests:", error);
      toast.error(getErrorMessage(error, "Failed to load void requests"));
    } finally {
      setLoadingVoidRequests(false);
    }
  }, [voidStatusFilter]);

  // Reset void request form when selected transaction changes
  useEffect(() => {
    setShowVoidRequestForm(false);
    setVoidRequestReason("");
  }, [selectedTransaction]);

  // Load void requests when tab is switched or filter changes
  useEffect(() => {
    if (showVoidRequests) {
      loadVoidRequests();
    }
  }, [showVoidRequests, voidStatusFilter, loadVoidRequests]);

  // Approve void request
  const handleApproveVoid = async (transaction: Transaction) => {
    if (
      !confirm(
        `Are you sure you want to approve void request for ${transaction.transactionId}?`
      )
    ) {
      return;
    }

    setIsProcessingVoid(true);
    try {
      await api.approveVoidRequest(transaction.id);
      toast.success("Void request approved successfully");
      loadVoidRequests(); // Reload void requests
      if (!showVoidRequests) {
        loadTransactions(false); // Reload transactions if on transactions tab
      }
    } catch (error) {
      console.error("Failed to approve void request:", error);
      toast.error(getErrorMessage(error, "Failed to approve void request"));
    } finally {
      setIsProcessingVoid(false);
    }
  };

  // Open reject modal
  const openRejectModal = (transaction: Transaction) => {
    setSelectedVoidRequest(transaction);
    setRejectionReason("");
    setShowRejectModal(true);
  };

  // Reject void request
  const handleRejectVoid = async () => {
    if (!selectedVoidRequest) return;

    setIsProcessingVoid(true);
    try {
      await api.rejectVoidRequest(
        selectedVoidRequest.id,
        rejectionReason.trim() || undefined
      );
      toast.success("Void request rejected");
      setShowRejectModal(false);
      setSelectedVoidRequest(null);
      setRejectionReason("");
      loadVoidRequests(); // Reload void requests
      if (!showVoidRequests) {
        loadTransactions(false); // Reload transactions if on transactions tab
      }
    } catch (error) {
      console.error("Failed to reject void request:", error);
      toast.error(getErrorMessage(error, "Failed to reject void request"));
    } finally {
      setIsProcessingVoid(false);
    }
  };

  // Submit a new void request from transaction detail
  const handleRequestVoid = async () => {
    if (!selectedTransaction || voidRequestReason.trim().length < 10) return;
    setIsSubmittingVoidRequest(true);
    try {
      await api.requestVoidTransaction(selectedTransaction.id, voidRequestReason.trim());
      toast.success("Transaction voided successfully");
      setShowVoidRequestForm(false);
      setVoidRequestReason("");
      setSelectedTransaction(null);
      loadTransactions(false);
    } catch (error) {
      console.error("Failed to submit void request:", error);
      toast.error(getErrorMessage(error, "Failed to submit void request"));
    } finally {
      setIsSubmittingVoidRequest(false);
    }
  };

  // Get void status badge color
  const getVoidStatusBadgeClass = (status?: string) => {
    switch (status) {
      case "PENDING":
        return "bg-yellow-100 text-yellow-800";
      case "APPROVED":
        return "bg-red-100 text-red-800";
      case "REJECTED":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-600";
    }
  };

  // For SPLIT transactions, flattens each leg into "Method: amount" pairs so the
  // per-method breakdown survives the export instead of collapsing to "SPLIT".
  const formatPaymentSplitSummary = (t: Transaction): string => {
    if (t.paymentMethod !== "SPLIT" || !t.payments?.length) return "";
    return t.payments
      .map((p) => `${getPaymentMethodLabel(p.method)}: ${p.amount.toFixed(2)}`)
      .join(" | ");
  };

  const exportToCSV = () => {
    const escapeCSV = (value: unknown): string => {
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

    const headers = [
      "Transaction ID",
      "Date",
      "User",
      "Total",
      "Discount",
      "Payment Method",
      "Split Breakdown",
      "Status",
    ];
    const rows = transactions.map((t) =>
      [
        t.transactionId,
        formatDateTime(t.timestamp),
        formatUserName(t.user),
        t.total,
        getCombinedDiscount(t) || "",
        t.paymentMethod,
        formatPaymentSplitSummary(t),
        t.paymentStatus || "COMPLETED",
      ].map(escapeCSV)
    );

    const csv = [headers.join(","), ...rows.map((row) => row.join(","))].join(
      "\n"
    );

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;

    const filterParts: string[] = [];
    if (filterStatus !== "ALL") filterParts.push(filterStatus.toLowerCase());
    if (filterMethod !== "ALL") filterParts.push(filterMethod.toLowerCase());
    if (startDate) filterParts.push(`from-${startDate.toISOString().split("T")[0]}`);
    if (endDate) filterParts.push(`to-${endDate.toISOString().split("T")[0]}`);
    if (debouncedSearchTerm) {
      filterParts.push(
        `search-${debouncedSearchTerm
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 30)}`
      );
    }
    const filterSuffix = filterParts.length ? `-${filterParts.join("-")}` : "";

    a.download = `transactions-${new Date().toISOString().split("T")[0]}${filterSuffix}.csv`;
    a.click();
  };

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
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
          Transactions
        </h1>
        <p className="text-sm sm:text-base text-gray-600 mt-2">
          View and manage all sales transactions
        </p>
      </div>

      {/* Tab Switcher */}
      <div className="mb-6 border-b border-gray-200">
        <div className="flex space-x-8">
          <button
            onClick={() => setShowVoidRequests(false)}
            className={`pb-4 px-2 border-b-2 font-medium transition-colors ${
              !showVoidRequests
                ? "border-current"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
            style={!showVoidRequests ? { color: activeTabColor, borderColor: primaryColor } : undefined}
          >
            All Transactions
          </button>
          <button
            onClick={() => setShowVoidRequests(true)}
            className={`pb-4 px-2 border-b-2 font-medium transition-colors relative ${
              showVoidRequests
                ? "border-current"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
            style={showVoidRequests ? { color: activeTabColor, borderColor: primaryColor } : undefined}
          >
            Void Requests
            {voidRequests.filter((r) => r.voidStatus === "PENDING").length >
              0 && (
              <span className="ml-2 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white bg-red-600 rounded-full">
                {voidRequests.filter((r) => r.voidStatus === "PENDING").length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Filters and Search - Only show for transactions tab */}
      {!showVoidRequests && (
        <div className="bg-white rounded-xl shadow-sm p-4 md:p-6 border border-gray-200 mb-6">
          <div className="space-y-4">
            {/* Search - Full width on all screens */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search by ID or user..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none bg-white text-gray-900 placeholder-gray-400"
              />
            </div>

            {/* Date pickers row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Start Date Picker */}
              <div className="relative">
                <DatePicker
                  date={startDate}
                  onDateChange={setStartDate}
                  placeholder="Start date"
                />
              </div>

              {/* End Date Picker with Clear Button */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <DatePicker
                    date={endDate}
                    onDateChange={setEndDate}
                    placeholder="End date"
                  />
                </div>
                {(startDate || endDate) && (
                  <button
                    onClick={clearDates}
                    className="flex items-center justify-center text-gray-600 hover:text-gray-900 p-2 rounded-lg border border-gray-300 hover:border-gray-400 transition flex-shrink-0"
                    title="Clear dates"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>

            {/* Filters row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Status Filter */}
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger style={{ color: activeTabColor }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent style={{ '--select-hover-bg': `${primaryColor}20`, '--select-hover-text': activeTabColor } as React.CSSProperties}>
                  <SelectItem value="ALL">All Status</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="FAILED">Failed</SelectItem>
                </SelectContent>
              </Select>

              {/* Payment Method Filter */}
              <Select value={filterMethod} onValueChange={setFilterMethod}>
                <SelectTrigger style={{ color: activeTabColor }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent style={{ '--select-hover-bg': `${primaryColor}20`, '--select-hover-text': activeTabColor } as React.CSSProperties}>
                  <SelectItem value="ALL">All Methods</SelectItem>
                  <SelectItem value="CASH">Cash</SelectItem>
                  <SelectItem value="GCASH">GCash</SelectItem>
                  <SelectItem value="PAYMAYA">Maya</SelectItem>
                  <SelectItem value="ONLINE">Online</SelectItem>
                  <SelectItem value="FOODPANDA">FoodPanda</SelectItem>
                  <SelectItem value="GRAB">Grab</SelectItem>
                  <SelectItem value="SPLIT">Split Payment</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <button
                onClick={() => loadTransactions(false)}
                className="p-2 rounded-lg border border-gray-300 bg-white text-gray-600 hover:text-gray-900 hover:border-gray-400 transition flex items-center justify-center"
                title="Refresh transactions"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
              <button
                onClick={exportToCSV}
                style={{ backgroundColor: primaryColor }}
                className="flex items-center justify-center space-x-2 text-black px-4 py-2 rounded-lg transition hover:opacity-90"
              >
                <Download className="w-5 h-5" />
                <span className="text-sm sm:text-base">Export CSV</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transactions Table - Only show for transactions tab */}
      {!showVoidRequests && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden relative">
          {isFiltering && (
            <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-10">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderBottomColor: primaryColor }}></div>
            </div>
          )}
          {transactions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Transaction ID
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Date & Time
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      User
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Total
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Discount
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Payment
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {transactions.map((transaction) => (
                    <tr
                      key={transaction.id}
                      className="hover:bg-gray-50 transition"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          <Receipt className="w-4 h-4 text-gray-400" />
                          <span className="text-sm font-mono text-gray-900">
                            {transaction.transactionId}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {formatDateTime(transaction.timestamp)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatUserName(transaction.user)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-bold text-gray-900">
                          {formatCurrency(transaction.total)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {getCombinedDiscount(transaction) > 0 ? (
                          <span className="text-red-600 font-medium">
                            -{formatCurrency(getCombinedDiscount(transaction))}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {getPaymentMethodLabel(transaction.paymentMethod)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-semibold ${getPaymentStatusColor(transaction.paymentStatus || "COMPLETED")}`}
                        >
                          {getPaymentStatusLabel(
                            transaction.paymentStatus || "COMPLETED"
                          )}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <button
                          onClick={() => setSelectedTransaction(transaction)}
                          className="text-black hover:opacity-70 transition"
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
              <Receipt className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No transactions found</p>
            </div>
          )}
        </div>
      )}

      {/* Void Requests Section - Only show for void requests tab */}
      {showVoidRequests && (
        <div className="space-y-6">
          {/* Status Filter */}
          <div className="bg-white rounded-xl shadow-sm p-4 md:p-6 border border-gray-200">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 flex-1">
                <label className="font-medium text-gray-700">Status:</label>
                <div className="flex-1 max-w-xs">
                  <Select
                    value={voidStatusFilter}
                    onValueChange={(v) => setVoidStatusFilter(v as "PENDING" | "APPROVED" | "REJECTED" | "ALL")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent style={{ '--select-hover-bg': `${primaryColor}20`, '--select-hover-text': activeTabColor } as React.CSSProperties}>
                      <SelectItem value="PENDING">Pending</SelectItem>
                      <SelectItem value="APPROVED">Approved</SelectItem>
                      <SelectItem value="REJECTED">Rejected</SelectItem>
                      <SelectItem value="ALL">All</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <button
                onClick={loadVoidRequests}
                disabled={loadingVoidRequests}
                className="p-2 rounded-lg border border-gray-300 bg-white text-gray-600 hover:text-gray-900 hover:border-gray-400 transition flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                title="Refresh void requests"
              >
                <RefreshCw
                  className={`w-5 h-5 ${loadingVoidRequests ? "animate-spin" : ""}`}
                />
              </button>
            </div>
          </div>

          {/* Void Requests Table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden relative">
            {loadingVoidRequests && (
              <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-10">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderBottomColor: primaryColor }}></div>
              </div>
            )}
            {voidRequests.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Transaction ID
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Amount
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Requested By
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Requested At
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Reason
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Review
                      </th>
                      <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {voidRequests.map((request) => (
                      <tr key={request.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="font-mono text-sm text-gray-900">
                            {request.transactionId}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="font-semibold text-gray-900">
                            {formatCurrency(request.total)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm text-gray-900">
                            {formatUserName(request.voidRequester)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm text-gray-600">
                            {formatDateTime(request.voidRequestedAt || "")}
                          </span>
                        </td>
                        <td className="px-6 py-4 max-w-xs">
                          <span className="text-sm text-gray-600 line-clamp-2">
                            {request.voidReason}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-medium ${getVoidStatusBadgeClass(request.voidStatus)}`}
                          >
                            {request.voidStatus}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {request.voidStatus === "PENDING" && canWrite ? (
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleApproveVoid(request)}
                                disabled={isProcessingVoid}
                                className="px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => openRejectModal(request)}
                                disabled={isProcessingVoid}
                                className="px-3 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 text-sm"
                              >
                                Reject
                              </button>
                            </div>
                          ) : (
                            <span className="text-sm text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <button
                            onClick={() => setSelectedTransaction(request)}
                            className="text-gray-700 hover:text-gray-900"
                            title="View details"
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
                <Receipt className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No void requests found</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Rejection Modal — portaled to document.body; an in-place fixed
          overlay nested this deep in the layout tree renders short at the
          top edge (see kioscify-company's brands/[brandId]/page.tsx Modal
          for notes). */}
      {showRejectModal && selectedVoidRequest && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-lg w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Reject Void Request
            </h2>
            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">
                Transaction: {selectedVoidRequest.transactionId}
              </p>
              <p className="text-sm text-gray-600 mb-4">
                Amount: {formatCurrency(selectedVoidRequest.total)}
              </p>
              <p className="text-sm text-gray-700 font-medium mb-2">
                Void Reason:
              </p>
              <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg mb-4">
                {selectedVoidRequest.voidReason}
              </p>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Rejection Reason (Optional)
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Enter reason for rejection..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowRejectModal(false);
                  setSelectedVoidRequest(null);
                  setRejectionReason("");
                }}
                disabled={isProcessingVoid}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRejectVoid}
                disabled={isProcessingVoid}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {isProcessingVoid ? "Processing..." : "Reject"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Transaction Details Modal — portaled to document.body */}
      {selectedTransaction && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-2 sm:p-4 z-50">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
            <div className="p-4 sm:p-6 border-b border-gray-200 flex-shrink-0">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900">
                  Transaction Details
                </h2>
                <button
                  onClick={() => setSelectedTransaction(null)}
                  className="text-gray-400 hover:text-gray-600 text-2xl flex-shrink-0"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 overflow-y-auto">
              {/* Basic Information */}
              <div>
                <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-2 sm:mb-3">
                  Basic Information
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <p className="text-xs sm:text-sm text-gray-600 mb-1">Transaction ID</p>
                    <p className="font-mono text-xs sm:text-sm text-gray-900 break-all">
                      {selectedTransaction.transactionId}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-gray-600 mb-1">Date & Time</p>
                    <p className="text-xs sm:text-sm text-gray-900">
                      {formatDateTime(selectedTransaction.timestamp)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-gray-600 mb-1">Cashier</p>
                    <p className="text-xs sm:text-sm text-gray-900 truncate">
                      {formatUserName(selectedTransaction.user)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-gray-600 mb-1">Payment Status</p>
                    <span
                      className={`px-2 sm:px-3 py-1 rounded-full text-xs font-semibold ${getPaymentStatusColor(selectedTransaction.paymentStatus || "COMPLETED")}`}
                    >
                      {getPaymentStatusLabel(
                        selectedTransaction.paymentStatus || "COMPLETED"
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* Order Items */}
              {selectedTransaction.items &&
                selectedTransaction.items.length > 0 && (
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-2 sm:mb-3">
                      Order Items
                    </h3>
                    <div className="space-y-2 sm:space-y-3">
                      {selectedTransaction.items.map((item) => (
                        <div
                          key={item.id}
                          className="p-3 sm:p-4 bg-gray-50 rounded-lg border-l-4 border-gray-300"
                        >
                          {/* Main product line */}
                          <div className="flex justify-between items-start gap-2 mb-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm sm:text-base font-medium text-gray-900">
                                {item.quantity}x{" "}
                                {item.product?.name || "Product"}
                                {item.size && (
                                  <span className="text-xs sm:text-sm text-gray-600">
                                    {" "}
                                    ({item.size.name})
                                  </span>
                                )}
                              </p>
                            </div>
                            <p className="text-sm sm:text-base font-bold text-gray-900 flex-shrink-0">
                              {formatCurrency(item.subtotal)}
                            </p>
                          </div>

                          {/* Price breakdown */}
                          <div className="ml-2 sm:ml-4 space-y-1 mt-2">
                            {/* Unit price */}
                            <div className="flex justify-between items-center gap-2 text-xs sm:text-sm text-gray-600">
                              <span className="truncate">Unit price × {item.quantity}</span>
                              <span className="flex-shrink-0">{formatCurrency(item.subtotal)}</span>
                            </div>

                            {/* Size modifier */}
                            {item.size && item.size.priceModifier !== 0 && (
                              <div className="flex justify-between items-center gap-2 text-xs sm:text-sm text-gray-600">
                                <span className="truncate">
                                  Size modifier ({item.size.name}) ×{" "}
                                  {item.quantity}
                                </span>
                                <span className="flex-shrink-0">
                                  {formatCurrency(
                                    item.size.priceModifier * item.quantity
                                  )}
                                </span>
                              </div>
                            )}

                            {/* Addons with prices */}
                            {item.addons && item.addons.length > 0 && (
                              <>
                                {item.addons.map((addonItem, idx) => {
                                  const addon =
                                    (addonItem as any).addon || addonItem;
                                  return (
                                    <div
                                      key={idx}
                                      className="flex justify-between items-center gap-2 text-xs sm:text-sm text-gray-600"
                                    >
                                      <span className="truncate">
                                        + {addon?.name || "Unknown addon"} ×{" "}
                                        {item.quantity}
                                      </span>
                                      <span className="flex-shrink-0">
                                        {formatCurrency(
                                          (addon?.price || 0) * item.quantity
                                        )}
                                      </span>
                                    </div>
                                  );
                                })}
                              </>
                            )}

                            {/* Item discount */}
                            {item.discountAmount != null && item.discountAmount > 0 && (
                              <div className="flex justify-between items-center gap-2 text-xs sm:text-sm text-red-600">
                                <span className="truncate">Item discount</span>
                                <span className="flex-shrink-0">
                                  -{formatCurrency(item.discountAmount)}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {/* Financial Summary */}
              <div>
                <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-2 sm:mb-3">
                  Financial Summary
                </h3>
                <div className="bg-gray-50 p-3 sm:p-4 rounded-lg space-y-2">
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-xs sm:text-sm text-gray-600">Subtotal</span>
                    <span className="text-xs sm:text-sm font-medium text-gray-900">
                      {formatCurrency(selectedTransaction.subtotal)}
                    </span>
                  </div>
                  {getCombinedDiscount(selectedTransaction) > 0 && (
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-xs sm:text-sm text-red-600">Discount</span>
                      <span className="text-xs sm:text-sm font-medium text-red-600">
                        -{formatCurrency(getCombinedDiscount(selectedTransaction))}
                      </span>
                    </div>
                  )}
                  <div className="border-t border-gray-200 pt-2 flex justify-between items-center gap-2">
                    <span className="text-sm sm:text-base font-bold text-gray-900">
                      Total
                    </span>
                    <span className="text-lg sm:text-xl font-bold text-gray-900">
                      {formatCurrency(selectedTransaction.total)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Payment Information */}
              <div>
                <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-2 sm:mb-3">
                  Payment Information
                </h3>
                <div className="bg-gray-50 p-3 sm:p-4 rounded-lg space-y-3">
                  <div>
                    <p className="text-xs sm:text-sm text-gray-600 mb-1">Payment Method</p>
                    <p className="text-xs sm:text-sm font-medium text-gray-900">
                      {getPaymentMethodLabel(selectedTransaction.paymentMethod)}
                    </p>
                  </div>

                  {/* Cash Payment Details */}
                  {selectedTransaction.paymentMethod === "CASH" && (
                    <>
                      {selectedTransaction.cashReceived !== null &&
                        selectedTransaction.cashReceived !== undefined && (
                          <div>
                            <p className="text-xs sm:text-sm text-gray-600 mb-1">
                              Cash Received
                            </p>
                            <p className="text-xs sm:text-sm font-medium text-gray-900">
                              {formatCurrency(selectedTransaction.cashReceived)}
                            </p>
                          </div>
                        )}
                      {selectedTransaction.change !== null &&
                        selectedTransaction.change !== undefined && (
                          <div>
                            <p className="text-xs sm:text-sm text-gray-600 mb-1">Change</p>
                            <p className="text-xs sm:text-sm font-medium text-gray-900">
                              {formatCurrency(selectedTransaction.change)}
                            </p>
                          </div>
                        )}
                    </>
                  )}

                  {/* Digital Payment Reference */}
                  {selectedTransaction.paymentMethod !== "CASH" &&
                    selectedTransaction.paymentMethod !== "SPLIT" &&
                    selectedTransaction.referenceNumber && (
                      <div>
                        <p className="text-xs sm:text-sm text-gray-600 mb-1">
                          Reference Number
                        </p>
                        <p className="text-xs sm:text-sm font-mono font-medium text-gray-900 break-all">
                          {selectedTransaction.referenceNumber}
                        </p>
                      </div>
                    )}

                  {/* Split Payment Breakdown */}
                  {selectedTransaction.paymentMethod === "SPLIT" &&
                    (selectedTransaction.payments ?? []).length > 0 && (
                      <div>
                        <p className="text-xs sm:text-sm text-gray-600 mb-2">
                          Split Breakdown
                        </p>
                        <div className="space-y-2">
                          {(selectedTransaction.payments ?? []).map((split, index) => (
                            <div
                              key={`${split.method}-${index}`}
                              className="flex items-center justify-between bg-white rounded-md px-3 py-2 border border-gray-200"
                            >
                              <div>
                                <p className="text-xs sm:text-sm font-medium text-gray-900">
                                  {getPaymentMethodLabel(split.method)}
                                </p>
                                {split.method === "CASH" ? (
                                  <p className="text-xs text-gray-500">
                                    Received {formatCurrency(split.cashReceived ?? 0)} · Change{" "}
                                    {formatCurrency(split.change ?? 0)}
                                  </p>
                                ) : (
                                  split.referenceNumber && (
                                    <p className="text-xs text-gray-500 font-mono break-all">
                                      Ref #{split.referenceNumber}
                                    </p>
                                  )
                                )}
                              </div>
                              <p className="text-xs sm:text-sm font-semibold text-gray-900">
                                {formatCurrency(split.amount)}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                </div>
              </div>

              {/* Remarks/Notes */}
              {selectedTransaction.remarks && (
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-2 sm:mb-3">
                    Remarks
                  </h3>
                  <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                    <p className="text-xs sm:text-sm text-gray-700 whitespace-pre-wrap break-words">
                      {selectedTransaction.remarks}
                    </p>
                  </div>
                </div>
              )}

              {/* Void Information */}
              {selectedTransaction.voidStatus &&
                selectedTransaction.voidStatus !== "NONE" && (
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-2 sm:mb-3">
                      Void Information
                    </h3>
                    <div className="bg-red-50 border border-red-200 p-3 sm:p-4 rounded-lg space-y-3">
                      <div className="flex justify-between items-center gap-2">
                        <span className="text-xs sm:text-sm text-gray-600">
                          Void Status
                        </span>
                        <span
                          className={`px-2 sm:px-3 py-1 rounded-full text-xs font-medium ${getVoidStatusBadgeClass(selectedTransaction.voidStatus)}`}
                        >
                          {selectedTransaction.voidStatus}
                        </span>
                      </div>

                      {selectedTransaction.voidReason && (
                        <div>
                          <p className="text-xs sm:text-sm text-gray-600 mb-1">
                            Void Reason
                          </p>
                          <p className="text-xs sm:text-sm text-gray-900 bg-white p-3 rounded border border-red-100 break-words">
                            {selectedTransaction.voidReason}
                          </p>
                        </div>
                      )}

                      {selectedTransaction.voidRequester && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                          <div>
                            <p className="text-xs sm:text-sm text-gray-600 mb-1">
                              Requested By
                            </p>
                            <p className="text-xs sm:text-sm text-gray-900 truncate">
                              {formatUserName(selectedTransaction.voidRequester)}
                            </p>
                          </div>
                          {selectedTransaction.voidRequestedAt && (
                            <div>
                              <p className="text-xs sm:text-sm text-gray-600 mb-1">
                                Requested At
                              </p>
                              <p className="text-xs sm:text-sm text-gray-900">
                                {formatDateTime(
                                  selectedTransaction.voidRequestedAt
                                )}
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {selectedTransaction.voidReviewer && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 pt-3 border-t border-red-200">
                          <div>
                            <p className="text-xs sm:text-sm text-gray-600 mb-1">
                              Reviewed By
                            </p>
                            <p className="text-xs sm:text-sm text-gray-900 truncate">
                              {formatUserName(selectedTransaction.voidReviewer)}
                            </p>
                          </div>
                          {selectedTransaction.voidReviewedAt && (
                            <div>
                              <p className="text-xs sm:text-sm text-gray-600 mb-1">
                                Reviewed At
                              </p>
                              <p className="text-xs sm:text-sm text-gray-900">
                                {formatDateTime(
                                  selectedTransaction.voidReviewedAt
                                )}
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {selectedTransaction.voidStatus === "REJECTED" &&
                        selectedTransaction.voidRejectionReason && (
                          <div>
                            <p className="text-xs sm:text-sm text-gray-600 mb-1">
                              Rejection Reason
                            </p>
                            <p className="text-xs sm:text-sm text-gray-900 bg-white p-3 rounded border border-red-100 break-words">
                              {selectedTransaction.voidRejectionReason}
                            </p>
                          </div>
                        )}
                    </div>
                  </div>
                )}

              {/* Request Void */}
              {(!selectedTransaction.voidStatus ||
                selectedTransaction.voidStatus === "NONE") &&
                canWrite && (
                  <div className="pt-2">
                    {!showVoidRequestForm ? (
                      <button
                        onClick={() => setShowVoidRequestForm(true)}
                        className="w-full py-2 px-4 border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors"
                      >
                        Request Void
                      </button>
                    ) : (
                      <div className="border border-red-200 rounded-lg p-3 sm:p-4 space-y-3 bg-red-50">
                        <h4 className="text-sm font-semibold text-gray-900">
                          Request Void
                        </h4>
                        <div>
                          <label className="block text-xs sm:text-sm text-gray-600 mb-1">
                            Reason <span className="text-gray-400">(min. 10 characters)</span>
                          </label>
                          <textarea
                            value={voidRequestReason}
                            onChange={(e) => setVoidRequestReason(e.target.value)}
                            rows={3}
                            maxLength={500}
                            placeholder="Describe the reason for voiding this transaction..."
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
                          />
                          <p className="text-xs text-gray-400 text-right mt-1">
                            {voidRequestReason.length}/500
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setShowVoidRequestForm(false);
                              setVoidRequestReason("");
                            }}
                            disabled={isSubmittingVoidRequest}
                            className="flex-1 py-2 px-4 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleRequestVoid}
                            disabled={
                              isSubmittingVoidRequest ||
                              voidRequestReason.trim().length < 10
                            }
                            className="flex-1 py-2 px-4 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isSubmittingVoidRequest ? "Submitting..." : "Submit"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
