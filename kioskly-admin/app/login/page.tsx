'use client';

import { useState, FormEvent, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useTenant } from '@/contexts/TenantContext';
import { LogIn, ArrowLeft } from 'lucide-react';
import Image from 'next/image';

export default function LoginPage() {
  const router = useRouter();
  const { tenant, clearTenant } = useTenant();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Redirect to tenant setup if no tenant configured
    if (!tenant) {
      router.push('/tenant-setup');
    }
  }, [tenant, router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    console.log('🔐 Login attempt started');
    console.log('📦 Tenant ID:', tenant?.id);
    console.log('👤 Username:', username);

    try {
      const response = await api.login({
        username,
        password,
        storeSlug: tenant?.slug ?? '',
      });

      const allowedRoles = ['STORE_ADMIN', 'ADMIN'];
      if (!allowedRoles.includes(response.user.role)) {
        setError('Access denied. Store Admin access required.');
        api.logout();
        setLoading(false);
        return;
      }

      localStorage.setItem('user', JSON.stringify(response.user));

      // Redirect to change-password on first login
      if ((response as any).mustChangePassword || response.user.isFirstLogin) {
        router.push('/change-password');
        return;
      }

      // If user has multiple stores, show store picker
      const stores = (response as any).stores ?? [];
      if (stores.length > 1) {
        sessionStorage.setItem('accessible_stores', JSON.stringify(stores));
        router.push('/store-picker');
        return;
      }

      router.push('/dashboard');
    } catch (err: any) {
      console.error('❌ Login failed:', err);
      setError(err.response?.data?.message || 'Login failed. Please check your credentials.');
      setLoading(false);
    }
  };

  const handleChangeTenant = () => {
    clearTenant();
    router.push('/tenant-setup');
  };

  if (!tenant) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Use brand theme colors if available, otherwise fall back to store or default
  const primaryColor = tenant.brand?.themeColors?.primary ?? tenant.themeColors?.primary ?? '#ea580c';
  const brandLogoUrl = tenant.brand?.logoUrl ?? tenant.company?.logoUrl ?? tenant.logoUrl;

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 sm:px-6 lg:px-8"
      style={{
        background: `linear-gradient(to bottom right, ${primaryColor}15, ${primaryColor}30)`
      }}
    >
      <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-2xl w-full max-w-md">
        <button
          onClick={handleChangeTenant}
          className="flex items-center text-gray-600 hover:text-gray-900 mb-4 text-sm transition"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Change Store
        </button>

        <div className="flex flex-col items-center justify-center mb-6">
          {brandLogoUrl ? (
            <div className="relative w-24 h-24 sm:w-32 sm:h-32 mb-4">
              <Image src={brandLogoUrl} alt={tenant.brand?.name ?? tenant.name} fill className="object-contain" />
            </div>
          ) : (
            <div className="w-24 h-24 sm:w-32 sm:h-32 mb-4 rounded-full flex items-center justify-center text-3xl font-bold text-white" style={{ backgroundColor: primaryColor }}>
              {(tenant.brand?.name ?? tenant.name).charAt(0).toUpperCase()}
            </div>
          )}

          <h1 className="text-2xl sm:text-3xl font-bold text-center text-gray-900 mb-1">
            {tenant.brand?.name ?? tenant.name}
          </h1>
          <p className="text-center text-sm text-gray-500">{tenant.name}</p>
          <p className="text-center text-sm sm:text-base text-gray-600 mb-4 sm:mb-6">
            Store Management Portal
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 sm:px-4 py-2 sm:py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="username" className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition text-gray-900"
              placeholder="Enter your username"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition text-gray-900"
              placeholder="Enter your password"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full text-white font-semibold py-2.5 sm:py-3 px-4 text-sm sm:text-base rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-90"
            style={{ backgroundColor: primaryColor }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-4 sm:mt-6">
          Powered by <span className="font-semibold">Kioscify</span>
        </p>
      </div>
    </div>
  );
}
