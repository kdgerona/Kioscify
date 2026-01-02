'use client';

import { useEffect, useState } from 'react';
import { Settings as SettingsIcon, Store, Palette, User } from 'lucide-react';
import type { User as UserType } from '@/types';
import { useTenant } from '@/contexts/TenantContext';

export default function SettingsPage() {
  const { tenant } = useTenant();
  const primaryColor = tenant?.themeColors?.primary || '#4f46e5';
  const [user, setUser] = useState<UserType | null>(null);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) setUser(JSON.parse(userStr));
  }, []);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm sm:text-base text-gray-600 mt-2">Manage your business and account settings</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Tenant Info */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
          <div className="flex items-center mb-4 sm:mb-6">
            <div className="p-2 sm:p-3 rounded-lg flex-shrink-0" style={{ backgroundColor: `${primaryColor}20` }}>
              <Store className="w-5 h-5 sm:w-6 sm:h-6" style={{ color: primaryColor }} />
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 ml-3 sm:ml-4">Business Information</h2>
          </div>

          <div className="space-y-3 sm:space-y-4">
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-600 mb-1">
                Business Name
              </label>
              <p className="text-sm sm:text-base text-gray-900 font-medium break-words">{tenant?.name || 'N/A'}</p>
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-600 mb-1">
                Slug
              </label>
              <p className="text-xs sm:text-sm text-gray-900 font-mono break-all">{tenant?.slug || 'N/A'}</p>
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-600 mb-1">
                Created
              </label>
              <p className="text-sm sm:text-base text-gray-900">
                {tenant?.createdAt ? new Date(tenant.createdAt).toLocaleDateString() : 'N/A'}
              </p>
            </div>
          </div>
        </div>

        {/* User Info */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
          <div className="flex items-center mb-4 sm:mb-6">
            <div className="bg-green-100 p-2 sm:p-3 rounded-lg flex-shrink-0">
              <User className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 ml-3 sm:ml-4">Account Information</h2>
          </div>

          <div className="space-y-3 sm:space-y-4">
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-600 mb-1">
                Username
              </label>
              <p className="text-sm sm:text-base text-gray-900 font-medium break-words">{user?.username || 'N/A'}</p>
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-600 mb-1">
                Email
              </label>
              <p className="text-sm sm:text-base text-gray-900 break-all">{user?.email || 'Not set'}</p>
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-600 mb-1">
                Role
              </label>
              <span
                className="inline-block px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-semibold"
                style={{ backgroundColor: `${primaryColor}20`, color: primaryColor }}
              >
                {user?.role || 'N/A'}
              </span>
            </div>
          </div>
        </div>

        {/* Theme Colors */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 lg:col-span-2">
          <div className="flex items-center mb-4 sm:mb-6">
            <div className="bg-purple-100 p-2 sm:p-3 rounded-lg flex-shrink-0">
              <Palette className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600" />
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 ml-3 sm:ml-4">Brand Colors</h2>
          </div>

          {tenant?.themeColors ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 sm:gap-4">
              {Object.entries(tenant.themeColors).map(([key, value]) => (
                <div key={key} className="text-center">
                  <div
                    className="w-full h-16 sm:h-20 rounded-lg border-2 border-gray-200 mb-2"
                    style={{ backgroundColor: value }}
                  />
                  <p className="text-xs sm:text-sm font-medium text-gray-900 capitalize break-words">{key}</p>
                  <p className="text-xs text-gray-500 font-mono break-all">{value}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm sm:text-base text-gray-600">No theme colors configured</p>
          )}
        </div>

        {/* API Integration Info */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 lg:col-span-2">
          <div className="flex items-center mb-4 sm:mb-6">
            <div className="bg-orange-100 p-2 sm:p-3 rounded-lg flex-shrink-0">
              <SettingsIcon className="w-5 h-5 sm:w-6 sm:h-6 text-orange-600" />
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 ml-3 sm:ml-4">API Configuration</h2>
          </div>

          <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
            <p className="text-xs sm:text-sm text-gray-600 mb-2">API Base URL:</p>
            <code className="text-xs sm:text-sm font-mono text-gray-900 bg-white px-2 sm:px-3 py-2 rounded border border-gray-200 block overflow-x-auto">
              {process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}
            </code>
          </div>

          <div className="mt-3 sm:mt-4 p-3 sm:p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-xs sm:text-sm text-blue-900">
              <strong>Note:</strong> To modify business settings, tenant information, or brand colors,
              please use the API endpoints directly or contact system administrator.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
