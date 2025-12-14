'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useTenant } from '@/contexts/TenantContext';
import {
  InventoryItem,
  LatestInventoryItem,
  InventoryStats,
} from '@/types';
import {
  Boxes,
  AlertTriangle,
  Package,
  TrendingDown,
  Plus,
  Edit2,
  Trash2,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';

export default function InventoryPage() {
  const { tenant } = useTenant();
  const primaryColor = tenant?.themeColors?.primary || '#4f46e5';

  // State management
  const [stats, setStats] = useState<InventoryStats | null>(null);
  const [latestInventory, setLatestInventory] = useState<LatestInventoryItem[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'items' | 'count'>('overview');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [itemForm, setItemForm] = useState({
    name: '',
    category: '',
    unit: '',
    description: '',
    minStockLevel: '',
  });

  // Load data on mount
  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadStats(),
        loadLatestInventory(),
        loadInventoryItems(),
      ]);
    } catch (error) {
      console.error('Failed to load inventory data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const data = await api.getInventoryStats();
      setStats(data);
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  const loadLatestInventory = async () => {
    try {
      const data = await api.getLatestInventory();
      setLatestInventory(data);
    } catch (error) {
      console.error('Failed to load latest inventory:', error);
    }
  };

  const loadInventoryItems = async () => {
    try {
      const data = await api.getInventoryItems(selectedCategory || undefined);
      setInventoryItems(data);
    } catch (error) {
      console.error('Failed to load inventory items:', error);
    }
  };

  // Get unique categories from inventory items
  const categories = Array.from(new Set(inventoryItems.map((item) => item.category))).sort();

  // Filter items based on search and category
  const filteredItems = latestInventory.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = !selectedCategory || item.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Handle item CRUD operations
  const handleCreateItem = async () => {
    try {
      await api.createInventoryItem({
        name: itemForm.name,
        category: itemForm.category,
        unit: itemForm.unit,
        description: itemForm.description || undefined,
        minStockLevel: itemForm.minStockLevel ? parseFloat(itemForm.minStockLevel) : undefined,
      });
      await loadInventoryItems();
      await loadStats();
      setShowItemModal(false);
      resetItemForm();
    } catch (error) {
      console.error('Failed to create item:', error);
      alert('Failed to create inventory item');
    }
  };

  const handleUpdateItem = async () => {
    if (!editingItem) return;
    try {
      await api.updateInventoryItem(editingItem.id, {
        name: itemForm.name,
        category: itemForm.category,
        unit: itemForm.unit,
        description: itemForm.description || undefined,
        minStockLevel: itemForm.minStockLevel ? parseFloat(itemForm.minStockLevel) : undefined,
      });
      await loadInventoryItems();
      await loadStats();
      setShowItemModal(false);
      setEditingItem(null);
      resetItemForm();
    } catch (error) {
      console.error('Failed to update item:', error);
      alert('Failed to update inventory item');
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm('Are you sure you want to delete this item?')) return;
    try {
      await api.deleteInventoryItem(id);
      await loadInventoryItems();
      await loadStats();
    } catch (error) {
      console.error('Failed to delete item:', error);
      alert('Failed to delete inventory item');
    }
  };

  const resetItemForm = () => {
    setItemForm({
      name: '',
      category: '',
      unit: '',
      description: '',
      minStockLevel: '',
    });
  };

  const openItemModal = (item?: InventoryItem) => {
    if (item) {
      setEditingItem(item);
      setItemForm({
        name: item.name,
        category: item.category,
        unit: item.unit,
        description: item.description || '',
        minStockLevel: item.minStockLevel?.toString() || '',
      });
    } else {
      setEditingItem(null);
      resetItemForm();
    }
    setShowItemModal(true);
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 bg-gray-200 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Inventory Management</h1>
        <p className="text-gray-600 mt-2">
          Track stock levels, manage items, and view inventory statistics
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-blue-500 p-3 rounded-lg">
              <Boxes className="w-6 h-6 text-white" />
            </div>
          </div>
          <p className="text-gray-600 text-sm mb-1">Total Items</p>
          <p className="text-2xl font-bold text-gray-900">{stats?.totalItems || 0}</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-red-500 p-3 rounded-lg">
              <AlertTriangle className="w-6 h-6 text-white" />
            </div>
          </div>
          <p className="text-gray-600 text-sm mb-1">Low Stock Alerts</p>
          <p className="text-2xl font-bold text-gray-900">{stats?.lowStockCount || 0}</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-orange-500 p-3 rounded-lg">
              <TrendingDown className="w-6 h-6 text-white" />
            </div>
          </div>
          <p className="text-gray-600 text-sm mb-1">Needs Counting</p>
          <p className="text-2xl font-bold text-gray-900">{stats?.itemsWithoutRecords || 0}</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-green-500 p-3 rounded-lg">
              <Package className="w-6 h-6 text-white" />
            </div>
          </div>
          <p className="text-gray-600 text-sm mb-1">Categories</p>
          <p className="text-2xl font-bold text-gray-900">{categories.length}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8">
            {['overview', 'items', 'count'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition ${
                  activeTab === tab
                    ? 'border-current text-gray-900'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
                style={activeTab === tab ? { borderColor: primaryColor } : {}}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Low Stock Alerts */}
          {stats && stats.lowStockItems.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm p-6 border border-red-200">
              <div className="flex items-center space-x-2 mb-4">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                <h2 className="text-xl font-bold text-gray-900">Low Stock Alerts</h2>
              </div>
              <div className="space-y-3">
                {stats.lowStockItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-4 bg-red-50 rounded-lg border border-red-100"
                  >
                    <div>
                      <p className="font-semibold text-gray-900">{item.name}</p>
                      <p className="text-sm text-gray-600">Category: {item.category}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-red-600">{item.latestQuantity}</p>
                      <p className="text-sm text-gray-600">Min: {item.minStockLevel}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Latest Inventory Counts */}
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Latest Inventory Counts</h2>
              <button
                onClick={loadLatestInventory}
                className="p-2 rounded-lg border border-gray-300 bg-white text-gray-600 hover:text-gray-900 hover:border-gray-400 transition"
                title="Refresh inventory counts"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
            </div>

            {/* Filters */}
            <div className="flex space-x-4 mb-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search items..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-900"
                />
              </div>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-900"
              >
                <option value="">All Categories</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Inventory List */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredItems.map((item) => (
                <div
                  key={item.id}
                  className="p-4 bg-gray-50 rounded-lg border border-gray-200 hover:shadow-md transition"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900">{item.name}</p>
                      <p className="text-xs text-gray-500">{item.category}</p>
                    </div>
                    <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
                      {item.unit}
                    </span>
                  </div>
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Current Stock:</span>
                      <span className={`text-lg font-bold ${
                        item.minStockLevel && item.latestQuantity && item.latestQuantity <= item.minStockLevel
                          ? 'text-red-600'
                          : 'text-green-600'
                      }`}>
                        {item.latestQuantity ?? '-'}
                      </span>
                    </div>
                    {item.minStockLevel && (
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs text-gray-500">Min Level:</span>
                        <span className="text-sm text-gray-600">{item.minStockLevel}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {filteredItems.length === 0 && (
              <div className="text-center py-12">
                <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No inventory items found</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Items Tab */}
      {activeTab === 'items' && (
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900">Manage Inventory Items</h2>
            <button
              onClick={() => openItemModal()}
              className="flex items-center space-x-2 px-4 py-2 rounded-lg text-black font-medium transition hover:opacity-90"
              style={{ backgroundColor: primaryColor }}
            >
              <Plus className="w-4 h-4" />
              <span>Add Item</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Name</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Category</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Unit</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Min Level</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Description</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {inventoryItems.map((item) => (
                  <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 font-medium text-gray-900">{item.name}</td>
                    <td className="py-3 px-4 text-gray-600">{item.category}</td>
                    <td className="py-3 px-4 text-gray-600">{item.unit}</td>
                    <td className="py-3 px-4 text-gray-600">{item.minStockLevel || '-'}</td>
                    <td className="py-3 px-4 text-gray-600 max-w-xs truncate">
                      {item.description || '-'}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => openItemModal(item)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteItem(item.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {inventoryItems.length === 0 && (
            <div className="text-center py-12">
              <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No inventory items yet</p>
              <button
                onClick={() => openItemModal()}
                className="mt-4 px-6 py-2 rounded-lg text-black font-medium transition hover:opacity-90"
                style={{ backgroundColor: primaryColor }}
              >
                Add Your First Item
              </button>
            </div>
          )}
        </div>
      )}

      {/* Count Tab */}
      {activeTab === 'count' && (
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Quick Inventory Count</h2>
          <p className="text-gray-600 mb-6">
            This feature is available in the mobile app for easier counting on the go.
          </p>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
            <Package className="w-16 h-16 text-blue-600 mx-auto mb-4" />
            <p className="text-gray-900 font-semibold mb-2">Use the Kioskly Mobile App</p>
            <p className="text-sm text-gray-600">
              Download the mobile app to quickly count inventory with an optimized interface
              designed for daily use.
            </p>
          </div>
        </div>
      )}

      {/* Item Modal */}
      {showItemModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-900">
                {editingItem ? 'Edit Item' : 'Add New Item'}
              </h3>
              <button
                onClick={() => {
                  setShowItemModal(false);
                  setEditingItem(null);
                  resetItemForm();
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  value={itemForm.name}
                  onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-900"
                  placeholder="e.g., Fresh Lemons"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category *
                </label>
                <input
                  type="text"
                  value={itemForm.category}
                  onChange={(e) => setItemForm({ ...itemForm, category: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-900"
                  placeholder="e.g., MAINS, SYRUPS, etc."
                  list="categories-list"
                />
                <datalist id="categories-list">
                  {categories.map((cat) => (
                    <option key={cat} value={cat} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Unit *
                </label>
                <input
                  type="text"
                  value={itemForm.unit}
                  onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-900"
                  placeholder="e.g., Box, Bottle, Pack"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Min Stock Level
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={itemForm.minStockLevel}
                  onChange={(e) => setItemForm({ ...itemForm, minStockLevel: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-900"
                  placeholder="Alert when stock falls below this"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={itemForm.description}
                  onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-900"
                  rows={3}
                  placeholder="Optional description"
                />
              </div>
            </div>

            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => {
                  setShowItemModal(false);
                  setEditingItem(null);
                  resetItemForm();
                }}
                className="flex-1 px-4 py-2 border-2 border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 hover:border-gray-400 transition"
              >
                Cancel
              </button>
              <button
                onClick={editingItem ? handleUpdateItem : handleCreateItem}
                disabled={!itemForm.name || !itemForm.category || !itemForm.unit}
                className="flex-1 px-4 py-2 rounded-lg text-black font-medium transition disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
                style={{ backgroundColor: primaryColor }}
              >
                {editingItem ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
