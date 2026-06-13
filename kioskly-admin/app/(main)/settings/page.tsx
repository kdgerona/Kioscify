'use client';

import { useEffect, useState } from 'react';
import { Store, User, KeyRound, Eye, EyeOff } from 'lucide-react';
import type { User as UserType } from '@/types';
import { useTenant } from '@/contexts/TenantContext';
import { api } from '@/lib/api';
import { formatRole } from '@/lib/utils';
import { hasPrivilege } from '@/lib/privileges';

export default function SettingsPage() {
  const { tenant, brand } = useTenant();
  const primaryColor = brand?.themeColors?.primary ?? tenant?.themeColors?.primary ?? '#ea580c';
  const canViewStore = hasPrivilege('settings', 'read');
  const [user, setUser] = useState<UserType | null>(null);

  // Change password state
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    if (newPassword !== confirmPassword) { setPwError('New passwords do not match'); return; }
    setPwLoading(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      setPwSuccess(true);
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setTimeout(() => { setPwSuccess(false); setShowChangePassword(false); }, 2500);
    } catch (err: any) {
      setPwError(err?.response?.data?.message || 'Failed to change password');
    } finally {
      setPwLoading(false);
    }
  };

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
        {/* Tenant Info — only for users with at least read on settings */}
        {canViewStore && <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
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
        </div>}

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
              <label className="block text-xs sm:text-sm font-medium text-gray-600 mb-1">Username</label>
              <p className="text-sm sm:text-base text-gray-900 font-medium break-words">{user?.username || 'N/A'}</p>
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-600 mb-1">Email</label>
              <p className="text-sm sm:text-base text-gray-900 break-all">{user?.email || 'Not set'}</p>
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-600 mb-1">Role</label>
              <span
                className="inline-block whitespace-nowrap px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-semibold"
                style={
                  ['STORE_ADMIN', 'ADMIN'].includes(user?.role ?? '')
                    ? { backgroundColor: '#e0e7ff', color: '#3730a3' }
                    : { backgroundColor: '#f3f4f6', color: '#374151' }
                }
              >
                {formatRole(user?.role) || 'N/A'}
              </span>
            </div>

            <div className="pt-2 border-t border-gray-100">
              {!showChangePassword ? (
                <button
                  onClick={() => { setShowChangePassword(true); setPwError(null); setPwSuccess(false); }}
                  className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition"
                >
                  <KeyRound className="h-4 w-4" />
                  Change Password
                </button>
              ) : (
                <form onSubmit={handleChangePassword} className="space-y-3">
                  <p className="text-sm font-medium text-gray-700">Change Password</p>
                  {pwError && <p className="text-xs text-red-600">{pwError}</p>}
                  {pwSuccess && <p className="text-xs text-green-600">Password changed successfully.</p>}
                  {[
                    { label: 'Current Password', val: currentPassword, set: setCurrentPassword, show: showCurrent, toggle: () => setShowCurrent(v => !v) },
                    { label: 'New Password', val: newPassword, set: setNewPassword, show: showNew, toggle: () => setShowNew(v => !v) },
                    { label: 'Confirm New Password', val: confirmPassword, set: setConfirmPassword, show: showConfirm, toggle: () => setShowConfirm(v => !v) },
                  ].map(({ label, val, set, show, toggle }) => (
                    <div key={label}>
                      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                      <div className="relative">
                        <input
                          type={show ? 'text' : 'password'}
                          value={val}
                          onChange={e => set(e.target.value)}
                          required
                          className="w-full px-3 py-2 pr-9 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2"
                          style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                        />
                        <button type="button" tabIndex={-1} onClick={toggle} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                          {show ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                    </div>
                  ))}
                  <p className="text-xs text-gray-400">Min 10 chars · uppercase · lowercase · number · special character</p>
                  <div className="flex gap-2 pt-1">
                    <button
                      type="submit"
                      disabled={pwLoading}
                      className="px-4 py-2 text-sm text-black rounded-lg font-medium hover:opacity-90 transition disabled:opacity-50"
                      style={{ backgroundColor: primaryColor }}
                    >
                      {pwLoading ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowChangePassword(false); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); setPwError(null); }}
                      className="px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
