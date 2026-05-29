'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useTenant } from '@/contexts/TenantContext';

interface CompanyInfo {
  name: string;
  logoUrl: string | null;
}

export default function LoginForm({
  companySlug,
  company,
}: {
  companySlug: string;
  company: CompanyInfo | null;
}) {
  const router = useRouter();
  const { fetchTenantBySlug } = useTenant();
  const [storeSlug, setStoreSlug] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Resolve the store — validates slug and populates TenantContext + localStorage
      await fetchTenantBySlug(storeSlug.trim().toLowerCase());

      const response = await api.login({
        username,
        password,
        storeSlug: storeSlug.trim().toLowerCase(),
      });

      const allowedRoles = ['STORE_ADMIN', 'ADMIN'];
      if (!allowedRoles.includes(response.user.role)) {
        setError('Access denied. Store Admin access required.');
        api.logout();
        setLoading(false);
        return;
      }

      localStorage.setItem('user', JSON.stringify(response.user));

      if ((response as any).mustChangePassword || response.user.isFirstLogin) {
        router.push('/change-password');
        return;
      }

      const stores = (response as any).stores ?? [];
      if (stores.length > 1) {
        sessionStorage.setItem('accessible_stores', JSON.stringify(stores));
        router.push('/store-picker');
        return;
      }

      router.push('/dashboard');
    } catch (err: any) {
      if (err.message?.includes('Store not found') || err.message?.includes('check the Store ID')) {
        setError('Store not found. Please check the Store ID and try again.');
      } else {
        setError(err.response?.data?.message || 'Login failed. Please check your credentials.');
      }
      setLoading(false);
    }
  };

  const apiBase = process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') || 'http://localhost:3000';
  const logoSrc = company?.logoUrl
    ? company.logoUrl.startsWith('http')
      ? company.logoUrl
      : `${apiBase}${company.logoUrl}`
    : null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 to-amber-100 px-4">
      <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          {logoSrc ? (
            <div className="flex justify-center mb-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoSrc}
                alt={company!.name}
                className="w-24 h-24 object-contain rounded-xl"
              />
            </div>
          ) : (
            <div className="w-24 h-24 bg-orange-500 rounded-xl flex items-center justify-center mb-4">
              <span className="text-white text-3xl font-bold">
                {company ? company.name[0].toUpperCase() : 'K'}
              </span>
            </div>
          )}
          <h1 className="text-2xl font-bold text-gray-900 text-center">
            {company ? company.name : 'Store Portal'}
          </h1>
          <p className="text-gray-500 text-sm mt-1">Store Management Portal</p>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Store ID / Slug</label>
            <input
              type="text"
              value={storeSlug}
              onChange={e => setStoreSlug(e.target.value)}
              required
              autoCapitalize="none"
              autoCorrect="off"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none text-sm text-gray-900"
              placeholder="e.g. mr-lemon-branch-1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none text-sm text-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none text-sm text-gray-900"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">
          Powered by <span className="font-semibold">Kioscify</span>
        </p>
      </div>
    </div>
  );
}
