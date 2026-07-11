'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { getErrorMessage } from '@/lib/utils';
import type { Brand, Store, PriceTier, Menu, InventorySetup } from '@/types';
import { Pencil, Trash2, ChevronLeft, Upload, Save, QrCode, Truck, Copy, Plus, X, Power, PowerOff } from 'lucide-react';
import { toast } from 'sonner';
import StoreQRModal from '@/components/StoreQRModal';

type Tab = 'overview' | 'menus' | 'inventory-setups' | 'stores' | 'settings';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'menus', label: 'Menus' },
  { id: 'inventory-setups', label: 'Inventory Setups' },
  { id: 'stores', label: 'Stores' },
  { id: 'settings', label: 'Settings' },
];

// ─── Main Page ────────────────────────────────────────────────────────────

const UPLOAD_MAX_SIZE = 5 * 1024 * 1024;
const UPLOAD_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export default function BrandDetailPage() {
  return (
    <Suspense fallback={null}>
      <BrandDetailPageContent />
    </Suspense>
  );
}

// useSearchParams() (to restore the active tab when navigating back from a
// Menu/InventorySetup workspace) requires a Suspense boundary around the
// component that calls it, per Next.js App Router — see wrapper above.
function BrandDetailPageContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const brandId = params.brandId as string;
  const companyId = params.id as string;

  // PLATFORM_ADMIN always has full access — no company-admin-style privilege gating applies here.
  const canWrite = true;
  const canDelete = true;

  const [brand, setBrand] = useState<Brand | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const tabParam = searchParams.get('tab');
    return TABS.some(t => t.id === tabParam) ? (tabParam as Tab) : 'overview';
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Settings tab state
  const [settingsName, setSettingsName] = useState('');
  const [settingsDescription, setSettingsDescription] = useState('');
  const [settingsTheme, setSettingsTheme] = useState<Brand['themeColors']>({});
  const [settingsThemeHex, setSettingsThemeHex] = useState<Record<string, string>>({});
  const [enableFoodPanda, setEnableFoodPanda] = useState(
    brand?.enabledDeliveryPlatforms?.includes('FOODPANDA') ?? false
  );
  const [enableGrab, setEnableGrab] = useState(
    brand?.enabledDeliveryPlatforms?.includes('GRAB') ?? false
  );
  const [settingsPreferenceLabel, setSettingsPreferenceLabel] = useState('');
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoUploadError, setLogoUploadError] = useState<string | null>(null);

  // Tab data
  const [stores, setStores] = useState<Store[]>([]);
  const [editingStoreId, setEditingStoreId] = useState<string | null>(null);
  const [editingStoreName, setEditingStoreName] = useState('');
  const [deliveryModalStore, setDeliveryModalStore] = useState<Store | null>(null);
  const [deliveryToggles, setDeliveryToggles] = useState<Record<string, boolean>>({});
  const [qrStore, setQrStore] = useState<{
    storeName: string;
    companySlug: string;
    brandSlug: string;
    storeSlug: string;
  } | null>(null);
  const [tabLoading, setTabLoading] = useState(false);

  const [menus, setMenus] = useState<Menu[]>([]);
  const [inventorySetups, setInventorySetups] = useState<InventorySetup[]>([]);
  const [menuModal, setMenuModal] = useState<{ mode: 'create' | 'edit'; item?: Menu } | null>(null);
  const [setupModal, setSetupModal] = useState<{ mode: 'create' | 'edit'; item?: InventorySetup } | null>(null);
  const [cloneMenuModal, setCloneMenuModal] = useState<{ item: Menu } | null>(null);
  const [cloneSetupModal, setCloneSetupModal] = useState<{ item: InventorySetup } | null>(null);

  // Store price-tier / menu / inventory-setup edit — pending values while the row is in edit mode, committed on row Save.
  // Price tiers are Menu-scoped, so the available tier list is refetched
  // whenever the row's menu selection changes during edit.
  const [editingStorePriceTierValue, setEditingStorePriceTierValue] = useState<string | null>(null);
  const [editingStoreMenuValue, setEditingStoreMenuValue] = useState<string | null>(null);
  const [editingStoreInventorySetupValue, setEditingStoreInventorySetupValue] = useState<string | null>(null);
  const [editingStoreAvailableTiers, setEditingStoreAvailableTiers] = useState<PriceTier[]>([]);

  // Load brand + menus + inventory setups
  useEffect(() => {
    Promise.all([api.getBrandById(brandId, companyId), api.getMenus(brandId), api.getInventorySetups(brandId)])
      .then(([b, mns, setups]) => {
        setBrand(b);
        setMenus(mns);
        setInventorySetups(setups);
        setSettingsName(b.name);
        setSettingsDescription(b.description || '');
        setSettingsTheme(b.themeColors || {});
        setSettingsThemeHex((b.themeColors as Record<string, string>) || {});
        setEnableFoodPanda(b.enabledDeliveryPlatforms?.includes('FOODPANDA') ?? false);
        setEnableGrab(b.enabledDeliveryPlatforms?.includes('GRAB') ?? false);
        setSettingsPreferenceLabel(b.preferenceLabel || '');
      })
      .catch(() => setError('Failed to load brand'))
      .finally(() => setLoading(false));
  }, [brandId, companyId]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!brand) return;
    setSettingsSaving(true);
    try {
      const updated = await api.updateBrand(brand.id, {
        name: settingsName,
        description: settingsDescription || undefined,
        themeColors: Object.keys(settingsTheme || {}).length ? settingsTheme : undefined,
        enabledDeliveryPlatforms: [
          ...(enableFoodPanda ? ['FOODPANDA'] : []),
          ...(enableGrab ? ['GRAB'] : []),
        ],
        preferenceLabel: settingsPreferenceLabel || undefined,
      });
      setBrand(updated);
      setSettingsSuccess(true);
      setTimeout(() => setSettingsSuccess(false), 3000);
      toast.success('Brand settings saved');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to save brand settings'));
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !brand) return;
    if (!UPLOAD_ALLOWED_TYPES.includes(file.type)) {
      setLogoUploadError('Only JPEG, PNG, WebP, or GIF images are allowed.');
      e.target.value = '';
      return;
    }
    if (file.size > UPLOAD_MAX_SIZE) {
      setLogoUploadError('File too large. Maximum size is 5 MB.');
      e.target.value = '';
      return;
    }
    setLogoUploadError(null);
    setLogoUploading(true);
    try {
      const updated = await api.uploadBrandLogo(brand.id, file);
      setBrand(prev => prev ? { ...prev, logoUrl: updated.logoUrl } : prev);
      toast.success('Logo updated');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to upload logo'));
    } finally {
      setLogoUploading(false);
      e.target.value = '';
    }
  };

  const loadTab = useCallback(
    async (tab: Tab) => {
      if (tab !== 'stores') return;
      setTabLoading(true);
      try {
        setStores(await api.getStoresByBrand(brandId));
      } catch {
        // silent — show empty list
      } finally {
        setTabLoading(false);
      }
    },
    [brandId]
  );

  useEffect(() => {
    loadTab(activeTab);
  }, [activeTab, loadTab]);

  const startEditingStore = async (store: Store) => {
    setEditingStoreId(store.id);
    setEditingStoreName(store.name);
    setEditingStorePriceTierValue(store.priceTier?.id ?? null);
    setEditingStoreMenuValue(store.menu?.id ?? null);
    setEditingStoreInventorySetupValue(store.inventorySetup?.id ?? null);
    setEditingStoreAvailableTiers(store.menu?.id ? await api.getPriceTiers(store.menu.id).catch(() => []) : []);
  };

  const handleEditingStoreMenuChange = async (newMenuId: string | null) => {
    setEditingStoreMenuValue(newMenuId);
    setEditingStorePriceTierValue(null);
    setEditingStoreAvailableTiers(newMenuId ? await api.getPriceTiers(newMenuId).catch(() => []) : []);
  };

  const handleSaveStoreRow = async (storeId: string) => {
    if (!editingStoreName.trim()) return;
    try {
      const updated = await api.updateStore(storeId, {
        name: editingStoreName.trim(),
        priceTierId: editingStorePriceTierValue,
        menuId: editingStoreMenuValue,
        inventorySetupId: editingStoreInventorySetupValue,
      });
      setStores(prev => prev.map(s => s.id === storeId ? { ...s, name: updated.name, priceTier: updated.priceTier, menu: updated.menu, inventorySetup: updated.inventorySetup } : s));
      setEditingStoreId(null);
      toast.success('Store updated');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update store'));
    }
  };

  const openDeliveryModal = (store: Store) => {
    const current = store.enabledDeliveryPlatforms ?? [];
    setDeliveryToggles({
      FOODPANDA: current.includes('FOODPANDA'),
      GRAB: current.includes('GRAB'),
    });
    setDeliveryModalStore(store);
  };

  const copyStoreLink = async (store: Store) => {
    const base = process.env.NEXT_PUBLIC_STORE_PORTAL_BASE_URL ?? '';
    const url = `${base}/${brand?.company?.slug ?? ''}/${brand?.slug ?? ''}/${store.slug}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const el = document.createElement('textarea');
      el.value = url;
      el.setAttribute('readonly', '');
      el.style.cssText = 'position:absolute;left:-9999px';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    toast.success('Store portal link copied!');
  };

  const handleSaveDelivery = async () => {
    if (!deliveryModalStore) return;
    const platforms = Object.entries(deliveryToggles)
      .filter(([, on]) => on)
      .map(([p]) => p);
    try {
      await api.updateStore(deliveryModalStore.id, { enabledDeliveryPlatforms: platforms });
      setStores(prev => prev.map(s =>
        s.id === deliveryModalStore.id ? { ...s, enabledDeliveryPlatforms: platforms } : s
      ));
      setDeliveryModalStore(null);
      toast.success('Delivery platforms updated');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update delivery platforms'));
    }
  };

  // ─── Menu CRUD ──────────────────────────────────────────────────────────
  const handleToggleMenuActive = async (menu: Menu) => {
    try {
      const updated = await api.updateMenu(brandId, menu.id, { isActive: !menu.isActive });
      setMenus(prev => prev.map(m => (m.id === menu.id ? updated : m)));
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update menu'));
    }
  };

  const handleDeleteMenu = async (menu: Menu) => {
    if (!confirm(`Delete "${menu.name}"? This is blocked if any store is currently assigned to it.`)) return;
    try {
      await api.deleteMenu(brandId, menu.id);
      setMenus(prev => prev.filter(m => m.id !== menu.id));
      toast.success('Menu deleted');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to delete menu — it may still be assigned to a store'));
    }
  };

  // ─── Inventory Setup CRUD ───────────────────────────────────────────────
  const handleToggleSetupActive = async (setup: InventorySetup) => {
    try {
      const updated = await api.updateInventorySetup(brandId, setup.id, { isActive: !setup.isActive });
      setInventorySetups(prev => prev.map(s => (s.id === setup.id ? updated : s)));
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update inventory setup'));
    }
  };

  const handleDeleteSetup = async (setup: InventorySetup) => {
    if (!confirm(`Delete "${setup.name}"? This is blocked if any store is currently assigned to it.`)) return;
    try {
      await api.deleteInventorySetup(brandId, setup.id);
      setInventorySetups(prev => prev.filter(s => s.id !== setup.id));
      toast.success('Inventory setup deleted');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to delete inventory setup — it may still be assigned to a store'));
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderBottomColor: '#4f46e5' }} />
      </div>
    );
  }

  if (error || !brand) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg text-sm">
          {error || 'Brand not found'}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/companies/${companyId}`} className="text-gray-400 hover:text-gray-600">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div>
          <p className="text-xs text-gray-400">
            <Link href={`/companies/${companyId}`} className="hover:text-indigo-600">
              {brand.company?.slug ?? 'Company'}
            </Link>
            <span className="mx-1.5 text-gray-300">/</span>
            {brand.name}
          </p>
          <h1 className="text-2xl font-bold text-gray-900">{brand.name}</h1>
          <p className="text-sm text-gray-500">{brand.slug}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b">
        <nav className="flex gap-1 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-current'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
              style={activeTab === tab.id ? { color: '#4f46e5' } : undefined}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div>
        {tabLoading && activeTab !== 'overview' && (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2" style={{ borderBottomColor: '#4f46e5' }} />
          </div>
        )}

        {/* Overview */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard label="Stores" value={brand.storeCount ?? 0} />
            <StatCard label="Products" value={brand.productCount ?? 0} />
            <StatCard label="Inventory Items" value={brand.inventoryItemCount ?? 0} />
          </div>
        )}

        {/* Menus */}
        {activeTab === 'menus' && (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b gap-4">
              <div>
                <h2 className="font-semibold text-gray-900">Menus</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Each menu has its own independent categories, products, sizes, add-ons, preferences, and price tiers — fully isolated from other menus. Click a menu to open its workspace. Assign a menu to a store on the Stores tab.
                </p>
              </div>
              {canWrite && (
                <button
                  onClick={() => setMenuModal({ mode: 'create' })}
                  className="flex items-center gap-1.5 px-3 py-2 text-white rounded-lg text-sm font-medium hover:brightness-90 shrink-0"
                  style={{ backgroundColor: '#4f46e5' }}
                >
                  <Plus className="w-3.5 h-3.5" /> Add Menu
                </button>
              )}
            </div>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {menus.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-sm text-gray-400">No menus yet.</td>
                  </tr>
                ) : menus.map(menu => (
                  <tr
                    key={menu.id}
                    onClick={() => router.push(`/companies/${companyId}/brands/${brandId}/menus/${menu.id}`)}
                    className="hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="px-6 py-4">
                      <span className="text-sm font-medium text-gray-900">{menu.name}</span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                      {menu.description || <span className="text-gray-300 italic">—</span>}
                    </td>
                    <td className="px-6 py-4">
                      {menu.isActive ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700 border border-green-200">Active</span>
                      ) : (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500 border border-gray-200">Inactive</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right" onClick={e => e.stopPropagation()}>
                      {canWrite && (
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => setMenuModal({ mode: 'edit', item: menu })} title="Edit" className="p-1.5 text-gray-400 hover:opacity-70 rounded">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setCloneMenuModal({ item: menu })} title="Clone" className="p-1.5 text-gray-400 hover:opacity-70 rounded">
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleToggleMenuActive(menu)}
                            title={menu.isActive ? 'Deactivate' : 'Activate'}
                            className="p-1.5 text-gray-400 hover:opacity-70 rounded"
                          >
                            {menu.isActive ? <PowerOff className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
                          </button>
                          {canDelete && (
                            <button onClick={() => handleDeleteMenu(menu)} title="Delete" className="p-1.5 text-gray-400 hover:text-red-600 rounded">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Inventory Setups */}
        {activeTab === 'inventory-setups' && (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b gap-4">
              <div>
                <h2 className="font-semibold text-gray-900">Inventory Setups</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Each setup has its own independent inventory items and categories. Click a setup to open its workspace. Assign a setup to a store on the Stores tab — a store keeps its recorded stock history even if its setup later changes.
                </p>
              </div>
              {canWrite && (
                <button
                  onClick={() => setSetupModal({ mode: 'create' })}
                  className="flex items-center gap-1.5 px-3 py-2 text-white rounded-lg text-sm font-medium hover:brightness-90 shrink-0"
                  style={{ backgroundColor: '#4f46e5' }}
                >
                  <Plus className="w-3.5 h-3.5" /> Add Inventory Setup
                </button>
              )}
            </div>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {inventorySetups.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-sm text-gray-400">No inventory setups yet.</td>
                  </tr>
                ) : inventorySetups.map(setup => (
                  <tr
                    key={setup.id}
                    onClick={() => router.push(`/companies/${companyId}/brands/${brandId}/inventory-setups/${setup.id}`)}
                    className="hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="px-6 py-4">
                      <span className="text-sm font-medium text-gray-900">{setup.name}</span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                      {setup.description || <span className="text-gray-300 italic">—</span>}
                    </td>
                    <td className="px-6 py-4">
                      {setup.isActive ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700 border border-green-200">Active</span>
                      ) : (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500 border border-gray-200">Inactive</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right" onClick={e => e.stopPropagation()}>
                      {canWrite && (
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => setSetupModal({ mode: 'edit', item: setup })} title="Edit" className="p-1.5 text-gray-400 hover:opacity-70 rounded">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setCloneSetupModal({ item: setup })} title="Clone" className="p-1.5 text-gray-400 hover:opacity-70 rounded">
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleToggleSetupActive(setup)}
                            title={setup.isActive ? 'Deactivate' : 'Activate'}
                            className="p-1.5 text-gray-400 hover:opacity-70 rounded"
                          >
                            {setup.isActive ? <PowerOff className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
                          </button>
                          {canDelete && (
                            <button onClick={() => handleDeleteSetup(setup)} title="Delete" className="p-1.5 text-gray-400 hover:text-red-600 rounded">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Stores */}
        {activeTab === 'stores' && !tabLoading && (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Store Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Store ID / Slug</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Menu</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Inventory Setup</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price Tier</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {stores.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-sm text-gray-400">No stores under this brand yet.</td>
                  </tr>
                ) : stores.map(store => (
                  <tr key={store.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      {editingStoreId === store.id ? (
                        <input
                          autoFocus
                          type="text"
                          value={editingStoreName}
                          onChange={e => setEditingStoreName(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleSaveStoreRow(store.id);
                            if (e.key === 'Escape') setEditingStoreId(null);
                          }}
                          className="px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white w-full max-w-xs"
                          style={{ '--tw-ring-color': '#4f46e5' } as React.CSSProperties}
                        />
                      ) : (
                        <p className="text-sm font-medium text-gray-900">{store.name}</p>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 font-mono">{store.slug}</td>
                    <td className="px-6 py-4">
                      {canWrite && editingStoreId === store.id ? (
                        <select
                          value={editingStoreMenuValue ?? 'none'}
                          onChange={e => handleEditingStoreMenuChange(e.target.value === 'none' ? null : e.target.value)}
                          className="w-40 h-8 text-xs border border-gray-300 rounded-md px-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          <option value="none">— Unassigned —</option>
                          {menus.filter(m => m.isActive).map(m => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                          ))}
                        </select>
                      ) : (
                        <button
                          onClick={canWrite ? () => startEditingStore(store) : undefined}
                          className={`text-sm ${store.menu ? 'text-gray-700' : 'text-gray-400'} ${canWrite ? 'hover:opacity-70 cursor-pointer' : 'cursor-default'}`}
                        >
                          {store.menu ? store.menu.name : <span className="italic">Not set</span>}
                        </button>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {canWrite && editingStoreId === store.id ? (
                        <select
                          value={editingStoreInventorySetupValue ?? 'none'}
                          onChange={e => setEditingStoreInventorySetupValue(e.target.value === 'none' ? null : e.target.value)}
                          className="w-40 h-8 text-xs border border-gray-300 rounded-md px-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          <option value="none">— Unassigned —</option>
                          {inventorySetups.filter(s => s.isActive).map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      ) : (
                        <button
                          onClick={canWrite ? () => startEditingStore(store) : undefined}
                          className={`text-sm ${store.inventorySetup ? 'text-gray-700' : 'text-gray-400'} ${canWrite ? 'hover:opacity-70 cursor-pointer' : 'cursor-default'}`}
                        >
                          {store.inventorySetup ? store.inventorySetup.name : <span className="italic">Not set</span>}
                        </button>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {canWrite && editingStoreId === store.id ? (
                        <select
                          value={editingStorePriceTierValue ?? 'none'}
                          onChange={e => setEditingStorePriceTierValue(e.target.value === 'none' ? null : e.target.value)}
                          disabled={!editingStoreMenuValue}
                          className="w-36 h-8 text-xs border border-gray-300 rounded-md px-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400"
                        >
                          <option value="none">{editingStoreMenuValue ? '— None —' : '— No menu —'}</option>
                          {editingStoreAvailableTiers.map(t => (
                            <option key={t.id} value={t.id}>{t.name}{t.isDefault ? ' (Default)' : ''}</option>
                          ))}
                        </select>
                      ) : (
                        <button
                          onClick={canWrite ? () => startEditingStore(store) : undefined}
                          className={`text-sm ${store.priceTier ? 'text-gray-700' : 'text-gray-400'} ${canWrite ? 'hover:opacity-70 cursor-pointer' : 'cursor-default'}`}
                        >
                          {store.priceTier ? (
                            <span className="flex items-center gap-1.5">
                              {store.priceTier.name}
                              {store.priceTier.isDefault && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">Default</span>
                              )}
                            </span>
                          ) : (
                            <span className="italic">Not set</span>
                          )}
                        </button>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-3">
                        {canWrite && (
                          <button
                            onClick={() => openDeliveryModal(store)}
                            title="Delivery Platforms"
                            className="text-gray-400 hover:opacity-70 transition-colors"
                          >
                            <Truck className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => setQrStore({
                            storeName: store.name,
                            companySlug: brand?.company?.slug ?? '',
                            brandSlug: brand?.slug ?? '',
                            storeSlug: store.slug,
                          })}
                          title="View QR Code"
                          className="text-gray-400 hover:opacity-70 transition-colors"
                        >
                          <QrCode className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => copyStoreLink(store)}
                          title="Copy store portal link"
                          className="text-gray-400 hover:opacity-70 transition-colors"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        {canWrite && (
                          editingStoreId === store.id ? (
                            <div className="flex gap-3">
                              <button onClick={() => handleSaveStoreRow(store.id)} className="text-sm font-medium hover:opacity-80" style={{ color: '#4f46e5' }}>Save</button>
                              <button onClick={() => setEditingStoreId(null)} className="text-sm text-gray-400 hover:text-gray-600">Cancel</button>
                            </div>
                          ) : (
                            <button
                              onClick={() => startEditingStore(store)}
                              className="text-sm text-gray-400 hover:text-gray-600"
                            >
                              Edit
                            </button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Delivery Platforms Modal */}
        {deliveryModalStore && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
              <h3 className="font-semibold text-gray-900 mb-1">{deliveryModalStore.name}</h3>
              <p className="text-xs text-gray-500 mb-4">Delivery Platforms</p>

              {(brand?.enabledDeliveryPlatforms ?? []).length === 0 ? (
                <p className="text-sm text-gray-500">
                  No delivery platforms configured for this brand. Enable them in Brand Settings first.
                </p>
              ) : (
                <div className="space-y-3">
                  {brand?.enabledDeliveryPlatforms?.includes('FOODPANDA') && (
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={deliveryToggles['FOODPANDA'] ?? false}
                        onChange={e => setDeliveryToggles(t => ({ ...t, FOODPANDA: e.target.checked }))}
                        className="rounded border-gray-300 text-pink-500 focus:ring-pink-500"
                      />
                      <span className="text-sm font-medium text-gray-700">FoodPanda</span>
                    </label>
                  )}
                  {brand?.enabledDeliveryPlatforms?.includes('GRAB') && (
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={deliveryToggles['GRAB'] ?? false}
                        onChange={e => setDeliveryToggles(t => ({ ...t, GRAB: e.target.checked }))}
                        className="rounded border-gray-300 text-green-500 focus:ring-green-500"
                      />
                      <span className="text-sm font-medium text-gray-700">Grab</span>
                    </label>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setDeliveryModalStore(null)}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveDelivery}
                  className="text-sm text-white px-4 py-2 rounded-lg font-medium hover:brightness-90" style={{ backgroundColor: '#4f46e5' }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Settings */}
        {activeTab === 'settings' && (
          <div className="space-y-6 max-w-xl">
            {/* Logo */}
            <div className="bg-white rounded-lg border">
              <div className="px-6 py-4 border-b">
                <h2 className="font-semibold text-gray-900">Brand Logo</h2>
                <p className="text-xs text-gray-400 mt-0.5">Displayed on the Store Portal login page</p>
              </div>
              <div className="p-6 flex items-center gap-6">
                <div className="w-20 h-20 rounded-xl border border-gray-200 flex items-center justify-center bg-gray-50 shrink-0 overflow-hidden">
                  {brand.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={brand.logoUrl.startsWith('http') ? brand.logoUrl : `${process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') || 'http://localhost:3000'}${brand.logoUrl}`}
                      alt="Brand logo"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <span className="text-3xl font-bold text-gray-300">{brand.name[0]?.toUpperCase()}</span>
                  )}
                </div>
                <div>
                  {canWrite && (
                    <label
                      className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors ${
                        logoUploading ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'text-white hover:brightness-90'
                      }`}
                      style={logoUploading ? undefined : { backgroundColor: '#4f46e5' }}
                    >
                      <Upload className="w-4 h-4" />
                      {logoUploading ? 'Uploading...' : 'Upload Logo'}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        className="sr-only"
                        disabled={logoUploading}
                        onChange={handleLogoUpload}
                      />
                    </label>
                  )}
                  <p className="text-xs text-gray-400 mt-2">JPEG, PNG, WebP or GIF · Max 5 MB</p>
                  {logoUploadError && <p className="text-red-500 text-xs mt-1">{logoUploadError}</p>}
                </div>
              </div>
            </div>

            {/* Info + Theme */}
            <div className="bg-white rounded-lg border">
              <div className="px-6 py-4 border-b">
                <h2 className="font-semibold text-gray-900">Brand Settings</h2>
              </div>
              <form onSubmit={handleSaveSettings} className="p-6 space-y-4">
                {settingsSuccess && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded text-green-700 text-sm">
                    Settings saved
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Brand Name</label>
                  <input
                    type="text"
                    value={settingsName}
                    onChange={e => setSettingsName(e.target.value)}
                    required
                    disabled={!canWrite}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed"
                    style={{ '--tw-ring-color': '#4f46e5' } as React.CSSProperties}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    value={settingsDescription}
                    onChange={e => setSettingsDescription(e.target.value)}
                    rows={2}
                    disabled={!canWrite}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white resize-none disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed"
                    style={{ '--tw-ring-color': '#4f46e5' } as React.CSSProperties}
                  />
                </div>

                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Theme Colors</p>
                  <p className="text-xs text-gray-400 mb-3">These colors are used as branding in the Store Portal and App</p>
                  <div className="grid grid-cols-1 gap-2">
                    {(['primary', 'secondary', 'accent', 'background', 'text'] as const).map(key => {
                      const defaultColor = key === 'background' ? '#ffffff' : key === 'text' ? '#1f2937' : '#ea580c';
                      const colorValue = settingsTheme?.[key] || defaultColor;
                      const hexValue = settingsThemeHex[key] ?? colorValue;
                      return (
                        <div key={key} className="flex items-center gap-2">
                          <input
                            type="color"
                            value={colorValue}
                            disabled={!canWrite}
                            onChange={e => {
                              setSettingsTheme(prev => ({ ...prev, [key]: e.target.value }));
                              setSettingsThemeHex(prev => ({ ...prev, [key]: e.target.value }));
                            }}
                            className="w-9 h-9 rounded cursor-pointer border border-gray-200 p-0.5 shrink-0 disabled:cursor-not-allowed disabled:opacity-50"
                          />
                          <input
                            type="text"
                            value={hexValue}
                            disabled={!canWrite}
                            onChange={e => {
                              const v = e.target.value;
                              setSettingsThemeHex(prev => ({ ...prev, [key]: v }));
                              if (/^#[0-9a-fA-F]{6}$/.test(v)) {
                                setSettingsTheme(prev => ({ ...prev, [key]: v }));
                              }
                            }}
                            maxLength={7}
                            placeholder={defaultColor}
                            spellCheck={false}
                            className="w-24 px-2 py-1 text-xs border border-gray-200 rounded-md font-mono focus:outline-none focus:ring-1 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed" style={{ '--tw-ring-color': '#4f46e5' } as React.CSSProperties}
                          />
                          <span className="text-sm text-gray-600 capitalize">{key}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="border-t pt-4">
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">Delivery Platforms</h4>
                  <p className="text-xs text-gray-500 mb-3">
                    Enable delivery platforms to set separate pricing for those orders.
                  </p>
                  <div className="space-y-2">
                    <label className={`flex items-center gap-3 ${canWrite ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
                      <input
                        type="checkbox"
                        checked={enableFoodPanda}
                        disabled={!canWrite}
                        onChange={e => setEnableFoodPanda(e.target.checked)}
                        className="rounded border-gray-300 text-pink-500 focus:ring-pink-500 disabled:cursor-not-allowed"
                      />
                      <span className="text-sm font-medium text-gray-700">FoodPanda</span>
                    </label>
                    <label className={`flex items-center gap-3 ${canWrite ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
                      <input
                        type="checkbox"
                        checked={enableGrab}
                        disabled={!canWrite}
                        onChange={e => setEnableGrab(e.target.checked)}
                        className="rounded border-gray-300 text-green-500 focus:ring-green-500 disabled:cursor-not-allowed"
                      />
                      <span className="text-sm font-medium text-gray-700">Grab</span>
                    </label>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <h4 className="text-sm font-semibold text-gray-700 mb-1">Preference Label</h4>
                  <p className="text-xs text-gray-500 mb-3">
                    The heading shown to customers when selecting a preference in the app (e.g., &quot;Sugar Level&quot;). Defaults to &quot;Preference&quot; if left blank.
                  </p>
                  <input
                    type="text"
                    value={settingsPreferenceLabel}
                    disabled={!canWrite}
                    onChange={e => setSettingsPreferenceLabel(e.target.value)}
                    placeholder="e.g. Sugar Level"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed"
                    style={{ '--tw-ring-color': '#4f46e5' } as React.CSSProperties}
                  />
                </div>

                {canWrite && (
                  <button
                    type="submit"
                    disabled={settingsSaving}
                    className="flex items-center gap-2 px-4 py-2 text-white rounded-lg hover:brightness-90 disabled:opacity-50 text-sm font-medium" style={{ backgroundColor: '#4f46e5' }}
                  >
                    <Save className="w-4 h-4" />
                    {settingsSaving ? 'Saving...' : 'Save Settings'}
                  </button>
                )}
              </form>
            </div>
          </div>
        )}
      </div>

      {qrStore && (
        <StoreQRModal
          storeName={qrStore.storeName}
          companySlug={qrStore.companySlug}
          brandSlug={qrStore.brandSlug}
          storeSlug={qrStore.storeSlug}
          onClose={() => setQrStore(null)}
        />
      )}

      {menuModal && (
        <NameDescriptionModal
          title={menuModal.mode === 'create' ? 'New Menu' : 'Edit Menu'}
          namePlaceholder="e.g. Summer Menu 2026"
          initialName={menuModal.item?.name ?? ''}
          initialDescription={menuModal.item?.description ?? ''}
          onClose={() => setMenuModal(null)}
          onSubmit={async (name, description) => {
            if (menuModal.mode === 'create') {
              const menu = await api.createMenu(brandId, { name, description: description || undefined });
              setMenus(prev => [...prev, menu]);
              toast.success('Menu created');
            } else {
              const updated = await api.updateMenu(brandId, menuModal.item!.id, { name, description: description || undefined });
              setMenus(prev => prev.map(m => (m.id === updated.id ? updated : m)));
              toast.success('Menu updated');
            }
          }}
        />
      )}

      {setupModal && (
        <NameDescriptionModal
          title={setupModal.mode === 'create' ? 'New Inventory Setup' : 'Edit Inventory Setup'}
          namePlaceholder="e.g. Default Setup"
          initialName={setupModal.item?.name ?? ''}
          initialDescription={setupModal.item?.description ?? ''}
          onClose={() => setSetupModal(null)}
          onSubmit={async (name, description) => {
            if (setupModal.mode === 'create') {
              const setup = await api.createInventorySetup(brandId, { name, description: description || undefined });
              setInventorySetups(prev => [...prev, setup]);
              toast.success('Inventory setup created');
            } else {
              const updated = await api.updateInventorySetup(brandId, setupModal.item!.id, { name, description: description || undefined });
              setInventorySetups(prev => prev.map(s => (s.id === updated.id ? updated : s)));
              toast.success('Inventory setup updated');
            }
          }}
        />
      )}

      {cloneMenuModal && (
        <NameDescriptionModal
          title={`Clone "${cloneMenuModal.item.name}"`}
          namePlaceholder="e.g. Summer Menu 2026"
          initialName={`${cloneMenuModal.item.name} (Copy)`}
          initialDescription={cloneMenuModal.item.description ?? ''}
          onClose={() => setCloneMenuModal(null)}
          onSubmit={async (name, description) => {
            const created = await api.cloneMenu(brandId, cloneMenuModal.item.id, { name, description: description || undefined });
            setMenus(prev => [...prev, created]);
            toast.success('Menu cloned');
          }}
        />
      )}

      {cloneSetupModal && (
        <NameDescriptionModal
          title={`Clone "${cloneSetupModal.item.name}"`}
          namePlaceholder="e.g. Default Setup"
          initialName={`${cloneSetupModal.item.name} (Copy)`}
          initialDescription={cloneSetupModal.item.description ?? ''}
          onClose={() => setCloneSetupModal(null)}
          onSubmit={async (name, description) => {
            const created = await api.cloneInventorySetup(brandId, cloneSetupModal.item.id, { name, description: description || undefined });
            setInventorySetups(prev => [...prev, created]);
            toast.success('Inventory setup cloned');
          }}
        />
      )}
    </div>
  );
}

// ─── Helper components ────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-lg border p-5">
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className="text-3xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  // Portaled directly to document.body — rendering this in-place inside the
  // page's layout tree caused the fixed overlay to render ~24px short at the
  // top (confirmed empirically: moving the same node to be a direct child of
  // body fixes it, moving it back reproduces it, despite computed styles
  // showing top:0 the whole time). Portaling sidesteps whatever in the
  // ancestor chain is responsible.
  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

// Shared create/edit modal for Menu and InventorySetup — both are just a
// name + optional description, so one component covers both instead of
// duplicating near-identical forms.
function NameDescriptionModal({
  title,
  namePlaceholder,
  initialName,
  initialDescription,
  onClose,
  onSubmit,
}: {
  title: string;
  namePlaceholder?: string;
  initialName: string;
  initialDescription: string;
  onClose: () => void;
  onSubmit: (name: string, description: string) => Promise<void>;
}) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setError(null);
    setLoading(true);
    try {
      await onSubmit(trimmed, description.trim());
      onClose();
    } catch (err: unknown) {
      const message = getErrorMessage(err, 'Failed to save');
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <input
            autoFocus
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            placeholder={namePlaceholder}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
            style={{ '--tw-ring-color': '#4f46e5' } as React.CSSProperties}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description <span className="text-gray-400 font-normal">(optional)</span></label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={3}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white resize-none"
            style={{ '--tw-ring-color': '#4f46e5' } as React.CSSProperties}
          />
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={loading || !name.trim()} className="flex-1 py-2 text-white rounded-lg text-sm font-medium hover:brightness-90 disabled:opacity-50" style={{ backgroundColor: '#4f46e5' }}>
            {loading ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
