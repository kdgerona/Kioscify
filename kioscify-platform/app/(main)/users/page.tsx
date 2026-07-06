'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { getErrorMessage } from '@/lib/utils';
import type { User } from '@/types';
import { Plus, KeyRound, Trash2, Copy, Check, UserX, UserCheck } from 'lucide-react';

function TempPasswordModal({
  password,
  onClose,
}: {
  password: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable — do nothing, password still visible
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Temporary Password</h3>
        <p className="text-sm text-amber-600 mb-4">
          This password will not be shown again. Share it via a secure channel.
        </p>
        <div className="flex items-center gap-2 bg-gray-50 border rounded-md px-3 py-2 mb-4">
          <code className="flex-1 text-sm font-mono text-gray-900 break-all">{password}</code>
          <button
            onClick={handleCopy}
            className="text-gray-500 hover:text-gray-900 transition-colors"
          >
            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
        <button
          onClick={onClose}
          className="w-full bg-indigo-600 text-white py-2 rounded-md text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function CreateAdminModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (password: string) => void;
}) {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', username: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await api.createPlatformAdmin(form);
      onCreated(result.temporaryPassword);
      toast.success('Platform admin created');
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const message = status === 409 ? 'Username or email already exists.' : 'Failed to create admin. Please try again.';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Add Platform Admin</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">First Name</label>
              <input
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={form.firstName}
                onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Last Name</label>
              <input
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={form.lastName}
                onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Username</label>
            <input
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={form.username}
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
              required
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border rounded-md py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-indigo-600 text-white rounded-md py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Creating...' : 'Create Admin'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ConfirmDialog({
  message,
  confirmLabel,
  confirmClass,
  onConfirm,
  onCancel,
}: {
  message: string;
  confirmLabel: string;
  confirmClass: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm">
        <p className="text-sm text-gray-700 mb-6">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 border rounded-md py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 rounded-md py-2 text-sm font-medium text-white transition-colors ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function UsersPage() {
  const [admins, setAdmins] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<User | null>(null);
  const [confirmReset, setConfirmReset] = useState<User | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    const userStr = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
    if (userStr) {
      try {
        setCurrentUserId(JSON.parse(userStr).id);
      } catch { /* ignore */ }
    }

    api.getPlatformAdmins()
      .then(setAdmins)
      .catch(() => setActionError('Failed to load admins. Please refresh.'))
      .finally(() => setLoading(false));
  }, []);

  function refreshAdmins() {
    return api.getPlatformAdmins().then(setAdmins);
  }

  async function handleToggleActive(admin: User) {
    setTogglingId(admin.id);
    try {
      const updated = await api.updatePlatformAdmin(admin.id, { isActive: !admin.isActive });
      setAdmins(prev => prev.map(a => (a.id === updated.id ? { ...a, isActive: updated.isActive } : a)));
      toast.success(updated.isActive ? 'Admin enabled' : 'Admin disabled');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update status.'));
    } finally {
      setTogglingId(null);
    }
  }

  async function handleResetPassword(admin: User) {
    setConfirmReset(null);
    try {
      const result = await api.resetPlatformAdminPassword(admin.id);
      setTempPassword(result.temporaryPassword);
      toast.success('Password reset');
      refreshAdmins().catch(() => {});
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to reset password.'));
    }
  }

  async function handleDelete(admin: User) {
    setConfirmDelete(null);
    try {
      await api.deletePlatformAdmin(admin.id);
      setAdmins(prev => prev.filter(a => a.id !== admin.id));
      toast.success('Admin deleted');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to delete admin.'));
    }
  }

  function handleCreated(password: string) {
    setShowCreate(false);
    setTempPassword(password);
    refreshAdmins().catch(() => {});
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-sm text-gray-500 mt-1">Manage platform admin accounts</p>
        </div>
        <button
          onClick={() => { setActionError(''); setShowCreate(true); }}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Admin
        </button>
      </div>

      {actionError && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-4 py-3">
          {actionError}
        </div>
      )}

      <div className="bg-white rounded-lg border overflow-x-auto">
        {loading ? (
          <div className="px-6 py-8 text-center text-sm text-gray-400">Loading...</div>
        ) : admins.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-gray-400">No platform admins found.</div>
        ) : (
          <table className="w-full min-w-[800px] text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Username</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {admins.map(admin => {
                const isSelf = admin.id === currentUserId;
                return (
                  <tr key={admin.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {admin.firstName} {admin.lastName}
                      {isSelf && (
                        <span className="ml-2 text-xs text-indigo-500 font-normal">(you)</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-600">{admin.username}</td>
                    <td className="px-6 py-4 text-gray-600">{admin.email}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        admin.isActive
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}>
                        {admin.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-500">
                      {new Date(admin.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 justify-end">
                        {!isSelf && !admin.isActive && (
                          <button
                            onClick={() => handleToggleActive(admin)}
                            disabled={togglingId === admin.id}
                            title="Enable account"
                            aria-label="Enable account"
                            className="p-1.5 text-gray-400 hover:text-green-600 rounded transition-colors disabled:opacity-50"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {!isSelf && admin.isActive && (
                          <button
                            onClick={() => handleToggleActive(admin)}
                            disabled={togglingId === admin.id}
                            title="Disable account"
                            aria-label="Disable account"
                            className="p-1.5 text-gray-400 hover:text-gray-600 rounded transition-colors disabled:opacity-50"
                          >
                            <UserX className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => setConfirmReset(admin)}
                          title="Reset password"
                          className="flex items-center gap-1 text-xs text-gray-500 hover:text-amber-600 border border-gray-200 hover:border-amber-300 rounded px-2.5 py-1.5 transition-colors"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          Reset Password
                        </button>
                        {!isSelf && !admin.isActive && (
                          <button
                            onClick={() => setConfirmDelete(admin)}
                            title="Delete admin"
                            aria-label="Delete admin"
                            className="p-1.5 text-gray-400 hover:text-red-600 rounded transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && (
        <CreateAdminModal
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}

      {tempPassword && (
        <TempPasswordModal
          password={tempPassword}
          onClose={() => setTempPassword(null)}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          message={`Delete ${confirmDelete.firstName} ${confirmDelete.lastName} (${confirmDelete.username})? This cannot be undone.`}
          confirmLabel="Delete"
          confirmClass="bg-red-600 hover:bg-red-700"
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {confirmReset && (
        <ConfirmDialog
          message={`Reset password for ${confirmReset.firstName} ${confirmReset.lastName}? They will be required to change it on next login.`}
          confirmLabel="Reset Password"
          confirmClass="bg-indigo-600 hover:bg-indigo-700"
          onConfirm={() => handleResetPassword(confirmReset)}
          onCancel={() => setConfirmReset(null)}
        />
      )}
    </div>
  );
}
