'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import {
  BarChart,
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
} from 'recharts';
import { Calendar, TrendingUp, Download } from 'lucide-react';
import type { Transaction } from '@/types';
import { useTenant } from '@/contexts/TenantContext';

export default function ReportsPage() {
  const { tenant } = useTenant();
  const primaryColor = tenant?.themeColors?.primary || '#4f46e5';
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<'week' | 'month' | 'year'>('month');

  useEffect(() => {
    loadReportData();
  }, []);

  const loadReportData = async () => {
    try {
      setLoading(true);
      const data = await api.getTransactions();
      setTransactions(data);
    } catch (error) {
      console.error('Failed to load report data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Prepare sales by day data
  const getSalesByDay = () => {
    const salesMap = new Map<string, number>();

    transactions.forEach(t => {
      if (t.paymentStatus === 'COMPLETED') {
        const date = new Date(t.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        salesMap.set(date, (salesMap.get(date) || 0) + t.totalAmount);
      }
    });

    return Array.from(salesMap.entries())
      .map(([date, total]) => ({ date, total }))
      .slice(-30); // Last 30 days
  };

  // Prepare payment method distribution
  const getPaymentMethodData = () => {
    const methodMap = new Map<string, number>();

    transactions.forEach(t => {
      if (t.paymentStatus === 'COMPLETED') {
        methodMap.set(t.paymentMethod, (methodMap.get(t.paymentMethod) || 0) + 1);
      }
    });

    const colors = {
      CASH: '#10b981',
      CARD: '#3b82f6',
      GCASH: '#8b5cf6',
      PAYMAYA: '#f59e0b',
    };

    return Array.from(methodMap.entries()).map(([method, count]) => ({
      name: method,
      value: count,
      color: colors[method as keyof typeof colors] || '#6b7280',
    }));
  };

  // Calculate metrics
  const getMetrics = () => {
    const completedTransactions = transactions.filter(t => t.paymentStatus === 'COMPLETED');
    const totalSales = completedTransactions.reduce((sum, t) => sum + t.totalAmount, 0);
    const totalTransactions = completedTransactions.length;
    const averageOrderValue = totalTransactions > 0 ? totalSales / totalTransactions : 0;

    // Calculate growth (comparing last 7 days vs previous 7 days)
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const lastWeekSales = completedTransactions
      .filter(t => new Date(t.createdAt) > sevenDaysAgo)
      .reduce((sum, t) => sum + t.totalAmount, 0);

    const prevWeekSales = completedTransactions
      .filter(t => {
        const date = new Date(t.createdAt);
        return date > fourteenDaysAgo && date <= sevenDaysAgo;
      })
      .reduce((sum, t) => sum + t.totalAmount, 0);

    const growth = prevWeekSales > 0 ? ((lastWeekSales - prevWeekSales) / prevWeekSales) * 100 : 0;

    return {
      totalSales,
      totalTransactions,
      averageOrderValue,
      growth,
    };
  };

  const exportReport = () => {
    const metrics = getMetrics();
    const salesData = getSalesByDay();
    const paymentData = getPaymentMethodData();

    const report = {
      generatedAt: new Date().toISOString(),
      summary: metrics,
      dailySales: salesData,
      paymentMethods: paymentData,
      transactions: transactions.map(t => ({
        id: t.id,
        date: t.createdAt,
        total: t.totalAmount,
        method: t.paymentMethod,
        status: t.paymentStatus,
      })),
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
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

  const salesByDay = getSalesByDay();
  const paymentMethodData = getPaymentMethodData();
  const metrics = getMetrics();

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Reports & Analytics</h1>
          <p className="text-gray-600 mt-2">Sales performance and business insights</p>
        </div>
        <button
          onClick={exportReport}
          style={{ backgroundColor: primaryColor }}
          className="flex items-center space-x-2 text-black px-4 py-2 rounded-lg transition hover:opacity-90"
        >
          <Download className="w-5 h-5" />
          <span>Export Report</span>
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-6 rounded-xl shadow-lg">
          <p className="text-blue-100 text-sm mb-2">Total Sales</p>
          <p className="text-3xl font-bold">{formatCurrency(metrics.totalSales)}</p>
          <p className="text-sm text-blue-100 mt-2">
            {metrics.growth >= 0 ? '↑' : '↓'} {Math.abs(metrics.growth).toFixed(1)}% from last week
          </p>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 text-white p-6 rounded-xl shadow-lg">
          <p className="text-green-100 text-sm mb-2">Transactions</p>
          <p className="text-3xl font-bold">{metrics.totalTransactions}</p>
          <p className="text-sm text-green-100 mt-2">Completed orders</p>
        </div>

        <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white p-6 rounded-xl shadow-lg">
          <p className="text-purple-100 text-sm mb-2">Avg. Order Value</p>
          <p className="text-3xl font-bold">{formatCurrency(metrics.averageOrderValue)}</p>
          <p className="text-sm text-purple-100 mt-2">Per transaction</p>
        </div>

        <div className="bg-gradient-to-br from-orange-500 to-orange-600 text-white p-6 rounded-xl shadow-lg">
          <p className="text-orange-100 text-sm mb-2">Period</p>
          <p className="text-3xl font-bold">{dateRange}</p>
          <p className="text-sm text-orange-100 mt-2">Current view</p>
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
              <XAxis dataKey="date" stroke="#6b7280" style={{ fontSize: '12px' }} />
              <YAxis stroke="#6b7280" style={{ fontSize: '12px' }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                formatter={(value: number) => formatCurrency(value)}
              />
              <Line type="monotone" dataKey="total" stroke={primaryColor} strokeWidth={3} dot={{ fill: primaryColor, r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Payment Methods */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900">Payment Methods</h2>
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
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
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

      {/* Daily Sales Bar Chart */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h2 className="text-xl font-bold text-gray-900 mb-6">Daily Sales Overview</h2>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={salesByDay}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="date" stroke="#6b7280" style={{ fontSize: '12px' }} />
            <YAxis stroke="#6b7280" style={{ fontSize: '12px' }} />
            <Tooltip
              contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
              formatter={(value: number) => formatCurrency(value)}
            />
            <Legend />
            <Bar dataKey="total" fill={primaryColor} radius={[8, 8, 0, 0]} name="Sales" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
