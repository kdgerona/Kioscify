'use client';
import { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { api } from '@/lib/api';
import type { TopBrandItem } from '@/types';

interface Props {
  startDate: string;
  endDate: string;
}

function peso(n: number) {
  return `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function TopBrandsWidget({ startDate, endDate }: Props) {
  const [data, setData] = useState<TopBrandItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .getTopBrands(startDate, endDate)
      .then(setData)
      .catch((err: { response?: { data?: { message?: string } } }) =>
        setError(err?.response?.data?.message || 'Failed to load brands'),
      )
      .finally(() => setLoading(false));
  }, [startDate, endDate]);

  return (
    <div className="bg-white rounded-lg border p-6">
      <h2 className="font-semibold text-gray-900 mb-4">Top Brands by Revenue</h2>
      {loading ? (
        <div className="h-48 bg-gray-100 rounded animate-pulse" />
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : data.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No data for this period</p>
      ) : (
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ left: 0, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  tickFormatter={v => `₱${(v as number).toLocaleString()}`}
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  type="category"
                  dataKey="brandName"
                  width={90}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip formatter={(v: number) => peso(v)} />
                <Bar dataKey="totalRevenue" name="Revenue" fill="#4f46e5" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2 pr-2">#</th>
                  <th className="pb-2 pr-4">Brand</th>
                  <th className="pb-2 text-right pr-4">Revenue</th>
                  <th className="pb-2 text-right pr-2">Txns</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.map((brand, i) => (
                  <tr key={brand.brandId} className="hover:bg-gray-50">
                    <td className="py-2 pr-2 text-gray-400">{i + 1}</td>
                    <td className="py-2 pr-4 font-medium text-gray-900">{brand.brandName}</td>
                    <td className="py-2 pr-4 text-right text-gray-700">{peso(brand.totalRevenue)}</td>
                    <td className="py-2 pr-2 text-right text-gray-500">
                      {brand.transactionCount.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
