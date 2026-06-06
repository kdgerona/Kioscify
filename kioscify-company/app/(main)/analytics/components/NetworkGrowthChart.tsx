'use client';
import { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { format, parseISO, differenceInDays } from 'date-fns';
import { api } from '@/lib/api';
import type { GrowthDataPoint } from '@/types';

interface Props {
  startDate: string;
  endDate: string;
}

export function NetworkGrowthChart({ startDate, endDate }: Props) {
  const [data, setData] = useState<GrowthDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .getNetworkGrowth(startDate, endDate)
      .then(setData)
      .catch((err: { response?: { data?: { message?: string } } }) =>
        setError(err?.response?.data?.message || 'Failed to load growth data'),
      )
      .finally(() => setLoading(false));
  }, [startDate, endDate]);

  const diffDays = differenceInDays(parseISO(endDate), parseISO(startDate));
  const dateFormat =
    diffDays <= 1 ? 'HH:mm' : diffDays <= 31 ? 'MMM d' : diffDays <= 90 ? 'MMM d' : 'MMM yyyy';

  const chartData = data.map(d => ({
    ...d,
    label: format(parseISO(d.date), dateFormat),
  }));

  return (
    <div className="bg-white rounded-lg border p-6">
      <div className="mb-4">
        <h2 className="font-semibold text-gray-900">Network Growth</h2>
        <p className="text-xs text-gray-400 mt-0.5">Cumulative number of stores and brands added over time</p>
      </div>
      {loading ? (
        <div className="h-52 bg-gray-100 rounded animate-pulse" />
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : data.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No data for this period</p>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="storeCount"
              name="Stores"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="brandCount"
              name="Brands"
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
