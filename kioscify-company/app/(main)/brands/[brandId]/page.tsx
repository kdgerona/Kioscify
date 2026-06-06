'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import type { Brand, Category, Product, Size, Addon, InventoryBrandTemplate } from '@/types';
import { Plus, Pencil, Trash2, X, ChevronLeft, Upload, Save, QrCode, ChevronUp, ChevronDown } from 'lucide-react';
import StoreQRModal from '@/components/StoreQRModal';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type Tab = 'overview' | 'products' | 'categories' | 'sizes' | 'addons' | 'inventory' | 'stores' | 'settings';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'products', label: 'Products' },
  { id: 'categories', label: 'Categories' },
  { id: 'sizes', label: 'Sizes' },
  { id: 'addons', label: 'Add-ons' },
  { id: 'inventory', label: 'Inventory Items' },
  { id: 'stores', label: 'Stores' },
  { id: 'settings', label: 'Settings' },
];

// ─── Simple inline edit row ───────────────────────────────────────────────

function CRUDRow({
  label,
  sublabel,
  onEdit,
  onDelete,
}: {
  label: string;
  sublabel?: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
      <div>
        <p className="text-sm font-medium text-gray-900">{label}</p>
        {sublabel && <p className="text-xs text-gray-400">{sublabel}</p>}
      </div>
      <div className="flex items-center gap-2">
        <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-orange-600 rounded">
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button onClick={onDelete} className="p-1.5 text-gray-400 hover:text-red-600 rounded">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
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
}: {
  cat: Category;
  index: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors gap-2">
      {/* Sequence controls */}
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

      {/* Label */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{cat.name}</p>
        {cat.description && <p className="text-xs text-gray-400 truncate">{cat.description}</p>}
      </div>

      {/* Edit / Delete */}
      <div className="flex items-center gap-2 shrink-0">
        <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-orange-600 rounded">
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button onClick={onDelete} className="p-1.5 text-gray-400 hover:text-red-600 rounded">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
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
}: {
  label: string;
  sublabel?: string;
  index: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors gap-2">
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
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{label}</p>
        {sublabel && <p className="text-xs text-gray-400 truncate">{sublabel}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-orange-600 rounded">
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button onClick={onDelete} className="p-1.5 text-gray-400 hover:text-red-600 rounded">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
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

function ProductRow({ product, onEdit, onDelete }: { product: Product; onEdit: () => void; onDelete: () => void }) {
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
        <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-orange-600 rounded">
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button onClick={onDelete} className="p-1.5 text-gray-400 hover:text-red-600 rounded">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
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

export default function BrandDetailPage() {
  const params = useParams();
  const brandId = params.brandId as string;

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
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);

  // Tab data
  const [productCategories, setProductCategories] = useState<Category[]>([]);
  const [invCategories, setInvCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [sizes, setSizes] = useState<Size[]>([]);
  const [addons, setAddons] = useState<Addon[]>([]);
  const [invItems, setInvItems] = useState<InventoryBrandTemplate[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [editingStoreId, setEditingStoreId] = useState<string | null>(null);
  const [editingStoreName, setEditingStoreName] = useState('');
  const [qrStore, setQrStore] = useState<{
    storeName: string;
    companySlug: string;
    brandSlug: string;
    storeSlug: string;
  } | null>(null);
  const [tabLoading, setTabLoading] = useState(false);


  // Modal state
  const [modal, setModal] = useState<{
    type: Tab | null;
    mode: 'create' | 'edit';
    item?: unknown;
  }>({ type: null, mode: 'create' });

  const closeModal = () => setModal({ type: null, mode: 'create' });

  // Load brand
  useEffect(() => {
    api
      .getBrandById(brandId)
      .then(b => {
        setBrand(b);
        setSettingsName(b.name);
        setSettingsDescription(b.description || '');
        setSettingsTheme(b.themeColors || {});
        setSettingsThemeHex(b.themeColors || {});
        setEnableFoodPanda(b.enabledDeliveryPlatforms?.includes('FOODPANDA') ?? false);
        setEnableGrab(b.enabledDeliveryPlatforms?.includes('GRAB') ?? false);
      })
      .catch(() => setError('Failed to load brand'))
      .finally(() => setLoading(false));
  }, [brandId]);


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
          const [cats, prods, szs, ads] = await Promise.all([
            api.getCategories(brandId, 'PRODUCT'),
            api.getProducts(brandId),
            api.getSizes(brandId),
            api.getAddons(brandId),
          ]);
          setProductCategories(cats);
          setProducts(prods);
          setSizes(szs);
          setAddons(ads);
        }
        if (tab === 'sizes') setSizes(await api.getSizes(brandId));
        if (tab === 'addons') setAddons(await api.getAddons(brandId));
        if (tab === 'inventory') {
          const [items, ic] = await Promise.all([
            api.getInventoryBrandTemplates(brandId),
            api.getCategories(brandId, 'INVENTORY'),
          ]);
          setInvItems(items);
          setInvCategories(ic);
        }
        if (tab === 'stores') setStores(await api.getStores(brandId));
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

  const handleSaveStoreName = async (storeId: string) => {
    if (!editingStoreName.trim()) return;
    try {
      const updated = await api.updateStore(storeId, { name: editingStoreName.trim() });
      setStores(prev => prev.map(s => s.id === storeId ? { ...s, name: updated.name } : s));
      setEditingStoreId(null);
    } catch { /* silent */ }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600" />
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
        <a href="/brands" className="text-gray-400 hover:text-gray-600">
          <ChevronLeft className="w-5 h-5" />
        </a>
        <div>
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
                  ? 'border-orange-600 text-orange-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
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
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600" />
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

        {/* Categories */}
        {activeTab === 'categories' && !tabLoading && (
          <div className="space-y-6">
            {/* Product Categories */}
            <TabSection
              title="Product Categories"
              onAdd={() => setModal({ type: 'categories', mode: 'create', item: { _catType: 'PRODUCT' } })}
            >
              {productCategories.length === 0 ? (
                <EmptyState message="No product categories yet" />
              ) : (
                productCategories.map((cat, i) => (
                  <CategoryRow
                    key={cat.id}
                    cat={cat}
                    index={i}
                    total={productCategories.length}
                    onMoveUp={() => reorderItem(productCategories, setProductCategories, i, 'up', (id, seq) => api.updateCategory(id, { sequenceNo: seq }))}
                    onMoveDown={() => reorderItem(productCategories, setProductCategories, i, 'down', (id, seq) => api.updateCategory(id, { sequenceNo: seq }))}
                    onEdit={() => setModal({ type: 'categories', mode: 'edit', item: cat })}
                    onDelete={async () => {
                      if (!confirm(`Delete "${cat.name}"?`)) return;
                      await api.deleteCategory(cat.id);
                      setProductCategories(prev => prev.filter(c => c.id !== cat.id));
                    }}
                  />
                ))
              )}
            </TabSection>

            {/* Inventory Categories */}
            <TabSection
              title="Inventory Categories"
              onAdd={() => setModal({ type: 'categories', mode: 'create', item: { _catType: 'INVENTORY' } })}
            >
              {invCategories.length === 0 ? (
                <EmptyState message="No inventory categories yet" />
              ) : (
                invCategories.map((cat, i) => (
                  <CategoryRow
                    key={cat.id}
                    cat={cat}
                    index={i}
                    total={invCategories.length}
                    onMoveUp={() => reorderItem(invCategories, setInvCategories, i, 'up', (id, seq) => api.updateCategory(id, { sequenceNo: seq }))}
                    onMoveDown={() => reorderItem(invCategories, setInvCategories, i, 'down', (id, seq) => api.updateCategory(id, { sequenceNo: seq }))}
                    onEdit={() => setModal({ type: 'categories', mode: 'edit', item: cat })}
                    onDelete={async () => {
                      if (!confirm(`Delete "${cat.name}"?`)) return;
                      await api.deleteCategory(cat.id);
                      setInvCategories(prev => prev.filter(c => c.id !== cat.id));
                    }}
                  />
                ))
              )}
            </TabSection>
          </div>
        )}

        {/* Products */}
        {activeTab === 'products' && !tabLoading && (
          <TabSection
            title="Products"
            onAdd={() => setModal({ type: 'products', mode: 'create' })}
          >
            {products.length === 0 ? (
              <EmptyState message="No products yet" />
            ) : (
              products.map(prod => (
                <ProductRow
                  key={prod.id}
                  product={prod}
                  onEdit={() => setModal({ type: 'products', mode: 'edit', item: prod })}
                  onDelete={async () => {
                    if (!confirm(`Delete "${prod.name}"?`)) return;
                    await api.deleteProduct(prod.id);
                    setProducts(prev => prev.filter(p => p.id !== prod.id));
                  }}
                />
              ))
            )}
          </TabSection>
        )}

        {/* Sizes */}
        {activeTab === 'sizes' && !tabLoading && (
          <TabSection
            title="Sizes"
            onAdd={() => setModal({ type: 'sizes', mode: 'create' })}
          >
            {sizes.length === 0 ? (
              <EmptyState message="No sizes yet" />
            ) : (
              sizes.map((size, i) => (
                <ReorderRow
                  key={size.id}
                  label={size.name}
                  sublabel={`Price modifier: +₱${size.priceModifier.toFixed(2)}`}
                  index={i}
                  total={sizes.length}
                  onMoveUp={() => reorderItem(sizes, setSizes, i, 'up', (id, seq) => api.updateSize(id, { sequenceNo: seq }))}
                  onMoveDown={() => reorderItem(sizes, setSizes, i, 'down', (id, seq) => api.updateSize(id, { sequenceNo: seq }))}
                  onEdit={() => setModal({ type: 'sizes', mode: 'edit', item: size })}
                  onDelete={async () => {
                    if (!confirm(`Delete "${size.name}"?`)) return;
                    await api.deleteSize(size.id);
                    setSizes(prev => prev.filter(s => s.id !== size.id));
                  }}
                />
              ))
            )}
          </TabSection>
        )}

        {/* Addons */}
        {activeTab === 'addons' && !tabLoading && (
          <TabSection
            title="Add-ons"
            onAdd={() => setModal({ type: 'addons', mode: 'create' })}
          >
            {addons.length === 0 ? (
              <EmptyState message="No add-ons yet" />
            ) : (
              addons.map((addon, i) => (
                <ReorderRow
                  key={addon.id}
                  label={addon.name}
                  sublabel={`₱${addon.price.toFixed(2)}`}
                  index={i}
                  total={addons.length}
                  onMoveUp={() => reorderItem(addons, setAddons, i, 'up', (id, seq) => api.updateAddon(id, { sequenceNo: seq }))}
                  onMoveDown={() => reorderItem(addons, setAddons, i, 'down', (id, seq) => api.updateAddon(id, { sequenceNo: seq }))}
                  onEdit={() => setModal({ type: 'addons', mode: 'edit', item: addon })}
                  onDelete={async () => {
                    if (!confirm(`Delete "${addon.name}"?`)) return;
                    await api.deleteAddon(addon.id);
                    setAddons(prev => prev.filter(a => a.id !== addon.id));
                  }}
                />
              ))
            )}
          </TabSection>
        )}

        {/* Stores */}
        {activeTab === 'stores' && !tabLoading && (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Store Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Store ID / Slug</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {stores.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-6 py-12 text-center text-sm text-gray-400">No stores under this brand yet.</td>
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
                            if (e.key === 'Enter') handleSaveStoreName(store.id);
                            if (e.key === 'Escape') setEditingStoreId(null);
                          }}
                          className="px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white w-full max-w-xs"
                          style={{ '--tw-ring-color': '#ea580c' } as React.CSSProperties}
                        />
                      ) : (
                        <p className="text-sm font-medium text-gray-900">{store.name}</p>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 font-mono">{store.slug}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          onClick={() => setQrStore({
                            storeName: store.name,
                            companySlug: brand?.company?.slug ?? '',
                            brandSlug: brand?.slug ?? '',
                            storeSlug: store.slug,
                          })}
                          title="View QR Code"
                          className="text-gray-400 hover:text-orange-600 transition-colors"
                        >
                          <QrCode className="w-4 h-4" />
                        </button>
                        {editingStoreId === store.id ? (
                          <div className="flex gap-3">
                            <button onClick={() => handleSaveStoreName(store.id)} className="text-sm text-orange-600 hover:text-orange-800 font-medium">Save</button>
                            <button onClick={() => setEditingStoreId(null)} className="text-sm text-gray-400 hover:text-gray-600">Cancel</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setEditingStoreId(store.id); setEditingStoreName(store.name); }}
                            className="text-sm text-gray-400 hover:text-gray-600"
                          >
                            Edit
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                  <label className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors ${
                    logoUploading ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-orange-600 text-white hover:bg-orange-700'
                  }`}>
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
                  <p className="text-xs text-gray-400 mt-2">JPEG, PNG, WebP or GIF · Max 5 MB</p>
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
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
                    style={{ '--tw-ring-color': '#ea580c' } as React.CSSProperties}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    value={settingsDescription}
                    onChange={e => setSettingsDescription(e.target.value)}
                    rows={2}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white resize-none"
                    style={{ '--tw-ring-color': '#ea580c' } as React.CSSProperties}
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
                            onChange={e => {
                              setSettingsTheme(prev => ({ ...prev, [key]: e.target.value }));
                              setSettingsThemeHex(prev => ({ ...prev, [key]: e.target.value }));
                            }}
                            className="w-9 h-9 rounded cursor-pointer border border-gray-200 p-0.5 shrink-0"
                          />
                          <input
                            type="text"
                            value={hexValue}
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
                            className="w-24 px-2 py-1 text-xs border border-gray-200 rounded-md font-mono focus:outline-none focus:ring-1 focus:ring-orange-500"
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
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enableFoodPanda}
                        onChange={e => setEnableFoodPanda(e.target.checked)}
                        className="rounded border-gray-300 text-pink-500 focus:ring-pink-500"
                      />
                      <span className="text-sm font-medium text-gray-700">FoodPanda</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enableGrab}
                        onChange={e => setEnableGrab(e.target.checked)}
                        className="rounded border-gray-300 text-green-500 focus:ring-green-500"
                      />
                      <span className="text-sm font-medium text-gray-700">Grab</span>
                    </label>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={settingsSaving}
                  className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 text-sm font-medium"
                >
                  <Save className="w-4 h-4" />
                  {settingsSaving ? 'Saving...' : 'Save Settings'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Inventory Items */}
        {activeTab === 'inventory' && !tabLoading && (
          <TabSection
            title="Inventory Items"
            onAdd={() => setModal({ type: 'inventory', mode: 'create' })}
          >
            {invItems.length === 0 ? (
              <EmptyState message="No inventory items yet" />
            ) : (
              invItems.map(item => (
                <CRUDRow
                  key={item.id}
                  label={item.name}
                  sublabel={`${item.unit}${item.category ? ` · ${item.category}` : ''}`}
                  onEdit={() => setModal({ type: 'inventory', mode: 'edit', item })}
                  onDelete={async () => {
                    if (!confirm(`Delete "${item.name}"?`)) return;
                    await api.deleteInventoryBrandTemplate(item.id);
                    setInvItems(prev => prev.filter(i => i.id !== item.id));
                  }}
                />
              ))
            )}
          </TabSection>
        )}

      </div>

      {/* Modals */}
      {modal.type === 'categories' && (
        <CategoryModal
          mode={modal.mode}
          item={modal.mode === 'edit' ? modal.item as Category : undefined}
          catType={(modal.item as any)?._catType ?? (modal.mode === 'edit' ? (modal.item as Category)?.type : 'PRODUCT')}
          brandId={brandId}
          onClose={closeModal}
          onSave={cat => {
            if (modal.mode === 'create') {
              if (cat.type === 'INVENTORY') {
                setInvCategories(prev => [...prev, cat]);
              } else {
                setProductCategories(prev => [...prev, cat]);
              }
            } else {
              setProductCategories(prev => prev.map(c => (c.id === cat.id ? cat : c)));
              setInvCategories(prev => prev.map(c => (c.id === cat.id ? cat : c)));
            }
            closeModal();
          }}
        />
      )}

      {modal.type === 'products' && (
        <ProductModal
          mode={modal.mode}
          item={modal.item as Product | undefined}
          brandId={brandId}
          brand={brand}
          categories={productCategories}
          sizes={sizes}
          addons={addons}
          onClose={closeModal}
          onSave={prod => {
            if (modal.mode === 'create') {
              setProducts(prev => [...prev, prod]);
            } else {
              setProducts(prev => prev.map(p => (p.id === prod.id ? prod : p)));
            }
            closeModal();
          }}
        />
      )}

      {modal.type === 'sizes' && (
        <SizeModal
          mode={modal.mode}
          item={modal.item as Size | undefined}
          brandId={brandId}
          brand={brand}
          onClose={closeModal}
          onSave={size => {
            if (modal.mode === 'create') {
              setSizes(prev => [...prev, size]);
            } else {
              setSizes(prev => prev.map(s => (s.id === size.id ? size : s)));
            }
            closeModal();
          }}
        />
      )}

      {modal.type === 'addons' && (
        <AddonModal
          mode={modal.mode}
          item={modal.item as Addon | undefined}
          brandId={brandId}
          brand={brand}
          onClose={closeModal}
          onSave={addon => {
            if (modal.mode === 'create') {
              setAddons(prev => [...prev, addon]);
            } else {
              setAddons(prev => prev.map(a => (a.id === addon.id ? addon : a)));
            }
            closeModal();
          }}
        />
      )}

      {modal.type === 'inventory' && (
        <InventoryModal
          mode={modal.mode}
          item={modal.item as InventoryBrandTemplate | undefined}
          brandId={brandId}
          categories={invCategories}
          onClose={closeModal}
          onSave={item => {
            if (modal.mode === 'create') {
              setInvItems(prev => [...prev, item]);
            } else {
              setInvItems(prev => prev.map(i => (i.id === item.id ? item : i)));
            }
            closeModal();
          }}
        />
      )}

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
  children,
}: {
  title: string;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-lg border">
      <div className="flex items-center justify-between px-5 py-4 border-b">
        <h2 className="font-semibold text-gray-900 text-sm">{title}</h2>
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 text-sm text-orange-600 hover:text-orange-800 font-medium"
        >
          <Plus className="w-4 h-4" /> Add
        </button>
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

// ─── CRUD Modals ──────────────────────────────────────────────────────────

function CategoryModal({
  mode,
  item,
  catType = 'PRODUCT',
  brandId,
  onClose,
  onSave,
}: {
  mode: 'create' | 'edit';
  item?: Category;
  catType?: 'PRODUCT' | 'INVENTORY';
  brandId: string;
  onClose: () => void;
  onSave: (cat: Category) => void;
}) {
  const [name, setName] = useState(item?.name || '');
  const [description, setDescription] = useState(item?.description || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const typeLabel = catType === 'INVENTORY' ? 'Inventory Category' : 'Product Category';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      let result: Category;
      if (mode === 'create') {
        result = await api.createCategory({ name, description: description || undefined, brandId, type: catType });
      } else {
        result = await api.updateCategory(item!.id, { name, description: description || undefined });
      }
      onSave(result);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr?.response?.data?.message || 'Failed to save');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title={mode === 'create' ? `New ${typeLabel}` : `Edit ${typeLabel}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
            style={{ '--tw-ring-color': '#ea580c' } as React.CSSProperties}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description <span className="text-gray-400 font-normal">(optional)</span></label>
          <input
            type="text"
            value={description}
            onChange={e => setDescription(e.target.value)}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
            style={{ '--tw-ring-color': '#ea580c' } as React.CSSProperties}
          />
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={loading} className="flex-1 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-50">
            {loading ? 'Saving...' : mode === 'create' ? 'Create' : 'Update'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ProductModal({
  mode,
  item,
  brandId,
  brand,
  categories,
  sizes,
  addons,
  onClose,
  onSave,
}: {
  mode: 'create' | 'edit';
  item?: Product;
  brandId: string;
  brand: Brand | null;
  categories: Category[];
  sizes: Size[];
  addons: Addon[];
  onClose: () => void;
  onSave: (prod: Product) => void;
}) {
  const [name, setName] = useState(item?.name || '');
  const [price, setPrice] = useState(item?.price?.toString() || '');
  const [foodpandaPrice, setFoodpandaPrice] = useState(
    item?.foodpandaPrice != null ? item.foodpandaPrice.toString() : ''
  );
  const [grabPrice, setGrabPrice] = useState(
    item?.grabPrice != null ? item.grabPrice.toString() : ''
  );
  const [categoryId, setCategoryId] = useState(item?.categoryId || '');
  const [selectedSizeIds, setSelectedSizeIds] = useState<string[]>(item?.sizes?.map(s => s.id) ?? []);
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>(item?.addons?.map(a => a.id) ?? []);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(resolveUrl(item?.image));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleId = (set: string[], setFn: (v: string[]) => void, id: string) =>
    setFn(set.includes(id) ? set.filter(x => x !== id) : [...set, id]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    e.target.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const parseOptionalPrice = (val: string): number | null =>
      val.trim() === '' ? null : parseFloat(val);
    try {
      let result: Product;
      if (mode === 'create') {
        result = await api.createProduct({ name, price: parseFloat(price), categoryId: categoryId || undefined, sizeIds: selectedSizeIds, addonIds: selectedAddonIds, brandId, foodpandaPrice: parseOptionalPrice(foodpandaPrice), grabPrice: parseOptionalPrice(grabPrice) });
      } else {
        result = await api.updateProduct(item!.id, { name, price: parseFloat(price), categoryId: categoryId || undefined, sizeIds: selectedSizeIds, addonIds: selectedAddonIds, foodpandaPrice: parseOptionalPrice(foodpandaPrice), grabPrice: parseOptionalPrice(grabPrice) });
      }
      if (imageFile) {
        result = await api.uploadProductImage(result.id, brandId, imageFile);
      }
      onSave(result);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr?.response?.data?.message || 'Failed to save');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title={mode === 'create' ? 'New Product' : 'Edit Product'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-red-600 text-sm">{error}</p>}

        {/* Image upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Product Image <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0">
              {imagePreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
              ) : (
                <Upload className="w-6 h-6 text-gray-300" />
              )}
            </div>
            <div className="flex-1">
              <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer bg-orange-600 text-white hover:bg-orange-700 transition-colors">
                <Upload className="w-3.5 h-3.5" />
                {imagePreview ? 'Change Image' : 'Upload Image'}
                <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" onChange={handleImageChange} />
              </label>
              {imagePreview && (
                <button
                  type="button"
                  onClick={() => { setImageFile(null); setImagePreview(null); }}
                  className="ml-2 text-xs text-gray-400 hover:text-red-500"
                >
                  Remove
                </button>
              )}
              <p className="text-xs text-gray-400 mt-1">JPEG, PNG, WebP or GIF · Max 5 MB</p>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} required
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
            style={{ '--tw-ring-color': '#ea580c' } as React.CSSProperties} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Price</label>
          <input type="number" value={price} onChange={e => setPrice(e.target.value)} required min="0" step="0.01"
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
            style={{ '--tw-ring-color': '#ea580c' } as React.CSSProperties} />
        </div>
        {(brand?.enabledDeliveryPlatforms?.includes('FOODPANDA') ||
          brand?.enabledDeliveryPlatforms?.includes('GRAB')) && (
          <div className="grid grid-cols-2 gap-3">
            {brand?.enabledDeliveryPlatforms?.includes('FOODPANDA') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  FoodPanda Price <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="number"
                  value={foodpandaPrice}
                  onChange={e => setFoodpandaPrice(e.target.value)}
                  min="0"
                  step="0.01"
                  placeholder="Same as base price"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white text-sm"
                  style={{ '--tw-ring-color': '#ec4899' } as React.CSSProperties}
                />
              </div>
            )}
            {brand?.enabledDeliveryPlatforms?.includes('GRAB') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Grab Price <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="number"
                  value={grabPrice}
                  onChange={e => setGrabPrice(e.target.value)}
                  min="0"
                  step="0.01"
                  placeholder="Same as base price"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white text-sm"
                  style={{ '--tw-ring-color': '#22c55e' } as React.CSSProperties}
                />
              </div>
            )}
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
          <Select value={categoryId || 'none'} onValueChange={v => setCategoryId(v === 'none' ? '' : v)}>
            <SelectTrigger>
              <SelectValue placeholder="— None —" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— None —</SelectItem>
              {categories.map(cat => (
                <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {/* Sizes */}
        {sizes.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Sizes</label>
            <div className="border border-gray-200 rounded-lg divide-y max-h-40 overflow-y-auto">
              {sizes.map(s => (
                <label key={s.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedSizeIds.includes(s.id)}
                    onChange={() => toggleId(selectedSizeIds, setSelectedSizeIds, s.id)}
                    className="rounded border-gray-300 text-orange-600"
                  />
                  <span className="text-sm text-gray-800 flex-1">{s.name}</span>
                  {s.priceModifier !== 0 && (
                    <span className="text-xs text-gray-400">
                      {s.priceModifier > 0 ? '+' : ''}₱{s.priceModifier}
                    </span>
                  )}
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Add-ons */}
        {addons.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Add-ons</label>
            <div className="border border-gray-200 rounded-lg divide-y max-h-40 overflow-y-auto">
              {addons.map(a => (
                <label key={a.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedAddonIds.includes(a.id)}
                    onChange={() => toggleId(selectedAddonIds, setSelectedAddonIds, a.id)}
                    className="rounded border-gray-300 text-orange-600"
                  />
                  <span className="text-sm text-gray-800 flex-1">{a.name}</span>
                  <span className="text-xs text-gray-400">+₱{a.price}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={loading} className="flex-1 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-50">
            {loading ? 'Saving...' : mode === 'create' ? 'Create' : 'Update'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function SizeModal({
  mode,
  item,
  brandId,
  brand,
  onClose,
  onSave,
}: {
  mode: 'create' | 'edit';
  item?: Size;
  brandId: string;
  brand: Brand | null;
  onClose: () => void;
  onSave: (size: Size) => void;
}) {
  const [name, setName] = useState(item?.name || '');
  const [priceModifier, setPriceModifier] = useState(item?.priceModifier?.toString() || '0');
  const [foodpandaPrice, setFoodpandaPrice] = useState(
    item?.foodpandaPrice != null ? item.foodpandaPrice.toString() : ''
  );
  const [grabPrice, setGrabPrice] = useState(
    item?.grabPrice != null ? item.grabPrice.toString() : ''
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const parseOptionalPrice = (val: string): number | null =>
      val.trim() === '' ? null : parseFloat(val);
    try {
      let result: Size;
      if (mode === 'create') {
        result = await api.createSize({
          name,
          priceModifier: parseFloat(priceModifier),
          foodpandaPrice: parseOptionalPrice(foodpandaPrice),
          grabPrice: parseOptionalPrice(grabPrice),
          brandId,
        });
      } else {
        result = await api.updateSize(item!.id, {
          name,
          priceModifier: parseFloat(priceModifier),
          foodpandaPrice: parseOptionalPrice(foodpandaPrice),
          grabPrice: parseOptionalPrice(grabPrice),
        });
      }
      onSave(result);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr?.response?.data?.message || 'Failed to save');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title={mode === 'create' ? 'New Size' : 'Edit Size'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} required
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
            placeholder="e.g. Small, Medium, Large"
            style={{ '--tw-ring-color': '#ea580c' } as React.CSSProperties} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Price Modifier (+₱)</label>
          <input type="number" value={priceModifier} onChange={e => setPriceModifier(e.target.value)} required min="0" step="0.01"
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
            style={{ '--tw-ring-color': '#ea580c' } as React.CSSProperties} />
        </div>
        {(brand?.enabledDeliveryPlatforms?.includes('FOODPANDA') ||
          brand?.enabledDeliveryPlatforms?.includes('GRAB')) && (
          <div className="grid grid-cols-2 gap-3">
            {brand?.enabledDeliveryPlatforms?.includes('FOODPANDA') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  FoodPanda Modifier <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="number" value={foodpandaPrice}
                  onChange={e => setFoodpandaPrice(e.target.value)}
                  min="0" step="0.01" placeholder="Same as base"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white text-sm"
                  style={{ '--tw-ring-color': '#ec4899' } as React.CSSProperties}
                />
              </div>
            )}
            {brand?.enabledDeliveryPlatforms?.includes('GRAB') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Grab Modifier <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="number" value={grabPrice}
                  onChange={e => setGrabPrice(e.target.value)}
                  min="0" step="0.01" placeholder="Same as base"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white text-sm"
                  style={{ '--tw-ring-color': '#22c55e' } as React.CSSProperties}
                />
              </div>
            )}
          </div>
        )}
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={loading} className="flex-1 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-50">
            {loading ? 'Saving...' : mode === 'create' ? 'Create' : 'Update'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AddonModal({
  mode,
  item,
  brandId,
  brand,
  onClose,
  onSave,
}: {
  mode: 'create' | 'edit';
  item?: Addon;
  brandId: string;
  brand: Brand | null;
  onClose: () => void;
  onSave: (addon: Addon) => void;
}) {
  const [name, setName] = useState(item?.name || '');
  const [price, setPrice] = useState(item?.price?.toString() || '0');
  const [foodpandaPrice, setFoodpandaPrice] = useState(
    item?.foodpandaPrice != null ? item.foodpandaPrice.toString() : ''
  );
  const [grabPrice, setGrabPrice] = useState(
    item?.grabPrice != null ? item.grabPrice.toString() : ''
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const parseOptionalPrice = (val: string): number | null =>
      val.trim() === '' ? null : parseFloat(val);
    try {
      let result: Addon;
      if (mode === 'create') {
        result = await api.createAddon({ name, price: parseFloat(price), brandId, foodpandaPrice: parseOptionalPrice(foodpandaPrice), grabPrice: parseOptionalPrice(grabPrice) });
      } else {
        result = await api.updateAddon(item!.id, { name, price: parseFloat(price), foodpandaPrice: parseOptionalPrice(foodpandaPrice), grabPrice: parseOptionalPrice(grabPrice) });
      }
      onSave(result);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr?.response?.data?.message || 'Failed to save');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title={mode === 'create' ? 'New Add-on' : 'Edit Add-on'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} required
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
            placeholder="e.g. Tapioca, Jelly"
            style={{ '--tw-ring-color': '#ea580c' } as React.CSSProperties} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Price (+$)</label>
          <input type="number" value={price} onChange={e => setPrice(e.target.value)} required min="0" step="0.01"
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
            style={{ '--tw-ring-color': '#ea580c' } as React.CSSProperties} />
        </div>
        {(brand?.enabledDeliveryPlatforms?.includes('FOODPANDA') ||
          brand?.enabledDeliveryPlatforms?.includes('GRAB')) && (
          <div className="grid grid-cols-2 gap-3">
            {brand?.enabledDeliveryPlatforms?.includes('FOODPANDA') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  FoodPanda Price <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="number"
                  value={foodpandaPrice}
                  onChange={e => setFoodpandaPrice(e.target.value)}
                  min="0"
                  step="0.01"
                  placeholder="Same as base price"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white text-sm"
                  style={{ '--tw-ring-color': '#ec4899' } as React.CSSProperties}
                />
              </div>
            )}
            {brand?.enabledDeliveryPlatforms?.includes('GRAB') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Grab Price <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="number"
                  value={grabPrice}
                  onChange={e => setGrabPrice(e.target.value)}
                  min="0"
                  step="0.01"
                  placeholder="Same as base price"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white text-sm"
                  style={{ '--tw-ring-color': '#22c55e' } as React.CSSProperties}
                />
              </div>
            )}
          </div>
        )}
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={loading} className="flex-1 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-50">
            {loading ? 'Saving...' : mode === 'create' ? 'Create' : 'Update'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function InventoryModal({
  mode,
  item,
  brandId,
  categories,
  onClose,
  onSave,
}: {
  mode: 'create' | 'edit';
  item?: InventoryBrandTemplate;
  brandId: string;
  categories: Category[];
  onClose: () => void;
  onSave: (item: InventoryBrandTemplate) => void;
}) {
  const [name, setName] = useState(item?.name || '');
  const [unit, setUnit] = useState(item?.unit || '');
  const [category, setCategory] = useState(item?.category || '');
  const [minStockLevel, setMinStockLevel] = useState(item?.minStockLevel?.toString() || '');
  const [requiresExpirationDate, setRequiresExpirationDate] = useState(item?.requiresExpirationDate ?? false);
  const [expirationWarningDays, setExpirationWarningDays] = useState(
    item?.expirationWarningDays?.toString() || ''
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const body = {
        name,
        unit,
        category: category || undefined,
        minStockLevel: minStockLevel ? parseInt(minStockLevel) : undefined,
        requiresExpirationDate,
        expirationWarningDays: requiresExpirationDate && expirationWarningDays ? parseInt(expirationWarningDays) : undefined,
      };
      let result: InventoryBrandTemplate;
      if (mode === 'create') {
        result = await api.createInventoryBrandTemplate({ ...body, brandId });
      } else {
        result = await api.updateInventoryBrandTemplate(item!.id, body);
      }
      onSave(result);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr?.response?.data?.message || 'Failed to save');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title={mode === 'create' ? 'New Inventory Item' : 'Edit Inventory Item'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} required
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
            style={{ '--tw-ring-color': '#ea580c' } as React.CSSProperties} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
          <input type="text" value={unit} onChange={e => setUnit(e.target.value)} required
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
            placeholder="e.g. kg, liters, bags"
            style={{ '--tw-ring-color': '#ea580c' } as React.CSSProperties} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Category (optional)</label>
          <Select value={category || 'none'} onValueChange={v => setCategory(v === 'none' ? '' : v)}>
            <SelectTrigger>
              <SelectValue placeholder="— None —" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— None —</SelectItem>
              {categories.map(c => (
                <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Min Stock Level</label>
          <input type="number" value={minStockLevel} onChange={e => setMinStockLevel(e.target.value)} min="0"
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
            style={{ '--tw-ring-color': '#ea580c' } as React.CSSProperties} />
        </div>
        <div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={requiresExpirationDate}
              onChange={e => setRequiresExpirationDate(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
            />
            <span className="text-sm font-medium text-gray-700">Track expiration dates</span>
          </label>
          {requiresExpirationDate && (
            <div className="mt-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Expiry Warning (days before)
              </label>
              <input type="number" value={expirationWarningDays} onChange={e => setExpirationWarningDays(e.target.value)} min="1"
                placeholder="7"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
                style={{ '--tw-ring-color': '#ea580c' } as React.CSSProperties} />
              <p className="mt-1 text-xs text-gray-400">
                How many days before expiry to show a warning. Defaults to 7 days if left blank.
              </p>
            </div>
          )}
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={loading} className="flex-1 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-50">
            {loading ? 'Saving...' : mode === 'create' ? 'Create' : 'Update'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
