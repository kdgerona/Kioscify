'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { User, Company } from '@/types';
import { Plus, X, Copy, KeyRound, Trash2, UserCheck, UserX } from 'lucide-react';
import { toast } from 'sonner';

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [newPassword, setNewPassword] = useState<string | null>(null);

  // Form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const currentUser = typeof window !== 'undefined'
    ? (() => { try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; } })()
    : null;

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const companyData = await api.getMyCompany();
      setCompany(companyData);
      const usersData = await api.getCompanyUsers(companyData.id);
      setUsers(usersData);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr?.response?.data?.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormLoading(true);
    try {
      const result = await api.createCompanyUser(company!.id, {
        firstName,
        lastName,
        email,
        username,
      });
      setUsers(prev => [...prev, result.user]);
      setNewPassword(result.temporaryPassword);
      setFirstName('');
      setLastName('');
      setEmail('');
      setUsername('');
      setShowForm(false);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setFormError(axiosErr?.response?.data?.message || 'Failed to create user');
    } finally {
      setFormLoading(false);
    }
  };

  const handleToggleActive = async (user: User) => {
    if (!company) return;
    try {
      await api.updateCompanyUser(company.id, user.id, { isActive: !user.isActive });
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, isActive: !user.isActive } : u));
    } catch {
      toast.error('Failed to update user. Please try again.');
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const el = document.createElement('textarea');
      el.value = text;
      el.setAttribute('readonly', '');
      el.style.cssText = 'position:absolute;left:-9999px';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    toast.success('Password copied to clipboard!');
  };

  const handleRemoveUser = async (user: User) => {
    if (!company) return;
    try {
      await api.deactivateCompanyUser(company.id, user.id);
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, isActive: false } : u));
    } catch {
      toast.error('Failed to remove user. Please try again.');
    }
  };

  const handleResetPassword = async (user: User) => {
    if (!company) return;
    try {
      const result = await api.resetCompanyUserPassword(company.id, user.id);
      setNewPassword(result.temporaryPassword);
    } catch {
      // silent
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderBottomColor: 'var(--company-primary, #ea580c)' }} />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-sm text-gray-500 mt-1">Company admin accounts</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 text-white rounded-lg hover:brightness-90 text-sm font-medium transition-colors"
          style={{ backgroundColor: 'var(--company-primary, #ea580c)' }}
        >
          <Plus className="w-4 h-4" />
          New User
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* New password banner */}
      {newPassword && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-green-800 font-medium text-sm">User created successfully</p>
            <button onClick={() => setNewPassword(null)} className="text-green-600 hover:text-green-800">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-green-700 text-sm mb-2">Temporary password (share with the user):</p>
          <div className="flex items-center gap-2 bg-white rounded border border-green-200 px-3 py-2">
            <code className="text-sm font-mono flex-1">{newPassword}</code>
            <button
              onClick={() => copyToClipboard(newPassword!)}
              className="text-green-600 hover:text-green-800 flex items-center gap-1 text-xs"
            >
              <Copy className="w-3.5 h-3.5" />
              Copy
            </button>
          </div>
        </div>
      )}

      {/* Create form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="font-semibold text-gray-900">New Company User</h2>
              <button onClick={() => { setShowForm(false); setFormError(null); }} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              {formError && (
                <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                  {formError}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                  <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} required
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
                    style={{ '--tw-ring-color': 'var(--company-primary, #ea580c)' } as React.CSSProperties} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                  <input type="text" value={lastName} onChange={e => setLastName(e.target.value)} required
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
                    style={{ '--tw-ring-color': 'var(--company-primary, #ea580c)' } as React.CSSProperties} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
                  style={{ '--tw-ring-color': 'var(--company-primary, #ea580c)' } as React.CSSProperties} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                <input type="text" value={username} onChange={e => setUsername(e.target.value)} required
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
                  style={{ '--tw-ring-color': 'var(--company-primary, #ea580c)' } as React.CSSProperties} />
              </div>
              <p className="text-xs text-gray-400">Role will be set to COMPANY_ADMIN. A temporary password will be generated.</p>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowForm(false); setFormError(null); }}
                  className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={formLoading}
                  className="flex-1 py-2 text-white rounded-lg text-sm font-medium hover:brightness-90 disabled:opacity-50"
                  style={{ backgroundColor: 'var(--company-primary, #ea580c)' }}>
                  {formLoading ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Users list */}
      <div className="bg-white rounded-lg border">
        {users.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">No users yet</div>
        ) : (
          <div className="divide-y">
            {users.map(user => (
              <div key={user.id} className="p-5 flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900 text-sm">
                    {user.firstName} {user.lastName}
                  </p>
                  <p className="text-xs text-gray-400">{user.username} · {user.email}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${user.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {user.isActive ? 'Active' : 'Inactive'}
                  </span>
                  {user.isFirstLogin && (
                    <span className="text-xs px-2 py-1 rounded-full font-medium bg-amber-50 text-amber-700">
                      Pending login
                    </span>
                  )}
                  {currentUser?.id !== user.id && (
                    <div className="flex items-center gap-2">
                      {!user.isActive ? (
                        <button
                          onClick={() => handleToggleActive(user)}
                          title="Enable account"
                          className="p-1.5 text-gray-400 hover:text-gray-600 rounded"
                        >
                          <UserCheck className="w-4 h-4" />
                        </button>
                      ) : (
                        <>
                          {user.isFirstLogin && (
                            <button
                              onClick={() => handleRemoveUser(user)}
                              title="Remove pending user"
                              className="p-1.5 text-gray-400 hover:text-red-500 rounded"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                          {!user.isFirstLogin && (
                            <button
                              onClick={() => handleToggleActive(user)}
                              title="Disable account"
                              className="p-1.5 text-gray-400 hover:text-gray-600 rounded"
                            >
                              <UserX className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => handleResetPassword(user)}
                            title="Reset password"
                            className="p-1.5 text-gray-400 hover:text-amber-500 rounded"
                          >
                            <KeyRound className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
