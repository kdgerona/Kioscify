'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { api } from '@/lib/api';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = api.getToken();
    if (!token) {
      router.push('/login');
      return;
    }

    const userStr = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
    if (userStr) {
      const user = JSON.parse(userStr);

      // Allow STORE_ADMIN and legacy ADMIN roles
      const allowedRoles = ['STORE_ADMIN', 'ADMIN'];
      if (!allowedRoles.includes(user.role)) {
        api.logout();
        return;
      }

      // Redirect to change-password if first login
      if (user.mustChangePassword || user.isFirstLogin) {
        router.push('/change-password');
        return;
      }
    }

    setLoading(false);
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto" />
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar />
      <main className="flex-1 overflow-auto w-full">
        <div className="pt-16 lg:pt-0">{children}</div>
      </main>
    </div>
  );
}
