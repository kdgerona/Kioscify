'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

export default function BrandSlugForm() {
  const [companySlug, setCompanySlug] = useState('');
  const [brandSlug, setBrandSlug] = useState('');
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!companySlug.trim() || !brandSlug.trim()) return;
    setLoading(true);
    router.push(`/${companySlug.trim().toLowerCase()}/${brandSlug.trim().toLowerCase()}`);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 to-amber-100 px-4">
      <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="relative w-32 h-32 mb-4">
            <Image src="/logo.png" alt="Kioscify" fill className="object-contain" priority />
          </div>
          <h1 className="text-2xl font-bold text-orange-600 text-center">Store Management Portal</h1>
          <p className="text-gray-500 text-sm mt-1 text-center">Enter your company and brand to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Company Slug</label>
            <input
              type="text"
              value={companySlug}
              onChange={e => setCompanySlug(e.target.value)}
              required
              autoCapitalize="none"
              autoCorrect="off"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none text-sm text-gray-900"
              placeholder="e.g. greatserve"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Brand Slug</label>
            <input
              type="text"
              value={brandSlug}
              onChange={e => setBrandSlug(e.target.value)}
              required
              autoCapitalize="none"
              autoCorrect="off"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none text-sm text-gray-900"
              placeholder="e.g. mr-lemon"
            />
          </div>
          <p className="text-xs text-gray-400">Provided by your Kioscify platform administrator</p>

          <button
            type="submit"
            disabled={loading || !companySlug.trim() || !brandSlug.trim()}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {loading ? 'Redirecting...' : 'Continue'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">
          Powered by <span className="font-semibold">Kioscify</span>
        </p>
      </div>
    </div>
  );
}
