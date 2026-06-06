'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { useTenant } from '@/contexts/TenantContext';
import { formatRole } from '@/lib/utils';
import type { User, StoreUserCreatePayload } from '@/types';
import { UserPlus, Eye, EyeOff, UserCheck, UserX } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import AssignUserModal from './AssignUserModal';

export default function UsersPage() {
  const { tenant, brand } = useTenant();
  const primaryColor = brand?.themeColors?.primary ?? tenant?.themeColors?.primary ?? '#ea580c';
  const textColor = '#1f2937';
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const currentUser = typeof window !== 'undefined'
    ? (() => { try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; } })()
    : null;
  const isStoreAdmin = currentUser?.role === 'STORE_ADMIN' || currentUser?.role === 'ADMIN';
  const [isMultiStoreAdmin, setIsMultiStoreAdmin] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState<StoreUserCreatePayload>({
    firstName: '',
    lastName: '',
    email: '',
    username: '',
    role: 'CASHIER',
  });
  const [formLoading, setFormLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    if (!tenant?.id) return;
    setLoading(true);
    try {
      const data = await api.getStoreUsers(tenant.id);
      setUsers(data);
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  }, [tenant?.id]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    if (!tenant?.id || !currentUser?.id || !isStoreAdmin) return;
    api.getMyStoreAccess(currentUser.id)
      .then((stores) => setIsMultiStoreAdmin(stores.length >= 1))
      .catch(() => {});
  }, [currentUser?.id, isStoreAdmin, tenant?.id]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant?.id) return;
    setFormLoading(true);
    setError(null);
    try {
      const result = await api.createStoreUser(tenant.id, form);
      setCreatedPassword(result.temporaryPassword);
      setShowPassword(true);
      setShowCreateForm(false);
      setForm({ firstName: '', lastName: '', email: '', username: '', role: 'CASHIER' });
      await fetchUsers();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to create user');
    } finally {
      setFormLoading(false);
    }
  };

  const handleToggleActive = async (user: User) => {
    if (!tenant?.id) return;
    try {
      await api.updateStoreUser(tenant.id, user.id, { isActive: !user.isActive });
      await fetchUsers();
    } catch (err) {
      console.error('Failed to update user:', err);
    }
  };

  const handleRevokeAccess = async (user: User) => {
    if (!tenant?.id) return;
    try {
      await api.revokeStoreAccess(tenant.id, user.id);
      await fetchUsers();
    } catch (err) {
      console.error('Failed to revoke access:', err);
    }
  };


  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Store Users</h1>
          <p className="text-sm text-gray-500 mt-1">Manage staff accounts for this store</p>
        </div>
        {isStoreAdmin && (
          <div className="flex items-center gap-3">
            {isStoreAdmin && isMultiStoreAdmin && (
              <button
                onClick={() => setShowAssignModal(true)}
                className="flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50 transition"
                style={{ borderColor: primaryColor, color: primaryColor }}
              >
                <UserCheck className="h-4 w-4" />
                Assign Existing User
              </button>
            )}
            <button
              onClick={() => setShowCreateForm(true)}
              className="flex items-center gap-2 px-4 py-2 text-black rounded-lg text-sm font-medium hover:opacity-90 transition"
              style={{ backgroundColor: primaryColor }}
            >
              <UserPlus className="h-4 w-4" />
              Add User
            </button>
          </div>
        )}
      </div>

      {/* New password display */}
      {createdPassword && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="font-semibold text-green-800 mb-1">User created successfully!</p>
          <p className="text-sm text-green-700 mb-2">
            Share this temporary password via a secure channel. The user must change it on first login.
          </p>
          <div className="flex items-center gap-2">
            <code className="bg-white border border-green-300 px-3 py-1 rounded text-sm font-mono text-gray-900 select-all">
              {showPassword ? createdPassword : '•'.repeat(createdPassword.length)}
            </code>
            <button onClick={() => setShowPassword((v) => !v)} className="text-green-700">
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
            <button
              onClick={() => navigator.clipboard.writeText(createdPassword)}
              className="text-xs text-green-700 underline ml-2"
            >
              Copy
            </button>
          </div>
          <button
            onClick={() => setCreatedPassword(null)}
            className="mt-2 text-xs text-green-600 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Create form — STORE_ADMIN only */}
      {showCreateForm && isStoreAdmin && (
        <div className="mb-6 p-5 bg-white border border-gray-200 rounded-lg shadow-sm">
          <h2 className="font-semibold text-gray-900 mb-4">Add New User</h2>
          {error && (
            <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              {error}
            </div>
          )}
          <form onSubmit={handleCreate} className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
              <input
                type="text"
                required
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
              <input
                type="text"
                required
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
              <input
                type="text"
                required
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <Select
                value={form.role}
                onValueChange={(v) => setForm({ ...form, role: v as any })}
              >
                <SelectTrigger className="w-full" style={{ color: textColor }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent style={{ '--select-hover-bg': `${primaryColor}20`, '--select-hover-text': textColor } as React.CSSProperties}>
                  <SelectItem value="CASHIER">Cashier</SelectItem>
                  <SelectItem value="STORE_ADMIN">Store Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={formLoading}
                className="px-4 py-2 text-sm text-black rounded-lg hover:opacity-90 transition disabled:opacity-50"
                style={{ backgroundColor: primaryColor }}
              >
                {formLoading ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Users table */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading users...</div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Username</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.map((user) => (
                <tr key={user.id} className={!user.isActive ? 'opacity-50' : ''}>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    <div className="flex items-center gap-2">
                      <span>{user.firstName} {user.lastName}</span>
                      {user.isAssigned && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">
                          Assigned
                        </span>
                      )}
                    </div>
                    {user.isAssigned && user.primaryStore && (
                      <p className="text-xs text-gray-400 mt-0.5">from {user.primaryStore.name}</p>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm font-mono text-gray-700">{user.username}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{user.email}</td>
                  <td className="px-6 py-4 text-sm">
                    <span
                      className="inline-block whitespace-nowrap px-2 py-1 rounded-full text-xs font-medium"
                      style={
                        ['STORE_ADMIN', 'ADMIN'].includes(user.isAssigned ? (user.assignedRole ?? user.role) : user.role)
                          ? { backgroundColor: '#e0e7ff', color: '#3730a3' }
                          : { backgroundColor: '#f3f4f6', color: '#374151' }
                      }
                    >
                      {formatRole(user.isAssigned ? (user.assignedRole ?? user.role) : user.role)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {user.isActive ? (
                      <span className="text-green-600 font-medium">Active</span>
                    ) : (
                      <span className="text-red-500 font-medium">Inactive</span>
                    )}
                    {user.isFirstLogin && (
                      <span className="ml-2 text-xs text-amber-600 bg-amber-50 px-1 py-0.5 rounded">
                        Pending login
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {isStoreAdmin && currentUser?.id !== user.id && (
                      user.isAssigned ? (
                        <div className="relative group inline-block">
                          <button
                            onClick={() => handleRevokeAccess(user)}
                            className="text-gray-400 hover:text-red-500"
                          >
                            <UserX className="h-4 w-4" />
                          </button>
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 text-xs text-white bg-gray-800 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                            Remove access
                          </div>
                        </div>
                      ) : (
                        <div className="relative group inline-block">
                          <button
                            onClick={() => handleToggleActive(user)}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            {user.isActive ? (
                              <UserX className="h-4 w-4" />
                            ) : (
                              <UserCheck className="h-4 w-4" />
                            )}
                          </button>
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 text-xs text-white bg-gray-800 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                            {user.isActive ? 'Disable account' : 'Enable account'}
                          </div>
                        </div>
                      )
                    )}
                    {currentUser?.id === user.id && (
                      <span className="text-xs text-gray-400">No action</span>
                    )}
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    No users found. Add the first user above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}

      <AssignUserModal
        isOpen={showAssignModal}
        onClose={() => setShowAssignModal(false)}
        storeId={tenant?.id ?? ''}
        primaryColor={primaryColor}
        onAssigned={fetchUsers}
      />
    </div>
  );
}
