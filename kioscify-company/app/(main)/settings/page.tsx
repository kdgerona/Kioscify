'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { hasPrivilege } from '@/lib/privileges';
import { formatRole, getErrorMessage } from '@/lib/utils';
import { useCompany } from '@/contexts/CompanyContext';
import type { Company, ThemeColors, User } from '@/types';
import { Save, KeyRound } from 'lucide-react';

export default function SettingsPage() {
  const canEdit = hasPrivilege('settings', 'write');

  const { refetchCompany } = useCompany();
  const [company, setCompany] = useState<Company | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editable fields
  const [name, setName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [description, setDescription] = useState('');

  // Branding colors
  const [theme, setTheme] = useState<ThemeColors>({});
  const [themeHex, setThemeHex] = useState<Record<string, string>>({});
  const [themeSaving, setThemeSaving] = useState(false);

  const primaryColor = company?.themeColors?.primary ?? '#ea580c';

  // Change password
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  const canViewCompany = hasPrivilege('settings', 'read');

  useEffect(() => {
    setCurrentUser(api.getCurrentUser());
    if (!canViewCompany) {
      setLoading(false);
      return;
    }
    api
      .getMyCompany()
      .then(data => {
        setCompany(data);
        setName(data.name);
        setContactEmail(data.contactEmail || '');
        setDescription(data.description || '');
        const tc = data.themeColors || {};
        setTheme(tc);
        setThemeHex({ ...tc });
      })
      .catch(() => setError('Failed to load company settings'))
      .finally(() => setLoading(false));
  }, [canViewCompany]);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters');
      return;
    }
    setPwSaving(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowChangePassword(false);
      toast.success('Password changed successfully');
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Failed to change password'));
    } finally {
      setPwSaving(false);
    }
  };

  const handleSaveTheme = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company) return;
    setThemeSaving(true);
    try {
      const updated = await api.updateCompany(company.id, { themeColors: theme });
      setCompany(updated);
      await refetchCompany();
      toast.success('Branding colors saved');
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Failed to save branding'));
    } finally {
      setThemeSaving(false);
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
      toast.success('Settings saved successfully');
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Failed to save settings'));
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
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  required
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
                  style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
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
                  style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
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
                  style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => { setShowChangePassword(false); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); }}
                  className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pwSaving}
                  className="flex-1 py-3 text-white rounded-xl text-sm font-semibold disabled:opacity-50"
                  style={{ backgroundColor: primaryColor }}
                >
                  {pwSaving ? 'Saving...' : 'Update Password'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Editable section — only for users with at least read on settings */}
      {canViewCompany && <div className="bg-white rounded-lg border">
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
              style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contact Email</label>
            <input
              type="email"
              value={contactEmail}
              onChange={e => setContactEmail(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
              style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white resize-none"
              style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
            />
          </div>
          {canEdit && (
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 text-white rounded-lg disabled:opacity-50 text-sm font-medium transition-colors"
              style={{ backgroundColor: primaryColor }}
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          )}
        </form>
      </div>}

      {canViewCompany && <div className="bg-white rounded-lg border">
        <div className="px-6 py-4 border-b">
          <h2 className="font-semibold text-gray-900">Account Details</h2>
        </div>
        <div className="px-6 py-4 space-y-3">
          <DetailRow label="Slug" value={company?.slug || '—'} />
          <DetailRow label="Status" value={company?.isActive ? 'Active' : 'Inactive'} />
        </div>
      </div>}

      {/* Branding colors */}
      {canViewCompany && <div className="bg-white rounded-lg border">
        <div className="px-6 py-4 border-b">
          <h2 className="font-semibold text-gray-900">Branding</h2>
          <p className="text-xs text-gray-400 mt-0.5">Customize your company portal colors</p>
        </div>
        <form onSubmit={handleSaveTheme} className="p-6 space-y-4">
          <div className="grid grid-cols-1 gap-3">
            {(['primary', 'secondary', 'accent', 'background', 'text'] as const).map(key => {
              const defaultColor = key === 'background' ? '#ffffff' : key === 'text' ? '#1f2937' : key === 'secondary' ? '#fb923c' : key === 'accent' ? '#fdba74' : '#ea580c';
              const colorValue = theme[key] || defaultColor;
              const hexValue = themeHex[key] ?? colorValue;
              return (
                <div key={key} className="flex items-center gap-3">
                  <input
                    type="color"
                    value={colorValue}
                    onChange={e => {
                      setTheme(prev => ({ ...prev, [key]: e.target.value }));
                      setThemeHex(prev => ({ ...prev, [key]: e.target.value }));
                    }}
                    className="w-9 h-9 rounded-lg cursor-pointer border border-gray-200 p-0.5 shrink-0"
                  />
                  <input
                    type="text"
                    value={hexValue}
                    onChange={e => {
                      const v = e.target.value;
                      setThemeHex(prev => ({ ...prev, [key]: v }));
                      if (/^#[0-9a-fA-F]{6}$/.test(v)) {
                        setTheme(prev => ({ ...prev, [key]: v }));
                      }
                    }}
                    maxLength={7}
                    placeholder={defaultColor}
                    spellCheck={false}
                    className="w-28 px-3 py-2 text-sm border border-gray-200 rounded-xl font-mono focus:outline-none focus:ring-2 focus:border-transparent"
                    style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                  />
                  <span className="text-sm text-gray-600 capitalize">{key}</span>
                </div>
              );
            })}
          </div>
          {canEdit && (
            <button
              type="submit"
              disabled={themeSaving}
              className="flex items-center gap-2 px-4 py-2 text-white rounded-lg disabled:opacity-50 text-sm font-medium transition-colors"
              style={{ backgroundColor: primaryColor }}
            >
              <Save className="w-4 h-4" />
              {themeSaving ? 'Saving...' : 'Save Branding'}
            </button>
          )}
        </form>
      </div>}
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
