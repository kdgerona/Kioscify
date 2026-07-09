"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { hasPrivilege } from "@/lib/privileges";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/utils";
import { useTenant } from "@/contexts/TenantContext";
import { InventoryItem, LatestInventoryItem, InventoryStats } from "@/types";
import {
  Boxes,
  AlertTriangle,
  Package,
  TrendingDown,
  RefreshCw,
  Search,
  Calendar,
  CalendarX,
} from "lucide-react";
import { ExpirationBatch } from "@/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function InventoryPage() {
  const router = useRouter();
  const { tenant, brand } = useTenant();
  const primaryColor = brand?.themeColors?.primary ?? tenant?.themeColors?.primary ?? "#ea580c";
  const textColor = "#1f2937";

  const canWrite = hasPrivilege('inventory', 'write');

  useEffect(() => {
    if (!hasPrivilege('inventory', 'read')) router.replace('/dashboard');
  }, [router]);

  // State management
  const [stats, setStats] = useState<InventoryStats | null>(null);
  const [latestInventory, setLatestInventory] = useState<LatestInventoryItem[]>(
    []
  );
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [legacyItems, setLegacyItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "items">("overview");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [batchesMap, setBatchesMap] = useState<Map<string, ExpirationBatch[]>>(new Map());
  const [editingThresholdId, setEditingThresholdId] = useState<string | null>(null);
  const [thresholdValues, setThresholdValues] = useState<{ minStockLevel?: number; expirationWarningDays?: number }>({});

  // Helper function to format category names to human-readable text
  const formatCategoryName = (category: string): string => {
    if (!category) return "Uncategorized";

    // Replace underscores and hyphens with spaces, then handle camelCase
    return category
      .replace(/[_-]/g, " ") // Replace underscores and hyphens with spaces
      .replace(/([a-z])([A-Z])/g, "$1 $2") // Add space before capital letters in camelCase
      .split(/\s+/) // Split by whitespace
      .filter((word) => word.length > 0) // Remove empty strings
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  };

  // Load data on mount
  useEffect(() => {
    loadAllData();
  }, []);

  // Re-fetch items when the Items-tab category filter changes
  useEffect(() => {
    if (!loading) loadInventoryItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategoryId]);

  const loadAllData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadStats(),
        loadLatestInventory(),
        loadInventoryItems(),
      ]);
    } catch (error) {
      console.error("Failed to load inventory data:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const data = await api.getInventoryStats();
      setStats(data);
    } catch (error) {
      console.error("Failed to load stats:", error);
    }
  };

  const loadLatestInventory = async () => {
    try {
      const data = await api.getLatestInventory();
      setLatestInventory(data);
      const newBatchesMap = new Map<string, ExpirationBatch[]>();
      data.forEach((item: any) => {
        if (item.expirationBatches && item.expirationBatches.length > 0) {
          newBatchesMap.set(item.id, item.expirationBatches);
        }
      });
      setBatchesMap(newBatchesMap);
    } catch (error) {
      console.error("Failed to load latest inventory:", error);
    }
  };

  // Get expiration status for a batch
  const getExpirationStatus = (
    expirationDate: string | undefined,
    warningDays: number = 7
  ): { status: "expired" | "expiring-soon" | "warning" | "ok"; daysLeft: number | null } => {
    if (!expirationDate) return { status: "ok", daysLeft: null };

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const expDate = new Date(expirationDate);
    expDate.setHours(0, 0, 0, 0);

    const daysLeft = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysLeft < 0) return { status: "expired", daysLeft };
    if (daysLeft <= 3) return { status: "expiring-soon", daysLeft };
    if (daysLeft <= warningDays) return { status: "warning", daysLeft };
    return { status: "ok", daysLeft };
  };

  const formatExpirationDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const loadInventoryItems = async () => {
    try {
      const data = await api.getInventoryItems(selectedCategoryId || undefined);
      setInventoryItems(data.active);
      setLegacyItems(data.legacy);
    } catch (error) {
      console.error("Failed to load inventory items:", error);
    }
  };

  const handleEditThreshold = (item: InventoryItem) => {
    setEditingThresholdId(item.id);
    setThresholdValues({ minStockLevel: item.minStockLevel ?? undefined, expirationWarningDays: item.expirationWarningDays ?? undefined });
  };

  const handleSaveThreshold = async (id: string) => {
    try {
      await api.updateStoreInventoryItem(id, thresholdValues);
      setEditingThresholdId(null);
      await loadInventoryItems();
      toast.success("Threshold updated");
    } catch (error) {
      console.error("Failed to update thresholds:", error);
      toast.error(getErrorMessage(error, "Failed to update threshold"));
    }
  };

  // Category names for the Overview tab filter (derived from the flat
  // latestInventory list, which flattens category to its name string)
  const categories = Array.from(
    new Set(latestInventory.map((item) => item.category).filter((c): c is string => !!c))
  ).sort();

  // Category id/name pairs for the Items tab filter (active items carry the
  // structured {id, name} category)
  const itemCategories = Array.from(
    new Map(inventoryItems.filter((i) => i.category).map((i) => [i.category!.id, i.category!.name])).entries()
  ).sort((a, b) => a[1].localeCompare(b[1]));

  // Filter items based on search and category
  const filteredItems = latestInventory.filter((item) => {
    const matchesSearch = item.name
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesCategory =
      !selectedCategory || item.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Group filtered items by category
  const groupedItems = filteredItems.reduce(
    (acc, item) => {
      const category = item.category || "Uncategorized";
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(item);
      return acc;
    },
    {} as Record<string, LatestInventoryItem[]>
  );

  // Sort categories alphabetically
  const sortedCategories = Object.keys(groupedItems).sort();


  if (loading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
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
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
          Inventory Management
        </h1>
        <p className="text-sm sm:text-base text-gray-600 mt-2">
          Track stock levels, manage items, and view inventory statistics
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6 sm:mb-8">
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-blue-500 p-3 rounded-lg">
              <Boxes className="w-6 h-6 text-white" />
            </div>
          </div>
          <p className="text-gray-600 text-sm mb-1">Total Items</p>
          <p className="text-2xl font-bold text-gray-900">
            {stats?.totalItems || 0}
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-red-500 p-3 rounded-lg">
              <AlertTriangle className="w-6 h-6 text-white" />
            </div>
          </div>
          <p className="text-gray-600 text-sm mb-1">Low Stock Alerts</p>
          <p className="text-2xl font-bold text-gray-900">
            {stats?.lowStockCount || 0}
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-orange-500 p-3 rounded-lg">
              <TrendingDown className="w-6 h-6 text-white" />
            </div>
          </div>
          <p className="text-gray-600 text-sm mb-1">Needs Counting</p>
          <p className="text-2xl font-bold text-gray-900">
            {stats?.itemsWithoutRecords || 0}
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-green-500 p-3 rounded-lg">
              <Package className="w-6 h-6 text-white" />
            </div>
          </div>
          <p className="text-gray-600 text-sm mb-1">Categories</p>
          <p className="text-2xl font-bold text-gray-900">
            {categories.length}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8">
            {["overview", "items"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition ${
                  activeTab === tab
                    ? "border-current text-gray-900"
                    : "border-transparent text-gray-500 hover:text-gray-700"
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
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Low Stock Alerts */}
          {stats &&
            stats.lowStockItems.length > 0 &&
            (() => {
              // Group low stock items by category
              const groupedLowStock = stats.lowStockItems.reduce(
                (acc, item) => {
                  const category = item.category || "Uncategorized";
                  if (!acc[category]) {
                    acc[category] = [];
                  }
                  acc[category].push(item);
                  return acc;
                },
                {} as Record<string, typeof stats.lowStockItems>
              );

              const sortedLowStockCategories =
                Object.keys(groupedLowStock).sort();

              return (
                <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 border border-red-200">
                  <div className="flex items-center space-x-2 mb-4 sm:mb-6">
                    <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-red-600" />
                    <h2 className="text-lg sm:text-xl font-bold text-gray-900">
                      Low Stock Alerts
                    </h2>
                  </div>
                  <div className="space-y-4 sm:space-y-6">
                    {sortedLowStockCategories.map((category) => (
                      <div key={category}>
                        {/* Category Header */}
                        <div className="flex items-center mb-3 gap-2">
                          <h3 className="text-base sm:text-lg font-semibold text-gray-800">
                            {formatCategoryName(category)}
                          </h3>
                          <div className="flex-1 border-t border-red-300"></div>
                          <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-700 whitespace-nowrap">
                            {groupedLowStock[category].length}{" "}
                            {groupedLowStock[category].length === 1
                              ? "item"
                              : "items"}
                          </span>
                        </div>

                        {/* Items List */}
                        <div className="space-y-2 sm:space-y-3">
                          {groupedLowStock[category].map((item) => (
                            <div
                              key={item.id}
                              className="flex items-center justify-between gap-2 p-3 sm:p-4 bg-red-50 rounded-lg border border-red-100"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="text-sm sm:text-base font-semibold text-gray-900 break-words">
                                  {item.name}
                                </p>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className="text-base sm:text-lg font-bold text-red-600">
                                  {item.latestQuantity}
                                </p>
                                <p className="text-xs sm:text-sm text-gray-600">
                                  Min: {item.minStockLevel}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

          {/* Latest Inventory Counts */}
          <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 border border-gray-200">
            <div className="flex items-center justify-between gap-2 mb-4 sm:mb-6">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">
                Latest Inventory Counts
              </h2>
              <button
                onClick={loadLatestInventory}
                className="p-2 rounded-lg border border-gray-300 bg-white text-gray-600 hover:text-gray-900 hover:border-gray-400 transition flex-shrink-0"
                title="Refresh inventory counts"
              >
                <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search items..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-9 pl-10 pr-4 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent outline-none text-sm text-gray-900"
                  style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                />
              </div>
              <div className="w-full sm:w-48 flex-shrink-0">
                <Select
                  value={selectedCategory || "ALL"}
                  onValueChange={(v) => setSelectedCategory(v === "ALL" ? "" : v)}
                >
                  <SelectTrigger style={{ color: textColor }}>
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent style={{ '--select-hover-bg': `${primaryColor}20`, '--select-hover-text': textColor } as React.CSSProperties}>
                    <SelectItem value="ALL">All Categories</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {formatCategoryName(cat)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Inventory List - Grouped by Category */}
            <div className="space-y-4 sm:space-y-6">
              {sortedCategories.map((category) => (
                <div key={category}>
                  {/* Category Header */}
                  <div className="flex items-center mb-3 gap-2">
                    <h3 className="text-base sm:text-lg font-semibold text-gray-800">
                      {formatCategoryName(category)}
                    </h3>
                    <div className="flex-1 border-t border-gray-300"></div>
                    <span className="px-2 py-1 text-xs rounded-full bg-gray-200 text-gray-700 whitespace-nowrap">
                      {groupedItems[category].length}{" "}
                      {groupedItems[category].length === 1 ? "item" : "items"}
                    </span>
                  </div>

                  {/* Items Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                    {groupedItems[category].map((item) => {
                      const itemBatches = batchesMap.get(item.id) || [];
                      const hasExpirationBatches = item.requiresExpirationDate && itemBatches.length > 0;

                      return (
                        <div
                          key={item.id}
                          className="p-3 sm:p-4 bg-gray-50 rounded-lg border border-gray-200 hover:shadow-md transition"
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm sm:text-base font-semibold text-gray-900 break-words">
                                {item.name}
                              </p>
                              {item.requiresExpirationDate && (
                                <span className="inline-flex items-center gap-1 text-xs text-amber-600 mt-1">
                                  <Calendar className="w-3 h-3" />
                                  Tracks expiration
                                </span>
                              )}
                            </div>
                            <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800 flex-shrink-0">
                              {item.unit}
                            </span>
                          </div>
                          <div className="mt-2 sm:mt-3 pt-2 sm:pt-3 border-t border-gray-200">
                            <div className="flex items-center justify-between">
                              <span className="text-xs sm:text-sm text-gray-600">
                                Current Stock:
                              </span>
                              <span
                                className={`text-base sm:text-lg font-bold ${
                                  item.minStockLevel &&
                                  item.latestQuantity &&
                                  item.latestQuantity <= item.minStockLevel
                                    ? "text-red-600"
                                    : "text-green-600"
                                }`}
                              >
                                {item.latestQuantity ?? "-"}
                              </span>
                            </div>
                            {item.minStockLevel && (
                              <div className="flex items-center justify-between mt-1">
                                <span className="text-xs text-gray-500">
                                  Min Level:
                                </span>
                                <span className="text-xs sm:text-sm text-gray-600">
                                  {item.minStockLevel}
                                </span>
                              </div>
                            )}

                            {/* Expiration Batches Display */}
                            {hasExpirationBatches && (
                              <div className="mt-3 pt-3 border-t border-gray-200">
                                <p className="text-xs font-semibold text-gray-700 mb-2">
                                  Expiration Batches:
                                </p>
                                <div className="space-y-2">
                                  {itemBatches.map((batch, idx) => {
                                    const { status, daysLeft } = getExpirationStatus(
                                      batch.expirationDate,
                                      item.expirationWarningDays || 7
                                    );

                                    const getBatchStyles = () => {
                                      switch (status) {
                                        case "expired":
                                          return {
                                            bg: "bg-red-100",
                                            border: "border-red-300",
                                            text: "text-red-700",
                                            icon: <CalendarX className="w-3 h-3" />,
                                          };
                                        case "expiring-soon":
                                          return {
                                            bg: "bg-orange-100",
                                            border: "border-orange-300",
                                            text: "text-orange-700",
                                            icon: <Calendar className="w-3 h-3" />,
                                          };
                                        case "warning":
                                          return {
                                            bg: "bg-amber-100",
                                            border: "border-amber-300",
                                            text: "text-amber-700",
                                            icon: <Calendar className="w-3 h-3" />,
                                          };
                                        default:
                                          return {
                                            bg: "bg-green-50",
                                            border: "border-green-200",
                                            text: "text-green-700",
                                            icon: <Calendar className="w-3 h-3" />,
                                          };
                                      }
                                    };

                                    const styles = getBatchStyles();

                                    return (
                                      <div
                                        key={idx}
                                        className={`flex items-center justify-between p-2 rounded-md border ${styles.bg} ${styles.border}`}
                                      >
                                        <div className="flex items-center gap-2">
                                          <span className={styles.text}>{styles.icon}</span>
                                          <span className={`text-xs font-medium ${styles.text}`}>
                                            {batch.expirationDate
                                              ? formatExpirationDate(batch.expirationDate)
                                              : "No date"}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs font-bold text-gray-900">
                                            Qty: {batch.quantity}
                                          </span>
                                          {status === "expired" && (
                                            <span className="px-1.5 py-0.5 text-xs font-bold bg-red-600 text-white rounded">
                                              EXPIRED
                                            </span>
                                          )}
                                          {status === "expiring-soon" && daysLeft !== null && (
                                            <span className="px-1.5 py-0.5 text-xs font-bold bg-orange-500 text-white rounded">
                                              {daysLeft}d
                                            </span>
                                          )}
                                          {status === "warning" && daysLeft !== null && (
                                            <span className="px-1.5 py-0.5 text-xs font-bold bg-amber-500 text-white rounded">
                                              {daysLeft}d
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
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
      {activeTab === "items" && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 border border-gray-200">
            <div className="flex items-center justify-between gap-2 mb-4 sm:mb-6">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-gray-900">Inventory Items</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Items are defined by your brand&apos;s inventory setup. Adjust the alert thresholds for your store below.
                  Values marked with <span className="text-indigo-500 font-medium">*</span> are store-level overrides and will not be changed when your brand updates the shared setup.
                </p>
              </div>
              {itemCategories.length > 0 && (
                <div className="w-full sm:w-48 flex-shrink-0">
                  <Select
                    value={selectedCategoryId || "ALL"}
                    onValueChange={(v) => setSelectedCategoryId(v === "ALL" ? "" : v)}
                  >
                    <SelectTrigger style={{ color: textColor }}>
                      <SelectValue placeholder="All Categories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Categories</SelectItem>
                      {itemCategories.map(([id, name]) => (
                        <SelectItem key={id} value={id}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {inventoryItems.length === 0 ? (
              <div className="text-center py-12">
                <Package className="w-10 h-10 sm:w-12 sm:h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-sm sm:text-base text-gray-600">No inventory items configured for your store yet.</p>
                <p className="text-xs text-gray-400 mt-1">Contact your brand manager to set up inventory items.</p>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-4 sm:mx-0">
                <div className="min-w-full inline-block align-middle px-4 sm:px-0">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-2 sm:px-4 font-semibold text-gray-700 text-xs sm:text-sm">Item</th>
                        <th className="text-left py-3 px-2 sm:px-4 font-semibold text-gray-700 text-xs sm:text-sm">Category</th>
                        <th className="text-left py-3 px-2 sm:px-4 font-semibold text-gray-700 text-xs sm:text-sm">Unit</th>
                        <th className="text-left py-3 px-2 sm:px-4 font-semibold text-gray-700 text-xs sm:text-sm">Min Stock</th>
                        <th className="text-left py-3 px-2 sm:px-4 font-semibold text-gray-700 text-xs sm:text-sm">Expiry Warning (days)</th>
                        {canWrite && <th className="text-right py-3 px-2 sm:px-4 font-semibold text-gray-700 text-xs sm:text-sm">Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {inventoryItems.map((item) => (
                        <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-3 px-2 sm:px-4">
                            <div className="font-medium text-gray-900 text-xs sm:text-sm">{item.name}</div>
                            {item.description && <div className="text-xs text-gray-400">{item.description}</div>}
                          </td>
                          <td className="py-3 px-2 sm:px-4 text-gray-600 text-xs sm:text-sm">{item.category?.name || "—"}</td>
                          <td className="py-3 px-2 sm:px-4 text-gray-600 text-xs sm:text-sm">{item.unit}</td>
                          <td className="py-3 px-2 sm:px-4 text-xs sm:text-sm">
                            {editingThresholdId === item.id ? (
                              <input
                                type="number" min={0} step={1}
                                value={thresholdValues.minStockLevel ?? ''}
                                onChange={(e) => setThresholdValues({ ...thresholdValues, minStockLevel: e.target.value === '' ? undefined : parseInt(e.target.value) })}
                                className="w-24 px-2 py-1 border border-gray-300 rounded text-sm text-gray-900"
                              />
                            ) : (
                              <span className="text-gray-600">
                                {item.minStockLevel ?? "—"}
                                {item.minStockLevelOverridden && (
                                  <span className="ml-1 text-xs text-indigo-500" title="Store override">*</span>
                                )}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-2 sm:px-4 text-xs sm:text-sm">
                            {editingThresholdId === item.id ? (
                              item.requiresExpirationDate ? (
                                <input
                                  type="number" min={1}
                                  value={thresholdValues.expirationWarningDays ?? ''}
                                  onChange={(e) => setThresholdValues({ ...thresholdValues, expirationWarningDays: e.target.value === '' ? undefined : parseInt(e.target.value) })}
                                  className="w-20 px-2 py-1 border border-gray-300 rounded text-sm text-gray-900"
                                />
                              ) : (
                                <span className="text-gray-400">—</span>
                              )
                            ) : (
                              <span className="text-gray-600">
                                {item.requiresExpirationDate && item.expirationWarningDays != null
                                  ? <>
                                      {item.expirationWarningDays}
                                      {item.expirationWarningDaysOverridden && (
                                        <span className="ml-1 text-xs text-indigo-500" title="Store override">*</span>
                                      )}
                                    </>
                                  : "—"}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-2 sm:px-4 text-right text-xs sm:text-sm">
                            {canWrite && (editingThresholdId === item.id ? (
                              <div className="flex gap-2 justify-end">
                                <button onClick={() => handleSaveThreshold(item.id)} className="text-gray-900 hover:text-gray-600 font-medium">Save</button>
                                <button onClick={() => setEditingThresholdId(null)} className="text-gray-500 hover:text-gray-700">Cancel</button>
                              </div>
                            ) : (
                              <button onClick={() => handleEditThreshold(item)} className="text-gray-500 hover:text-gray-700">
                                Edit thresholds
                              </button>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {legacyItems.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 border border-gray-200">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">Legacy Items</h2>
              <p className="text-sm text-gray-500 mt-1 mb-4 sm:mb-6">
                Items no longer part of your store&apos;s current inventory setup, but preserved because your store has recorded stock for them.
                They&apos;re still fully recordable, just excluded from low-stock alerts and the active item list above.
              </p>
              <div className="overflow-x-auto -mx-4 sm:mx-0">
                <div className="min-w-full inline-block align-middle px-4 sm:px-0">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-2 sm:px-4 font-semibold text-gray-700 text-xs sm:text-sm">Item</th>
                        <th className="text-left py-3 px-2 sm:px-4 font-semibold text-gray-700 text-xs sm:text-sm">Category</th>
                        <th className="text-left py-3 px-2 sm:px-4 font-semibold text-gray-700 text-xs sm:text-sm">Unit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {legacyItems.map((item) => (
                        <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-3 px-2 sm:px-4">
                            <div className="font-medium text-gray-700 text-xs sm:text-sm">{item.name}</div>
                          </td>
                          <td className="py-3 px-2 sm:px-4 text-gray-500 text-xs sm:text-sm">{item.category?.name || "—"}</td>
                          <td className="py-3 px-2 sm:px-4 text-gray-500 text-xs sm:text-sm">{item.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}


    </div>
  );
}
