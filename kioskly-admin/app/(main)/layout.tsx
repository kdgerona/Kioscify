'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { api } from '@/lib/api';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('🏠 Dashboard layout mounted');

    // Check if user is authenticated
    const token = api.getToken();
    console.log('🎫 Dashboard - Token exists:', !!token);

    if (!token) {
      console.log('❌ No token, redirecting to login');
      router.push('/login');
      return;
    }

    // Check if user is admin
    const userStr = localStorage.getItem('user');
    console.log('👤 Dashboard - User data:', userStr ? 'exists' : 'missing');

    if (userStr) {
      const user = JSON.parse(userStr);
      console.log('👤 Dashboard - User role:', user.role);

      if (user.role !== 'ADMIN') {
        console.log('❌ Not an admin, logging out');
        api.logout();
        return;
      }
    }

    console.log('✅ Dashboard auth check passed');
    setLoading(false);
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar />
      <main className="flex-1 overflow-auto w-full">
        <div className="pt-16 lg:pt-0">
          {children}
        </div>
      </main>
    </div>
  );
}
