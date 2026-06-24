'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { TopStoreItem, Brand } from '@/types';

interface Props {
  companyId: string;
  startDate: string;
  endDate: string;
}

export function TopStoresWidget({ companyId, startDate, endDate }: Props) {
  const [allData, setAllData] = useState<TopStoreItem[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrandId, setSelectedBrandId] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getBrandsByCompany(companyId).then(setBrands).catch(() => {});
  }, [companyId]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .getTopStores(companyId, startDate, endDate)
      .then(setAllData)
      .catch((err: { response?: { data?: { message?: string } } }) =>
        setError(err?.response?.data?.message || 'Failed to load stores'),
      )
      .finally(() => setLoading(false));
  }, [companyId, startDate, endDate]);

  const data =
    selectedBrandId === 'all'
      ? allData
      : allData.filter(s => s.brandId === selectedBrandId);

  return (
    <div className="bg-white rounded-lg border p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="font-semibold text-gray-900">Top Stores</h2>
          <p className="text-xs text-gray-400 mt-0.5">Stores ranked by transaction volume in the selected period</p>
        </div>
        {brands.length > 0 && (
          <select
            value={selectedBrandId}
            onChange={(e) => setSelectedBrandId(e.target.value)}
            className="w-36 h-8 text-xs border border-gray-300 rounded-md px-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All Brands</option>
            {brands.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        )}
      </div>
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
            <div key={store.storeId} className="flex items-center justify-between py-2.5 border-b last:border-0">
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-gray-400 w-5">{i + 1}</span>
                <div>
                  <p className="text-sm font-medium text-gray-900">{store.storeName}</p>
                  <p className="text-xs text-gray-400">{store.brandName}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
