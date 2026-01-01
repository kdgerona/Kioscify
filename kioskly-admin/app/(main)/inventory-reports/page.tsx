'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useTenant } from '@/contexts/TenantContext';
import { FileText, Calendar, User, TrendingUp, AlertTriangle, RefreshCw } from 'lucide-react';
import Link from 'next/link';

export default function InventoryReportsPage() {
  const { tenant } = useTenant();
  const primaryColor = tenant?.themeColors?.primary || '#4f46e5';

  const [reports, setReports] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [reportsData, statsData] = await Promise.all([
        api.getSubmittedInventoryReports(),
        api.getInventoryReportStats(),
      ]);
      setReports(reportsData);
      setStats(statsData);
    } catch (error) {
      console.error('Failed to load inventory reports:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-gray-200 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Inventory Reports</h1>
        <p className="text-sm sm:text-base text-gray-600 mt-2">
          View submitted inventory reports and track stock progression over time
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6 sm:mb-8">
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-blue-500 p-3 rounded-lg">
              <FileText className="w-6 h-6 text-white" />
            </div>
          </div>
          <p className="text-gray-600 text-sm mb-1">Total Reports</p>
          <p className="text-2xl font-bold text-gray-900">{stats?.totalReports || 0}</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-green-500 p-3 rounded-lg">
              <Calendar className="w-6 h-6 text-white" />
            </div>
          </div>
          <p className="text-gray-600 text-sm mb-1">This Month</p>
          <p className="text-2xl font-bold text-gray-900">{stats?.reportsThisMonth || 0}</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-purple-500 p-3 rounded-lg">
              <User className="w-6 h-6 text-white" />
            </div>
          </div>
          <p className="text-gray-600 text-sm mb-1">Last Submission</p>
          <p className="text-sm font-bold text-gray-900">
            {stats?.lastSubmission ? formatDate(stats.lastSubmission.date) : 'No reports yet'}
          </p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex space-x-4 mb-6">
        <Link
          href="/inventory-progression"
          className="flex items-center space-x-2 px-4 py-2 rounded-lg text-black font-medium transition hover:opacity-90"
          style={{ backgroundColor: primaryColor }}
        >
          <TrendingUp className="w-4 h-4" />
          <span>View Progression</span>
        </Link>
        <Link
          href="/inventory-alerts"
          className="flex items-center space-x-2 px-4 py-2 bg-red-600 rounded-lg text-white font-medium transition hover:bg-red-700"
        >
          <AlertTriangle className="w-4 h-4" />
          <span>View Alerts</span>
        </Link>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center justify-center p-2 border border-gray-300 rounded-lg text-gray-700 font-medium transition hover:bg-gray-50 disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Reports List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Submitted Reports</h2>

          {reports.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 mb-2">No inventory reports yet</p>
              <p className="text-sm text-gray-500">
                Reports will appear here once submitted from the mobile app
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Report Date</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Submitted At</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Submitted By</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Items</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((report) => (
                    <tr key={report.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4 font-medium text-gray-900">
                        {formatDate(report.reportDate)}
                      </td>
                      <td className="py-3 px-4 text-gray-600">
                        {formatDateTime(report.submittedAt)}
                      </td>
                      <td className="py-3 px-4 text-gray-600">
                        {report.user.username}
                      </td>
                      <td className="py-3 px-4 text-gray-600">
                        {report.inventorySnapshot.totalItems} items
                      </td>
                      <td className="py-3 px-4 text-gray-600">
                        {report.notes ? (
                          <span className="text-sm bg-blue-100 text-blue-800 px-2 py-1 rounded">
                            Has notes
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
