"use client";

import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { hasPrivilege } from "@/lib/privileges";
import { api } from "@/lib/api";
import { formatCurrency, formatDateTime, formatUserName, getErrorMessage } from "@/lib/utils";
import {
  Receipt,
  Search,
  Download,
  Eye,
  X,
  RefreshCw,
} from "lucide-react";
import type { Expense } from "@/types";
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

const getCategoryLabel = (category: string) => {
  return category
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
};

const getCategoryColor = (category: string) => {
  const colors: Record<string, string> = {
    SUPPLIES: "bg-yellow-100 text-yellow-800",
    UTILITIES: "bg-purple-100 text-purple-800",
    RENT: "bg-red-100 text-red-800",
    SALARIES: "bg-blue-100 text-blue-800",
    MARKETING: "bg-pink-100 text-pink-800",
    MAINTENANCE: "bg-orange-100 text-orange-800",
    TRANSPORTATION: "bg-emerald-100 text-emerald-800",
    MISCELLANEOUS: "bg-gray-100 text-gray-800",
  };
  return colors[category] || "bg-gray-100 text-gray-600";
};

export default function ExpensesPage() {
  const router = useRouter();
  const { tenant, brand } = useTenant();
  const primaryColor = brand?.themeColors?.primary ?? tenant?.themeColors?.primary ?? "#ea580c";
  const activeTabColor = "#1f2937";

  const canWrite = hasPrivilege('expenses', 'write');

  useEffect(() => {
    if (!hasPrivilege('expenses', 'read')) router.replace('/dashboard');
  }, [router]);

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [isFiltering, setIsFiltering] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("ALL");
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);

  // Void request state
  const [showVoidRequests, setShowVoidRequests] = useState(false);
  const [voidRequests, setVoidRequests] = useState<Expense[]>([]);
  const [loadingVoidRequests, setLoadingVoidRequests] = useState(false);
  const [voidStatusFilter, setVoidStatusFilter] = useState<
    "PENDING" | "APPROVED" | "REJECTED" | "ALL"
  >("PENDING");
  const [selectedVoidRequest, setSelectedVoidRequest] =
    useState<Expense | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [isProcessingVoid, setIsProcessingVoid] = useState(false);

  // Request void state (from expense detail)
  const [showVoidRequestForm, setShowVoidRequestForm] = useState(false);
  const [voidRequestReason, setVoidRequestReason] = useState("");
  const [isSubmittingVoidRequest, setIsSubmittingVoidRequest] = useState(false);

  // Debounce search term to avoid too many API calls
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  const clearDates = () => {
    setStartDate(undefined);
    setEndDate(undefined);
  };

  const loadExpenses = useCallback(
    async (isInitial = false) => {
      try {
        if (isInitial) {
          setInitialLoading(true);
        } else {
          setIsFiltering(true);
        }

        const params: {
          category?: string;
          startDate?: string;
          endDate?: string;
        } = {};

        if (filterCategory !== "ALL") {
          params.category = filterCategory;
        }
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

        const data = await api.getExpenses(params);

        // Filter by search term on the client side
        let filteredData = data;
        if (debouncedSearchTerm) {
          const searchLower = debouncedSearchTerm.toLowerCase();
          filteredData = data.filter(
            (expense) =>
              expense.description.toLowerCase().includes(searchLower) ||
              expense.user?.email?.toLowerCase().includes(searchLower) ||
              expense.user?.username?.toLowerCase().includes(searchLower)
          );
        }

        setExpenses(filteredData);
      } catch (error) {
        console.error("Failed to load expenses:", error);
      } finally {
        setInitialLoading(false);
        setIsFiltering(false);
      }
    },
    [debouncedSearchTerm, filterCategory, startDate, endDate]
  );

  // Initial load
  useEffect(() => {
    loadExpenses(true);
  }, [loadExpenses]);

  // Filter changes - don't show full skeleton
  useEffect(() => {
    if (!initialLoading) {
      loadExpenses(false);
    }
  }, [
    debouncedSearchTerm,
    filterCategory,
    startDate,
    endDate,
    initialLoading,
    loadExpenses,
  ]);

  // Load void requests
  const loadVoidRequests = useCallback(async () => {
    try {
      setLoadingVoidRequests(true);
      const requests = await api.getExpenseVoidRequests({
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

  // Reset void request form when selected expense changes
  useEffect(() => {
    setShowVoidRequestForm(false);
    setVoidRequestReason("");
  }, [selectedExpense]);

  // Load void requests when tab is switched or filter changes
  useEffect(() => {
    if (showVoidRequests) {
      loadVoidRequests();
    }
  }, [showVoidRequests, voidStatusFilter, loadVoidRequests]);

  // Approve void request
  const handleApproveVoid = async (expense: Expense) => {
    if (
      !confirm(
        `Are you sure you want to approve void request for expense "${expense.description}"?`
      )
    ) {
      return;
    }

    setIsProcessingVoid(true);
    try {
      await api.approveExpenseVoidRequest(expense.id);
      toast.success("Void request approved successfully");
      loadVoidRequests();
      if (!showVoidRequests) {
        loadExpenses(false);
      }
    } catch (error) {
      console.error("Failed to approve void request:", error);
      toast.error(getErrorMessage(error, "Failed to approve void request"));
    } finally {
      setIsProcessingVoid(false);
    }
  };

  // Open reject modal
  const openRejectModal = (expense: Expense) => {
    setSelectedVoidRequest(expense);
    setRejectionReason("");
    setShowRejectModal(true);
  };

  // Reject void request
  const handleRejectVoid = async () => {
    if (!selectedVoidRequest) return;

    setIsProcessingVoid(true);
    try {
      await api.rejectExpenseVoidRequest(
        selectedVoidRequest.id,
        rejectionReason.trim() || undefined
      );
      toast.success("Void request rejected");
      setShowRejectModal(false);
      setSelectedVoidRequest(null);
      setRejectionReason("");
      loadVoidRequests();
      if (!showVoidRequests) {
        loadExpenses(false);
      }
    } catch (error) {
      console.error("Failed to reject void request:", error);
      toast.error(getErrorMessage(error, "Failed to reject void request"));
    } finally {
      setIsProcessingVoid(false);
    }
  };

  // Submit a new void request from expense detail
  const handleRequestVoid = async () => {
    if (!selectedExpense || voidRequestReason.trim().length < 10) return;
    setIsSubmittingVoidRequest(true);
    try {
      await api.requestVoidExpense(selectedExpense.id, voidRequestReason.trim());
      toast.success("Expense voided successfully");
      setShowVoidRequestForm(false);
      setVoidRequestReason("");
      setSelectedExpense(null);
      loadExpenses(false);
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
      "Description",
      "Date",
      "User",
      "Amount",
      "Category",
      "Notes",
    ];
    const rows = expenses.map((e) =>
      [
        e.description,
        formatDateTime(e.date),
        formatUserName(e.user),
        e.amount,
        e.category,
        e.notes || "",
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
    if (filterCategory !== "ALL") filterParts.push(filterCategory.toLowerCase());
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

    a.download = `expenses-${new Date().toISOString().split("T")[0]}${filterSuffix}.csv`;
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
          Expenses
        </h1>
        <p className="text-sm sm:text-base text-gray-600 mt-2">
          View and manage all expense records
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
            All Expenses
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

      {/* Filters and Search - Only show for expenses tab */}
      {!showVoidRequests && (
        <div className="bg-white rounded-xl shadow-sm p-4 md:p-6 border border-gray-200 mb-6">
          <div className="space-y-4">
            {/* Search - Full width on all screens */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search by description or user..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none bg-white text-gray-900 placeholder-gray-400"
              />
            </div>

            {/* Date pickers row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="relative">
                <DatePicker
                  date={startDate}
                  onDateChange={setStartDate}
                  placeholder="Start date"
                />
              </div>
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

            {/* Category Filter */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger style={{ color: activeTabColor }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent style={{ '--select-hover-bg': `${primaryColor}20`, '--select-hover-text': activeTabColor } as React.CSSProperties}>
                  <SelectItem value="ALL">All Categories</SelectItem>
                  <SelectItem value="SUPPLIES">Supplies</SelectItem>
                  <SelectItem value="UTILITIES">Utilities</SelectItem>
                  <SelectItem value="RENT">Rent</SelectItem>
                  <SelectItem value="SALARIES">Salaries</SelectItem>
                  <SelectItem value="MARKETING">Marketing</SelectItem>
                  <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
                  <SelectItem value="TRANSPORTATION">Transportation</SelectItem>
                  <SelectItem value="MISCELLANEOUS">Miscellaneous</SelectItem>
                </SelectContent>
              </Select>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <button
                  onClick={() => loadExpenses(false)}
                  className="p-2 rounded-lg border border-gray-300 bg-white text-gray-600 hover:text-gray-900 hover:border-gray-400 transition flex items-center justify-center"
                  title="Refresh expenses"
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
        </div>
      )}

      {/* Expenses Table - Only show for expenses tab */}
      {!showVoidRequests && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden relative">
          {isFiltering && (
            <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-10">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderBottomColor: primaryColor }}></div>
            </div>
          )}
          {expenses.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Description
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Date & Time
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      User
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Category
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
                  {expenses.map((expense) => (
                    <tr
                      key={expense.id}
                      className="hover:bg-gray-50 transition"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          <Receipt className="w-4 h-4 text-gray-400" />
                          <span className="text-sm text-gray-900 max-w-xs truncate">
                            {expense.description}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {formatDateTime(expense.date)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatUserName(expense.user)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-bold text-gray-900">
                          {formatCurrency(expense.amount)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-semibold ${getCategoryColor(expense.category)}`}
                        >
                          {getCategoryLabel(expense.category)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {expense.voidStatus && expense.voidStatus !== "NONE" ? (
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-semibold ${getVoidStatusBadgeClass(expense.voidStatus)}`}
                          >
                            {expense.voidStatus}
                          </span>
                        ) : (
                          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                            Active
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <button
                          onClick={() => setSelectedExpense(expense)}
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
              <p className="text-gray-600">No expenses found</p>
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
                        Description
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
                          <span className="text-sm text-gray-900 max-w-xs truncate block">
                            {request.description}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="font-semibold text-gray-900">
                            {formatCurrency(request.amount)}
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
                            onClick={() => setSelectedExpense(request)}
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
                Expense: {selectedVoidRequest.description}
              </p>
              <p className="text-sm text-gray-600 mb-4">
                Amount: {formatCurrency(selectedVoidRequest.amount)}
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

      {/* Expense Details Modal — portaled to document.body */}
      {selectedExpense && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-2 sm:p-4 z-50">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
            <div className="p-4 sm:p-6 border-b border-gray-200 flex-shrink-0">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900">
                  Expense Details
                </h2>
                <button
                  onClick={() => setSelectedExpense(null)}
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
                    <p className="text-xs sm:text-sm text-gray-600 mb-1">
                      Description
                    </p>
                    <p className="text-sm text-gray-900 break-words">
                      {selectedExpense.description}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-gray-600 mb-1">
                      Date & Time
                    </p>
                    <p className="text-xs sm:text-sm text-gray-900">
                      {formatDateTime(selectedExpense.date)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-gray-600 mb-1">
                      Added By
                    </p>
                    <p className="text-xs sm:text-sm text-gray-900 truncate">
                      {formatUserName(selectedExpense.user)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-gray-600 mb-1">
                      Category
                    </p>
                    <span
                      className={`px-2 sm:px-3 py-1 rounded-full text-xs font-semibold ${getCategoryColor(selectedExpense.category)}`}
                    >
                      {getCategoryLabel(selectedExpense.category)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Amount */}
              <div>
                <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-2 sm:mb-3">
                  Amount
                </h3>
                <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                  <span className="text-lg sm:text-xl font-bold text-gray-900">
                    {formatCurrency(selectedExpense.amount)}
                  </span>
                </div>
              </div>

              {/* Notes */}
              {selectedExpense.notes && (
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-2 sm:mb-3">
                    Notes
                  </h3>
                  <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                    <p className="text-xs sm:text-sm text-gray-700 whitespace-pre-wrap break-words">
                      {selectedExpense.notes}
                    </p>
                  </div>
                </div>
              )}

              {/* Void Information */}
              {selectedExpense.voidStatus &&
                selectedExpense.voidStatus !== "NONE" && (
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
                          className={`px-2 sm:px-3 py-1 rounded-full text-xs font-medium ${getVoidStatusBadgeClass(selectedExpense.voidStatus)}`}
                        >
                          {selectedExpense.voidStatus}
                        </span>
                      </div>

                      {selectedExpense.voidReason && (
                        <div>
                          <p className="text-xs sm:text-sm text-gray-600 mb-1">
                            Void Reason
                          </p>
                          <p className="text-xs sm:text-sm text-gray-900 bg-white p-3 rounded border border-red-100 break-words">
                            {selectedExpense.voidReason}
                          </p>
                        </div>
                      )}

                      {selectedExpense.voidRequester && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                          <div>
                            <p className="text-xs sm:text-sm text-gray-600 mb-1">
                              Requested By
                            </p>
                            <p className="text-xs sm:text-sm text-gray-900 truncate">
                              {formatUserName(selectedExpense.voidRequester)}
                            </p>
                          </div>
                          {selectedExpense.voidRequestedAt && (
                            <div>
                              <p className="text-xs sm:text-sm text-gray-600 mb-1">
                                Requested At
                              </p>
                              <p className="text-xs sm:text-sm text-gray-900">
                                {formatDateTime(selectedExpense.voidRequestedAt)}
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {selectedExpense.voidReviewer && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 pt-3 border-t border-red-200">
                          <div>
                            <p className="text-xs sm:text-sm text-gray-600 mb-1">
                              Reviewed By
                            </p>
                            <p className="text-xs sm:text-sm text-gray-900 truncate">
                              {formatUserName(selectedExpense.voidReviewer)}
                            </p>
                          </div>
                          {selectedExpense.voidReviewedAt && (
                            <div>
                              <p className="text-xs sm:text-sm text-gray-600 mb-1">
                                Reviewed At
                              </p>
                              <p className="text-xs sm:text-sm text-gray-900">
                                {formatDateTime(selectedExpense.voidReviewedAt)}
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {selectedExpense.voidStatus === "REJECTED" &&
                        selectedExpense.voidRejectionReason && (
                          <div>
                            <p className="text-xs sm:text-sm text-gray-600 mb-1">
                              Rejection Reason
                            </p>
                            <p className="text-xs sm:text-sm text-gray-900 bg-white p-3 rounded border border-red-100 break-words">
                              {selectedExpense.voidRejectionReason}
                            </p>
                          </div>
                        )}
                    </div>
                  </div>
                )}

              {/* Request Void */}
              {(!selectedExpense.voidStatus ||
                selectedExpense.voidStatus === "NONE") &&
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
                            placeholder="Describe the reason for voiding this expense..."
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
