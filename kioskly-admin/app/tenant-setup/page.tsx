'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTenant } from '@/contexts/TenantContext';
import Image from 'next/image';
import { Store } from 'lucide-react';

export default function TenantSetupPage() {
  const router = useRouter();
  const [slug, setSlug] = useState('');
  const { fetchTenantBySlug, loading, error } = useTenant();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!slug.trim()) {
      return;
    }

    try {
      await fetchTenantBySlug(slug.trim().toLowerCase());
      // If successful, navigate to login
      router.push('/login');
    } catch (err) {
      // Error is handled by the context
      console.error('Failed to fetch tenant:', err);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 to-amber-100">
      <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex flex-col items-center justify-center mb-6">
          <div className="relative w-48 h-48 mb-4">
            <Image
              src="/logo.png"
              alt="Kioskly Logo"
              fill
              className="object-contain"
              priority
            />
          </div>
          <h1 className="text-3xl font-bold text-orange-600 mb-2 text-center">
            Welcome to Kioskly Admin
          </h1>
          <p className="text-center text-gray-600">
            Enter your store identifier to continue
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="slug" className="block text-sm font-semibold text-gray-700 mb-2">
              Store ID / Slug
            </label>
            <input
              id="slug"
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition text-gray-900"
              placeholder="e.g., my-store"
              autoCapitalize="none"
              autoCorrect="off"
              disabled={loading}
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Ask your administrator for your store identifier
            </p>
          </div>

          <button
            type="submit"
            disabled={loading || !slug.trim()}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 px-4 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                <span className="ml-2">Loading...</span>
              </div>
            ) : (
              'Continue'
            )}
          </button>
        </form>

        <div className="mt-8 p-4 bg-orange-50 rounded-lg">
          <div className="flex items-start">
            <Store className="w-5 h-5 text-orange-600 mt-0.5 mr-2 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-orange-800 mb-1">
                What is a Store ID?
              </p>
              <p className="text-xs text-gray-600">
                Your Store ID (slug) is a unique identifier for your business.
                It&apos;s used to load your custom branding, theme, and settings.
                Contact your system administrator if you don&apos;t have this information.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
