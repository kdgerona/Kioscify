'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import type { Brand, Menu, Category, Product, Size, Addon, Preference, PriceTier, ProductPriceTier, SizePriceTier, AddonPriceTier } from '@/types';
import { Plus, Pencil, Trash2, X, ChevronLeft, Upload, ChevronUp, ChevronDown, Star } from 'lucide-react';
import { toast } from 'sonner';
import { hasPrivilege } from '@/lib/privileges';
import { getErrorMessage } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type Tab = 'products' | 'categories' | 'sizes' | 'addons' | 'preferences' | 'price-tiers';

const TABS: { id: Tab; label: string }[] = [
  { id: 'products', label: 'Products' },
  { id: 'categories', label: 'Categories' },
  { id: 'sizes', label: 'Sizes' },
  { id: 'addons', label: 'Add-ons' },
  { id: 'preferences', label: 'Preferences' },
  { id: 'price-tiers', label: 'Price Tiers' },
];

const UPLOAD_MAX_SIZE = 5 * 1024 * 1024;
const UPLOAD_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const apiBase = process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') || 'http://localhost:3000';

function resolveUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const path = raw.startsWith('http') ? new URL(raw).pathname : raw;
    return `${apiBase}${path}`;
  } catch { return raw; }
}

// ─── Shared row/section components ────────────────────────────────────────

function CategoryRow({
  cat, index, total, onMoveUp, onMoveDown, onEdit, onDelete, showEdit = true, showDelete = true,
}: {
  cat: Category; index: number; total: number; onMoveUp: () => void; onMoveDown: () => void;
  onEdit: () => void; onDelete: () => void; showEdit?: boolean; showDelete?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors gap-2">
      {showEdit && (
        <div className="flex flex-col items-center gap-0.5 shrink-0">
          <button onClick={onMoveUp} disabled={index === 0} className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-20 disabled:cursor-not-allowed">
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <span className="text-xs text-gray-400 font-mono w-5 text-center leading-none">{index + 1}</span>
          <button onClick={onMoveDown} disabled={index === total - 1} className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-20 disabled:cursor-not-allowed">
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{cat.name}</p>
        {cat.description && <p className="text-xs text-gray-400 truncate">{cat.description}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {showEdit && <button onClick={onEdit} className="p-1.5 text-gray-400 hover:opacity-70 rounded"><Pencil className="w-3.5 h-3.5" /></button>}
        {showDelete && <button onClick={onDelete} className="p-1.5 text-gray-400 hover:text-red-600 rounded"><Trash2 className="w-3.5 h-3.5" /></button>}
      </div>
    </div>
  );
}

function ReorderRow({
  label, sublabel, index, total, onMoveUp, onMoveDown, onEdit, onDelete, isDefault, onSetDefault, showEdit = true, showDelete = true,
}: {
  label: string; sublabel?: string; index: number; total: number; onMoveUp: () => void; onMoveDown: () => void;
  onEdit: () => void; onDelete: () => void; isDefault?: boolean; onSetDefault?: () => void; showEdit?: boolean; showDelete?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors gap-2">
      {showEdit && (
        <div className="flex flex-col items-center gap-0.5 shrink-0">
          <button onClick={onMoveUp} disabled={index === 0} className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-20 disabled:cursor-not-allowed">
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <span className="text-xs text-gray-400 font-mono w-5 text-center leading-none">{index + 1}</span>
          <button onClick={onMoveDown} disabled={index === total - 1} className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-20 disabled:cursor-not-allowed">
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
          <button onClick={onSetDefault} title={isDefault ? 'Default preference' : 'Set as default'} className={`p-1.5 rounded ${isDefault ? 'text-yellow-500' : 'text-gray-300 hover:text-yellow-400'}`}>
            <Star className="w-3.5 h-3.5" fill={isDefault ? 'currentColor' : 'none'} />
          </button>
        )}
        {showEdit && <button onClick={onEdit} className="p-1.5 text-gray-400 hover:opacity-70 rounded"><Pencil className="w-3.5 h-3.5" /></button>}
        {showDelete && <button onClick={onDelete} className="p-1.5 text-gray-400 hover:text-red-600 rounded"><Trash2 className="w-3.5 h-3.5" /></button>}
      </div>
    </div>
  );
}

function ProductRow({
  product, onEdit, onDelete, showEdit = true, showDelete = true,
}: {
  product: Product; onEdit: () => void; onDelete: () => void; showEdit?: boolean; showDelete?: boolean;
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
        {showEdit && <button onClick={onEdit} className="p-1.5 text-gray-400 hover:opacity-70 rounded"><Pencil className="w-3.5 h-3.5" /></button>}
        {showDelete && <button onClick={onDelete} className="p-1.5 text-gray-400 hover:text-red-600 rounded"><Trash2 className="w-3.5 h-3.5" /></button>}
      </div>
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function TabSection({ title, onAdd, showAdd = true, children }: { title: string; onAdd: () => void; showAdd?: boolean; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg border">
      <div className="flex items-center justify-between px-5 py-4 border-b">
        <h2 className="font-semibold text-gray-900 text-sm">{title}</h2>
        {showAdd && (
          <button onClick={onAdd} className="flex items-center gap-1.5 text-sm font-medium hover:opacity-80" style={{ color: 'var(--company-primary, #ea580c)' }}>
            <Plus className="w-4 h-4" /> Add
          </button>
        )}
      </div>
      <div className="divide-y">{children}</div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <div className="py-10 text-center text-gray-400 text-sm">{message}</div>;
}

// ─── Main Page ────────────────────────────────────────────────────────────

export default function MenuWorkspacePage() {
  const params = useParams();
  const brandId = params.brandId as string;
  const menuId = params.menuId as string;

  const canWrite = hasPrivilege('brands', 'write');
  const canDelete = hasPrivilege('brands', 'all');

  const [menu, setMenu] = useState<Menu | null>(null);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('products');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tabLoading, setTabLoading] = useState(false);

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [sizes, setSizes] = useState<Size[]>([]);
  const [addons, setAddons] = useState<Addon[]>([]);
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [priceTiers, setPriceTiers] = useState<PriceTier[]>([]);

  const [newTierName, setNewTierName] = useState('');
  const [newTierSaving, setNewTierSaving] = useState(false);
  const [editingTierId, setEditingTierId] = useState<string | null>(null);
  const [editingTierName, setEditingTierName] = useState('');

  const [modal, setModal] = useState<{ type: Tab | null; mode: 'create' | 'edit'; item?: unknown }>({ type: null, mode: 'create' });
  const closeModal = () => setModal({ type: null, mode: 'create' });

  useEffect(() => {
    Promise.all([api.getBrandById(brandId), api.getMenu(brandId, menuId), api.getPriceTiers(menuId)])
      .then(([b, m, tiers]) => {
        setBrand(b);
        setMenu(m);
        setPriceTiers(tiers);
      })
      .catch(() => setError('Failed to load menu'))
      .finally(() => setLoading(false));
  }, [brandId, menuId]);

  const reorderItem = async <T extends { id: string; sequenceNo?: number }>(
    list: T[], setList: React.Dispatch<React.SetStateAction<T[]>>, index: number, direction: 'up' | 'down',
    updateFn: (id: string, sequenceNo: number) => Promise<T>,
  ) => {
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= list.length) return;
    const reordered = [...list];
    [reordered[index], reordered[swapIndex]] = [reordered[swapIndex], reordered[index]];
    const stamped = reordered.map((item, i) => ({ ...item, sequenceNo: i }));
    setList(stamped);
    try {
      await Promise.all([updateFn(stamped[index].id, index), updateFn(stamped[swapIndex].id, swapIndex)]);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Failed to reorder'));
    }
  };

  const loadTab = useCallback(
    async (tab: Tab) => {
      if (tab === 'price-tiers') return;
      setTabLoading(true);
      try {
        if (tab === 'categories') setCategories(await api.getCategories({ menuId }, 'PRODUCT'));
        if (tab === 'products') {
          const [cats, prods, szs, ads, prefs] = await Promise.all([
            api.getCategories({ menuId }, 'PRODUCT'),
            api.getProducts(menuId),
            api.getSizes(menuId),
            api.getAddons(menuId),
            api.getPreferences(menuId),
          ]);
          setCategories(cats);
          setProducts(prods);
          setSizes(szs);
          setAddons(ads);
          setPreferences(prefs);
        }
        if (tab === 'sizes') setSizes(await api.getSizes(menuId));
        if (tab === 'addons') setAddons(await api.getAddons(menuId));
        if (tab === 'preferences') setPreferences(await api.getPreferences(menuId));
      } catch {
        // silent — show empty list
      } finally {
        setTabLoading(false);
      }
    },
    [menuId],
  );

  useEffect(() => {
    loadTab(activeTab);
  }, [activeTab, loadTab]);

  const handleCreateTier = async () => {
    const name = newTierName.trim();
    if (!name) return;
    setNewTierSaving(true);
    try {
      const tier = await api.createPriceTier(menuId, { name });
      setPriceTiers(prev => [...prev, tier]);
      setNewTierName('');
      toast.success('Price tier created');
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Failed to create price tier'));
    } finally {
      setNewTierSaving(false);
    }
  };

  const handleRenameTier = async (tierId: string) => {
    const name = editingTierName.trim();
    if (!name) return;
    try {
      const updated = await api.updatePriceTier(menuId, tierId, { name });
      setPriceTiers(prev => prev.map(t => t.id === tierId ? updated : t));
      setEditingTierId(null);
      toast.success('Tier renamed');
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Failed to rename tier'));
    }
  };

  const handleSetDefaultTier = async (tierId: string) => {
    try {
      const updated = await api.updatePriceTier(menuId, tierId, { isDefault: true });
      setPriceTiers(prev => prev.map(t => t.id === tierId ? updated : { ...t, isDefault: false }));
      toast.success('Default tier updated');
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Failed to set default tier'));
    }
  };

  const handleDeleteTier = async (tier: PriceTier) => {
    if (!confirm('Are you sure you want to delete this tier?')) return;
    try {
      await api.deletePriceTier(menuId, tier.id);
      setPriceTiers(prev => prev.filter(t => t.id !== tier.id));
      toast.success('Price tier deleted');
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Failed to delete tier — it may still be assigned to a store'));
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderBottomColor: 'var(--company-primary, #ea580c)' }} />
      </div>
    );
  }

  if (error || !menu) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg text-sm">{error || 'Menu not found'}</div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/brands/${brandId}?tab=menus`} className="text-gray-400 hover:text-gray-600">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{menu.name}</h1>
          <p className="text-sm text-gray-500">
            <Link href={`/brands/${brandId}?tab=menus`} className="hover:underline">← Back to Menus</Link>
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b">
        <nav className="flex gap-1 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${activeTab === tab.id ? 'border-current' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              style={activeTab === tab.id ? { color: 'var(--company-primary, #ea580c)' } : undefined}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div>
        {tabLoading && (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2" style={{ borderBottomColor: 'var(--company-primary, #ea580c)' }} />
          </div>
        )}

        {activeTab === 'categories' && !tabLoading && (
          <TabSection title="Categories" onAdd={() => setModal({ type: 'categories', mode: 'create' })} showAdd={canWrite}>
            {categories.length === 0 ? (
              <EmptyState message="No categories yet" />
            ) : (
              categories.map((cat, i) => (
                <CategoryRow
                  key={cat.id}
                  cat={cat}
                  index={i}
                  total={categories.length}
                  onMoveUp={() => reorderItem(categories, setCategories, i, 'up', (id, seq) => api.updateCategory(id, { sequenceNo: seq }))}
                  onMoveDown={() => reorderItem(categories, setCategories, i, 'down', (id, seq) => api.updateCategory(id, { sequenceNo: seq }))}
                  onEdit={() => setModal({ type: 'categories', mode: 'edit', item: cat })}
                  onDelete={async () => {
                    if (!confirm(`Delete "${cat.name}"?`)) return;
                    try {
                      await api.deleteCategory(cat.id);
                      setCategories(prev => prev.filter(c => c.id !== cat.id));
                      toast.success('Category deleted');
                    } catch (err: unknown) {
                      toast.error(getErrorMessage(err, 'Failed to delete category'));
                    }
                  }}
                  showEdit={canWrite}
                  showDelete={canDelete}
                />
              ))
            )}
          </TabSection>
        )}

        {activeTab === 'products' && !tabLoading && (
          <TabSection title="Products" onAdd={() => setModal({ type: 'products', mode: 'create' })} showAdd={canWrite}>
            {products.length === 0 ? (
              <EmptyState message="No products on this menu yet" />
            ) : (
              products.map(prod => (
                <ProductRow
                  key={prod.id}
                  product={prod}
                  onEdit={() => setModal({ type: 'products', mode: 'edit', item: prod })}
                  onDelete={async () => {
                    if (!confirm(`Delete "${prod.name}" from this menu?`)) return;
                    try {
                      await api.deleteProduct(prod.id, menuId);
                      setProducts(prev => prev.filter(p => p.id !== prod.id));
                      toast.success('Product deleted');
                    } catch (err: unknown) {
                      toast.error(getErrorMessage(err, 'Failed to delete product'));
                    }
                  }}
                  showEdit={canWrite}
                  showDelete={canDelete}
                />
              ))
            )}
          </TabSection>
        )}

        {activeTab === 'sizes' && !tabLoading && (
          <TabSection title="Sizes" onAdd={() => setModal({ type: 'sizes', mode: 'create' })} showAdd={canWrite}>
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
                    try {
                      await api.deleteSize(size.id);
                      setSizes(prev => prev.filter(s => s.id !== size.id));
                      toast.success('Size deleted');
                    } catch (err: unknown) {
                      toast.error(getErrorMessage(err, 'Failed to delete size'));
                    }
                  }}
                  showEdit={canWrite}
                  showDelete={canDelete}
                />
              ))
            )}
          </TabSection>
        )}

        {activeTab === 'addons' && !tabLoading && (
          <TabSection title="Add-ons" onAdd={() => setModal({ type: 'addons', mode: 'create' })} showAdd={canWrite}>
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
                    try {
                      await api.deleteAddon(addon.id);
                      setAddons(prev => prev.filter(a => a.id !== addon.id));
                      toast.success('Add-on deleted');
                    } catch (err: unknown) {
                      toast.error(getErrorMessage(err, 'Failed to delete add-on'));
                    }
                  }}
                  showEdit={canWrite}
                  showDelete={canDelete}
                />
              ))
            )}
          </TabSection>
        )}

        {activeTab === 'preferences' && !tabLoading && (
          <TabSection title="Preferences" onAdd={() => setModal({ type: 'preferences', mode: 'create' })} showAdd={canWrite}>
            {preferences.length === 0 ? (
              <EmptyState message="No preference options yet" />
            ) : (
              preferences.map((pref, i) => (
                <ReorderRow
                  key={pref.id}
                  label={pref.name}
                  sublabel={pref.isDefault ? 'Default' : undefined}
                  index={i}
                  total={preferences.length}
                  isDefault={pref.isDefault}
                  onSetDefault={canWrite ? async () => {
                    const updated = await api.updatePreference(pref.id, { isDefault: true });
                    setPreferences(prev => prev.map(p => ({ ...p, isDefault: p.id === updated.id })));
                  } : undefined}
                  onMoveUp={() => reorderItem(preferences, setPreferences, i, 'up', (id, seq) => api.updatePreference(id, { sequenceNo: seq }))}
                  onMoveDown={() => reorderItem(preferences, setPreferences, i, 'down', (id, seq) => api.updatePreference(id, { sequenceNo: seq }))}
                  onEdit={() => setModal({ type: 'preferences', mode: 'edit', item: pref })}
                  onDelete={async () => {
                    if (!confirm(`Delete "${pref.name}"?`)) return;
                    try {
                      await api.deletePreference(pref.id);
                      setPreferences(prev => prev.filter(p => p.id !== pref.id));
                      toast.success('Preference deleted');
                    } catch (err: unknown) {
                      toast.error(getErrorMessage(err, 'Failed to delete preference'));
                    }
                  }}
                  showEdit={canWrite}
                  showDelete={canDelete}
                />
              ))
            )}
          </TabSection>
        )}

        {activeTab === 'price-tiers' && (
          <div className="max-w-2xl">
            <div className="bg-white rounded-lg border">
              <div className="px-6 py-4 border-b">
                <h2 className="font-semibold text-gray-900">Price Tiers</h2>
                <p className="text-xs text-gray-400 mt-0.5">Define pricing tiers for this menu and assign stores to them on the brand's Stores tab. The default tier is used when a store has no specific tier assigned.</p>
              </div>
              <div className="divide-y">
                {priceTiers.length === 0 && <div className="py-8 text-center text-gray-400 text-sm">No price tiers yet</div>}
                {priceTiers.map(tier => (
                  <div key={tier.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
                    {editingTierId === tier.id ? (
                      <input
                        autoFocus
                        type="text"
                        value={editingTierName}
                        onChange={e => setEditingTierName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleRenameTier(tier.id);
                          if (e.key === 'Escape') setEditingTierId(null);
                        }}
                        className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-900 outline-none focus:ring-2 focus:border-transparent"
                        style={{ '--tw-ring-color': 'var(--company-primary, #ea580c)' } as React.CSSProperties}
                      />
                    ) : (
                      <div className="flex-1 flex items-center gap-2 min-w-0">
                        <span className="text-sm font-medium text-gray-900 truncate">{tier.name}</span>
                        {tier.isDefault && (
                          <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">Default</span>
                        )}
                      </div>
                    )}
                    {canWrite && (
                      <div className="flex items-center gap-1 shrink-0">
                        {editingTierId === tier.id ? (
                          <>
                            <button onClick={() => handleRenameTier(tier.id)} className="text-xs px-2 py-1 rounded font-medium hover:opacity-80" style={{ color: 'var(--company-primary, #ea580c)' }}>Save</button>
                            <button onClick={() => setEditingTierId(null)} className="text-xs px-2 py-1 rounded text-gray-400 hover:text-gray-600">Cancel</button>
                          </>
                        ) : (
                          <>
                            {!tier.isDefault && (
                              <button onClick={() => handleSetDefaultTier(tier.id)} title="Set as default" className="p-1.5 text-gray-300 hover:text-amber-500 rounded">
                                <Star className="w-3.5 h-3.5" fill="none" />
                              </button>
                            )}
                            <button onClick={() => { setEditingTierId(tier.id); setEditingTierName(tier.name); }} className="p-1.5 text-gray-400 hover:opacity-70 rounded">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            {canDelete && (
                              <button onClick={() => handleDeleteTier(tier)} className="p-1.5 text-gray-400 hover:text-red-600 rounded">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {canWrite && (
                <div className="px-4 py-3 border-t bg-gray-50">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newTierName}
                      onChange={e => setNewTierName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreateTier(); } }}
                      placeholder="New tier name (e.g. Airport)"
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 outline-none focus:ring-2 focus:border-transparent bg-white"
                      style={{ '--tw-ring-color': 'var(--company-primary, #ea580c)' } as React.CSSProperties}
                    />
                    <button
                      onClick={handleCreateTier}
                      disabled={newTierSaving || !newTierName.trim()}
                      className="flex items-center gap-1.5 px-3 py-2 text-white rounded-lg text-sm font-medium hover:brightness-90 disabled:opacity-50"
                      style={{ backgroundColor: 'var(--company-primary, #ea580c)' }}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {newTierSaving ? 'Adding...' : 'Add'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {modal.type === 'categories' && (
        <CategoryModal
          mode={modal.mode}
          item={modal.mode === 'edit' ? modal.item as Category : undefined}
          menuId={menuId}
          onClose={closeModal}
          onSave={cat => {
            if (modal.mode === 'create') {
              setCategories(prev => [...prev, cat]);
              toast.success('Category created');
            } else {
              setCategories(prev => prev.map(c => (c.id === cat.id ? cat : c)));
              toast.success('Category updated');
            }
            closeModal();
          }}
        />
      )}

      {modal.type === 'products' && (
        <ProductModal
          mode={modal.mode}
          item={modal.item as Product | undefined}
          menuId={menuId}
          brand={brand}
          priceTiers={priceTiers}
          categories={categories}
          sizes={sizes}
          addons={addons}
          preferences={preferences}
          onClose={closeModal}
          onSave={prod => {
            if (modal.mode === 'create') {
              setProducts(prev => [...prev, prod]);
              toast.success('Product created');
            } else {
              setProducts(prev => prev.map(p => (p.id === prod.id ? prod : p)));
              toast.success('Product updated');
            }
            closeModal();
          }}
        />
      )}

      {modal.type === 'sizes' && (
        <SizeModal
          mode={modal.mode}
          item={modal.item as Size | undefined}
          menuId={menuId}
          brand={brand}
          priceTiers={priceTiers}
          onClose={closeModal}
          onSave={size => {
            if (modal.mode === 'create') {
              setSizes(prev => [...prev, size]);
              toast.success('Size created');
            } else {
              setSizes(prev => prev.map(s => (s.id === size.id ? size : s)));
              toast.success('Size updated');
            }
            closeModal();
          }}
        />
      )}

      {modal.type === 'addons' && (
        <AddonModal
          mode={modal.mode}
          item={modal.item as Addon | undefined}
          menuId={menuId}
          brand={brand}
          priceTiers={priceTiers}
          onClose={closeModal}
          onSave={addon => {
            if (modal.mode === 'create') {
              setAddons(prev => [...prev, addon]);
              toast.success('Add-on created');
            } else {
              setAddons(prev => prev.map(a => (a.id === addon.id ? addon : a)));
              toast.success('Add-on updated');
            }
            closeModal();
          }}
        />
      )}

      {modal.type === 'preferences' && (
        <PreferenceModal
          mode={modal.mode}
          item={modal.item as Preference | undefined}
          menuId={menuId}
          onClose={closeModal}
          onSave={pref => {
            if (modal.mode === 'create') {
              setPreferences(prev => [...prev, pref]);
              toast.success('Preference created');
            } else {
              setPreferences(prev => prev.map(p => (p.id === pref.id ? pref : p)));
              toast.success('Preference updated');
            }
            closeModal();
          }}
        />
      )}
    </div>
  );
}

// ─── CRUD Modals ──────────────────────────────────────────────────────────

function CategoryModal({
  mode, item, menuId, onClose, onSave,
}: {
  mode: 'create' | 'edit'; item?: Category; menuId: string; onClose: () => void; onSave: (cat: Category) => void;
}) {
  const [name, setName] = useState(item?.name || '');
  const [description, setDescription] = useState(item?.description || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      let result: Category;
      if (mode === 'create') {
        result = await api.createCategory({ name, description: description || undefined, type: 'PRODUCT', menuId });
      } else {
        result = await api.updateCategory(item!.id, { name, description: description || undefined });
      }
      onSave(result);
    } catch (err: unknown) {
      const message = getErrorMessage(err, 'Failed to save');
      setError(message);
      toast.error(message);
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
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
            style={{ '--tw-ring-color': 'var(--company-primary, #ea580c)' } as React.CSSProperties}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description <span className="text-gray-400 font-normal">(optional)</span></label>
          <input
            type="text"
            value={description}
            onChange={e => setDescription(e.target.value)}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
            style={{ '--tw-ring-color': 'var(--company-primary, #ea580c)' } as React.CSSProperties}
          />
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={loading} className="flex-1 py-2 text-white rounded-lg text-sm font-medium hover:brightness-90 disabled:opacity-50" style={{ backgroundColor: 'var(--company-primary, #ea580c)' }}>
            {loading ? 'Saving...' : mode === 'create' ? 'Create' : 'Update'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ProductModal({
  mode, item, menuId, brand, priceTiers, categories, sizes, addons, preferences, onClose, onSave,
}: {
  mode: 'create' | 'edit'; item?: Product; menuId: string; brand: Brand | null; priceTiers: PriceTier[];
  categories: Category[]; sizes: Size[]; addons: Addon[]; preferences: Preference[];
  onClose: () => void; onSave: (prod: Product) => void;
}) {
  const [name, setName] = useState(item?.name || '');
  const [categoryId, setCategoryId] = useState(item?.categoryId || '');
  const [selectedSizeIds, setSelectedSizeIds] = useState<string[]>(item?.sizes?.map(s => s.id) ?? []);
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>(item?.addons?.map(a => a.id) ?? []);
  const [selectedPreferenceIds, setSelectedPreferenceIds] = useState<string[]>(item?.preferences?.map(p => p.id) ?? []);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(resolveUrl(item?.image));
  const [imageRemoved, setImageRemoved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);

  const [tierPrices, setTierPrices] = useState<Record<string, { price: string; foodpandaPrice: string; grabPrice: string }>>(() => {
    const init: Record<string, { price: string; foodpandaPrice: string; grabPrice: string }> = {};
    for (const tier of priceTiers) {
      const existing = item?.priceTiers?.find(pt => pt.tierId === tier.id);
      init[tier.id] = {
        price: existing?.price != null ? existing.price.toString() : (tier.isDefault && item?.price != null ? item.price.toString() : ''),
        foodpandaPrice: existing?.foodpandaPrice != null ? existing.foodpandaPrice.toString() : '',
        grabPrice: existing?.grabPrice != null ? existing.grabPrice.toString() : '',
      };
    }
    return init;
  });

  const [flatPrice, setFlatPrice] = useState(item?.price?.toString() || '');
  const [flatFoodpandaPrice, setFlatFoodpandaPrice] = useState(item?.foodpandaPrice != null ? item.foodpandaPrice.toString() : '');
  const [flatGrabPrice, setFlatGrabPrice] = useState(item?.grabPrice != null ? item.grabPrice.toString() : '');

  const hasTiers = priceTiers.length > 0;

  const setTierField = (tierId: string, field: 'price' | 'foodpandaPrice' | 'grabPrice', value: string) => {
    setTierPrices(prev => ({ ...prev, [tierId]: { ...prev[tierId], [field]: value } }));
  };

  const toggleId = (set: string[], setFn: (v: string[]) => void, id: string) =>
    setFn(set.includes(id) ? set.filter(x => x !== id) : [...set, id]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!UPLOAD_ALLOWED_TYPES.includes(file.type)) {
      setImageUploadError('Only JPEG, PNG, WebP, or GIF images are allowed.');
      e.target.value = '';
      return;
    }
    if (file.size > UPLOAD_MAX_SIZE) {
      setImageUploadError('File too large. Maximum size is 5 MB.');
      e.target.value = '';
      return;
    }
    setImageUploadError(null);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setImageRemoved(false);
    e.target.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'create' && !categoryId) {
      setError('Select a category');
      return;
    }
    setError(null);
    setLoading(true);
    const parseOptionalPrice = (val: string): number | null => (val.trim() === '' ? null : parseFloat(val));
    try {
      let result: Product;
      if (hasTiers) {
        const builtTiers: ProductPriceTier[] = priceTiers.map(tier => ({
          tierId: tier.id,
          price: parseFloat(tierPrices[tier.id]?.price || '0') || 0,
          foodpandaPrice: parseOptionalPrice(tierPrices[tier.id]?.foodpandaPrice ?? ''),
          grabPrice: parseOptionalPrice(tierPrices[tier.id]?.grabPrice ?? ''),
        }));
        const defaultTier = priceTiers.find(t => t.isDefault);
        const defaultTierPriceStr = defaultTier ? (tierPrices[defaultTier.id]?.price || '0') : '0';
        if (mode === 'create') {
          result = await api.createProduct(menuId, { name, price: parseFloat(defaultTierPriceStr) || 0, categoryId, sizeIds: selectedSizeIds, addonIds: selectedAddonIds, preferenceIds: selectedPreferenceIds, priceTiers: builtTiers });
        } else {
          result = await api.updateProduct(item!.id, menuId, { name, price: parseFloat(defaultTierPriceStr) || 0, categoryId: categoryId || undefined, sizeIds: selectedSizeIds, addonIds: selectedAddonIds, preferenceIds: selectedPreferenceIds, priceTiers: builtTiers });
        }
      } else {
        if (mode === 'create') {
          result = await api.createProduct(menuId, { name, price: parseFloat(flatPrice), categoryId, sizeIds: selectedSizeIds, addonIds: selectedAddonIds, preferenceIds: selectedPreferenceIds, foodpandaPrice: parseOptionalPrice(flatFoodpandaPrice), grabPrice: parseOptionalPrice(flatGrabPrice) });
        } else {
          result = await api.updateProduct(item!.id, menuId, { name, price: parseFloat(flatPrice), categoryId: categoryId || undefined, sizeIds: selectedSizeIds, addonIds: selectedAddonIds, preferenceIds: selectedPreferenceIds, foodpandaPrice: parseOptionalPrice(flatFoodpandaPrice), grabPrice: parseOptionalPrice(flatGrabPrice) });
        }
      }
      if (imageFile) {
        result = await api.uploadProductImage(result.id, menuId, imageFile);
      } else if (imageRemoved && item?.image) {
        result = await api.removeProductImage(result.id, menuId);
      }
      onSave(result);
    } catch (err: unknown) {
      const message = getErrorMessage(err, 'Failed to save');
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title={mode === 'create' ? 'New Product' : 'Edit Product'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-red-600 text-sm">{error}</p>}

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
              <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer text-white hover:brightness-90 transition-colors" style={{ backgroundColor: 'var(--company-primary, #ea580c)' }}>
                <Upload className="w-3.5 h-3.5" />
                {imagePreview ? 'Change Image' : 'Upload Image'}
                <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" onChange={handleImageChange} />
              </label>
              {imagePreview && (
                <button type="button" onClick={() => { setImageFile(null); setImagePreview(null); setImageRemoved(true); }} className="ml-2 text-xs text-gray-400 hover:text-red-500">
                  Remove
                </button>
              )}
              <p className="text-xs text-gray-400 mt-1">JPEG, PNG, WebP or GIF · Max 5 MB</p>
              {imageUploadError && <p className="text-red-500 text-xs mt-1">{imageUploadError}</p>}
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} required
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
            style={{ '--tw-ring-color': 'var(--company-primary, #ea580c)' } as React.CSSProperties} />
        </div>

        {hasTiers ? (
          <div className="space-y-3">
            <p className="text-sm font-medium text-gray-700">Prices by Tier</p>
            {priceTiers.map(tier => (
              <div key={tier.id} className="border border-gray-200 rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-gray-700">{tier.name}</span>
                  {tier.isDefault && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">Default</span>
                  )}
                </div>
                <div className={`grid gap-2 items-end ${(brand?.enabledDeliveryPlatforms?.includes('FOODPANDA') || brand?.enabledDeliveryPlatforms?.includes('GRAB')) ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1'}`}>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Regular Price</label>
                    <input
                      type="number"
                      value={tierPrices[tier.id]?.price ?? ''}
                      onChange={e => setTierField(tier.id, 'price', e.target.value)}
                      required={tier.isDefault}
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
                      style={{ '--tw-ring-color': 'var(--company-primary, #ea580c)' } as React.CSSProperties}
                    />
                  </div>
                  {brand?.enabledDeliveryPlatforms?.includes('FOODPANDA') && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">FoodPanda <span className="text-gray-400 font-normal">(opt.)</span></label>
                      <input
                        type="number"
                        value={tierPrices[tier.id]?.foodpandaPrice ?? ''}
                        onChange={e => setTierField(tier.id, 'foodpandaPrice', e.target.value)}
                        min="0"
                        step="0.01"
                        placeholder="Same as regular"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
                        style={{ '--tw-ring-color': '#ec4899' } as React.CSSProperties}
                      />
                    </div>
                  )}
                  {brand?.enabledDeliveryPlatforms?.includes('GRAB') && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Grab <span className="text-gray-400 font-normal">(opt.)</span></label>
                      <input
                        type="number"
                        value={tierPrices[tier.id]?.grabPrice ?? ''}
                        onChange={e => setTierField(tier.id, 'grabPrice', e.target.value)}
                        min="0"
                        step="0.01"
                        placeholder="Same as regular"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
                        style={{ '--tw-ring-color': '#22c55e' } as React.CSSProperties}
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Price</label>
              <input type="number" value={flatPrice} onChange={e => setFlatPrice(e.target.value)} required min="0" step="0.01"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
                style={{ '--tw-ring-color': 'var(--company-primary, #ea580c)' } as React.CSSProperties} />
            </div>
            {(brand?.enabledDeliveryPlatforms?.includes('FOODPANDA') || brand?.enabledDeliveryPlatforms?.includes('GRAB')) && (
              <div className="grid grid-cols-2 gap-3">
                {brand?.enabledDeliveryPlatforms?.includes('FOODPANDA') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      FoodPanda Price <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <input
                      type="number"
                      value={flatFoodpandaPrice}
                      onChange={e => setFlatFoodpandaPrice(e.target.value)}
                      min="0"
                      step="0.01"
                      placeholder="Same as regular price"
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
                      value={flatGrabPrice}
                      onChange={e => setFlatGrabPrice(e.target.value)}
                      min="0"
                      step="0.01"
                      placeholder="Same as regular price"
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white text-sm"
                      style={{ '--tw-ring-color': '#22c55e' } as React.CSSProperties}
                    />
                  </div>
                )}
              </div>
            )}
          </>
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
                    className="rounded border-gray-300" style={{ accentColor: 'var(--company-primary, #ea580c)' }}
                  />
                  <span className="text-sm text-gray-800 flex-1">{s.name}</span>
                  {s.priceModifier !== 0 && (
                    <span className="text-xs text-gray-400">{s.priceModifier > 0 ? '+' : ''}₱{s.priceModifier}</span>
                  )}
                </label>
              ))}
            </div>
          </div>
        )}
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
                    className="rounded border-gray-300" style={{ accentColor: 'var(--company-primary, #ea580c)' }}
                  />
                  <span className="text-sm text-gray-800 flex-1">{a.name}</span>
                  <span className="text-xs text-gray-400">+₱{a.price}</span>
                </label>
              ))}
            </div>
          </div>
        )}
        {preferences.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Preferences</label>
            <div className="border border-gray-200 rounded-lg divide-y max-h-40 overflow-y-auto">
              {preferences.map(p => (
                <label key={p.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedPreferenceIds.includes(p.id)}
                    onChange={() => toggleId(selectedPreferenceIds, setSelectedPreferenceIds, p.id)}
                    className="rounded border-gray-300" style={{ accentColor: 'var(--company-primary, #ea580c)' }}
                  />
                  <span className="text-sm text-gray-800">{p.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={loading} className="flex-1 py-2 text-white rounded-lg text-sm font-medium hover:brightness-90 disabled:opacity-50" style={{ backgroundColor: 'var(--company-primary, #ea580c)' }}>
            {loading ? 'Saving...' : mode === 'create' ? 'Create' : 'Update'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function SizeModal({
  mode, item, menuId, brand, priceTiers, onClose, onSave,
}: {
  mode: 'create' | 'edit'; item?: Size; menuId: string; brand: Brand | null; priceTiers: PriceTier[];
  onClose: () => void; onSave: (size: Size) => void;
}) {
  const [name, setName] = useState(item?.name || '');
  const [flatPriceModifier, setFlatPriceModifier] = useState(item?.priceModifier?.toString() || '0');
  const [flatFoodpandaPrice, setFlatFoodpandaPrice] = useState(item?.foodpandaPrice != null ? item.foodpandaPrice.toString() : '');
  const [flatGrabPrice, setFlatGrabPrice] = useState(item?.grabPrice != null ? item.grabPrice.toString() : '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasTiers = priceTiers.length > 0;

  const [tierPrices, setTierPrices] = useState<Record<string, { priceModifier: string; foodpandaPrice: string; grabPrice: string }>>(() => {
    const init: Record<string, { priceModifier: string; foodpandaPrice: string; grabPrice: string }> = {};
    for (const tier of priceTiers) {
      const existing = item?.priceTiers?.find(pt => pt.tierId === tier.id);
      init[tier.id] = {
        priceModifier: existing?.priceModifier != null ? existing.priceModifier.toString() : (tier.isDefault && item?.priceModifier != null ? item.priceModifier.toString() : '0'),
        foodpandaPrice: existing?.foodpandaPrice != null ? existing.foodpandaPrice.toString() : '',
        grabPrice: existing?.grabPrice != null ? existing.grabPrice.toString() : '',
      };
    }
    return init;
  });

  const setTierField = (tierId: string, field: 'priceModifier' | 'foodpandaPrice' | 'grabPrice', value: string) => {
    setTierPrices(prev => ({ ...prev, [tierId]: { ...prev[tierId], [field]: value } }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const parseOptionalPrice = (val: string): number | null => (val.trim() === '' ? null : parseFloat(val));
    try {
      let result: Size;
      if (hasTiers) {
        const builtTiers: SizePriceTier[] = priceTiers.map(tier => ({
          tierId: tier.id,
          priceModifier: parseFloat(tierPrices[tier.id]?.priceModifier || '0') || 0,
          foodpandaPrice: parseOptionalPrice(tierPrices[tier.id]?.foodpandaPrice ?? ''),
          grabPrice: parseOptionalPrice(tierPrices[tier.id]?.grabPrice ?? ''),
        }));
        const defaultTier = priceTiers.find(t => t.isDefault);
        const defaultModStr = defaultTier ? (tierPrices[defaultTier.id]?.priceModifier || '0') : '0';
        if (mode === 'create') {
          result = await api.createSize(menuId, { name, priceModifier: parseFloat(defaultModStr) || 0, priceTiers: builtTiers });
        } else {
          result = await api.updateSize(item!.id, { name, priceModifier: parseFloat(defaultModStr) || 0, priceTiers: builtTiers });
        }
      } else {
        if (mode === 'create') {
          result = await api.createSize(menuId, { name, priceModifier: parseFloat(flatPriceModifier), foodpandaPrice: parseOptionalPrice(flatFoodpandaPrice), grabPrice: parseOptionalPrice(flatGrabPrice) });
        } else {
          result = await api.updateSize(item!.id, { name, priceModifier: parseFloat(flatPriceModifier), foodpandaPrice: parseOptionalPrice(flatFoodpandaPrice), grabPrice: parseOptionalPrice(flatGrabPrice) });
        }
      }
      onSave(result);
    } catch (err: unknown) {
      const message = getErrorMessage(err, 'Failed to save');
      setError(message);
      toast.error(message);
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
            style={{ '--tw-ring-color': 'var(--company-primary, #ea580c)' } as React.CSSProperties} />
        </div>

        {hasTiers ? (
          <div className="space-y-3">
            <p className="text-sm font-medium text-gray-700">Price Modifiers by Tier</p>
            {priceTiers.map(tier => (
              <div key={tier.id} className="border border-gray-200 rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-gray-700">{tier.name}</span>
                  {tier.isDefault && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">Default</span>
                  )}
                </div>
                <div className={`grid gap-2 items-end ${(brand?.enabledDeliveryPlatforms?.includes('FOODPANDA') || brand?.enabledDeliveryPlatforms?.includes('GRAB')) ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1'}`}>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Price Modifier (+₱)</label>
                    <input
                      type="number"
                      value={tierPrices[tier.id]?.priceModifier ?? '0'}
                      onChange={e => setTierField(tier.id, 'priceModifier', e.target.value)}
                      min="0"
                      step="0.01"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
                      style={{ '--tw-ring-color': 'var(--company-primary, #ea580c)' } as React.CSSProperties}
                    />
                  </div>
                  {brand?.enabledDeliveryPlatforms?.includes('FOODPANDA') && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">FoodPanda Mod. <span className="text-gray-400 font-normal">(opt.)</span></label>
                      <input
                        type="number"
                        value={tierPrices[tier.id]?.foodpandaPrice ?? ''}
                        onChange={e => setTierField(tier.id, 'foodpandaPrice', e.target.value)}
                        min="0"
                        step="0.01"
                        placeholder="Same as regular"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
                        style={{ '--tw-ring-color': '#ec4899' } as React.CSSProperties}
                      />
                    </div>
                  )}
                  {brand?.enabledDeliveryPlatforms?.includes('GRAB') && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Grab Mod. <span className="text-gray-400 font-normal">(opt.)</span></label>
                      <input
                        type="number"
                        value={tierPrices[tier.id]?.grabPrice ?? ''}
                        onChange={e => setTierField(tier.id, 'grabPrice', e.target.value)}
                        min="0"
                        step="0.01"
                        placeholder="Same as regular"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
                        style={{ '--tw-ring-color': '#22c55e' } as React.CSSProperties}
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Price Modifier (+₱)</label>
              <input type="number" value={flatPriceModifier} onChange={e => setFlatPriceModifier(e.target.value)} required min="0" step="0.01"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
                style={{ '--tw-ring-color': 'var(--company-primary, #ea580c)' } as React.CSSProperties} />
            </div>
            {(brand?.enabledDeliveryPlatforms?.includes('FOODPANDA') || brand?.enabledDeliveryPlatforms?.includes('GRAB')) && (
              <div className="grid grid-cols-2 gap-3">
                {brand?.enabledDeliveryPlatforms?.includes('FOODPANDA') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      FoodPanda Modifier <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <input
                      type="number" value={flatFoodpandaPrice}
                      onChange={e => setFlatFoodpandaPrice(e.target.value)}
                      min="0" step="0.01" placeholder="Same as regular"
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
                      type="number" value={flatGrabPrice}
                      onChange={e => setFlatGrabPrice(e.target.value)}
                      min="0" step="0.01" placeholder="Same as regular"
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white text-sm"
                      style={{ '--tw-ring-color': '#22c55e' } as React.CSSProperties}
                    />
                  </div>
                )}
              </div>
            )}
          </>
        )}
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={loading} className="flex-1 py-2 text-white rounded-lg text-sm font-medium hover:brightness-90 disabled:opacity-50" style={{ backgroundColor: 'var(--company-primary, #ea580c)' }}>
            {loading ? 'Saving...' : mode === 'create' ? 'Create' : 'Update'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AddonModal({
  mode, item, menuId, brand, priceTiers, onClose, onSave,
}: {
  mode: 'create' | 'edit'; item?: Addon; menuId: string; brand: Brand | null; priceTiers: PriceTier[];
  onClose: () => void; onSave: (addon: Addon) => void;
}) {
  const [name, setName] = useState(item?.name || '');
  const [flatPrice, setFlatPrice] = useState(item?.price?.toString() || '0');
  const [flatFoodpandaPrice, setFlatFoodpandaPrice] = useState(item?.foodpandaPrice != null ? item.foodpandaPrice.toString() : '');
  const [flatGrabPrice, setFlatGrabPrice] = useState(item?.grabPrice != null ? item.grabPrice.toString() : '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasTiers = priceTiers.length > 0;

  const [tierPrices, setTierPrices] = useState<Record<string, { price: string; foodpandaPrice: string; grabPrice: string }>>(() => {
    const init: Record<string, { price: string; foodpandaPrice: string; grabPrice: string }> = {};
    for (const tier of priceTiers) {
      const existing = item?.priceTiers?.find(pt => pt.tierId === tier.id);
      init[tier.id] = {
        price: existing?.price != null ? existing.price.toString() : (tier.isDefault && item?.price != null ? item.price.toString() : '0'),
        foodpandaPrice: existing?.foodpandaPrice != null ? existing.foodpandaPrice.toString() : '',
        grabPrice: existing?.grabPrice != null ? existing.grabPrice.toString() : '',
      };
    }
    return init;
  });

  const setTierField = (tierId: string, field: 'price' | 'foodpandaPrice' | 'grabPrice', value: string) => {
    setTierPrices(prev => ({ ...prev, [tierId]: { ...prev[tierId], [field]: value } }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const parseOptionalPrice = (val: string): number | null => (val.trim() === '' ? null : parseFloat(val));
    try {
      let result: Addon;
      if (hasTiers) {
        const builtTiers: AddonPriceTier[] = priceTiers.map(tier => ({
          tierId: tier.id,
          price: parseFloat(tierPrices[tier.id]?.price || '0') || 0,
          foodpandaPrice: parseOptionalPrice(tierPrices[tier.id]?.foodpandaPrice ?? ''),
          grabPrice: parseOptionalPrice(tierPrices[tier.id]?.grabPrice ?? ''),
        }));
        const defaultTier = priceTiers.find(t => t.isDefault);
        const defaultPriceStr = defaultTier ? (tierPrices[defaultTier.id]?.price || '0') : '0';
        if (mode === 'create') {
          result = await api.createAddon(menuId, { name, price: parseFloat(defaultPriceStr) || 0, priceTiers: builtTiers });
        } else {
          result = await api.updateAddon(item!.id, { name, price: parseFloat(defaultPriceStr) || 0, priceTiers: builtTiers });
        }
      } else {
        if (mode === 'create') {
          result = await api.createAddon(menuId, { name, price: parseFloat(flatPrice), foodpandaPrice: parseOptionalPrice(flatFoodpandaPrice), grabPrice: parseOptionalPrice(flatGrabPrice) });
        } else {
          result = await api.updateAddon(item!.id, { name, price: parseFloat(flatPrice), foodpandaPrice: parseOptionalPrice(flatFoodpandaPrice), grabPrice: parseOptionalPrice(flatGrabPrice) });
        }
      }
      onSave(result);
    } catch (err: unknown) {
      const message = getErrorMessage(err, 'Failed to save');
      setError(message);
      toast.error(message);
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
            style={{ '--tw-ring-color': 'var(--company-primary, #ea580c)' } as React.CSSProperties} />
        </div>

        {hasTiers ? (
          <div className="space-y-3">
            <p className="text-sm font-medium text-gray-700">Prices by Tier</p>
            {priceTiers.map(tier => (
              <div key={tier.id} className="border border-gray-200 rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-gray-700">{tier.name}</span>
                  {tier.isDefault && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">Default</span>
                  )}
                </div>
                <div className={`grid gap-2 items-end ${(brand?.enabledDeliveryPlatforms?.includes('FOODPANDA') || brand?.enabledDeliveryPlatforms?.includes('GRAB')) ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1'}`}>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Price (+₱)</label>
                    <input
                      type="number"
                      value={tierPrices[tier.id]?.price ?? '0'}
                      onChange={e => setTierField(tier.id, 'price', e.target.value)}
                      min="0"
                      step="0.01"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
                      style={{ '--tw-ring-color': 'var(--company-primary, #ea580c)' } as React.CSSProperties}
                    />
                  </div>
                  {brand?.enabledDeliveryPlatforms?.includes('FOODPANDA') && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">FoodPanda <span className="text-gray-400 font-normal">(opt.)</span></label>
                      <input
                        type="number"
                        value={tierPrices[tier.id]?.foodpandaPrice ?? ''}
                        onChange={e => setTierField(tier.id, 'foodpandaPrice', e.target.value)}
                        min="0"
                        step="0.01"
                        placeholder="Same as regular"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
                        style={{ '--tw-ring-color': '#ec4899' } as React.CSSProperties}
                      />
                    </div>
                  )}
                  {brand?.enabledDeliveryPlatforms?.includes('GRAB') && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Grab <span className="text-gray-400 font-normal">(opt.)</span></label>
                      <input
                        type="number"
                        value={tierPrices[tier.id]?.grabPrice ?? ''}
                        onChange={e => setTierField(tier.id, 'grabPrice', e.target.value)}
                        min="0"
                        step="0.01"
                        placeholder="Same as regular"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
                        style={{ '--tw-ring-color': '#22c55e' } as React.CSSProperties}
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Price (+₱)</label>
              <input type="number" value={flatPrice} onChange={e => setFlatPrice(e.target.value)} required min="0" step="0.01"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
                style={{ '--tw-ring-color': 'var(--company-primary, #ea580c)' } as React.CSSProperties} />
            </div>
            {(brand?.enabledDeliveryPlatforms?.includes('FOODPANDA') || brand?.enabledDeliveryPlatforms?.includes('GRAB')) && (
              <div className="grid grid-cols-2 gap-3">
                {brand?.enabledDeliveryPlatforms?.includes('FOODPANDA') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      FoodPanda Price <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <input
                      type="number"
                      value={flatFoodpandaPrice}
                      onChange={e => setFlatFoodpandaPrice(e.target.value)}
                      min="0"
                      step="0.01"
                      placeholder="Same as regular price"
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
                      value={flatGrabPrice}
                      onChange={e => setFlatGrabPrice(e.target.value)}
                      min="0"
                      step="0.01"
                      placeholder="Same as regular price"
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white text-sm"
                      style={{ '--tw-ring-color': '#22c55e' } as React.CSSProperties}
                    />
                  </div>
                )}
              </div>
            )}
          </>
        )}
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={loading} className="flex-1 py-2 text-white rounded-lg text-sm font-medium hover:brightness-90 disabled:opacity-50" style={{ backgroundColor: 'var(--company-primary, #ea580c)' }}>
            {loading ? 'Saving...' : mode === 'create' ? 'Create' : 'Update'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function PreferenceModal({
  mode, item, menuId, onClose, onSave,
}: {
  mode: 'create' | 'edit'; item?: Preference; menuId: string; onClose: () => void; onSave: (pref: Preference) => void;
}) {
  const [name, setName] = useState(item?.name || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      let result: Preference;
      if (mode === 'create') {
        result = await api.createPreference(menuId, { name });
      } else {
        result = await api.updatePreference(item!.id, { name });
      }
      onSave(result);
    } catch (err: unknown) {
      const message = getErrorMessage(err, 'Failed to save');
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title={mode === 'create' ? 'New Preference' : 'Edit Preference'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Label</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            placeholder="e.g. Light Sweet (50%)"
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
            style={{ '--tw-ring-color': 'var(--company-primary, #ea580c)' } as React.CSSProperties}
          />
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={loading} className="flex-1 py-2 text-white rounded-lg text-sm font-medium hover:brightness-90 disabled:opacity-50" style={{ backgroundColor: 'var(--company-primary, #ea580c)' }}>
            {loading ? 'Saving...' : mode === 'create' ? 'Create' : 'Update'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
