"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { Ruler, Plus, Edit, Trash2, X } from "lucide-react";
import type { Size } from "@/types";
import { useTenant } from "@/contexts/TenantContext";

export default function SizesPage() {
  const { tenant } = useTenant();
  const primaryColor = tenant?.themeColors?.primary || "#4f46e5";
  const [sizes, setSizes] = useState<Size[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingSize, setEditingSize] = useState<Size | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    priceModifier: "",
    volume: "",
  });

  useEffect(() => {
    loadSizes();
  }, []);

  const loadSizes = async () => {
    try {
      setLoading(true);
      const data = await api.getSizes();
      setSizes(data);
    } catch (error) {
      console.error("Failed to load sizes:", error);
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditingSize(null);
    setFormData({
      name: "",
      priceModifier: "0",
      volume: "",
    });
    setShowModal(true);
  };

  const openEditModal = (size: Size) => {
    setEditingSize(size);
    setFormData({
      name: size.name,
      priceModifier: size.priceModifier.toString(),
      volume: size.volume || "",
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const sizeData = {
        name: formData.name,
        priceModifier: parseFloat(formData.priceModifier),
        volume: formData.volume || undefined,
      };

      if (editingSize) {
        await api.updateSize(editingSize.id, sizeData);
      } else {
        await api.createSize(sizeData);
      }

      await loadSizes();
      setShowModal(false);
    } catch (error) {
      console.error("Failed to save size:", error);
      alert("Failed to save size. Please try again.");
    }
  };

  const handleDelete = async (size: Size) => {
    if (!confirm(`Are you sure you want to delete "${size.name}"?`)) {
      return;
    }

    try {
      await api.deleteSize(size.id);
      await loadSizes();
    } catch (error) {
      console.error("Failed to delete size:", error);
      alert("Failed to delete size. Please try again.");
    }
  };

  if (loading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 sm:mb-8 gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            Sizes
          </h1>
          <p className="text-sm sm:text-base text-gray-600 mt-2">
            Manage product size options
          </p>
        </div>
        <button
          onClick={openCreateModal}
          style={{ backgroundColor: primaryColor }}
          className="flex items-center justify-center space-x-2 text-black px-4 py-2 rounded-lg transition hover:opacity-90 text-sm sm:text-base w-full sm:w-auto flex-shrink-0"
        >
          <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
          <span>Add Size</span>
        </button>
      </div>

      {/* Sizes Grid */}
      {sizes.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {sizes.map((size) => (
            <div
              key={size.id}
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 hover:shadow-md transition"
            >
              <div className="flex items-start justify-between mb-3 sm:mb-4">
                <div className="flex-1 min-w-0">
                  <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-1 break-words">
                    {size.name}
                  </h3>
                  {size.volume && (
                    <p className="text-xs sm:text-sm text-gray-500">{size.volume}</p>
                  )}
                </div>
                <Ruler className="w-5 h-5 sm:w-6 sm:h-6 text-gray-400 flex-shrink-0 ml-2" />
              </div>

              <div className="mb-3 sm:mb-4">
                <p className="text-xl sm:text-2xl font-bold text-black break-all">
                  {size.priceModifier >= 0 ? "+" : ""}
                  {formatCurrency(size.priceModifier)}
                </p>
                <p className="text-xs text-gray-500">Price Modifier</p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => openEditModal(size)}
                  className="flex-1 flex items-center justify-center space-x-1 sm:space-x-2 bg-blue-50 hover:bg-blue-100 text-blue-600 px-2 sm:px-3 py-2 rounded-lg transition"
                >
                  <Edit className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                  <span className="text-xs sm:text-sm font-medium">Edit</span>
                </button>
                <button
                  onClick={() => handleDelete(size)}
                  className="flex-1 flex items-center justify-center space-x-1 sm:space-x-2 bg-red-50 hover:bg-red-100 text-red-600 px-2 sm:px-3 py-2 rounded-lg transition"
                >
                  <Trash2 className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                  <span className="text-xs sm:text-sm font-medium">Delete</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 sm:p-12 text-center">
          <Ruler className="w-10 h-10 sm:w-12 sm:h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-sm sm:text-base text-gray-600">No sizes found</p>
          <p className="text-xs sm:text-sm text-gray-500 mt-2">
            Create your first size to get started
          </p>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-2 sm:p-4 z-50">
          <div className="bg-white rounded-xl max-w-lg w-full">
            <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200">
              <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900">
                {editingSize ? "Edit Size" : "Create Size"}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 flex-shrink-0"
              >
                <X className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-3 sm:space-y-4">
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                  Size Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="w-full px-3 sm:px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-gray-900 text-sm sm:text-base"
                  placeholder="e.g., Small, Medium, Large"
                />
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                  Volume (Optional)
                </label>
                <input
                  type="text"
                  value={formData.volume}
                  onChange={(e) =>
                    setFormData({ ...formData, volume: e.target.value })
                  }
                  className="w-full px-3 sm:px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-gray-900 text-sm sm:text-base"
                  placeholder="e.g., 12oz, 16oz, 20oz"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Display volume or measurement (optional)
                </p>
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                  Price Modifier *
                </label>
                <input
                  type="number"
                  required
                  step="0.01"
                  value={formData.priceModifier}
                  onChange={(e) =>
                    setFormData({ ...formData, priceModifier: e.target.value })
                  }
                  className="w-full px-3 sm:px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-gray-900 text-sm sm:text-base"
                  placeholder="0.00"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Amount to add (+) or subtract (-) from the base price. Use 0
                  for no change.
                </p>
              </div>

              <div className="flex gap-2 sm:gap-3 pt-3 sm:pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-3 sm:px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition text-sm sm:text-base"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ backgroundColor: primaryColor }}
                  className="flex-1 px-3 sm:px-4 py-2 text-black rounded-lg transition hover:opacity-90 text-sm sm:text-base"
                >
                  {editingSize ? "Update" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
