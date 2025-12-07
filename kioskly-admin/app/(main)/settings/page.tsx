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
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600 mt-2">Manage your business and account settings</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tenant Info */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center mb-6">
            <div className="p-3 rounded-lg" style={{ backgroundColor: `${primaryColor}20` }}>
              <Store className="w-6 h-6" style={{ color: primaryColor }} />
            </div>
            <h2 className="text-xl font-bold text-gray-900 ml-4">Business Information</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Business Name
              </label>
              <p className="text-gray-900 font-medium">{tenant?.name || 'N/A'}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Slug
              </label>
              <p className="text-gray-900 font-mono text-sm">{tenant?.slug || 'N/A'}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Created
              </label>
              <p className="text-gray-900">
                {tenant?.createdAt ? new Date(tenant.createdAt).toLocaleDateString() : 'N/A'}
              </p>
            </div>
          </div>
        </div>

        {/* User Info */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center mb-6">
            <div className="bg-green-100 p-3 rounded-lg">
              <User className="w-6 h-6 text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 ml-4">Account Information</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Username
              </label>
              <p className="text-gray-900 font-medium">{user?.username || 'N/A'}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Email
              </label>
              <p className="text-gray-900">{user?.email || 'Not set'}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Role
              </label>
              <span 
                className="inline-block px-3 py-1 rounded-full text-sm font-semibold"
                style={{ backgroundColor: `${primaryColor}20`, color: primaryColor }}
              >
                {user?.role || 'N/A'}
              </span>
            </div>
          </div>
        </div>

        {/* Theme Colors */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 lg:col-span-2">
          <div className="flex items-center mb-6">
            <div className="bg-purple-100 p-3 rounded-lg">
              <Palette className="w-6 h-6 text-purple-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 ml-4">Brand Colors</h2>
          </div>

          {tenant?.themeColors ? (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {Object.entries(tenant.themeColors).map(([key, value]) => (
                <div key={key} className="text-center">
                  <div
                    className="w-full h-20 rounded-lg border-2 border-gray-200 mb-2"
                    style={{ backgroundColor: value }}
                  />
                  <p className="text-sm font-medium text-gray-900 capitalize">{key}</p>
                  <p className="text-xs text-gray-500 font-mono">{value}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-600">No theme colors configured</p>
          )}
        </div>

        {/* API Integration Info */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 lg:col-span-2">
          <div className="flex items-center mb-6">
            <div className="bg-orange-100 p-3 rounded-lg">
              <SettingsIcon className="w-6 h-6 text-orange-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 ml-4">API Configuration</h2>
          </div>

          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm text-gray-600 mb-2">API Base URL:</p>
            <code className="text-sm font-mono text-gray-900 bg-white px-3 py-2 rounded border border-gray-200 inline-block">
              {process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}
            </code>
          </div>

          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-900">
              <strong>Note:</strong> To modify business settings, tenant information, or brand colors,
              please use the API endpoints directly or contact system administrator.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
