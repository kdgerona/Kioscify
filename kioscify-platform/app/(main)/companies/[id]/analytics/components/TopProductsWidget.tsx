'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { TopProductItem, Brand } from '@/types';

interface Props {
  companyId: string;
  startDate: string;
  endDate: string;
}

export function TopProductsWidget({ companyId, startDate, endDate }: Props) {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrandId, setSelectedBrandId] = useState<string>('');
  const [data, setData] = useState<TopProductItem[]>([]);
  const [loadingBrands, setLoadingBrands] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getBrandsByCompany(companyId)
      .then(b => {
        setBrands(b);
        if (b.length > 0) setSelectedBrandId(b[0].id);
      })
      .catch(() => setError('Failed to load brands'))
      .finally(() => setLoadingBrands(false));
  }, [companyId]);

  useEffect(() => {
    if (!selectedBrandId) return;
    setLoading(true);
    setError(null);
    api
      .getTopProducts(companyId, selectedBrandId, startDate, endDate)
      .then(setData)
      .catch((err: { response?: { data?: { message?: string } } }) =>
        setError(err?.response?.data?.message || 'Failed to load products'),
      )
      .finally(() => setLoading(false));
  }, [companyId, selectedBrandId, startDate, endDate]);

  return (
    <div className="bg-white rounded-lg border p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="font-semibold text-gray-900">Top Products</h2>
          <p className="text-xs text-gray-400 mt-0.5">Best-selling products by units sold for the selected brand</p>
        </div>
        {!loadingBrands && brands.length > 0 && (
          <select
            value={selectedBrandId}
            onChange={(e) => setSelectedBrandId(e.target.value)}
            className="w-36 h-8 text-xs border border-gray-300 rounded-md px-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {brands.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        )}
      </div>
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : data.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No data for this period</p>
      ) : (
        <div>
          {data.map((product, i) => (
            <div key={product.productId} className="flex items-center justify-between py-2.5 border-b last:border-0">
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-gray-400 w-5">{i + 1}</span>
                <p className="text-sm font-medium text-gray-900">{product.productName}</p>
              </div>
              <span className="text-sm font-semibold text-gray-500">
                {product.unitsSold.toLocaleString()} sold
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
