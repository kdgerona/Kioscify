'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { formatCurrency, formatDateTime, getPaymentMethodLabel, getPaymentStatusLabel, getPaymentStatusColor } from '@/lib/utils';
import { Receipt, Search, Filter, Download, Eye, X, RefreshCw } from 'lucide-react';
import type { Transaction } from '@/types';
import { useTenant } from '@/contexts/TenantContext';
import { DatePicker } from '@/components/ui/date-picker';

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
  const { tenant } = useTenant();
  const primaryColor = tenant?.themeColors?.primary || '#4f46e5';
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [isFiltering, setIsFiltering] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterMethod, setFilterMethod] = useState<string>('ALL');
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);

  // Debounce search term to avoid too many API calls
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  const clearDates = () => {
    setStartDate(undefined);
    setEndDate(undefined);
  };

  const loadTransactions = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) {
        setInitialLoading(true);
      } else {
        setIsFiltering(true);
      }

      const params: {
        transactionId?: string;
        paymentStatus?: string;
        paymentMethod?: string;
        startDate?: string;
        endDate?: string;
      } = {};

      if (debouncedSearchTerm) {
        params.transactionId = debouncedSearchTerm;
      }
      if (filterStatus !== 'ALL') {
        params.paymentStatus = filterStatus;
      }
      if (filterMethod !== 'ALL') {
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
      console.error('Failed to load transactions:', error);
    } finally {
      setInitialLoading(false);
      setIsFiltering(false);
    }
  }, [debouncedSearchTerm, filterStatus, filterMethod, startDate, endDate]);

  // Initial load
  useEffect(() => {
    loadTransactions(true);
  }, [loadTransactions]);

  // Filter changes - don't show full skeleton
  useEffect(() => {
    if (!initialLoading) {
      loadTransactions(false);
    }
  }, [debouncedSearchTerm, filterStatus, filterMethod, startDate, endDate, initialLoading, loadTransactions]);

  const exportToCSV = () => {
    const headers = ['Transaction ID', 'Date', 'User', 'Total', 'Payment Method', 'Status'];
    const rows = transactions.map(t => [
      t.transactionId,
      formatDateTime(t.createdAt),
      t.user?.email || t.user?.username || 'N/A',
      t.total,
      t.paymentMethod,
      t.paymentStatus || 'COMPLETED',
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  if (initialLoading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-16 bg-gray-200 rounded"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Transactions</h1>
        <p className="text-gray-600 mt-2">View and manage all sales transactions</p>
      </div>

      {/* Filters and Search */}
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
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 sm:w-5 sm:h-5" />
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full pl-9 sm:pl-10 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none appearance-none bg-white text-gray-900 cursor-pointer text-sm sm:text-base"
              >
                <option value="ALL">All Status</option>
                <option value="COMPLETED">Completed</option>
                <option value="PENDING">Pending</option>
                <option value="FAILED">Failed</option>
              </select>
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>

            {/* Payment Method Filter */}
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 sm:w-5 sm:h-5" />
              <select
                value={filterMethod}
                onChange={(e) => setFilterMethod(e.target.value)}
                className="w-full pl-9 sm:pl-10 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none appearance-none bg-white text-gray-900 cursor-pointer text-sm sm:text-base"
              >
                <option value="ALL">All Methods</option>
                <option value="CASH">Cash</option>
                <option value="CARD">Card</option>
                <option value="GCASH">GCash</option>
                <option value="PAYMAYA">PayMaya</option>
                <option value="ONLINE">Online</option>
                <option value="FOODPANDA">FoodPanda</option>
              </select>
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
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

      {/* Transactions Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden relative">
        {isFiltering && (
          <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-10">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
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
                  <tr key={transaction.id} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <Receipt className="w-4 h-4 text-gray-400" />
                        <span className="text-sm font-mono text-gray-900">
                          {transaction.transactionId}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {formatDateTime(transaction.createdAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {transaction.user?.email || transaction.user?.username || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-bold text-gray-900">
                        {formatCurrency(transaction.total)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {getPaymentMethodLabel(transaction.paymentMethod)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getPaymentStatusColor(transaction.paymentStatus || 'COMPLETED')}`}>
                        {getPaymentStatusLabel(transaction.paymentStatus || 'COMPLETED')}
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

      {/* Transaction Details Modal */}
      {selectedTransaction && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900">Transaction Details</h2>
                <button
                  onClick={() => setSelectedTransaction(null)}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Transaction ID</p>
                  <p className="font-mono text-sm text-gray-900">{selectedTransaction.transactionId}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Date & Time</p>
                  <p className="text-sm text-gray-900">{formatDateTime(selectedTransaction.createdAt)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">User</p>
                  <p className="text-sm text-gray-900">{selectedTransaction.user?.email || selectedTransaction.user?.username || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Payment Method</p>
                  <p className="text-sm text-gray-900">{getPaymentMethodLabel(selectedTransaction.paymentMethod)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Status</p>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getPaymentStatusColor(selectedTransaction.paymentStatus || 'COMPLETED')}`}>
                    {getPaymentStatusLabel(selectedTransaction.paymentStatus || 'COMPLETED')}
                  </span>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Total Amount</p>
                  <p className="text-xl font-bold text-gray-900">
                    {formatCurrency(selectedTransaction.total)}
                  </p>
                </div>
              </div>

              {selectedTransaction.items && selectedTransaction.items.length > 0 && (
                <div>
                  <h3 className="font-bold text-gray-900 mb-3">Order Items</h3>
                  <div className="space-y-2">
                    {selectedTransaction.items.map((item) => (
                      <div key={item.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-medium text-gray-900">{item.product?.name || 'Product'}</p>
                          <p className="text-sm text-gray-600">
                            Qty: {item.quantity}
                            {item.size && ` (${item.size.name})`}
                            {item.addons && item.addons.length > 0 && ` + ${item.addons.length} addon(s)`}
                          </p>
                        </div>
                        <p className="font-bold text-gray-900">{formatCurrency(item.subtotal)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
