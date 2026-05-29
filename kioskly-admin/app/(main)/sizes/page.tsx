"use client";

import { ExternalLink } from 'lucide-react';

export default function SizesRedirectPage() {
  return (
    <div className="p-6 flex items-center justify-center min-h-96">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <ExternalLink className="h-8 w-8 text-indigo-600" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Sizes Managed at Brand Level</h2>
        <p className="text-gray-600 text-sm">
          Sizes are now managed in the Company &amp; Brand Portal by your brand manager.
        </p>
      </div>
    </div>
  );
}
