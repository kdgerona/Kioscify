'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { PlatformStats } from '@/types';
import { Building2, BookOpen, Store, Activity, ArrowRight } from 'lucide-react';

export default function DashboardPage() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getPlatformStats()
      .then(setStats)
      .catch(() => setError('Failed to load platform stats'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Platform Overview</h1>
        <p className="text-sm text-gray-500 mt-1">Global stats across all companies</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg text-sm">
          {error}
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Companies"
            value={stats.totalCompanies}
            icon={<Building2 className="w-5 h-5 text-indigo-600" />}
            bg="bg-indigo-50"
          />
          <StatCard
            label="Brands"
            value={stats.totalBrands}
            icon={<BookOpen className="w-5 h-5 text-blue-600" />}
            bg="bg-blue-50"
          />
          <StatCard
            label="Total Stores"
            value={stats.totalStores}
            icon={<Store className="w-5 h-5 text-green-600" />}
            bg="bg-green-50"
          />
          <StatCard
            label="Active Stores (30d)"
            value={stats.monthlyActiveStores}
            icon={<Activity className="w-5 h-5 text-orange-600" />}
            bg="bg-orange-50"
          />
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <QuickAction
          title="Manage Companies"
          description="View, create, and configure companies on the platform"
          href="/companies"
        />
        <QuickAction
          title="Onboard a Company"
          description="Create a new company account and set up their admin user"
          href="/companies?action=create"
        />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  bg,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  bg: string;
}) {
  return (
    <div className="bg-white rounded-lg border p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-500">{label}</span>
        <div className={`p-2 ${bg} rounded-lg`}>{icon}</div>
      </div>
      <p className="text-3xl font-bold text-gray-900">{value.toLocaleString()}</p>
    </div>
  );
}

function QuickAction({
  title,
  description,
  href,
}: {
  title: string;
  description: string;
  href: string;
}) {
  return (
    <a
      href={href}
      className="bg-white rounded-lg border p-5 hover:border-indigo-300 hover:shadow-sm transition-all group"
    >
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900 text-sm">{title}</h3>
          <p className="text-xs text-gray-500 mt-1">{description}</p>
        </div>
        <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-indigo-600 transition-colors" />
      </div>
    </a>
  );
}
