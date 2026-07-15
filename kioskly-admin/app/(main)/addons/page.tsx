"use client";

import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { api } from '@/lib/api';

export default function AddonsRedirectPage() {
  const [menuName, setMenuName] = useState<string | null>(null);

  useEffect(() => {
    api.getCurrentTenant().then(t => setMenuName(t.menu?.name ?? null)).catch(() => {});
  }, []);

  return (
    <div className="p-6 flex items-center justify-center min-h-96">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <ExternalLink className="h-8 w-8 text-indigo-600" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Add-ons Managed at Brand Level</h2>
        <p className="text-gray-600 text-sm">
          Add-ons are now managed in the Company &amp; Brand Portal by your brand manager.
        </p>
        <p className="mt-4 text-sm text-gray-700">
          Current menu: <span className="font-medium">{menuName ?? 'Not assigned yet'}</span>
        </p>
      </div>
    </div>
  );
}
