'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useTenant } from '@/contexts/TenantContext';

export default function HomePage() {
  const router = useRouter();
  const { tenant, loading: tenantLoading } = useTenant();

  useEffect(() => {
    console.log('🔍 Root page - tenantLoading:', tenantLoading, 'tenant:', tenant?.name);

    if (tenantLoading) {
      console.log('⏳ Waiting for tenant to load...');
      return;
    }

    // Check if tenant is configured
    if (!tenant) {
      console.log('❌ No tenant found, redirecting to tenant-setup');
      router.push('/tenant-setup');
      return;
    }

    // Check if user is authenticated
    const token = api.getToken();
    console.log('🔐 Auth token exists:', !!token);

    if (token) {
      console.log('✅ User authenticated, redirecting to dashboard');
      router.push('/dashboard');
    } else {
      console.log('🔑 No auth token, redirecting to login');
      router.push('/login');
    }
  }, [router, tenant, tenantLoading]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Loading...</p>
      </div>
    </div>
  );
}
