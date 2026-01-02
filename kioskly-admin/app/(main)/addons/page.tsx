"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { Plus, Edit, Trash2, X, Sparkles } from "lucide-react";
import type { Addon } from "@/types";
import { useTenant } from "@/contexts/TenantContext";

export default function AddonsPage() {
  const { tenant } = useTenant();
  const primaryColor = tenant?.themeColors?.primary || "#4f46e5";
  const [addons, setAddons] = useState<Addon[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingAddon, setEditingAddon] = useState<Addon | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    price: "",
  });

  useEffect(() => {
    loadAddons();
  }, []);

  const loadAddons = async () => {
    try {
      setLoading(true);
      const data = await api.getAddons();
      setAddons(data);
    } catch (error) {
      console.error("Failed to load addons:", error);
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditingAddon(null);
    setFormData({
      name: "",
      price: "0",
    });
    setShowModal(true);
  };

  const openEditModal = (addon: Addon) => {
    setEditingAddon(addon);
    setFormData({
      name: addon.name,
      price: addon.price.toString(),
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const addonData = {
        name: formData.name,
        price: parseFloat(formData.price),
      };

      if (editingAddon) {
        await api.updateAddon(editingAddon.id, addonData);
      } else {
        await api.createAddon(addonData);
      }

      await loadAddons();
      setShowModal(false);
    } catch (error) {
      console.error("Failed to save addon:", error);
      alert("Failed to save addon. Please try again.");
    }
  };

  const handleDelete = async (addon: Addon) => {
    if (!confirm(`Are you sure you want to delete "${addon.name}"?`)) {
      return;
    }

    try {
      await api.deleteAddon(addon.id);
      await loadAddons();
    } catch (error) {
      console.error("Failed to delete addon:", error);
      alert("Failed to delete addon. Please try again.");
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
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            Addons
          </h1>
          <p className="text-sm sm:text-base text-gray-600 mt-2">
            Manage product add-ons and extras
          </p>
        </div>
        <button
          onClick={openCreateModal}
          style={{ backgroundColor: primaryColor }}
          className="flex items-center space-x-2 text-black px-4 py-2 rounded-lg transition hover:opacity-90"
        >
          <Plus className="w-5 h-5" />
          <span>Add Addon</span>
        </button>
      </div>

      {/* Addons Grid */}
      {addons.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {addons.map((addon) => (
            <div
              key={addon.id}
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900 mb-1">
                    {addon.name}
                  </h3>
                </div>
                <Sparkles className="w-6 h-6 text-gray-400" />
              </div>

              <div className="mb-4">
                <p className="text-2xl font-bold text-black">
                  {formatCurrency(addon.price)}
                </p>
                <p className="text-xs text-gray-500">Additional Price</p>
              </div>

              <div className="flex space-x-2">
                <button
                  onClick={() => openEditModal(addon)}
                  className="flex-1 flex items-center justify-center space-x-2 bg-blue-50 hover:bg-blue-100 text-blue-600 px-3 py-2 rounded-lg transition"
                >
                  <Edit className="w-4 h-4" />
                  <span className="text-sm font-medium">Edit</span>
                </button>
                <button
                  onClick={() => handleDelete(addon)}
                  className="flex-1 flex items-center justify-center space-x-2 bg-red-50 hover:bg-red-100 text-red-600 px-3 py-2 rounded-lg transition"
                >
                  <Trash2 className="w-4 h-4" />
                  <span className="text-sm font-medium">Delete</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <Sparkles className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">No addons found</p>
          <p className="text-sm text-gray-500 mt-2">
            Create your first addon to get started
          </p>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-lg w-full">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900">
                {editingAddon ? "Edit Addon" : "Create Addon"}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Addon Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-gray-900"
                  placeholder="e.g., Extra Shot, Whipped Cream, Caramel Drizzle"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Price *
                </label>
                <input
                  type="number"
                  required
                  step="0.01"
                  min="0"
                  value={formData.price}
                  onChange={(e) =>
                    setFormData({ ...formData, price: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-gray-900"
                  placeholder="0.00"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Additional cost for this addon
                </p>
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ backgroundColor: primaryColor }}
                  className="flex-1 px-4 py-2 text-black rounded-lg transition hover:opacity-90"
                >
                  {editingAddon ? "Update" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
