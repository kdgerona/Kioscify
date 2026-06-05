'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useTenant } from '@/contexts/TenantContext';
import { Store, ChevronRight } from 'lucide-react';
import { getContrastColor, resolveLogoUrl } from '@/lib/utils';

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
      api.setToken(result.accessToken);

      const userStr = localStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        user.tenantId = store.id;
        user.brandId = store.brandId;
        user.companyId = store.companyId;
        localStorage.setItem('user', JSON.stringify(user));
      }

      await fetchTenantBySlug(store.slug);
      sessionStorage.removeItem('accessible_stores');
      router.replace('/dashboard');
    } catch (err) {
      console.error('Store switch failed:', err);
      setSwitching(null);
    }
  };

  const brand = stores[0]?.brand ?? null;
  const primaryColor = brand?.themeColors?.primary ?? '#ea580c';
  const panelText  = getContrastColor(primaryColor);
  const panelMuted = panelText === '#ffffff' ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.55)';
  const panelPillBg = panelText === '#ffffff' ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.08)';
  const ringColor  = panelText === '#ffffff' ? 'white' : '#111827';

  const logoSrc = resolveLogoUrl(brand?.logoUrl ?? stores[0]?.company?.logoUrl);

  if (stores.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2" style={{ borderBottomColor: primaryColor }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      {/* Left panel — brand identity */}
      <div
        className="hidden lg:flex lg:w-5/12 xl:w-1/2 relative flex-col items-center justify-center p-12 overflow-hidden"
        style={{ backgroundColor: primaryColor }}
      >
        {/* Decorative rings */}
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full border-[40px] opacity-10" style={{ borderColor: ringColor }} />
        <div className="absolute -bottom-32 -right-32 w-[28rem] h-[28rem] rounded-full border-[50px] opacity-10" style={{ borderColor: ringColor }} />
        <div className="absolute top-1/2 -right-16 w-64 h-64 rounded-full border-[30px] opacity-[0.07]" style={{ borderColor: ringColor }} />
        <div className="absolute bottom-24 left-8 w-32 h-32 rounded-full opacity-10" style={{ backgroundColor: ringColor }} />

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center text-center">
          {logoSrc ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={logoSrc}
              alt={brand!.name}
              className="w-28 h-28 object-contain rounded-2xl mb-6 shadow-lg bg-white p-3"
            />
          ) : (
            <div className="w-28 h-28 rounded-2xl flex items-center justify-center mb-6 shadow-lg bg-white">
              <Store className="w-14 h-14" style={{ color: primaryColor }} />
            </div>
          )}

          <h1 className="text-3xl font-bold mb-2 drop-shadow" style={{ color: panelText }}>
            {brand?.name ?? 'Store Portal'}
          </h1>
          <p className="text-sm max-w-xs leading-relaxed" style={{ color: panelMuted }}>
            Choose a store to manage below.
          </p>

          <div className="flex flex-wrap justify-center gap-2 mt-8">
            {['Sales', 'Inventory', 'Reports', 'Expenses'].map((f) => (
              <span
                key={f}
                className="text-xs font-medium px-3 py-1 rounded-full"
                style={{ background: panelPillBg, color: panelText }}
              >
                {f}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — store list */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-10 bg-white">
        {/* Mobile brand header */}
        <div className="lg:hidden flex flex-col items-center mb-8">
          {logoSrc ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={logoSrc} alt={brand!.name} className="w-16 h-16 object-contain rounded-xl mb-3" />
          ) : (
            <div className="w-16 h-16 rounded-xl flex items-center justify-center mb-3" style={{ backgroundColor: primaryColor }}>
              <Store className="w-8 h-8 text-white" />
            </div>
          )}
          <h1 className="text-xl font-bold text-gray-900">{brand?.name ?? 'Store Portal'}</h1>
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Select a Store</h2>
            <p className="text-gray-500 text-sm mt-1">
              You manage {stores.length} store{stores.length !== 1 ? 's' : ''}. Choose which one to open.
            </p>
          </div>

          <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden">
            {stores.map((store) => {
              const storeColor = store.brand?.themeColors?.primary ?? primaryColor;
              const storeLogoSrc = resolveLogoUrl(store.brand?.logoUrl ?? store.company?.logoUrl);
              const isLoading = switching === store.id;

              return (
                <button
                  key={store.id}
                  onClick={() => handleSelectStore(store)}
                  disabled={!!switching}
                  className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none transition disabled:opacity-60 text-left"
                >
                  {/* Accent bar */}
                  <div className="self-stretch w-[3px] rounded-full flex-shrink-0" style={{ backgroundColor: storeColor }} />

                  {storeLogoSrc ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={storeLogoSrc} alt={store.brand?.name ? `${store.name} – ${store.brand.name}` : store.name} className="w-12 h-12 rounded-2xl object-cover flex-shrink-0" />
                  ) : (
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                      style={{ backgroundColor: storeColor }}
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
                      <div
                        className="w-5 h-5 border-2 rounded-full animate-spin"
                        style={{ borderColor: storeColor, borderTopColor: 'transparent' }}
                      />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-center gap-2 mt-10 bg-white border border-gray-200 rounded-full px-3 py-1.5 w-fit mx-auto">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-full.png" alt="Kioscify" className="w-5 h-5 object-contain" />
            <p className="text-xs text-gray-400">
              Powered by <span className="font-semibold text-gray-500">Kioscify</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
