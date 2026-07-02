'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { X, Shield } from 'lucide-react';
import { PrivilegesGrid } from './PrivilegesGrid';
import { api } from '@/lib/api';
import { getErrorMessage } from '@/lib/utils';
import type { User, CompanyPrivileges } from '@/types';

const DEFAULT_FULL: CompanyPrivileges = {
  brands: 'all',
  analytics: 'all',
  users: 'all',
  settings: 'all',
};

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (updatedUser: User) => void;
  companyId: string;
  user: User;
}

export function EditPrivilegesModal({ open, onClose, onSave, companyId, user }: Props) {
  const [privileges, setPrivileges] = useState<CompanyPrivileges>(
    (user.companyPrivileges as CompanyPrivileges | null) ?? DEFAULT_FULL
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPrivileges((user.companyPrivileges as CompanyPrivileges | null) ?? DEFAULT_FULL);
      setError(null);
    }
  }, [open, user]);

  if (!open) return null;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateCompanyUserPrivileges(companyId, user.id, privileges);
      onSave(updated);
      onClose();
      toast.success('Privileges updated');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr?.response?.data?.message || 'Failed to update privileges');
      toast.error(getErrorMessage(err, 'Failed to update privileges'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black bg-opacity-40" onClick={onClose} />

      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-gray-900">Edit Privileges</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          Editing permissions for{' '}
          <span className="font-medium text-gray-900">
            {user.firstName} {user.lastName}
          </span>
        </p>

        <PrivilegesGrid value={privileges} onChange={setPrivileges} disabled={saving} />

        {error && (
          <p className="mt-3 text-sm text-red-600">{error}</p>
        )}

        <div className="flex justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 font-medium"
          >
            {saving ? 'Saving...' : 'Save Privileges'}
          </button>
        </div>
      </div>
    </div>
  );
}
