'use client';

import { useState, useEffect } from 'react';
import { X, Search, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import type { AssignableUser } from '@/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  storeId: string;
  primaryColor: string;
  onAssigned: () => void;
}

export default function AssignUserModal({ isOpen, onClose, storeId, primaryColor, onAssigned }: Props) {
  const [allUsers, setAllUsers] = useState<AssignableUser[]>([]);
  const [filter, setFilter] = useState('');
  const [selectedUser, setSelectedUser] = useState<AssignableUser | null>(null);
  const [selectedRole, setSelectedRole] = useState<'CASHIER' | 'STORE_ADMIN'>('CASHIER');
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const loadUsers = async () => {
    setLoadingUsers(true);
    setLoadError(false);
    try {
      const data = await api.getAssignablePool(storeId);
      setAllUsers(data);
    } catch {
      setLoadError(true);
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      setAllUsers([]);
      setFilter('');
      setSelectedUser(null);
      setSelectedRole('CASHIER');
      setSubmitError(null);
      setLoadError(false);
      return;
    }
    loadUsers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const filteredUsers = allUsers.filter(u => {
    if (!filter.trim()) return true;
    const q = filter.toLowerCase();
    return (
      u.username.toLowerCase().includes(q) ||
      (u.firstName ?? '').toLowerCase().includes(q) ||
      (u.lastName ?? '').toLowerCase().includes(q)
    );
  });

  const handleConfirm = async () => {
    if (!selectedUser) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await api.assignUserToStore(storeId, { username: selectedUser.username, role: selectedRole });
      onAssigned();
      onClose();
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { message?: string } } };
      setSubmitError(apiErr?.response?.data?.message || 'Failed to assign user');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const displayName = (u: AssignableUser) =>
    u.firstName || u.lastName ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() : u.username;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Assign Existing User</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {submitError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {submitError}
          </div>
        )}

        {selectedUser ? (
          <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">{displayName(selectedUser)}</p>
              <p className="text-xs font-mono text-gray-500">{selectedUser.username}</p>
            </div>
            <button onClick={() => setSelectedUser(null)} className="text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="mb-4">
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Filter by name or username..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                disabled={loadingUsers || loadError}
              />
            </div>

            {loadingUsers && (
              <p className="text-xs text-gray-400 text-center py-4">Loading users...</p>
            )}

            {loadError && (
              <div className="text-center py-4">
                <p className="text-xs text-red-500 mb-2">Failed to load users</p>
                <button
                  onClick={loadUsers}
                  className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline"
                >
                  <RefreshCw className="h-3 w-3" />
                  Try again
                </button>
              </div>
            )}

            {!loadingUsers && !loadError && (
              <>
                {filteredUsers.length > 0 ? (
                  <ul className="border border-gray-200 rounded-md divide-y divide-gray-100 max-h-52 overflow-y-auto">
                    {filteredUsers.map((u) => (
                      <li
                        key={u.id}
                        onClick={() => setSelectedUser(u)}
                        className="px-3 py-2 hover:bg-gray-50 cursor-pointer"
                      >
                        <p className="text-sm font-medium text-gray-900">{displayName(u)}</p>
                        <p className="text-xs text-gray-500">
                          <span className="font-mono">{u.username}</span>
                          {' · '}
                          {u.brandName && <span>{u.brandName} · </span>}
                          <span>{u.primaryStore?.name ?? '—'}</span>
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-gray-400 text-center py-4">
                    {filter.trim()
                      ? 'No users match your filter'
                      : 'No assignable users available'}
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {selectedUser && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">Role in this store</label>
            <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as 'CASHIER' | 'STORE_ADMIN')}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CASHIER">Cashier</SelectItem>
                <SelectItem value="STORE_ADMIN">Store Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedUser || submitting}
            className="px-4 py-2 text-sm text-black rounded-lg hover:opacity-90 transition disabled:opacity-50"
            style={{ backgroundColor: primaryColor }}
          >
            {submitting ? 'Assigning...' : 'Assign User'}
          </button>
        </div>
      </div>
    </div>
  );
}
