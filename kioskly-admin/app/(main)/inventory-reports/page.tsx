'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { hasPrivilege } from '@/lib/privileges';
import { api } from '@/lib/api';
import { formatUserName } from '@/lib/utils';
import { useTenant } from '@/contexts/TenantContext';
import { FileText, Calendar, User, TrendingUp, AlertTriangle, RefreshCw, Eye, X } from 'lucide-react';
import Link from 'next/link';
import type { UserShiftInventoryReport } from '@/types';

type Tab = 'daily' | 'shift';

export default function InventoryReportsPage() {
  const router = useRouter();
  const { tenant, brand } = useTenant();
  const primaryColor = brand?.themeColors?.primary ?? tenant?.themeColors?.primary ?? '#ea580c';

  useEffect(() => {
    if (!hasPrivilege('inventory', 'read')) router.replace('/dashboard');
  }, [router]);

  const [activeTab, setActiveTab] = useState<Tab>('daily');

  // ─── Daily tab state ────────────────────────────────────────────────────────
  const [reports, setReports] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedReport, setSelectedReport] = useState<any | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

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

  const loadReportDetails = async (id: string) => {
    setLoadingDetails(true);
    try {
      const report = await api.getSubmittedInventoryReportById(id);
      setSelectedReport(report);
    } catch (error) {
      console.error('Failed to load report details:', error);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // ─── Shift tab state ────────────────────────────────────────────────────────
  const [shiftReports, setShiftReports] = useState<UserShiftInventoryReport[]>([]);
  const [shiftLoading, setShiftLoading] = useState(false);
  const [shiftRefreshing, setShiftRefreshing] = useState(false);
  const [selectedShiftReport, setSelectedShiftReport] = useState<UserShiftInventoryReport | null>(null);
  const [loadingShiftDetails, setLoadingShiftDetails] = useState(false);
  const shiftFirstLoad = useRef(false);

  const loadShiftData = async () => {
    setShiftRefreshing(true);
    try {
      const data = await api.getUserShiftInventoryReports();
      setShiftReports(data);
    } catch (error) {
      console.error('Failed to load shift inventory reports:', error);
    } finally {
      setShiftLoading(false);
      setShiftRefreshing(false);
    }
  };

  const loadShiftReportDetails = async (id: string) => {
    setLoadingShiftDetails(true);
    try {
      const report = await api.getUserShiftInventoryReportById(id);
      setSelectedShiftReport(report);
    } catch (error) {
      console.error('Failed to load shift report details:', error);
    } finally {
      setLoadingShiftDetails(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'shift' && !shiftFirstLoad.current) {
      shiftFirstLoad.current = true;
      setShiftLoading(true);
      loadShiftData();
    }
  }, [activeTab]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Manila' });
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Manila' });
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

      {/* Stats Cards — always show (for daily data) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
        <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <div className="bg-blue-500 p-2 sm:p-3 rounded-lg">
              <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
          </div>
          <p className="text-gray-600 text-xs sm:text-sm mb-1">Total Reports</p>
          <p className="text-xl sm:text-2xl font-bold text-gray-900">{stats?.totalReports || 0}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <div className="bg-green-500 p-2 sm:p-3 rounded-lg">
              <Calendar className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
          </div>
          <p className="text-gray-600 text-xs sm:text-sm mb-1">This Month</p>
          <p className="text-xl sm:text-2xl font-bold text-gray-900">{stats?.reportsThisMonth || 0}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <div className="bg-purple-500 p-2 sm:p-3 rounded-lg">
              <User className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
          </div>
          <p className="text-gray-600 text-xs sm:text-sm mb-1">Last Submission</p>
          <p className="text-xs sm:text-sm font-bold text-gray-900">
            {stats?.lastSubmission ? formatDate(stats.lastSubmission.date) : 'No reports yet'}
          </p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-6">
        <Link
          href="/inventory-progression"
          className="flex items-center justify-center space-x-2 px-4 py-2 rounded-lg text-black font-medium transition hover:opacity-90 text-sm sm:text-base"
          style={{ backgroundColor: primaryColor }}
        >
          <TrendingUp className="w-4 h-4" />
          <span>View Progression</span>
        </Link>
        <Link
          href="/inventory-alerts"
          className="flex items-center justify-center space-x-2 px-4 py-2 bg-red-600 rounded-lg text-white font-medium transition hover:bg-red-700 text-sm sm:text-base"
        >
          <AlertTriangle className="w-4 h-4" />
          <span>View Alerts</span>
        </Link>
        <button
          onClick={activeTab === 'daily' ? handleRefresh : () => loadShiftData()}
          disabled={activeTab === 'daily' ? refreshing : shiftRefreshing}
          className="flex items-center justify-center p-2 border border-gray-300 rounded-lg text-gray-700 font-medium transition hover:bg-gray-50 disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 sm:w-5 sm:h-5 ${(activeTab === 'daily' ? refreshing : shiftRefreshing) ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        <button
          onClick={() => setActiveTab('daily')}
          className={`px-4 py-2 text-sm font-medium transition border-b-2 -mb-px ${
            activeTab === 'daily' ? 'text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          style={activeTab === 'daily' ? { borderBottomColor: primaryColor } : {}}
        >
          Daily Inventory Reports (Full Day)
        </button>
        <button
          onClick={() => setActiveTab('shift')}
          className={`px-4 py-2 text-sm font-medium transition border-b-2 -mb-px ${
            activeTab === 'shift' ? 'text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          style={activeTab === 'shift' ? { borderBottomColor: primaryColor } : {}}
        >
          Shift Reports
        </button>
      </div>

      {/* ─── Daily Tab ──────────────────────────────────────────────────────── */}
      {activeTab === 'daily' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-4 sm:p-6">
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-3 sm:mb-4">Submitted Reports</h2>
            {reports.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="w-10 h-10 sm:w-12 sm:h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-sm sm:text-base text-gray-600 mb-2">No inventory reports yet</p>
                <p className="text-xs sm:text-sm text-gray-500">Reports will appear here once submitted from the mobile app</p>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-4 sm:mx-0">
                <div className="min-w-full inline-block align-middle px-4 sm:px-0">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-2 sm:px-4 font-semibold text-gray-700 text-xs sm:text-sm">Report Date</th>
                        <th className="text-left py-3 px-2 sm:px-4 font-semibold text-gray-700 text-xs sm:text-sm">Submitted At</th>
                        <th className="text-left py-3 px-2 sm:px-4 font-semibold text-gray-700 text-xs sm:text-sm">Submitted By</th>
                        <th className="text-left py-3 px-2 sm:px-4 font-semibold text-gray-700 text-xs sm:text-sm">Items</th>
                        <th className="text-center py-3 px-2 sm:px-4 font-semibold text-gray-700 text-xs sm:text-sm">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reports.map((report) => (
                        <tr key={report.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-3 px-2 sm:px-4 font-medium text-gray-900 text-xs sm:text-sm">{formatDate(report.reportDate)}</td>
                          <td className="py-3 px-2 sm:px-4 text-gray-600 text-xs sm:text-sm">{formatDateTime(report.submittedAt)}</td>
                          <td className="py-3 px-2 sm:px-4 text-gray-600 text-xs sm:text-sm">{formatUserName(report.user)}</td>
                          <td className="py-3 px-2 sm:px-4 text-gray-600 text-xs sm:text-sm">{report.inventorySnapshot.totalItems} items</td>
                          <td className="py-3 px-2 sm:px-4 text-center">
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
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Shift Tab ──────────────────────────────────────────────────────── */}
      {activeTab === 'shift' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-4 sm:p-6">
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-3 sm:mb-4">Shift Inventory Reports</h2>
            {shiftLoading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderBottomColor: primaryColor }}></div>
              </div>
            ) : shiftReports.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="w-10 h-10 sm:w-12 sm:h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-sm sm:text-base text-gray-600 mb-2">No shift inventory reports yet</p>
                <p className="text-xs sm:text-sm text-gray-500">Shift reports appear after individual users submit from the app</p>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-4 sm:mx-0">
                <div className="min-w-full inline-block align-middle px-4 sm:px-0">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-2 sm:px-4 font-semibold text-gray-700 text-xs sm:text-sm">Report Date</th>
                        <th className="text-left py-3 px-2 sm:px-4 font-semibold text-gray-700 text-xs sm:text-sm">Submitted At</th>
                        <th className="text-left py-3 px-2 sm:px-4 font-semibold text-gray-700 text-xs sm:text-sm">Submitted By</th>
                        <th className="text-left py-3 px-2 sm:px-4 font-semibold text-gray-700 text-xs sm:text-sm">Items</th>
                        <th className="text-center py-3 px-2 sm:px-4 font-semibold text-gray-700 text-xs sm:text-sm">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shiftReports.map((report) => (
                        <tr key={report.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-3 px-2 sm:px-4 font-medium text-gray-900 text-xs sm:text-sm">
                            <div className="flex items-center gap-1.5">
                              {formatDate(report.reportDate)}
                              <span className="text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">Shift</span>
                            </div>
                          </td>
                          <td className="py-3 px-2 sm:px-4 text-gray-600 text-xs sm:text-sm">{formatDateTime(report.submittedAt)}</td>
                          <td className="py-3 px-2 sm:px-4 text-gray-600 text-xs sm:text-sm">{formatUserName(report.user)}</td>
                          <td className="py-3 px-2 sm:px-4 text-gray-600 text-xs sm:text-sm">{report.inventorySnapshot.totalItems} items</td>
                          <td className="py-3 px-2 sm:px-4 text-center">
                            <button
                              onClick={() => loadShiftReportDetails(report.id)}
                              className="text-black hover:opacity-70 transition"
                              disabled={loadingShiftDetails}
                            >
                              <Eye className="w-5 h-5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Daily Inventory Report Detail Modal — portaled to document.body;
          an in-place fixed overlay nested this deep in the layout tree
          renders short at the top edge (see kioscify-company's
          brands/[brandId]/page.tsx Modal for notes). ───────────────────── */}
      {(selectedReport || loadingDetails) && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-2 sm:p-4 z-50">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 sm:p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg sm:text-xl font-bold text-gray-900">Inventory Report Details</h2>
                <button onClick={() => setSelectedReport(null)} className="text-gray-500 hover:text-gray-700 transition">
                  <X className="w-5 h-5 sm:w-6 sm:h-6" />
                </button>
              </div>
            </div>
            {loadingDetails && !selectedReport ? (
              <div className="flex items-center justify-center py-16">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderBottomColor: primaryColor }}></div>
              </div>
            ) : selectedReport && (
              <div className="p-4 sm:p-6 space-y-6">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Report Date</p>
                    <p className="text-sm font-semibold text-gray-900">{formatDate(selectedReport.reportDate)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Submitted At</p>
                    <p className="text-sm font-semibold text-gray-900">{formatDateTime(selectedReport.submittedAt)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Submitted By</p>
                    <p className="text-sm font-semibold text-gray-900">{formatUserName(selectedReport.user)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Total Items</p>
                    <p className="text-sm font-semibold text-gray-900">{selectedReport.inventorySnapshot.totalItems} items</p>
                  </div>
                </div>
                {selectedReport.notes && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-xs text-blue-600 uppercase tracking-wider font-semibold mb-1">Notes</p>
                    <p className="text-sm text-gray-800">{selectedReport.notes}</p>
                  </div>
                )}
                <div>
                  <h3 className="text-base font-bold text-gray-900 mb-3">Inventory Items</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 bg-gray-50">
                          <th className="text-left py-2 px-3 font-semibold text-gray-600 text-xs uppercase">Item Name</th>
                          <th className="text-left py-2 px-3 font-semibold text-gray-600 text-xs uppercase">Category</th>
                          <th className="text-left py-2 px-3 font-semibold text-gray-600 text-xs uppercase">Unit</th>
                          <th className="text-right py-2 px-3 font-semibold text-gray-600 text-xs uppercase">Prev Qty</th>
                          <th className="text-right py-2 px-3 font-semibold text-gray-600 text-xs uppercase">Quantity</th>
                          <th className="text-right py-2 px-3 font-semibold text-gray-600 text-xs uppercase">Min Stock</th>
                          <th className="text-left py-2 px-3 font-semibold text-gray-600 text-xs uppercase">Record Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedReport.inventorySnapshot.items.map((item: any, idx: number) => (
                          <>
                            <tr key={item.inventoryItemId ?? idx} className="border-b border-gray-100 hover:bg-gray-50">
                              <td className="py-2 px-3 font-medium text-gray-900">{item.itemName}</td>
                              <td className="py-2 px-3 text-gray-600">{item.category}</td>
                              <td className="py-2 px-3 text-gray-600">{item.unit}</td>
                              <td className="py-2 px-3 text-right text-gray-400">{item.previousQuantity != null ? item.previousQuantity : '—'}</td>
                              <td className="py-2 px-3 text-right text-gray-900 font-medium">{item.quantity}</td>
                              <td className="py-2 px-3 text-right text-gray-500">{item.minStockLevel != null ? item.minStockLevel : '—'}</td>
                              <td className="py-2 px-3 text-gray-600">{formatDate(item.recordDate)}</td>
                            </tr>
                            {item.expirationBatches && item.expirationBatches.length > 0 && (
                              <tr key={`${item.inventoryItemId ?? idx}-batches`} className="bg-amber-50">
                                <td colSpan={7} className="py-2 px-6">
                                  <p className="text-xs font-semibold text-amber-700 mb-1">Expiration Batches:</p>
                                  <div className="flex flex-wrap gap-2">
                                    {item.expirationBatches.map((batch: any, bi: number) => (
                                      <span key={bi} className="text-xs bg-white border border-amber-200 rounded px-2 py-1 text-amber-900">
                                        {batch.quantity} {item.unit}{batch.expirationDate ? ` — expires ${formatDate(batch.expirationDate)}` : ' — no expiry'}
                                      </span>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}

      {/* ─── Shift Inventory Report Detail Modal — portaled to document.body ── */}
      {(selectedShiftReport || loadingShiftDetails) && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-2 sm:p-4 z-50">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 sm:p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-gray-900">Shift Inventory Report</h2>
                  <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">Shift</span>
                </div>
                <button onClick={() => setSelectedShiftReport(null)} className="text-gray-500 hover:text-gray-700 transition">
                  <X className="w-5 h-5 sm:w-6 sm:h-6" />
                </button>
              </div>
            </div>
            {loadingShiftDetails && !selectedShiftReport ? (
              <div className="flex items-center justify-center py-16">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderBottomColor: primaryColor }}></div>
              </div>
            ) : selectedShiftReport && (
              <div className="p-4 sm:p-6 space-y-6">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Report Date</p>
                    <p className="text-sm font-semibold text-gray-900">{formatDate(selectedShiftReport.reportDate)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Submitted At</p>
                    <p className="text-sm font-semibold text-gray-900">{formatDateTime(selectedShiftReport.submittedAt)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Submitted By</p>
                    <p className="text-sm font-semibold text-gray-900">{formatUserName(selectedShiftReport.user)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Total Items</p>
                    <p className="text-sm font-semibold text-gray-900">{selectedShiftReport.inventorySnapshot.totalItems} items</p>
                  </div>
                </div>
                {selectedShiftReport.notes && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-xs text-blue-600 uppercase tracking-wider font-semibold mb-1">Notes</p>
                    <p className="text-sm text-gray-800">{selectedShiftReport.notes}</p>
                  </div>
                )}
                <div>
                  <h3 className="text-base font-bold text-gray-900 mb-3">Inventory Items</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 bg-gray-50">
                          <th className="text-left py-2 px-3 font-semibold text-gray-600 text-xs uppercase">Item Name</th>
                          <th className="text-left py-2 px-3 font-semibold text-gray-600 text-xs uppercase">Category</th>
                          <th className="text-left py-2 px-3 font-semibold text-gray-600 text-xs uppercase">Unit</th>
                          <th className="text-right py-2 px-3 font-semibold text-gray-600 text-xs uppercase">Prev Qty</th>
                          <th className="text-right py-2 px-3 font-semibold text-gray-600 text-xs uppercase">Quantity</th>
                          <th className="text-right py-2 px-3 font-semibold text-gray-600 text-xs uppercase">Min Stock</th>
                          <th className="text-left py-2 px-3 font-semibold text-gray-600 text-xs uppercase">Record Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedShiftReport.inventorySnapshot.items.map((item: any, idx: number) => (
                          <>
                            <tr key={item.inventoryItemId ?? idx} className="border-b border-gray-100 hover:bg-gray-50">
                              <td className="py-2 px-3 font-medium text-gray-900">{item.itemName}</td>
                              <td className="py-2 px-3 text-gray-600">{item.category}</td>
                              <td className="py-2 px-3 text-gray-600">{item.unit}</td>
                              <td className="py-2 px-3 text-right text-gray-400">{item.previousQuantity != null ? item.previousQuantity : '—'}</td>
                              <td className="py-2 px-3 text-right text-gray-900 font-medium">{item.quantity}</td>
                              <td className="py-2 px-3 text-right text-gray-500">{item.minStockLevel != null ? item.minStockLevel : '—'}</td>
                              <td className="py-2 px-3 text-gray-600">{formatDate(item.recordDate)}</td>
                            </tr>
                            {item.expirationBatches && item.expirationBatches.length > 0 && (
                              <tr key={`${item.inventoryItemId ?? idx}-batches`} className="bg-amber-50">
                                <td colSpan={7} className="py-2 px-6">
                                  <p className="text-xs font-semibold text-amber-700 mb-1">Expiration Batches:</p>
                                  <div className="flex flex-wrap gap-2">
                                    {item.expirationBatches.map((batch: any, bi: number) => (
                                      <span key={bi} className="text-xs bg-white border border-amber-200 rounded px-2 py-1 text-amber-900">
                                        {batch.quantity} {item.unit}{batch.expirationDate ? ` — expires ${formatDate(batch.expirationDate)}` : ' — no expiry'}
                                      </span>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
