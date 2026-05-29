'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { useTenant } from '@/contexts/TenantContext';
import type { User, StoreUserCreatePayload } from '@/types';
import { UserPlus, Eye, EyeOff, UserCheck, UserX, Search, Link } from 'lucide-react';

export default function UsersPage() {
  const { tenant } = useTenant();
  const [activeTab, setActiveTab] = useState<'store' | 'assign'>('store');
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
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

  // Assign existing user state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [assignLoading, setAssignLoading] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);

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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant?.id) return;
    setFormLoading(true);
    setError(null);
    try {
      const result = await api.createStoreUser(tenant.id, form);
      setCreatedPassword(result.temporaryPassword);
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

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    try {
      const results = await api.searchUsersInCompany(searchQuery);
      setSearchResults(results);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setSearchLoading(false);
    }
  }, [searchQuery]);

  const handleAssign = async (username: string) => {
    if (!tenant?.id) return;
    setAssignLoading(username);
    setAssignError(null);
    try {
      await api.assignUserToStore(tenant.id, { username, role: 'STORE_ADMIN' });
      setSearchResults((prev) => prev.filter((u) => u.username !== username));
      await fetchUsers();
    } catch (err: any) {
      setAssignError(err?.response?.data?.message || 'Failed to assign user');
    } finally {
      setAssignLoading(null);
    }
  };

  const roleLabel = (role: string) => {
    switch (role) {
      case 'STORE_ADMIN': case 'ADMIN': return 'Store Admin';
      case 'CASHIER': return 'Cashier';
      default: return role;
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Store Users</h1>
          <p className="text-sm text-gray-500 mt-1">Manage staff accounts for this store</p>
        </div>
        {activeTab === 'store' && (
          <button
            onClick={() => setShowCreateForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
          >
            <UserPlus className="h-4 w-4" />
            Add User
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        <button
          onClick={() => setActiveTab('store')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${activeTab === 'store' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          Store Users
        </button>
        <button
          onClick={() => setActiveTab('assign')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${activeTab === 'assign' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          Assign Existing User
        </button>
      </div>

      {/* New password display */}
      {createdPassword && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="font-semibold text-green-800 mb-1">User created successfully!</p>
          <p className="text-sm text-green-700 mb-2">
            Share this temporary password via a secure channel. The user must change it on first login.
          </p>
          <div className="flex items-center gap-2">
            <code className="bg-white border border-green-300 px-3 py-1 rounded text-sm font-mono">
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

      {/* Create form */}
      {showCreateForm && (
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
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="CASHIER">Cashier</option>
                <option value="STORE_ADMIN">Store Admin</option>
              </select>
            </div>
            <div className="col-span-2 flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={formLoading}
                className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
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
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Username</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.map((user) => (
                <tr key={user.id} className={!user.isActive ? 'opacity-50' : ''}>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {user.firstName} {user.lastName}
                  </td>
                  <td className="px-6 py-4 text-sm font-mono text-gray-700">{user.username}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{user.email}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      ['STORE_ADMIN', 'ADMIN'].includes(user.role)
                        ? 'bg-indigo-100 text-indigo-700'
                        : 'bg-gray-100 text-gray-700'
                    }`}>
                      {roleLabel(user.role)}
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
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleToggleActive(user)}
                      title={user.isActive ? 'Deactivate' : 'Activate'}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      {user.isActive ? (
                        <UserX className="h-4 w-4" />
                      ) : (
                        <UserCheck className="h-4 w-4" />
                      )}
                    </button>
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
      )}

      {/* Assign Existing User Tab */}
      {activeTab === 'assign' && (
        <div>
          <p className="text-sm text-gray-600 mb-4">
            Search for an existing user within your company and grant them access to this store.
            Only Platform Admins and Company Admins can use this feature.
          </p>

          {assignError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              {assignError}
            </div>
          )}

          <div className="flex gap-2 mb-4">
            <input
              type="text"
              placeholder="Search by username, email, or name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              onClick={handleSearch}
              disabled={searchLoading}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm disabled:opacity-50 flex items-center gap-2"
            >
              <Search className="h-4 w-4" />
              {searchLoading ? 'Searching...' : 'Search'}
            </button>
          </div>

          {searchResults.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Current Stores</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {searchResults.map((user) => (
                    <tr key={user.id}>
                      <td className="px-6 py-4">
                        <p className="text-sm font-medium text-gray-900">{user.firstName} {user.lastName}</p>
                        <p className="text-xs text-gray-500">@{user.username} · {user.email}</p>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {(user as any).storeAccess?.map((a: any) => a.tenant?.name).join(', ') || '—'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleAssign(user.username)}
                          disabled={assignLoading === user.username}
                          className="flex items-center gap-1 ml-auto px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-xs disabled:opacity-50"
                        >
                          <Link className="h-3 w-3" />
                          {assignLoading === user.username ? 'Assigning...' : 'Assign'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {searchResults.length === 0 && searchQuery && !searchLoading && (
            <p className="text-center text-gray-500 py-8 text-sm">No users found matching "{searchQuery}"</p>
          )}
        </div>
      )}
    </div>
  );
}
