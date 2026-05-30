'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import type { Brand, Category, Product, Size, Addon, InventoryBrandTemplate } from '@/types';
import { Plus, Pencil, Trash2, X, ChevronLeft, Upload, Save } from 'lucide-react';

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
        <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-indigo-600 rounded">
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
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);

  // Tab data
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [sizes, setSizes] = useState<Size[]>([]);
  const [addons, setAddons] = useState<Addon[]>([]);
  const [invItems, setInvItems] = useState<InventoryBrandTemplate[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [editingStoreId, setEditingStoreId] = useState<string | null>(null);
  const [editingStoreName, setEditingStoreName] = useState('');
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
      })
      .catch(() => setError('Failed to load brand'))
      .finally(() => setLoading(false));
  }, [brandId]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!brand) return;
    setSettingsSaving(true);
    try {
      const updated = await api.updateBrand(brand.id, {
        name: settingsName,
        description: settingsDescription || undefined,
        themeColors: Object.keys(settingsTheme || {}).length ? settingsTheme : undefined,
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
        if (tab === 'categories') setCategories(await api.getCategories(brandId));
        if (tab === 'products') {
          const [cats, prods] = await Promise.all([
            api.getCategories(brandId),
            api.getProducts(brandId),
          ]);
          setCategories(cats);
          setProducts(prods);
        }
        if (tab === 'sizes') setSizes(await api.getSizes(brandId));
        if (tab === 'addons') setAddons(await api.getAddons(brandId));
        if (tab === 'inventory') setInvItems(await api.getInventoryBrandTemplates(brandId));
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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
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
                  ? 'border-indigo-600 text-indigo-600'
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
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
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
          <TabSection
            title="Categories"
            onAdd={() => setModal({ type: 'categories', mode: 'create' })}
          >
            {categories.length === 0 ? (
              <EmptyState message="No categories yet" />
            ) : (
              categories.map(cat => (
                <CRUDRow
                  key={cat.id}
                  label={cat.name}
                  onEdit={() => setModal({ type: 'categories', mode: 'edit', item: cat })}
                  onDelete={async () => {
                    if (!confirm(`Delete "${cat.name}"?`)) return;
                    await api.deleteCategory(cat.id);
                    setCategories(prev => prev.filter(c => c.id !== cat.id));
                  }}
                />
              ))
            )}
          </TabSection>
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
                <CRUDRow
                  key={prod.id}
                  label={prod.name}
                  sublabel={`$${prod.price.toFixed(2)} · ${prod.category?.name || ''}`}
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
              sizes.map(size => (
                <CRUDRow
                  key={size.id}
                  label={size.name}
                  sublabel={`Price modifier: +$${size.priceModifier.toFixed(2)}`}
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
              addons.map(addon => (
                <CRUDRow
                  key={addon.id}
                  label={addon.name}
                  sublabel={`$${addon.price.toFixed(2)}`}
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
                          className="px-3 py-1.5 border border-indigo-400 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full max-w-xs"
                        />
                      ) : (
                        <p className="text-sm font-medium text-gray-900">{store.name}</p>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 font-mono">{store.slug}</td>
                    <td className="px-6 py-4 text-right">
                      {editingStoreId === store.id ? (
                        <div className="flex gap-3 justify-end">
                          <button onClick={() => handleSaveStoreName(store.id)} className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">Save</button>
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
                    logoUploading ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    value={settingsDescription}
                    onChange={e => setSettingsDescription(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm resize-none"
                  />
                </div>

                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Theme Colors</p>
                  <p className="text-xs text-gray-400 mb-3">These colors are used as branding in the Store Portal and App</p>
                  <div className="grid grid-cols-2 gap-3">
                    {(['primary', 'secondary', 'accent', 'background', 'text'] as const).map(key => (
                      <div key={key} className="flex items-center gap-3">
                        <input
                          type="color"
                          value={settingsTheme?.[key] || (key === 'background' ? '#ffffff' : key === 'text' ? '#1f2937' : '#ea580c')}
                          onChange={e => setSettingsTheme(prev => ({ ...prev, [key]: e.target.value }))}
                          className="w-9 h-9 rounded cursor-pointer border border-gray-200 p-0.5"
                        />
                        <span className="text-sm text-gray-600 capitalize">{key}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={settingsSaving}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium"
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
          item={modal.item as Category | undefined}
          brandId={brandId}
          onClose={closeModal}
          onSave={cat => {
            if (modal.mode === 'create') {
              setCategories(prev => [...prev, cat]);
            } else {
              setCategories(prev => prev.map(c => (c.id === cat.id ? cat : c)));
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
          categories={categories}
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
          categories={categories}
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
          className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
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
  brandId,
  onClose,
  onSave,
}: {
  mode: 'create' | 'edit';
  item?: Category;
  brandId: string;
  onClose: () => void;
  onSave: (cat: Category) => void;
}) {
  const [name, setName] = useState(item?.name || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      let result: Category;
      if (mode === 'create') {
        result = await api.createCategory({ name, brandId });
      } else {
        result = await api.updateCategory(item!.id, { name });
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
    <Modal title={mode === 'create' ? 'New Category' : 'Edit Category'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
          />
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={loading} className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
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
  categories,
  onClose,
  onSave,
}: {
  mode: 'create' | 'edit';
  item?: Product;
  brandId: string;
  categories: Category[];
  onClose: () => void;
  onSave: (prod: Product) => void;
}) {
  const [name, setName] = useState(item?.name || '');
  const [price, setPrice] = useState(item?.price?.toString() || '');
  const [categoryId, setCategoryId] = useState(item?.categoryId || categories[0]?.id || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      let result: Product;
      if (mode === 'create') {
        result = await api.createProduct({ name, price: parseFloat(price), categoryId, brandId });
      } else {
        result = await api.updateProduct(item!.id, { name, price: parseFloat(price), categoryId });
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
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Price ($)</label>
          <input type="number" value={price} onChange={e => setPrice(e.target.value)} required min="0" step="0.01"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
          <select value={categoryId} onChange={e => setCategoryId(e.target.value)} required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm bg-white">
            {categories.map(cat => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={loading} className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
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
  onClose,
  onSave,
}: {
  mode: 'create' | 'edit';
  item?: Size;
  brandId: string;
  onClose: () => void;
  onSave: (size: Size) => void;
}) {
  const [name, setName] = useState(item?.name || '');
  const [priceModifier, setPriceModifier] = useState(item?.priceModifier?.toString() || '0');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      let result: Size;
      if (mode === 'create') {
        result = await api.createSize({ name, priceModifier: parseFloat(priceModifier), brandId });
      } else {
        result = await api.updateSize(item!.id, { name, priceModifier: parseFloat(priceModifier) });
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
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
            placeholder="e.g. Small, Medium, Large" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Price Modifier (+$)</label>
          <input type="number" value={priceModifier} onChange={e => setPriceModifier(e.target.value)} required min="0" step="0.01"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={loading} className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
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
  onClose,
  onSave,
}: {
  mode: 'create' | 'edit';
  item?: Addon;
  brandId: string;
  onClose: () => void;
  onSave: (addon: Addon) => void;
}) {
  const [name, setName] = useState(item?.name || '');
  const [price, setPrice] = useState(item?.price?.toString() || '0');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      let result: Addon;
      if (mode === 'create') {
        result = await api.createAddon({ name, price: parseFloat(price), brandId });
      } else {
        result = await api.updateAddon(item!.id, { name, price: parseFloat(price) });
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
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
            placeholder="e.g. Tapioca, Jelly" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Price (+$)</label>
          <input type="number" value={price} onChange={e => setPrice(e.target.value)} required min="0" step="0.01"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={loading} className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
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
        expirationWarningDays: expirationWarningDays ? parseInt(expirationWarningDays) : undefined,
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
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
          <input type="text" value={unit} onChange={e => setUnit(e.target.value)} required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
            placeholder="e.g. kg, liters, bags" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Category (optional)</label>
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm bg-white text-gray-900"
          >
            <option value="">— None —</option>
            {categories.map(c => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Min Stock Level</label>
            <input type="number" value={minStockLevel} onChange={e => setMinStockLevel(e.target.value)} min="0"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Warning (days)</label>
            <input type="number" value={expirationWarningDays} onChange={e => setExpirationWarningDays(e.target.value)} min="0"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
          </div>
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={loading} className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
            {loading ? 'Saving...' : mode === 'create' ? 'Create' : 'Update'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
