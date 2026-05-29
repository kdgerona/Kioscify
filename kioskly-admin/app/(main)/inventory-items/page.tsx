'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import type { InventoryItem } from '@/types';

export default function InventoryItemsPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ minStockLevel?: number; expirationWarningDays?: number }>({});

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getStoreInventoryItems();
      setItems(data);
    } catch (err) {
      console.error('Failed to load inventory items:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleEdit = (item: InventoryItem) => {
    setEditingId(item.id);
    setEditValues({
      minStockLevel: item.minStockLevel,
      expirationWarningDays: item.expirationWarningDays,
    });
  };

  const handleSave = async (id: string) => {
    try {
      await api.updateStoreInventoryItem(id, editValues);
      setEditingId(null);
      await fetchItems();
    } catch (err) {
      console.error('Failed to update item:', err);
    }
  };

  const categoryColors: Record<string, string> = {
    MAINS: 'bg-blue-100 text-blue-700',
    FLAVORED_JAMS: 'bg-pink-100 text-pink-700',
    ADD_ONS: 'bg-purple-100 text-purple-700',
    SYRUPS: 'bg-yellow-100 text-yellow-700',
    HOT: 'bg-red-100 text-red-700',
    PACKAGING: 'bg-gray-100 text-gray-700',
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Inventory Items</h1>
        <p className="text-sm text-gray-500 mt-1">
          Items are defined by your brand. You can adjust alert thresholds for your store.
        </p>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading inventory items...</div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unit</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Min Stock</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Expiry Warning (days)</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900">{item.name}</div>
                    {item.description && (
                      <div className="text-xs text-gray-500">{item.description}</div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${categoryColors[item.category] ?? 'bg-gray-100 text-gray-700'}`}>
                      {item.category.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{item.unit}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {editingId === item.id ? (
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        value={editValues.minStockLevel ?? ''}
                        onChange={(e) => setEditValues({ ...editValues, minStockLevel: parseFloat(e.target.value) })}
                        className="w-24 px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                    ) : (
                      item.minStockLevel ?? '—'
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {editingId === item.id ? (
                      <input
                        type="number"
                        min={1}
                        value={editValues.expirationWarningDays ?? ''}
                        onChange={(e) => setEditValues({ ...editValues, expirationWarningDays: parseInt(e.target.value) })}
                        className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                    ) : (
                      item.requiresExpirationDate ? (item.expirationWarningDays ?? 7) : '—'
                    )}
                  </td>
                  <td className="px-6 py-4 text-right text-sm">
                    {editingId === item.id ? (
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => handleSave(item.id)}
                          className="text-indigo-600 hover:text-indigo-800 font-medium"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-gray-500 hover:text-gray-700"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleEdit(item)}
                        className="text-gray-500 hover:text-gray-700"
                      >
                        Edit thresholds
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    No inventory items configured. Contact your brand manager to set up inventory items.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
