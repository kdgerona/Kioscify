'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import type { SessionListItem, SessionStatus, Company } from '@/types';
import { Clock } from 'lucide-react';

const ROLE_BADGE: Record<string, string> = {
  COMPANY_ADMIN: 'bg-purple-50 text-purple-700',
  STORE_ADMIN: 'bg-indigo-50 text-indigo-700',
  CASHIER: 'bg-gray-100 text-gray-600',
};

const STATUS_BADGE: Record<SessionStatus, string> = {
  ACTIVE: 'bg-green-50 text-green-700',
  ENDED: 'bg-gray-100 text-gray-500',
  EXPIRED: 'bg-amber-50 text-amber-700',
};

function describeDevice(userAgent: string | null): string {
  if (!userAgent) return '—';
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /Chrome\//.test(userAgent)
      ? 'Chrome'
      : /Safari\//.test(userAgent)
        ? 'Safari'
        : /Firefox\//.test(userAgent)
          ? 'Firefox'
          : 'Unknown browser';
  const os = /Android/.test(userAgent)
    ? 'Android'
    : /iPhone|iPad/.test(userAgent)
      ? 'iOS'
      : /Mac OS X/.test(userAgent)
        ? 'macOS'
        : /Windows/.test(userAgent)
          ? 'Windows'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : 'Unknown OS';
  return `${browser} on ${os}`;
}

export default function SessionsPage() {
  const [rows, setRows] = useState<SessionListItem[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [status, setStatus] = useState<SessionStatus | ''>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.getSessions({
        companyId: companyId || undefined,
        status: status || undefined,
        search: search || undefined,
        page,
        limit: 20,
      });
      setRows(result.data);
      setTotalPages(result.pagination.totalPages);
    } finally {
      setLoading(false);
    }
  }, [companyId, status, search, page]);

  useEffect(() => {
    api.getCompanies().then(setCompanies);
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Sessions</h1>
        <p className="text-sm text-gray-500">Login history for Company Admins and Store users</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search name, username, or email"
          className="px-3 py-2 border border-gray-300 rounded-md text-sm min-w-[220px]"
        />
        <select
          value={companyId}
          onChange={e => { setCompanyId(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
        >
          <option value="">All Companies</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select
          value={status}
          onChange={e => { setStatus(e.target.value as SessionStatus | ''); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
        >
          <option value="">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="ENDED">Ended</option>
          <option value="EXPIRED">Expired</option>
        </select>
      </div>

      <div className="bg-white rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-5 py-3 font-medium">User</th>
              <th className="px-5 py-3 font-medium">Company</th>
              <th className="px-5 py-3 font-medium">Login Time</th>
              <th className="px-5 py-3 font-medium">Logout Time</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">IP Address</th>
              <th className="px-5 py-3 font-medium">Device</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr>
                <td colSpan={7} className="py-12">
                  <div className="flex justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
                  </div>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-16 text-center text-gray-400">
                  No sessions match these filters
                </td>
              </tr>
            ) : (
              rows.map(row => (
                <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-4">
                    <p className="font-medium text-gray-900">{row.user.firstName} {row.user.lastName}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-400">{row.user.username}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${ROLE_BADGE[row.user.role] ?? 'bg-gray-100 text-gray-600'}`}>
                        {row.user.role.replace('_', ' ')}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-gray-600">{row.company?.name ?? '—'}</td>
                  <td className="px-5 py-4 text-gray-600 whitespace-nowrap">
                    <Clock className="w-3.5 h-3.5 inline mr-1.5 text-gray-400" />
                    {new Date(row.loginAt).toLocaleString()}
                  </td>
                  <td className="px-5 py-4 text-gray-600 whitespace-nowrap">
                    {row.loggedOutAt ? new Date(row.loggedOutAt).toLocaleString() : '—'}
                  </td>
                  <td className="px-5 py-4">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[row.status]}`}>
                      {row.status.charAt(0) + row.status.slice(1).toLowerCase()}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-gray-500 font-mono text-xs">{row.ipAddress ?? '—'}</td>
                  <td className="px-5 py-4 text-gray-500 text-xs">{describeDevice(row.userAgent)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md disabled:opacity-50"
          >
            Previous
          </button>
          <span className="px-3 py-1.5 text-sm text-gray-500">Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
