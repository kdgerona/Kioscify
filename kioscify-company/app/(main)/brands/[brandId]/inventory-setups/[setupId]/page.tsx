'use client';

import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import type { InventorySetup, Category, InventoryItem } from '@/types';
import { Plus, Pencil, Trash2, X, ChevronLeft } from 'lucide-react';
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

type Tab = 'items' | 'categories';

const TABS: { id: Tab; label: string }[] = [
  { id: 'items', label: 'Items' },
  { id: 'categories', label: 'Categories' },
];

// ─── Shared row/section components ────────────────────────────────────────

function CRUDRow({
  label, sublabel, onEdit, onDelete, showEdit = true, showDelete = true,
}: {
  label: string; sublabel?: string; onEdit: () => void; onDelete: () => void; showEdit?: boolean; showDelete?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
      <div>
        <p className="text-sm font-medium text-gray-900">{label}</p>
        {sublabel && <p className="text-xs text-gray-400">{sublabel}</p>}
      </div>
      <div className="flex items-center gap-2">
        {showEdit && <button onClick={onEdit} className="p-1.5 text-gray-400 hover:opacity-70 rounded"><Pencil className="w-3.5 h-3.5" /></button>}
        {showDelete && <button onClick={onDelete} className="p-1.5 text-gray-400 hover:text-red-600 rounded"><Trash2 className="w-3.5 h-3.5" /></button>}
      </div>
    </div>
  );
}

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
          <button onClick={onMoveUp} disabled={index === 0} className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-20 disabled:cursor-not-allowed">↑</button>
          <span className="text-xs text-gray-400 font-mono w-5 text-center leading-none">{index + 1}</span>
          <button onClick={onMoveDown} disabled={index === total - 1} className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-20 disabled:cursor-not-allowed">↓</button>
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

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  // Portaled to document.body — rendering in-place caused the fixed overlay
  // to be offset short at the top; see brands/[brandId]/page.tsx Modal for
  // the full investigation notes.
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

export default function InventorySetupWorkspacePage() {
  const params = useParams();
  const brandId = params.brandId as string;
  const setupId = params.setupId as string;

  const canWrite = hasPrivilege('brands', 'write');
  const canDelete = hasPrivilege('brands', 'all');

  const [setup, setSetup] = useState<InventorySetup | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('items');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tabLoading, setTabLoading] = useState(false);

  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);

  const [modal, setModal] = useState<{ type: Tab | null; mode: 'create' | 'edit'; item?: unknown }>({ type: null, mode: 'create' });
  const closeModal = () => setModal({ type: null, mode: 'create' });

  useEffect(() => {
    api.getInventorySetup(brandId, setupId)
      .then(setSetup)
      .catch(() => setError('Failed to load inventory setup'))
      .finally(() => setLoading(false));
  }, [brandId, setupId]);

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
      setTabLoading(true);
      try {
        if (tab === 'categories') setCategories(await api.getCategories({ inventorySetupId: setupId }, 'INVENTORY'));
        if (tab === 'items') {
          const [cats, its] = await Promise.all([
            api.getCategories({ inventorySetupId: setupId }, 'INVENTORY'),
            api.getInventoryItems(setupId),
          ]);
          setCategories(cats);
          setItems(its);
        }
      } catch {
        // silent — show empty list
      } finally {
        setTabLoading(false);
      }
    },
    [setupId],
  );

  useEffect(() => {
    loadTab(activeTab);
  }, [activeTab, loadTab]);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderBottomColor: 'var(--company-primary, #ea580c)' }} />
      </div>
    );
  }

  if (error || !setup) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg text-sm">{error || 'Inventory setup not found'}</div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/brands/${brandId}?tab=inventory-setups`} className="text-gray-400 hover:text-gray-600">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{setup.name}</h1>
          <p className="text-sm text-gray-500">
            <Link href={`/brands/${brandId}?tab=inventory-setups`} className="hover:underline">← Back to Inventory Setups</Link>
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

        {activeTab === 'items' && !tabLoading && (
          <TabSection title="Items" onAdd={() => setModal({ type: 'items', mode: 'create' })} showAdd={canWrite}>
            {items.length === 0 ? (
              <EmptyState message="No items in this setup yet" />
            ) : (
              items.map(item => (
                <CRUDRow
                  key={item.id}
                  label={item.name}
                  sublabel={`${item.unit}${item.category ? ` · ${item.category.name}` : ''}${item.minStockLevel != null ? ` · min ${item.minStockLevel}` : ''}`}
                  onEdit={() => setModal({ type: 'items', mode: 'edit', item })}
                  onDelete={async () => {
                    if (!confirm(`Delete "${item.name}"? History is preserved.`)) return;
                    try {
                      await api.deleteInventoryItem(item.id, setupId);
                      setItems(prev => prev.filter(i => i.id !== item.id));
                      toast.success('Item deleted');
                    } catch (err: unknown) {
                      toast.error(getErrorMessage(err, 'Failed to delete item'));
                    }
                  }}
                  showEdit={canWrite}
                  showDelete={canDelete}
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
          inventorySetupId={setupId}
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

      {modal.type === 'items' && (
        <ItemModal
          mode={modal.mode}
          item={modal.mode === 'edit' ? modal.item as InventoryItem : undefined}
          inventorySetupId={setupId}
          categories={categories}
          onClose={closeModal}
          onSave={item => {
            if (modal.mode === 'create') {
              setItems(prev => [...prev, item]);
              toast.success('Item created');
            } else {
              setItems(prev => prev.map(i => (i.id === item.id ? item : i)));
              toast.success('Item updated');
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
  mode, item, inventorySetupId, onClose, onSave,
}: {
  mode: 'create' | 'edit'; item?: Category; inventorySetupId: string; onClose: () => void; onSave: (cat: Category) => void;
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
        result = await api.createCategory({ name, description: description || undefined, type: 'INVENTORY', inventorySetupId });
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

function ItemModal({
  mode, item, inventorySetupId, categories, onClose, onSave,
}: {
  mode: 'create' | 'edit'; item?: InventoryItem; inventorySetupId: string; categories: Category[];
  onClose: () => void; onSave: (item: InventoryItem) => void;
}) {
  const [name, setName] = useState(item?.name || '');
  const [unit, setUnit] = useState(item?.unit || '');
  const [categoryId, setCategoryId] = useState(item?.categoryId || '');
  const [minStockLevel, setMinStockLevel] = useState(item?.minStockLevel?.toString() || '');
  const [requiresExpirationDate, setRequiresExpirationDate] = useState(item?.requiresExpirationDate ?? false);
  const [expirationWarningDays, setExpirationWarningDays] = useState(item?.expirationWarningDays?.toString() || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!categoryId) {
      setError('Select a category');
      return;
    }
    setLoading(true);
    try {
      const payload = {
        name,
        unit,
        categoryId,
        minStockLevel: minStockLevel ? parseFloat(minStockLevel) : undefined,
        requiresExpirationDate,
        expirationWarningDays: requiresExpirationDate && expirationWarningDays ? parseInt(expirationWarningDays) : undefined,
      };
      let result: InventoryItem;
      if (mode === 'create') {
        result = await api.createInventoryItem(inventorySetupId, payload);
      } else {
        result = await api.updateInventoryItem(item!.id, inventorySetupId, payload);
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
    <Modal title={mode === 'create' ? 'New Inventory Item' : 'Edit Inventory Item'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} required
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
            style={{ '--tw-ring-color': 'var(--company-primary, #ea580c)' } as React.CSSProperties} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
          <input type="text" value={unit} onChange={e => setUnit(e.target.value)} required
            placeholder="e.g. kg, liters, bags"
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
            style={{ '--tw-ring-color': 'var(--company-primary, #ea580c)' } as React.CSSProperties} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
          <Select value={categoryId || undefined} onValueChange={setCategoryId}>
            <SelectTrigger>
              <SelectValue placeholder="Select a category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Min Stock Level</label>
          <input type="number" value={minStockLevel} onChange={e => setMinStockLevel(e.target.value)} min="0"
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
            style={{ '--tw-ring-color': 'var(--company-primary, #ea580c)' } as React.CSSProperties} />
        </div>
        <div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={requiresExpirationDate}
              onChange={e => setRequiresExpirationDate(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300" style={{ accentColor: 'var(--company-primary, #ea580c)' }}
            />
            <span className="text-sm font-medium text-gray-700">Track expiration dates</span>
          </label>
          {requiresExpirationDate && (
            <div className="mt-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Warning (days before)</label>
              <input type="number" value={expirationWarningDays} onChange={e => setExpirationWarningDays(e.target.value)} min="1"
                placeholder="7"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
                style={{ '--tw-ring-color': 'var(--company-primary, #ea580c)' } as React.CSSProperties} />
              <p className="mt-1 text-xs text-gray-400">How many days before expiry to show a warning. Defaults to 7 days if left blank.</p>
            </div>
          )}
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={loading} className="flex-1 py-2 text-white rounded-lg text-sm font-medium hover:brightness-90 disabled:opacity-50" style={{ backgroundColor: 'var(--company-primary, #ea580c)' }}>
            {loading ? 'Saving...' : mode === 'create' ? 'Add' : 'Update'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
