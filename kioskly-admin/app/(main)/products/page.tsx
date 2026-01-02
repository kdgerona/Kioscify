"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import {
  Package,
  Plus,
  Edit,
  Trash2,
  Search,
  X,
  Upload,
  Image as ImageIcon,
  Ruler,
  Sparkles,
} from "lucide-react";
import type { Product, Category, Size, Addon } from "@/types";
import { useTenant } from "@/contexts/TenantContext";

export default function ProductsPage() {
  const { tenant } = useTenant();
  const primaryColor = tenant?.themeColors?.primary || "#4f46e5";
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [sizes, setSizes] = useState<Size[]>([]);
  const [addons, setAddons] = useState<Addon[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [selectedSizeIds, setSelectedSizeIds] = useState<string[]>([]);
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    name: "",
    categoryId: "",
    price: "",
  });

  useEffect(() => {
    loadData();
  }, []);

  const filterProducts = useCallback(() => {
    if (!searchTerm) {
      setFilteredProducts(products);
      return;
    }

    const filtered = products.filter((p) =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredProducts(filtered);
  }, [searchTerm, products]);

  useEffect(() => {
    filterProducts();
  }, [filterProducts]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [productsData, categoriesData, sizesData, addonsData] =
        await Promise.all([
          api.getProducts(),
          api.getCategories(),
          api.getSizes(),
          api.getAddons(),
        ]);
      setProducts(productsData);
      setCategories(categoriesData);
      setSizes(sizesData);
      setAddons(addonsData);
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditingProduct(null);
    setFormData({
      name: "",
      categoryId: categories[0]?.id || "",
      price: "",
    });
    setSelectedSizeIds([]);
    setSelectedAddonIds([]);
    setSelectedImage(null);
    setImagePreview(null);
    setShowModal(true);
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      categoryId: product.categoryId,
      price: (Number(product.price) || 0).toString(),
    });
    setSelectedSizeIds(product.sizes?.map((s) => s.id) || []);
    setSelectedAddonIds(product.addons?.map((a) => a.id) || []);
    setSelectedImage(null);
    setImagePreview(product.image || null);
    setShowModal(true);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const productData = {
        name: formData.name,
        categoryId: formData.categoryId,
        price: parseFloat(formData.price),
        sizeIds: selectedSizeIds.length > 0 ? selectedSizeIds : undefined,
        addonIds: selectedAddonIds.length > 0 ? selectedAddonIds : undefined,
      };

      let productId: string;

      if (editingProduct) {
        await api.updateProduct(editingProduct.id, productData);
        productId = editingProduct.id;
      } else {
        const newProduct = await api.createProduct(productData);
        productId = newProduct.id;
      }

      // Upload image if selected
      if (selectedImage) {
        setUploadingImage(true);
        try {
          await api.uploadProductImage(productId, selectedImage);
        } catch (error) {
          console.error("Failed to upload image:", error);
          alert(
            "Product saved but image upload failed. You can try uploading again."
          );
        } finally {
          setUploadingImage(false);
        }
      }

      await loadData();
      setShowModal(false);
    } catch (error) {
      console.error("Failed to save product:", error);
      alert("Failed to save product. Please try again.");
    }
  };

  const handleDelete = async (product: Product) => {
    if (!confirm(`Are you sure you want to delete "${product.name}"?`)) {
      return;
    }

    try {
      await api.deleteProduct(product.id);
      await loadData();
    } catch (error) {
      console.error("Failed to delete product:", error);
      alert("Failed to delete product. Please try again.");
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
            Products
          </h1>
          <p className="text-sm sm:text-base text-gray-600 mt-2">
            Manage your product catalog
          </p>
        </div>
        <button
          onClick={openCreateModal}
          style={{ backgroundColor: primaryColor }}
          className="flex items-center space-x-2 text-black px-4 py-2 rounded-lg transition hover:opacity-90"
        >
          <Plus className="w-5 h-5" />
          <span>Add Product</span>
        </button>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-200 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search products..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
          />
        </div>
      </div>

      {/* Products Grid */}
      {filteredProducts.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProducts.map((product) => (
            <div
              key={product.id}
              className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition"
            >
              {/* Product Image */}
              {product.image ? (
                <div className="w-full h-48 bg-gray-100 overflow-hidden">
                  <img
                    src={product.image}
                    alt={product.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="w-full h-48 bg-gray-100 flex items-center justify-center">
                  <ImageIcon className="w-16 h-16 text-gray-300" />
                </div>
              )}

              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-gray-900 mb-1">
                      {product.name}
                    </h3>
                    <p className="text-xs text-gray-500">
                      Category:{" "}
                      {categories.find((c) => c.id === product.categoryId)
                        ?.name || "N/A"}
                    </p>
                  </div>
                </div>

                <div className="mb-4">
                  <p className="text-2xl font-bold text-black">
                    {formatCurrency(Number(product.price) || 0)}
                  </p>
                  <p className="text-xs text-gray-500">Base Price</p>
                </div>

                {product.sizes && product.sizes.length > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center space-x-1 mb-2">
                      <Ruler className="w-4 h-4 text-gray-400" />
                      <p className="text-xs font-medium text-gray-700">
                        Sizes Available:
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {product.sizes.map((size) => (
                        <span
                          key={size.id}
                          className="inline-flex items-center px-2 py-1 rounded-md bg-blue-50 text-blue-700 text-xs"
                        >
                          {size.name}
                          {size.priceModifier !== 0 && (
                            <span className="ml-1 text-blue-600">
                              ({size.priceModifier > 0 ? "+" : ""}
                              {formatCurrency(size.priceModifier)})
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {product.addons && product.addons.length > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center space-x-1 mb-2">
                      <Sparkles className="w-4 h-4 text-gray-400" />
                      <p className="text-xs font-medium text-gray-700">
                        Addons Available:
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {product.addons.map((addon) => (
                        <span
                          key={addon.id}
                          className="inline-flex items-center px-2 py-1 rounded-md bg-purple-50 text-purple-700 text-xs"
                        >
                          {addon.name}
                          <span className="ml-1 text-purple-600">
                            (+{formatCurrency(addon.price)})
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex space-x-2">
                  <button
                    onClick={() => openEditModal(product)}
                    className="flex-1 flex items-center justify-center space-x-2 bg-blue-50 hover:bg-blue-100 text-blue-600 px-3 py-2 rounded-lg transition"
                  >
                    <Edit className="w-4 h-4" />
                    <span className="text-sm font-medium">Edit</span>
                  </button>
                  <button
                    onClick={() => handleDelete(product)}
                    className="flex-1 flex items-center justify-center space-x-2 bg-red-50 hover:bg-red-100 text-red-600 px-3 py-2 rounded-lg transition"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span className="text-sm font-medium">Delete</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">No products found</p>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-4xl w-full my-8">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900">
                {editingProduct ? "Edit Product" : "Create Product"}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form
              onSubmit={handleSubmit}
              className="p-6 space-y-4 max-h-[calc(100vh-12rem)] overflow-y-auto"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Product Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-gray-900"
                  placeholder="e.g., Classic Lemonade"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Category *
                </label>
                <select
                  required
                  value={formData.categoryId}
                  onChange={(e) =>
                    setFormData({ ...formData, categoryId: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-gray-900"
                >
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Base Price *
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
                  Base price before size modifiers
                </p>
              </div>

              {(sizes.length > 0 || addons.length > 0) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {sizes.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Available Sizes (Optional)
                      </label>
                      <div className="border border-gray-300 rounded-lg p-3 space-y-2 h-40 overflow-y-auto">
                        {sizes.map((size) => (
                          <label
                            key={size.id}
                            className="flex items-center space-x-3 p-2 rounded hover:bg-gray-50 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={selectedSizeIds.includes(size.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedSizeIds([
                                    ...selectedSizeIds,
                                    size.id,
                                  ]);
                                } else {
                                  setSelectedSizeIds(
                                    selectedSizeIds.filter(
                                      (id) => id !== size.id
                                    )
                                  );
                                }
                              }}
                              className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                            />
                            <div className="flex-1 flex items-center justify-between">
                              <span className="text-sm text-gray-900">
                                {size.name}
                                {size.volume && (
                                  <span className="text-gray-500 ml-1">
                                    ({size.volume})
                                  </span>
                                )}
                              </span>
                              <span className="text-sm text-gray-600">
                                {size.priceModifier >= 0 ? "+" : ""}
                                {formatCurrency(size.priceModifier)}
                              </span>
                            </div>
                          </label>
                        ))}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Select which sizes are available
                      </p>
                    </div>
                  )}

                  {addons.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Available Addons (Optional)
                      </label>
                      <div className="border border-gray-300 rounded-lg p-3 space-y-2 h-40 overflow-y-auto">
                        {addons.map((addon) => (
                          <label
                            key={addon.id}
                            className="flex items-center space-x-3 p-2 rounded hover:bg-gray-50 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={selectedAddonIds.includes(addon.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedAddonIds([
                                    ...selectedAddonIds,
                                    addon.id,
                                  ]);
                                } else {
                                  setSelectedAddonIds(
                                    selectedAddonIds.filter(
                                      (id) => id !== addon.id
                                    )
                                  );
                                }
                              }}
                              className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                            />
                            <div className="flex-1 flex items-center justify-between">
                              <span className="text-sm text-gray-900">
                                {addon.name}
                              </span>
                              <span className="text-sm text-gray-600">
                                +{formatCurrency(addon.price)}
                              </span>
                            </div>
                          </label>
                        ))}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Select which addons are available
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Product Image
                </label>
                <div className="space-y-3">
                  {imagePreview && (
                    <div className="relative w-full h-48 bg-gray-100 rounded-lg overflow-hidden">
                      <img
                        src={imagePreview}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <div className="flex items-center space-x-2">
                    <label
                      htmlFor="image-upload"
                      className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition"
                    >
                      <Upload className="w-4 h-4 text-gray-600" />
                      <span className="text-sm text-gray-700">
                        {selectedImage ? selectedImage.name : "Choose Image"}
                      </span>
                    </label>
                    <input
                      id="image-upload"
                      type="file"
                      accept="image/*"
                      onChange={handleImageSelect}
                      className="hidden"
                    />
                  </div>
                  <p className="text-xs text-gray-500">
                    Accepted formats: JPG, PNG, GIF, WebP (Max 5MB)
                  </p>
                </div>
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  disabled={uploadingImage}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploadingImage}
                  style={{ backgroundColor: primaryColor }}
                  className="flex-1 px-4 py-2 text-black rounded-lg transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploadingImage
                    ? "Uploading..."
                    : editingProduct
                      ? "Update"
                      : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
