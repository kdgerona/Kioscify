'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { formatRole } from '@/lib/utils';
import type { Company, User } from '@/types';
import { Save, KeyRound } from 'lucide-react';

export default function SettingsPage() {
  const [company, setCompany] = useState<Company | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Editable fields
  const [name, setName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [description, setDescription] = useState('');

  // Change password
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);

  useEffect(() => {
    setCurrentUser(api.getCurrentUser());
    api
      .getMyCompany()
      .then(data => {
        setCompany(data);
        setName(data.name);
        setContactEmail(data.contactEmail || '');
        setDescription(data.description || '');
      })
      .catch(() => setError('Failed to load company settings'))
      .finally(() => setLoading(false));
  }, []);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    if (newPassword !== confirmPassword) {
      setPwError('New passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      setPwError('New password must be at least 8 characters');
      return;
    }
    setPwSaving(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      setPwSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowChangePassword(false);
      setTimeout(() => setPwSuccess(false), 3000);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setPwError(axiosErr?.response?.data?.message || 'Failed to change password');
    } finally {
      setPwSaving(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company) return;
    setError(null);
    setSaving(true);
    try {
      const updated = await api.updateCompany(company.id, {
        name,
        contactEmail,
        description,
      });
      setCompany(updated);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr?.response?.data?.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your company profile</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 p-4 rounded-lg text-sm">
          Settings saved successfully
        </div>
      )}

      {/* My Account */}
      <div className="bg-white rounded-lg border">
        <div className="px-6 py-4 border-b">
          <h2 className="font-semibold text-gray-900">My Account</h2>
        </div>
        <div className="px-6 py-4 space-y-3">
          <DetailRow label="Name" value={currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : '—'} />
          <DetailRow label="Username" value={currentUser?.username || '—'} />
          <DetailRow label="Email" value={currentUser?.email || '—'} />
          <DetailRow label="Role" value={formatRole(currentUser?.role)} />
        </div>
        <div className="px-6 pb-4">
          {pwSuccess && (
            <div className="mb-3 bg-green-50 border border-green-200 text-green-700 p-3 rounded-lg text-sm">
              Password changed successfully
            </div>
          )}
          {!showChangePassword ? (
            <button
              onClick={() => setShowChangePassword(true)}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium transition-colors"
            >
              <KeyRound className="w-4 h-4" />
              Change Password
            </button>
          ) : (
            <form onSubmit={handleChangePassword} className="space-y-3 pt-2 border-t">
              {pwError && (
                <p className="text-red-600 text-sm">{pwError}</p>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  required
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
                  style={{ '--tw-ring-color': '#ea580c' } as React.CSSProperties}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  required
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
                  style={{ '--tw-ring-color': '#ea580c' } as React.CSSProperties}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
                  style={{ '--tw-ring-color': '#ea580c' } as React.CSSProperties}
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => { setShowChangePassword(false); setPwError(null); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); }}
                  className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pwSaving}
                  className="flex-1 py-3 bg-orange-600 text-white rounded-xl text-sm font-semibold hover:bg-orange-700 disabled:opacity-50"
                >
                  {pwSaving ? 'Saving...' : 'Update Password'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Editable section */}
      <div className="bg-white rounded-lg border">
        <div className="px-6 py-4 border-b">
          <h2 className="font-semibold text-gray-900">Company Information</h2>
        </div>
        <form onSubmit={handleSave} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
              style={{ '--tw-ring-color': '#ea580c' } as React.CSSProperties}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contact Email</label>
            <input
              type="email"
              value={contactEmail}
              onChange={e => setContactEmail(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
              style={{ '--tw-ring-color': '#ea580c' } as React.CSSProperties}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white resize-none"
              style={{ '--tw-ring-color': '#ea580c' } as React.CSSProperties}
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 text-sm font-medium transition-colors"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>

      {/* Read-only company info */}
      <div className="bg-white rounded-lg border">
        <div className="px-6 py-4 border-b">
          <h2 className="font-semibold text-gray-900">Account Details</h2>
        </div>
        <div className="px-6 py-4 space-y-3">
          <DetailRow label="Slug" value={company?.slug || '—'} />
          <DetailRow label="Status" value={company?.isActive ? 'Active' : 'Inactive'} />
        </div>
      </div>
    </div>
  );
}


function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-500">{label}</span>
      <span className={`text-sm text-gray-900 ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  );
}
