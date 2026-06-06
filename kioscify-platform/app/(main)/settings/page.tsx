'use client';

import { useEffect, useState } from 'react';
import { formatRole } from '@/lib/utils';
import { api } from '@/lib/api';
import type { MaintenanceStatus } from '@/types';

export default function PlatformSettingsPage() {
  const [user, setUser] = useState<{
    firstName: string;
    lastName: string;
    username: string;
    email: string;
    role: string;
  } | null>(null);

  const [maintenance, setMaintenance] = useState<MaintenanceStatus | null>(null);
  const [maintenanceLoading, setMaintenanceLoading] = useState(true);
  const [togglingKeys, setTogglingKeys] = useState<Set<keyof MaintenanceStatus>>(new Set());

  useEffect(() => {
    const userStr = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
    if (userStr) {
      try {
        setUser(JSON.parse(userStr));
      } catch {
        // ignore
      }
    }

    api.getMaintenanceStatus()
      .then(setMaintenance)
      .catch(() => {}) // fail silently
      .finally(() => setMaintenanceLoading(false));
  }, []);

  async function handleMaintenanceToggle(key: keyof MaintenanceStatus) {
    if (!maintenance || togglingKeys.has(key)) return;
    const prev = maintenance;
    const next = { ...maintenance, [key]: !maintenance[key] };
    setMaintenance(next);
    setTogglingKeys(s => new Set(s).add(key));
    try {
      await api.updateMaintenanceStatus({ [key]: next[key] });
    } catch {
      setMaintenance(prev);
    } finally {
      setTogglingKeys(s => { const n = new Set(s); n.delete(key); return n; });
    }
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Platform account information</p>
      </div>

      <div className="bg-white rounded-lg border">
        <div className="px-6 py-4 border-b">
          <h2 className="font-semibold text-gray-900">Account Details</h2>
        </div>
        {user ? (
          <div className="px-6 py-4 space-y-3">
            <DetailRow label="Name" value={`${user.firstName} ${user.lastName}`} />
            <DetailRow label="Username" value={user.username} />
            <DetailRow label="Email" value={user.email} />
            <DetailRow label="Role" value={formatRole(user.role)} />
          </div>
        ) : (
          <div className="px-6 py-4 text-sm text-gray-400">Loading account details...</div>
        )}
      </div>

      <div className="bg-white rounded-lg border">
        <div className="px-6 py-4 border-b">
          <h2 className="font-semibold text-gray-900">Maintenance Mode</h2>
          <p className="text-xs text-gray-400 mt-0.5">Put a surface under maintenance — all users will see a maintenance page</p>
        </div>
        {maintenanceLoading ? (
          <div className="px-6 py-4 text-sm text-gray-400">Loading...</div>
        ) : maintenance ? (
          <div className="px-6 py-4 space-y-1 divide-y divide-gray-50">
            <MaintenanceToggleRow
              label="Store Portal"
              description="Store web portal"
              enabled={maintenance.storePortalMaintenance}
              disabled={togglingKeys.has('storePortalMaintenance')}
              onToggle={() => handleMaintenanceToggle('storePortalMaintenance')}
            />
            <MaintenanceToggleRow
              label="Company Portal"
              description="Company web portal"
              enabled={maintenance.companyPortalMaintenance}
              disabled={togglingKeys.has('companyPortalMaintenance')}
              onToggle={() => handleMaintenanceToggle('companyPortalMaintenance')}
            />
            <MaintenanceToggleRow
              label="Kioscify Mobile App"
              description="Kioscify Mobile App (store staff)"
              enabled={maintenance.mobileAppMaintenance}
              disabled={togglingKeys.has('mobileAppMaintenance')}
              onToggle={() => handleMaintenanceToggle('mobileAppMaintenance')}
            />
          </div>
        ) : (
          <div className="px-6 py-4 text-sm text-red-400">Failed to load maintenance status</div>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm text-gray-900 font-medium">{value}</span>
    </div>
  );
}

function MaintenanceToggleRow({
  label,
  description,
  enabled,
  disabled,
  onToggle,
}: {
  label: string;
  description: string;
  enabled: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="text-xs text-gray-400">{description}</p>
      </div>
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        className={`w-10 h-6 rounded-full flex items-center px-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          enabled ? 'bg-red-500' : 'bg-gray-200'
        }`}
      >
        <div
          className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${
            enabled ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}
