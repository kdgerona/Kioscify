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
        tenantId: tenant?.id
      });

      console.log('✅ Login successful!', response);
      console.log('👤 User role:', response.user.role);

      // Check if user is ADMIN
      if (response.user.role !== 'ADMIN') {
        console.log('❌ Access denied - not an admin');
        setError('Access denied. Admin privileges required.');
        api.logout();
        setLoading(false);
        return;
      }

      // Store user info
      localStorage.setItem('user', JSON.stringify(response.user));
      console.log('💾 User stored in localStorage');

      // Check if token was saved
      const savedToken = api.getToken();
      console.log('🎫 Token saved:', !!savedToken);

      // Redirect to dashboard
      console.log('🚀 Redirecting to dashboard...');
      router.push('/dashboard');
      console.log('✅ Router.push called');
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

  const primaryColor = tenant.themeColors?.primary || '#ea580c';

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
          {tenant.logoUrl ? (
            <div className="relative w-24 h-24 sm:w-32 sm:h-32 mb-4">
              <Image
                src={tenant.logoUrl}
                alt={tenant.name}
                fill
                className="object-contain"
              />
            </div>
          ) : (
            <div className="relative w-24 h-24 sm:w-32 sm:h-32 mb-4">
              <Image
                src="/logo.png"
                alt="Kioskly"
                fill
                className="object-contain"
              />
            </div>
          )}

          <h1 className="text-2xl sm:text-3xl font-bold text-center text-gray-900 mb-1">
            {tenant.name}
          </h1>
          <p className="text-center text-sm sm:text-base text-gray-600 mb-4 sm:mb-6">
            Admin Dashboard
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

        <p className="text-center text-xs sm:text-sm text-gray-500 mt-4 sm:mt-6">
          Admin access only
        </p>
      </div>
    </div>
  );
}
