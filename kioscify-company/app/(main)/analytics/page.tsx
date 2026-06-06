'use client';
import { useState } from 'react';
import { DateRangePicker } from './components/DateRangePicker';
import { OverviewCards } from './components/OverviewCards';
import { TopBrandsWidget } from './components/TopBrandsWidget';
import { TopProductsWidget } from './components/TopProductsWidget';
import { TopStoresWidget } from './components/TopStoresWidget';
import { NetworkGrowthChart } from './components/NetworkGrowthChart';

export default function AnalyticsPage() {
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  function handleDateChange(start: string, end: string) {
    setStartDate(start);
    setEndDate(end);
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <DateRangePicker onChange={handleDateChange} />
      </div>

      {startDate && endDate ? (
        <>
          <OverviewCards startDate={startDate} endDate={endDate} />

          <TopBrandsWidget startDate={startDate} endDate={endDate} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TopProductsWidget startDate={startDate} endDate={endDate} />
            <TopStoresWidget startDate={startDate} endDate={endDate} />
          </div>

          <NetworkGrowthChart startDate={startDate} endDate={endDate} />
        </>
      ) : (
        <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
          Select a date range to load analytics
        </div>
      )}
    </div>
  );
}
