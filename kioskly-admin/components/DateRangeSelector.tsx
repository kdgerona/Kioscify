'use client';

import { Calendar } from 'lucide-react';
import { DatePicker } from '@/components/ui/date-picker';

export type TimePeriod = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'overall' | 'custom';

interface DateRangeSelectorProps {
  period: TimePeriod;
  onPeriodChange: (period: TimePeriod) => void;
  startDate?: string;
  endDate?: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  primaryColor?: string;
}

export default function DateRangeSelector({
  period,
  onPeriodChange,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  primaryColor = '#4f46e5',
}: DateRangeSelectorProps) {
  const periods: { value: TimePeriod; label: string }[] = [
    { value: 'daily', label: 'Today' },
    { value: 'weekly', label: 'This Week' },
    { value: 'monthly', label: 'This Month' },
    { value: 'yearly', label: 'This Year' },
    { value: 'overall', label: 'All Time' },
    { value: 'custom', label: 'Custom Range' },
  ];

  return (
    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6">
      <div className="flex items-center space-x-2 mb-3">
        <Calendar className="w-5 h-5 text-gray-600" />
        <h3 className="text-lg font-semibold text-gray-900">Date Range</h3>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {periods.map((p) => (
          <button
            key={p.value}
            onClick={() => onPeriodChange(p.value)}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              period === p.value
                ? 'text-black shadow-md'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            style={
              period === p.value
                ? { backgroundColor: primaryColor }
                : undefined
            }
          >
            {p.label}
          </button>
        ))}
      </div>

      {period === 'custom' && (
        <div className="flex flex-col sm:flex-row gap-4 pt-3 border-t border-gray-200">
          <div className="w-full sm:w-auto">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Start Date
            </label>
            <DatePicker
              date={startDate ? new Date(startDate + 'T00:00:00') : undefined}
              onDateChange={(date) => {
                if (date) {
                  const year = date.getFullYear();
                  const month = String(date.getMonth() + 1).padStart(2, '0');
                  const day = String(date.getDate()).padStart(2, '0');
                  onStartDateChange(`${year}-${month}-${day}`);
                } else {
                  onStartDateChange('');
                }
              }}
              placeholder="Select start date"
            />
          </div>
          <div className="w-full sm:w-auto">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              End Date
            </label>
            <DatePicker
              date={endDate ? new Date(endDate + 'T00:00:00') : undefined}
              onDateChange={(date) => {
                if (date) {
                  const year = date.getFullYear();
                  const month = String(date.getMonth() + 1).padStart(2, '0');
                  const day = String(date.getDate()).padStart(2, '0');
                  onEndDateChange(`${year}-${month}-${day}`);
                } else {
                  onEndDateChange('');
                }
              }}
              placeholder="Select end date"
            />
          </div>
        </div>
      )}
    </div>
  );
}
