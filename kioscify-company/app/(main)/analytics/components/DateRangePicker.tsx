// kioscify-company/app/(main)/analytics/components/DateRangePicker.tsx
'use client';
import { useState } from 'react';
import {
  startOfDay, endOfDay, subDays,
  startOfWeek, endOfWeek,
  startOfMonth, endOfMonth, subMonths,
  startOfYear, endOfYear,
  parseISO, differenceInDays, format,
} from 'date-fns';
import { Calendar } from 'lucide-react';

export type DatePreset =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'this_month'
  | 'last_3_months'
  | 'this_year'
  | 'custom';

interface Props {
  initialPreset?: DatePreset;
  onChange: (startDate: string, endDate: string) => void;
}

function getPresetRange(preset: Exclude<DatePreset, 'custom'>): { start: Date; end: Date } {
  const now = new Date();
  switch (preset) {
    case 'today':
      return { start: startOfDay(now), end: endOfDay(now) };
    case 'yesterday': {
      const y = subDays(now, 1);
      return { start: startOfDay(y), end: endOfDay(y) };
    }
    case 'this_week':
      return {
        start: startOfWeek(now, { weekStartsOn: 1 }),
        end: endOfWeek(now, { weekStartsOn: 1 }),
      };
    case 'this_month':
      return { start: startOfMonth(now), end: endOfMonth(now) };
    case 'last_3_months':
      return { start: startOfMonth(subMonths(now, 2)), end: endOfMonth(now) };
    case 'this_year':
      return { start: startOfYear(now), end: endOfYear(now) };
  }
}

const PRESETS: { value: DatePreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_week', label: 'This Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_3_months', label: 'Last 3 Months' },
  { value: 'this_year', label: 'This Year' },
  { value: 'custom', label: 'Custom Range' },
];

export function DateRangePicker({ initialPreset = 'this_month', onChange }: Props) {
  const [preset, setPreset] = useState<DatePreset>(initialPreset);
  const [customStart, setCustomStart] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [customEnd, setCustomEnd] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [customError, setCustomError] = useState<string | null>(null);

  function handlePresetChange(value: DatePreset) {
    setPreset(value);
    if (value !== 'custom') {
      const { start, end } = getPresetRange(value);
      onChange(start.toISOString(), end.toISOString());
    }
  }

  function handleCustomApply() {
    const start = startOfDay(parseISO(customStart));
    const end = endOfDay(parseISO(customEnd));
    const diff = differenceInDays(end, start);
    if (diff < 0) {
      setCustomError('Start date must be before end date');
      return;
    }
    if (diff > 730) {
      setCustomError('Date range cannot exceed 2 years');
      return;
    }
    setCustomError(null);
    onChange(start.toISOString(), end.toISOString());
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <Calendar className="w-4 h-4 text-gray-500" />
        <select
          value={preset}
          onChange={e => handlePresetChange(e.target.value as DatePreset)}
          className="text-sm border border-gray-300 rounded-md px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {PRESETS.map(p => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </div>
      {preset === 'custom' && (
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="date"
            value={customStart}
            onChange={e => setCustomStart(e.target.value)}
            className="text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <span className="text-gray-400 text-sm">to</span>
          <input
            type="date"
            value={customEnd}
            onChange={e => setCustomEnd(e.target.value)}
            className="text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            onClick={handleCustomApply}
            className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-md hover:bg-indigo-700 transition-colors"
          >
            Apply
          </button>
          {customError && <span className="text-xs text-red-600">{customError}</span>}
        </div>
      )}
    </div>
  );
}
