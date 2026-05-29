'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useTenant } from '@/contexts/TenantContext';
import { Store, ChevronRight } from 'lucide-react';

interface StoreOption {
  id: string;
  name: string;
  slug: string;
  brandId?: string;
  companyId?: string;
  brand?: { name: string; logoUrl?: string; themeColors?: { primary: string } } | null;
  company?: { name: string; logoUrl?: string } | null;
}

export default function StorePickerPage() {
  const router = useRouter();
  const { fetchTenantBySlug } = useTenant();
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [switching, setSwitching] = useState<string | null>(null);

  useEffect(() => {
    // Stores passed from login response — stored in sessionStorage for this screen
    const raw = typeof window !== 'undefined' ? sessionStorage.getItem('accessible_stores') : null;
    if (!raw) {
      router.replace('/login');
      return;
    }
    setStores(JSON.parse(raw));
  }, [router]);

  const handleSelectStore = async (store: StoreOption) => {
    setSwitching(store.id);
    try {
      const result = await api.switchStore(store.id);
      // Update token with new store context
      api.setToken(result.accessToken);

      // Update user in localStorage
      const userStr = localStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        user.tenantId = store.id;
        user.brandId = store.brandId;
        user.companyId = store.companyId;
        localStorage.setItem('user', JSON.stringify(user));
      }

      // Fetch tenant data for the selected store to update context
      await fetchTenantBySlug(store.slug);

      // Clear the session storage
      sessionStorage.removeItem('accessible_stores');

      router.replace('/dashboard');
    } catch (err) {
      console.error('Store switch failed:', err);
      setSwitching(null);
    }
  };

  if (stores.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-md overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100">
          <h1 className="text-xl font-bold text-gray-900">Select a Store</h1>
          <p className="text-sm text-gray-500 mt-1">
            You manage {stores.length} stores. Choose which one to open.
          </p>
        </div>

        <ul className="divide-y divide-gray-100">
          {stores.map((store) => {
            const primaryColor = store.brand?.themeColors?.primary ?? '#4f46e5';
            const logoUrl = store.company?.logoUrl ?? store.brand?.logoUrl;
            const isLoading = switching === store.id;

            return (
              <li key={store.id}>
                <button
                  onClick={() => handleSelectStore(store)}
                  disabled={!!switching}
                  className="w-full flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition disabled:opacity-60 text-left"
                >
                  {logoUrl ? (
                    <img src={logoUrl} alt={store.brand?.name ?? store.name} className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                      style={{ backgroundColor: primaryColor }}
                    >
                      {store.name.charAt(0).toUpperCase()}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{store.name}</p>
                    {store.brand && (
                      <p className="text-xs text-gray-500 truncate">{store.brand.name}</p>
                    )}
                  </div>

                  <div className="flex-shrink-0">
                    {isLoading ? (
                      <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
          <p className="text-xs text-gray-400 text-center">Powered by Kioscify</p>
        </div>
      </div>
    </div>
  );
}
