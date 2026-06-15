'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { hasPrivilege } from '@/lib/privileges';
import { startOfMonth, endOfMonth } from 'date-fns';
import { DateRangePicker } from './components/DateRangePicker';
import { OverviewCards } from './components/OverviewCards';
import { TopBrandsWidget } from './components/TopBrandsWidget';
import { TopProductsWidget } from './components/TopProductsWidget';
import { TopStoresWidget } from './components/TopStoresWidget';
import { NetworkGrowthChart } from './components/NetworkGrowthChart';

export default function AnalyticsPage() {
  const router = useRouter();

  useEffect(() => {
    if (!hasPrivilege('analytics', 'read')) {
      router.replace('/dashboard');
    }
  }, [router]);

  const [startDate, setStartDate] = useState(startOfMonth(new Date()).toISOString());
  const [endDate, setEndDate] = useState(endOfMonth(new Date()).toISOString());

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="text-sm text-gray-500 mt-1">Cross-brand performance overview</p>
        </div>
        <DateRangePicker
          initialPreset="this_month"
          onChange={(start, end) => {
            setStartDate(start);
            setEndDate(end);
          }}
        />
      </div>

      <OverviewCards startDate={startDate} endDate={endDate} />

      <TopBrandsWidget startDate={startDate} endDate={endDate} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TopProductsWidget startDate={startDate} endDate={endDate} />
        <TopStoresWidget startDate={startDate} endDate={endDate} />
      </div>

      <NetworkGrowthChart startDate={startDate} endDate={endDate} />
    </div>
  );
}
