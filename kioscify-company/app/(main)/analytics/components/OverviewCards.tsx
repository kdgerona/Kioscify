'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { AnalyticsOverview } from '@/types';
import { BookOpen, Store, Activity } from 'lucide-react';

interface Props {
  startDate: string;
  endDate: string;
}

export function OverviewCards({ startDate, endDate }: Props) {
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .getAnalyticsOverview(startDate, endDate)
      .then(setData)
      .catch((err: { response?: { data?: { message?: string } } }) =>
        setError(err?.response?.data?.message || 'Failed to load overview'),
      )
      .finally(() => setLoading(false));
  }, [startDate, endDate]);

  const cards = [
    {
      label: 'Total Brands',
      value: data?.totalBrands ?? 0,
      icon: BookOpen,
      bgClass: 'bg-indigo-50',
      iconClass: 'text-indigo-600',
    },
    {
      label: 'Total Stores',
      value: data?.totalStores ?? 0,
      icon: Store,
      bgClass: 'bg-green-50',
      iconClass: 'text-green-600',
    },
    {
      label: 'Active Stores',
      value: data?.activeStores ?? 0,
      icon: Activity,
      bgClass: 'bg-blue-50',
      iconClass: 'text-blue-600',
    },
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[0, 1, 2].map(i => (
          <div key={i} className="bg-white rounded-lg border p-5 h-28 animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-sm">
        {error}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {cards.map(({ label, value, icon: Icon, bgClass, iconClass }) => (
        <div key={label} className="bg-white rounded-lg border p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-500">{label}</span>
            <div className={`p-2 ${bgClass} rounded-lg`}>
              <Icon className={`w-4 h-4 ${iconClass}`} />
            </div>
          </div>
          <p className="text-3xl font-bold text-gray-900">{value}</p>
        </div>
      ))}
    </div>
  );
}
