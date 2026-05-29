'use client';

import { useEffect, useState } from 'react';

export default function PlatformSettingsPage() {
  const [user, setUser] = useState<{
    firstName: string;
    lastName: string;
    username: string;
    email: string;
    role: string;
  } | null>(null);

  useEffect(() => {
    const userStr = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
    if (userStr) {
      try {
        setUser(JSON.parse(userStr));
      } catch {
        // ignore
      }
    }
  }, []);

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
            <DetailRow label="Role" value={user.role} />
          </div>
        ) : (
          <div className="px-6 py-4 text-sm text-gray-400">Loading account details...</div>
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
