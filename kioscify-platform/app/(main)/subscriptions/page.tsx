'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { SubscriptionListItem, SubscriptionStats, Company } from '@/types';
import { CreditCard, CheckCircle2, XCircle, Clock, LucideIcon } from 'lucide-react';

type StatusFilter = '' | 'activated' | 'pending';
type PaidFilter = '' | 'paid' | 'overdue';

export default function SubscriptionsPage() {
  const [stats, setStats] = useState<SubscriptionStats | null>(null);
  const [rows, setRows] = useState<SubscriptionListItem[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [status, setStatus] = useState<StatusFilter>('');
  const [paid, setPaid] = useState<PaidFilter>('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.getSubscriptions({
        companyId: companyId || undefined,
        status: status || undefined,
        paid: paid || undefined,
        page,
        limit: 20,
      });
      setRows(result.data);
      setTotalPages(result.pagination.totalPages);
    } finally {
      setLoading(false);
    }
  }, [companyId, status, paid, page]);

  useEffect(() => {
    api.getSubscriptionStats().then(setStats);
    api.getCompanies().then(setCompanies);
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Subscriptions</h1>
        <p className="text-sm text-gray-500">Track store activation and monthly payment status</p>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard label="Total Stores" value={stats.totalStores} icon={CreditCard} tone="indigo" />
          <StatCard label="Activated" value={stats.activated} icon={CheckCircle2} tone="green" />
          <StatCard label="Pending Activation" value={stats.pendingActivation} icon={Clock} tone="gray" />
          <StatCard label="Paid This Month" value={stats.paidThisMonth} icon={CheckCircle2} tone="green" />
          <StatCard label="Overdue" value={stats.overdue} icon={XCircle} tone="red" />
        </div>
      )}

      <div className="flex flex-wrap gap-3">
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
          onChange={e => { setStatus(e.target.value as StatusFilter); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
        >
          <option value="">All Statuses</option>
          <option value="activated">Activated</option>
          <option value="pending">Pending Activation</option>
        </select>
        <select
          value={paid}
          onChange={e => { setPaid(e.target.value as PaidFilter); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
        >
          <option value="">All Payment Status</option>
          <option value="paid">Paid This Month</option>
          <option value="overdue">Overdue</option>
        </select>
      </div>

      <div className="bg-white rounded-lg border divide-y">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">No stores match these filters</div>
        ) : (
          rows.map(row => (
            <Link
              key={row.tenantId}
              href={`/subscriptions/${row.tenantId}`}
              className="px-5 py-4 flex items-center justify-between gap-4 hover:bg-gray-50 transition-colors"
            >
              <div className="min-w-0">
                <p className="font-medium text-gray-900 truncate">{row.storeName}</p>
                <p className="text-xs text-gray-400">{row.company?.name} · {row.brand?.name}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-gray-500">
                  {row.activatedAt ? `Activated ${new Date(row.activatedAt).toLocaleDateString()}` : 'Pending Activation'}
                </span>
                {row.activatedAt && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    row.paidThisMonth ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
                  }`}>
                    {row.paidThisMonth ? 'Paid' : 'Overdue'}
                  </span>
                )}
              </div>
            </Link>
          ))
        )}
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

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  tone: 'indigo' | 'green' | 'gray' | 'red';
}) {
  const toneClasses: Record<string, string> = {
    indigo: 'text-indigo-600 bg-indigo-50',
    green: 'text-green-600 bg-green-50',
    gray: 'text-gray-500 bg-gray-100',
    red: 'text-red-600 bg-red-50',
  };
  return (
    <div className="bg-white rounded-lg border p-4">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${toneClasses[tone]}`}>
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}
