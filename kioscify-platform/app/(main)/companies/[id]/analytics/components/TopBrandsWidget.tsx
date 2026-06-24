'use client';
import { useEffect, useState } from 'react';
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { api } from '@/lib/api';
import type { TopBrandItem, Brand } from '@/types';

interface Props {
  companyId: string;
  startDate: string;
  endDate: string;
}

export function TopBrandsWidget({ companyId, startDate, endDate }: Props) {
  const [data, setData] = useState<TopBrandItem[]>([]);
  const [colorMap, setColorMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getBrandsByCompany(companyId)
      .then((brands: Brand[]) => {
        const map: Record<string, string> = {};
        for (const b of brands) map[b.id] = b.themeColors?.primary ?? '#4f46e5';
        setColorMap(map);
      })
      .catch(() => {});
  }, [companyId]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .getTopBrands(companyId, startDate, endDate)
      .then(setData)
      .catch((err: { response?: { data?: { message?: string } } }) =>
        setError(err?.response?.data?.message || 'Failed to load brands'),
      )
      .finally(() => setLoading(false));
  }, [companyId, startDate, endDate]);

  return (
    <div className="bg-white rounded-lg border p-6">
      <div className="mb-4">
        <h2 className="font-semibold text-gray-900">Top Brands</h2>
        <p className="text-xs text-gray-400 mt-0.5">Total units sold across all stores per brand</p>
      </div>
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
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="brandName" width={90} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => [`${v} units`, 'Units Sold']} />
                <Bar dataKey="unitsSold" name="Units Sold" radius={[0, 4, 4, 0]}>
                  {data.map(brand => (
                    <Cell key={brand.brandId} fill={colorMap[brand.brandId] ?? '#4f46e5'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2 pr-2">#</th>
                  <th className="pb-2 pr-4">Brand</th>
                  <th className="pb-2 text-right pr-2">Units Sold</th>
                  <th className="pb-2 text-right pr-2">Stores</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.map((brand, i) => (
                  <tr key={brand.brandId} className="hover:bg-gray-50">
                    <td className="py-2 pr-2 text-gray-400">{i + 1}</td>
                    <td className="py-2 pr-4 font-medium text-gray-900">{brand.brandName}</td>
                    <td className="py-2 pr-2 text-right text-gray-700">{brand.unitsSold.toLocaleString()}</td>
                    <td className="py-2 pr-2 text-right text-gray-700">{brand.storeCount}</td>
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
