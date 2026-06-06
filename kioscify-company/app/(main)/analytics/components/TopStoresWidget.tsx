'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { TopStoreItem } from '@/types';

interface Props {
  startDate: string;
  endDate: string;
}

function peso(n: number) {
  return `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function TopStoresWidget({ startDate, endDate }: Props) {
  const [data, setData] = useState<TopStoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .getTopStores(startDate, endDate)
      .then(setData)
      .catch((err: { response?: { data?: { message?: string } } }) =>
        setError(err?.response?.data?.message || 'Failed to load stores'),
      )
      .finally(() => setLoading(false));
  }, [startDate, endDate]);

  return (
    <div className="bg-white rounded-lg border p-6">
      <h2 className="font-semibold text-gray-900 mb-4">Top Stores by Revenue</h2>
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : data.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No data for this period</p>
      ) : (
        <div>
          {data.map((store, i) => (
            <div
              key={store.storeId}
              className="flex items-center justify-between py-2.5 border-b last:border-0"
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-gray-400 w-5">{i + 1}</span>
                <div>
                  <p className="text-sm font-medium text-gray-900">{store.storeName}</p>
                  <p className="text-xs text-gray-400">{store.brandName}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-700">{peso(store.totalRevenue)}</p>
                <p className="text-xs text-gray-400">
                  {store.transactionCount.toLocaleString()} txns
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
