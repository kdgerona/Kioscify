'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import type { Brand, Store, Category, Product, Size, Addon, Preference, InventoryBrandTemplate, PriceTier, ProductPriceTier, SizePriceTier, AddonPriceTier } from '@/types';
import { Plus, Pencil, Trash2, X, ChevronLeft, Upload, Save, QrCode, ChevronUp, ChevronDown, Truck, Star, Copy } from 'lucide-react';
import { toast } from 'sonner';
import StoreQRModal from '@/components/StoreQRModal';

type Tab = 'overview' | 'products' | 'categories' | 'sizes' | 'addons' | 'preferences' | 'inventory' | 'stores' | 'price-tiers' | 'settings';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'products', label: 'Products' },
  { id: 'categories', label: 'Categories' },
  { id: 'sizes', label: 'Sizes' },
  { id: 'addons', label: 'Add-ons' },
  { id: 'preferences', label: 'Preferences' },
  { id: 'inventory', label: 'Inventory Items' },
  { id: 'stores', label: 'Stores' },
  { id: 'price-tiers', label: 'Price Tiers' },
  { id: 'settings', label: 'Settings' },
];

// ─── Simple inline edit row ───────────────────────────────────────────────

function CRUDRow({
  label,
  sublabel,
  onEdit,
  onDelete,
  showEdit = true,
  showDelete = true,
}: {
  label: string;
  sublabel?: string;
  onEdit: () => void;
  onDelete: () => void;
  showEdit?: boolean;
  showDelete?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
      <div>
        <p className="text-sm font-medium text-gray-900">{label}</p>
        {sublabel && <p className="text-xs text-gray-400">{sublabel}</p>}
      </div>
      <div className="flex items-center gap-2">
        {showEdit && (
          <button onClick={onEdit} className="p-1.5 text-gray-400 hover:opacity-70 rounded">
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
        {showDelete && (
          <button onClick={onDelete} className="p-1.5 text-gray-400 hover:text-red-600 rounded">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Category row with sequence reorder controls ─────────────────────────

function CategoryRow({
  cat,
  index,
  total,
  onMoveUp,
  onMoveDown,
  onEdit,
  onDelete,
  showEdit = true,
  showDelete = true,
}: {
  cat: Category;
  index: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onEdit: () => void;
  onDelete: () => void;
  showEdit?: boolean;
  showDelete?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors gap-2">
      {/* Sequence controls */}
      {showEdit && (
        <div className="flex flex-col items-center gap-0.5 shrink-0">
          <button
            onClick={onMoveUp}
            disabled={index === 0}
            className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-20 disabled:cursor-not-allowed"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <span className="text-xs text-gray-400 font-mono w-5 text-center leading-none">{index + 1}</span>
          <button
            onClick={onMoveDown}
            disabled={index === total - 1}
            className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-20 disabled:cursor-not-allowed"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Label */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{cat.name}</p>
        {cat.description && <p className="text-xs text-gray-400 truncate">{cat.description}</p>}
      </div>

      {/* Edit / Delete */}
      <div className="flex items-center gap-2 shrink-0">
        {showEdit && (
          <button onClick={onEdit} className="p-1.5 text-gray-400 hover:opacity-70 rounded">
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
        {showDelete && (
          <button onClick={onDelete} className="p-1.5 text-gray-400 hover:text-red-600 rounded">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Generic row with sequence reorder controls ───────────────────────────

function ReorderRow({
  label,
  sublabel,
  index,
  total,
  onMoveUp,
  onMoveDown,
  onEdit,
  onDelete,
  isDefault,
  onSetDefault,
  showEdit = true,
  showDelete = true,
}: {
  label: string;
  sublabel?: string;
  index: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onEdit: () => void;
  onDelete: () => void;
  isDefault?: boolean;
  onSetDefault?: () => void;
  showEdit?: boolean;
  showDelete?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors gap-2">
      {showEdit && (
        <div className="flex flex-col items-center gap-0.5 shrink-0">
          <button
            onClick={onMoveUp}
            disabled={index === 0}
            className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-20 disabled:cursor-not-allowed"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <span className="text-xs text-gray-400 font-mono w-5 text-center leading-none">{index + 1}</span>
          <button
            onClick={onMoveDown}
            disabled={index === total - 1}
            className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-20 disabled:cursor-not-allowed"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{label}</p>
        {sublabel && <p className="text-xs text-gray-400 truncate">{sublabel}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {onSetDefault && (
          <button
            onClick={onSetDefault}
            title={isDefault ? 'Default preference' : 'Set as default'}
            className={`p-1.5 rounded ${isDefault ? 'text-yellow-500' : 'text-gray-300 hover:text-yellow-400'}`}
          >
            <Star className="w-3.5 h-3.5" fill={isDefault ? 'currentColor' : 'none'} />
          </button>
        )}
        {showEdit && (
          <button onClick={onEdit} className="p-1.5 text-gray-400 hover:opacity-70 rounded">
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
        {showDelete && (
          <button onClick={onDelete} className="p-1.5 text-gray-400 hover:text-red-600 rounded">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Product row with image thumbnail ────────────────────────────────────

const apiBase = process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') || 'http://localhost:3000';

function resolveUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const path = raw.startsWith('http') ? new URL(raw).pathname : raw;
    return `${apiBase}${path}`;
  } catch { return raw; }
}

function ProductRow({
  product,
  onEdit,
  onDelete,
  showEdit = true,
  showDelete = true,
}: {
  product: Product;
  onEdit: () => void;
  onDelete: () => void;
  showEdit?: boolean;
  showDelete?: boolean;
}) {
  const imageSrc = resolveUrl(product.image);
  return (
    <div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-lg border border-gray-100 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0">
          {imageSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageSrc} alt={product.name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-gray-300 text-xs">No img</span>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{product.name}</p>
          <p className="text-xs text-gray-400">
            ₱{product.price.toFixed(2)}{product.category?.name ? ` · ${product.category.name}` : ''}
            {(product.sizes?.length ?? 0) > 0 && ` · ${product.sizes!.length} size${product.sizes!.length !== 1 ? 's' : ''}`}
            {(product.addons?.length ?? 0) > 0 && ` · ${product.addons!.length} add-on${product.addons!.length !== 1 ? 's' : ''}`}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {showEdit && (
          <button onClick={onEdit} className="p-1.5 text-gray-400 hover:opacity-70 rounded">
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
        {showDelete && (
          <button onClick={onDelete} className="p-1.5 text-gray-400 hover:text-red-600 rounded">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Inline modal form ────────────────────────────────────────────────────

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────

const UPLOAD_MAX_SIZE = 5 * 1024 * 1024;
const UPLOAD_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export default function BrandDetailPage() {
  const params = useParams();
  const brandId = params.brandId as string;
  const companyId = params.id as string;

  // PLATFORM_ADMIN always has full access — no company-admin-style privilege gating applies here.
  const canWrite = true;
  const canDelete = true;

  const [brand, setBrand] = useState<Brand | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
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
  const [productCategories, setProductCategories] = useState<Category[]>([]);
  const [invCategories, setInvCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [sizes, setSizes] = useState<Size[]>([]);
  const [addons, setAddons] = useState<Addon[]>([]);
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [invItems, setInvItems] = useState<InventoryBrandTemplate[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [priceTiers, setPriceTiers] = useState<PriceTier[]>([]);
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


  // Price tier inline-edit state
  const [newTierName, setNewTierName] = useState('');
  const [newTierSaving, setNewTierSaving] = useState(false);
  const [editingTierId, setEditingTierId] = useState<string | null>(null);
  const [editingTierName, setEditingTierName] = useState('');

  // Store price-tier edit — pending value while the row is in edit mode, committed on row Save
  const [editingStorePriceTierValue, setEditingStorePriceTierValue] = useState<string | null>(null);

  // Modal state
  const [modal, setModal] = useState<{
    type: Tab | null;
    mode: 'create' | 'edit';
    item?: unknown;
  }>({ type: null, mode: 'create' });

  const closeModal = () => setModal({ type: null, mode: 'create' });

  // Load brand + price tiers
  useEffect(() => {
    Promise.all([api.getBrandById(brandId, companyId), api.getPriceTiers(brandId)])
      .then(([b, tiers]) => {
        setBrand(b);
        setPriceTiers(tiers);
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


  const reorderItem = async <T extends { id: string; sequenceNo?: number }>(
    list: T[],
    setList: React.Dispatch<React.SetStateAction<T[]>>,
    index: number,
    direction: 'up' | 'down',
    updateFn: (id: string, sequenceNo: number) => Promise<T>,
  ) => {
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= list.length) return;

    const reordered = [...list];
    [reordered[index], reordered[swapIndex]] = [reordered[swapIndex], reordered[index]];
    const stamped = reordered.map((item, i) => ({ ...item, sequenceNo: i }));

    setList(stamped);
    await Promise.all([
      updateFn(stamped[index].id, index),
      updateFn(stamped[swapIndex].id, swapIndex),
    ]);
  };

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
    } catch {
      // no-op
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
    } catch {
      // no-op
    } finally {
      setLogoUploading(false);
      e.target.value = '';
    }
  };

  // Load tab data
  const loadTab = useCallback(
    async (tab: Tab) => {
      if (tab === 'overview') return;
      setTabLoading(true);
      try {
        if (tab === 'categories') {
          const [pc, ic] = await Promise.all([
            api.getCategories(brandId, 'PRODUCT'),
            api.getCategories(brandId, 'INVENTORY'),
          ]);
          setProductCategories(pc);
          setInvCategories(ic);
        }
        if (tab === 'products') {
          const [cats, prods, szs, ads, prefs] = await Promise.all([
            api.getCategories(brandId, 'PRODUCT'),
            api.getProducts(brandId),
            api.getSizes(brandId),
            api.getAddons(brandId),
            api.getPreferences(brandId),
          ]);
          setProductCategories(cats);
          setProducts(prods);
          setSizes(szs);
          setAddons(ads);
          setPreferences(prefs);
        }
        if (tab === 'sizes') setSizes(await api.getSizes(brandId));
        if (tab === 'addons') setAddons(await api.getAddons(brandId));
        if (tab === 'preferences') setPreferences(await api.getPreferences(brandId));
        if (tab === 'inventory') {
          const [items, ic] = await Promise.all([
            api.getInventoryBrandTemplates(brandId),
            api.getCategories(brandId, 'INVENTORY'),
          ]);
          setInvItems(items);
          setInvCategories(ic);
        }
        if (tab === 'stores') setStores(await api.getStoresByBrand(brandId));
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

  const startEditingStore = (store: Store) => {
    setEditingStoreId(store.id);
    setEditingStoreName(store.name);
    setEditingStorePriceTierValue(store.priceTier?.id ?? null);
  };

  const handleSaveStoreRow = async (storeId: string) => {
    if (!editingStoreName.trim()) return;
    try {
      const payload: { name: string; priceTierId?: string | null } = { name: editingStoreName.trim() };
      if (priceTiers.length > 0) {
        payload.priceTierId = editingStorePriceTierValue;
      }
      const updated = await api.updateStore(storeId, payload);
      setStores(prev => prev.map(s => s.id === storeId ? { ...s, name: updated.name, priceTier: updated.priceTier } : s));
      setEditingStoreId(null);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      toast.error(axiosErr?.response?.data?.message || 'Failed to update store');
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
    } catch { /* silent */ }
  };

  const handleCreateTier = async () => {
    const name = newTierName.trim();
    if (!name) return;
    setNewTierSaving(true);
    try {
      const tier = await api.createPriceTier(brandId, { name });
      setPriceTiers(prev => [...prev, tier]);
      setNewTierName('');
      toast.success('Price tier created');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      toast.error(axiosErr?.response?.data?.message || 'Failed to create price tier');
    } finally {
      setNewTierSaving(false);
    }
  };

  const handleRenameTier = async (tierId: string) => {
    const name = editingTierName.trim();
    if (!name) return;
    try {
      const updated = await api.updatePriceTier(brandId, tierId, { name });
      setPriceTiers(prev => prev.map(t => t.id === tierId ? updated : t));
      setEditingTierId(null);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      toast.error(axiosErr?.response?.data?.message || 'Failed to rename tier');
    }
  };

  const handleSetDefaultTier = async (tierId: string) => {
    try {
      const updated = await api.updatePriceTier(brandId, tierId, { isDefault: true });
      setPriceTiers(prev => prev.map(t => t.id === tierId ? updated : { ...t, isDefault: false }));
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      toast.error(axiosErr?.response?.data?.message || 'Failed to set default tier');
    }
  };

  const handleDeleteTier = async (tier: PriceTier) => {
    if (!confirm(`Are you sure you want to delete this tier?`)) return;
    try {
      await api.deletePriceTier(brandId, tier.id);
      setPriceTiers(prev => prev.filter(t => t.id !== tier.id));
      toast.success('Price tier deleted');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      toast.error(axiosErr?.response?.data?.message || 'Failed to delete tier');
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

        {activeTab !== 'overview' && (
          <div className="bg-white rounded-lg border py-16 text-center text-gray-400 text-sm">
            {TABS.find(t => t.id === activeTab)?.label} — coming soon
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

function TabSection({
  title,
  onAdd,
  showAdd = true,
  children,
}: {
  title: string;
  onAdd: () => void;
  showAdd?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-lg border">
      <div className="flex items-center justify-between px-5 py-4 border-b">
        <h2 className="font-semibold text-gray-900 text-sm">{title}</h2>
        {showAdd && (
          <button
            onClick={onAdd}
            className="flex items-center gap-1.5 text-sm font-medium hover:opacity-80" style={{ color: '#4f46e5' }}
          >
            <Plus className="w-4 h-4" /> Add
          </button>
        )}
      </div>
      <div className="divide-y">{children}</div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-10 text-center text-gray-400 text-sm">{message}</div>
  );
}

