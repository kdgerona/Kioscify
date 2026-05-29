'use client';

import { BarChart2 } from 'lucide-react';

export default function AnalyticsPage() {
  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <p className="text-sm text-gray-500 mt-1">Cross-brand performance overview</p>
      </div>

      <div className="bg-white rounded-lg border p-10 flex flex-col items-center justify-center text-center">
        <div className="w-14 h-14 bg-indigo-50 rounded-full flex items-center justify-center mb-4">
          <BarChart2 className="w-7 h-7 text-indigo-600" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Analytics Coming Soon</h2>
        <p className="text-gray-500 text-sm max-w-sm">
          Cross-brand analytics will be available here. You will be able to compare store performance
          across all your brands.
        </p>
      </div>
    </div>
  );
}
