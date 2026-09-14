'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Download, Mail } from 'lucide-react';
import { api } from '@/lib/api';
import { getErrorMessage } from '@/lib/utils';
import type { AccountStatusResponse } from '@/types';

function daysRemaining(gracePeriodEndsAt: string | null): number | null {
  if (!gracePeriodEndsAt) return null;
  const diffMs = new Date(gracePeriodEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
}

export default function AccountStatusPage() {
  const [status, setStatus] = useState<AccountStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [isStoreAdmin, setIsStoreAdmin] = useState(false);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    const user = api.getCurrentUser();
    setIsStoreAdmin(user?.role === 'STORE_ADMIN' || user?.role === 'ADMIN');
    setTenantId(user?.tenantId ?? null);

    api
      .getAccountStatus()
      .then(setStatus)
      .catch(() => {
        // A 401 here is already handled by the axios interceptor
        // (force-logout to /login); nothing else to do on failure.
      })
      .finally(() => setLoading(false));
  }, []);

  const handleExport = async () => {
    if (!tenantId) return;
    setExportError(null);
    setExporting(true);
    try {
      await api.exportStoreData(tenantId);
    } catch (err) {
      setExportError(getErrorMessage(err, 'Failed to export store data'));
    } finally {
      setExporting(false);
    }
  };

  const days = daysRemaining(status?.gracePeriodEndsAt ?? null);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
        <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-5">
          <AlertTriangle className="w-7 h-7 text-amber-500" />
        </div>

        <h1 className="text-xl font-semibold text-gray-900 mb-2">
          Your subscription has ended
        </h1>

        {loading ? (
          <p className="text-gray-500 text-sm">Loading account status...</p>
        ) : days !== null ? (
          <p className="text-gray-600 text-sm mb-6">
            {status?.scopeName ? `${status.scopeName} has` : 'Your account has'}{' '}
            read-only access for{' '}
            <span className="font-semibold text-gray-900">
              {days} day{days === 1 ? '' : 's'}
            </span>{' '}
            remaining before it is fully deactivated.
          </p>
        ) : (
          <p className="text-gray-600 text-sm mb-6">
            Your account currently has limited, read-only access.
          </p>
        )}

        {isStoreAdmin && (
          <div className="mb-6">
            <button
              onClick={handleExport}
              disabled={exporting || !tenantId}
              className="w-full inline-flex items-center justify-center gap-2 font-semibold py-3 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed text-sm bg-gray-900 text-white hover:bg-gray-800"
            >
              <Download className="w-4 h-4" />
              {exporting ? 'Preparing export...' : 'Export your data'}
            </button>
            {exportError && (
              <p className="mt-2 text-xs text-red-600">{exportError}</p>
            )}
          </div>
        )}

        <div className="flex items-center justify-center gap-2 text-sm text-gray-500 border-t border-gray-100 pt-5">
          <Mail className="w-4 h-4" />
          <span>
            Email{' '}
            <a href="mailto:support@kioscify.com" className="font-medium text-gray-700 underline">
              support@kioscify.com
            </a>{' '}
            to resubscribe.
          </span>
        </div>
      </div>
    </div>
  );
}
