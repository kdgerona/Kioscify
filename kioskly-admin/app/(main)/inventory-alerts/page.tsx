"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useTenant } from "@/contexts/TenantContext";
import {
  AlertTriangle,
  TrendingUp,
  Clock,
  Package,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";
import Link from "next/link";

type AlertType = "LOW_STOCK" | "USAGE_SPIKE" | "PROJECTED_STOCKOUT";
type Severity = "HIGH" | "MEDIUM" | "LOW";

interface InventoryAlert {
  type: AlertType;
  severity: Severity;
  itemId: string;
  itemName: string;
  category: string;
  unit: string;
  currentQuantity?: number;
  minStockLevel?: number;
  shortfall?: number;
  latestConsumption?: number;
  averageConsumption?: number;
  percentageIncrease?: number;
  avgDailyConsumption?: number;
  daysUntilStockout?: number;
  estimatedStockoutDate?: string;
}

interface AlertsData {
  totalAlerts: number;
  alertsByType: {
    LOW_STOCK: number;
    USAGE_SPIKE: number;
    PROJECTED_STOCKOUT: number;
  };
  alertsBySeverity: {
    HIGH: number;
    MEDIUM: number;
    LOW: number;
  };
  alerts: InventoryAlert[];
}

export default function InventoryAlertsPage() {
  const { tenant } = useTenant();
  const primaryColor = tenant?.themeColors?.primary || "#4f46e5";

  const [alertsData, setAlertsData] = useState<AlertsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedType, setSelectedType] = useState<AlertType | null>(null);

  useEffect(() => {
    loadAlerts();
  }, []);

  const loadAlerts = async () => {
    try {
      const data = await api.getInventoryAlerts();
      setAlertsData(data);
    } catch (error) {
      console.error("Failed to load alerts:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadAlerts();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatCategoryName = (category: string): string => {
    if (!category) return "Uncategorized";

    // Replace underscores and hyphens with spaces, then handle camelCase
    return category
      .replace(/[_-]/g, " ")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .split(/\s+/)
      .filter((word) => word.length > 0)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  };

  const getSeverityColor = (severity: Severity) => {
    switch (severity) {
      case "HIGH":
        return "#ef4444";
      case "MEDIUM":
        return "#f97316";
      case "LOW":
        return "#eab308";
      default:
        return "#6b7280";
    }
  };

  const getSeverityBgColor = (severity: Severity) => {
    switch (severity) {
      case "HIGH":
        return "#fee2e2";
      case "MEDIUM":
        return "#ffedd5";
      case "LOW":
        return "#fef3c7";
      default:
        return "#f3f4f6";
    }
  };

  const getAlertIcon = (type: AlertType) => {
    switch (type) {
      case "LOW_STOCK":
        return Package;
      case "USAGE_SPIKE":
        return TrendingUp;
      case "PROJECTED_STOCKOUT":
        return Clock;
      default:
        return AlertTriangle;
    }
  };

  const getAlertTypeLabel = (type: AlertType) => {
    switch (type) {
      case "LOW_STOCK":
        return "Low Stock";
      case "USAGE_SPIKE":
        return "Usage Spike";
      case "PROJECTED_STOCKOUT":
        return "Projected Stockout";
      default:
        return type;
    }
  };

  if (loading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-gray-200 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const filteredAlerts = selectedType
    ? alertsData?.alerts.filter((a) => a.type === selectedType) || []
    : alertsData?.alerts || [];

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Inventory Alerts</h1>
        <p className="text-sm sm:text-base text-gray-600 mt-2">
          Monitor critical inventory issues and take action before stockouts
          occur
        </p>
      </div>

      {/* Quick Actions */}
      <div className="flex space-x-4 mb-6">
        <Link
          href="/inventory-reports"
          className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium transition hover:bg-gray-50"
        >
          <Package className="w-4 h-4" />
          <span>View Reports</span>
        </Link>
        <Link
          href="/inventory-progression"
          className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium transition hover:bg-gray-50"
        >
          <TrendingUp className="w-4 h-4" />
          <span>View Progression</span>
        </Link>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center justify-center p-2 border border-gray-300 rounded-lg text-gray-700 font-medium transition hover:bg-gray-50 disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw
            className={`w-5 h-5 ${refreshing ? "animate-spin" : ""}`}
          />
        </button>
      </div>

      {/* Alert Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <button
          onClick={() =>
            setSelectedType(selectedType === "LOW_STOCK" ? null : "LOW_STOCK")
          }
          className={`bg-white rounded-xl shadow-sm p-6 border-2 transition hover:shadow-md text-left ${
            selectedType === "LOW_STOCK" ? "border-red-500" : "border-gray-200"
          }`}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="bg-red-500 p-3 rounded-lg">
              <Package className="w-6 h-6 text-white" />
            </div>
            {selectedType === "LOW_STOCK" && (
              <span className="text-sm font-semibold text-red-600">
                FILTERED
              </span>
            )}
          </div>
          <p className="text-gray-600 text-sm mb-1">Low Stock Alerts</p>
          <p className="text-2xl sm:text-3xl font-bold text-gray-900">
            {alertsData?.alertsByType.LOW_STOCK || 0}
          </p>
        </button>

        <button
          onClick={() =>
            setSelectedType(
              selectedType === "USAGE_SPIKE" ? null : "USAGE_SPIKE"
            )
          }
          className={`bg-white rounded-xl shadow-sm p-6 border-2 transition hover:shadow-md text-left ${
            selectedType === "USAGE_SPIKE"
              ? "border-orange-500"
              : "border-gray-200"
          }`}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="bg-orange-500 p-3 rounded-lg">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
            {selectedType === "USAGE_SPIKE" && (
              <span className="text-sm font-semibold text-orange-600">
                FILTERED
              </span>
            )}
          </div>
          <p className="text-gray-600 text-sm mb-1">Usage Spikes</p>
          <p className="text-2xl sm:text-3xl font-bold text-gray-900">
            {alertsData?.alertsByType.USAGE_SPIKE || 0}
          </p>
        </button>

        <button
          onClick={() =>
            setSelectedType(
              selectedType === "PROJECTED_STOCKOUT"
                ? null
                : "PROJECTED_STOCKOUT"
            )
          }
          className={`bg-white rounded-xl shadow-sm p-6 border-2 transition hover:shadow-md text-left ${
            selectedType === "PROJECTED_STOCKOUT"
              ? "border-red-500"
              : "border-gray-200"
          }`}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="bg-red-600 p-3 rounded-lg">
              <Clock className="w-6 h-6 text-white" />
            </div>
            {selectedType === "PROJECTED_STOCKOUT" && (
              <span className="text-sm font-semibold text-red-600">
                FILTERED
              </span>
            )}
          </div>
          <p className="text-gray-600 text-sm mb-1">Projected Stockouts</p>
          <p className="text-2xl sm:text-3xl font-bold text-gray-900">
            {alertsData?.alertsByType.PROJECTED_STOCKOUT || 0}
          </p>
        </button>
      </div>

      {/* Alerts List */}
      {!alertsData || alertsData.totalAlerts === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-12 border border-gray-200 text-center">
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <p className="text-gray-900 text-xl font-bold mb-2">All Clear!</p>
          <p className="text-gray-600">
            No active alerts at this time. All inventory levels are healthy.
          </p>
        </div>
      ) : filteredAlerts.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-12 border border-gray-200 text-center">
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <p className="text-gray-900 text-xl font-bold mb-2">
            No {getAlertTypeLabel(selectedType!)} Alerts
          </p>
          <p className="text-gray-600">There are no alerts in this category.</p>
        </div>
      ) : (
        (() => {
          // Group alerts by category
          const groupedAlerts = filteredAlerts.reduce((acc: any, alert) => {
            const category = alert.category || "Uncategorized";
            if (!acc[category]) {
              acc[category] = [];
            }
            acc[category].push(alert);
            return acc;
          }, {});

          const sortedCategories = Object.keys(groupedAlerts).sort();

          return (
            <div className="space-y-8">
              {selectedType && (
                <div className="text-sm text-gray-600 mb-4">
                  Showing {filteredAlerts.length}{" "}
                  {getAlertTypeLabel(selectedType)} alert
                  {filteredAlerts.length !== 1 ? "s" : ""}
                </div>
              )}
              {sortedCategories.map((category) => (
                <div key={category}>
                  {/* Category Header */}
                  <div className="flex items-center mb-4">
                    <h2 className="text-2xl font-bold text-gray-800">
                      {formatCategoryName(category)}
                    </h2>
                    <div className="flex-1 ml-4 border-t-2 border-gray-300"></div>
                    <span className="ml-4 px-3 py-1 text-sm rounded-full bg-red-100 text-red-700 font-semibold">
                      {groupedAlerts[category].length}{" "}
                      {groupedAlerts[category].length === 1
                        ? "alert"
                        : "alerts"}
                    </span>
                  </div>

                  {/* Alerts in Category */}
                  <div className="space-y-4">
                    {groupedAlerts[category].map(
                      (alert: InventoryAlert, index: number) => {
                        const Icon = getAlertIcon(alert.type);
                        const severityColor = getSeverityColor(alert.severity);
                        const severityBgColor = getSeverityBgColor(
                          alert.severity
                        );

                        return (
                          <div
                            key={`${alert.type}-${alert.itemId}-${index}`}
                            className="bg-white rounded-xl shadow-sm p-6 border border-gray-200"
                          >
                            {/* Alert Header */}
                            <div className="flex items-start justify-between mb-4">
                              <div className="flex items-start space-x-4">
                                <div
                                  className="p-3 rounded-lg"
                                  style={{ backgroundColor: severityBgColor }}
                                >
                                  <Icon
                                    className="w-6 h-6"
                                    style={{ color: severityColor }}
                                  />
                                </div>
                                <div>
                                  <div className="flex items-center space-x-3 mb-1">
                                    <h3 className="text-xl font-bold text-gray-900">
                                      {alert.itemName}
                                    </h3>
                                    <span
                                      className="px-3 py-1 rounded-full text-xs font-bold"
                                      style={{
                                        backgroundColor: severityBgColor,
                                        color: severityColor,
                                      }}
                                    >
                                      {alert.severity}
                                    </span>
                                  </div>
                                  <p className="text-sm text-gray-600">
                                    Unit: {alert.unit}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right">
                                <span className="inline-block px-3 py-1 bg-gray-100 text-gray-700 text-sm font-semibold rounded-lg">
                                  {getAlertTypeLabel(alert.type)}
                                </span>
                              </div>
                            </div>

                            {/* Alert Details */}
                            <div className="bg-gray-50 rounded-lg p-4">
                              {alert.type === "LOW_STOCK" && (
                                <div className="grid grid-cols-3 gap-4">
                                  <div>
                                    <p className="text-sm text-gray-600 mb-1">
                                      Current Quantity
                                    </p>
                                    <p className="text-2xl font-bold text-gray-900">
                                      {alert.currentQuantity}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-sm text-gray-600 mb-1">
                                      Minimum Level
                                    </p>
                                    <p className="text-2xl font-bold text-gray-900">
                                      {alert.minStockLevel}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-sm text-gray-600 mb-1">
                                      Shortfall
                                    </p>
                                    <p className="text-2xl font-bold text-red-600">
                                      -{alert.shortfall}
                                    </p>
                                  </div>
                                </div>
                              )}

                              {alert.type === "USAGE_SPIKE" && (
                                <div className="grid grid-cols-3 gap-4">
                                  <div>
                                    <p className="text-sm text-gray-600 mb-1">
                                      Latest Consumption
                                    </p>
                                    <p className="text-2xl font-bold text-gray-900">
                                      {alert.latestConsumption?.toFixed(1)}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-sm text-gray-600 mb-1">
                                      Average Consumption
                                    </p>
                                    <p className="text-2xl font-bold text-gray-900">
                                      {alert.averageConsumption?.toFixed(1)}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-sm text-gray-600 mb-1">
                                      Increase
                                    </p>
                                    <p className="text-2xl font-bold text-orange-600">
                                      +{alert.percentageIncrease?.toFixed(1)}%
                                    </p>
                                  </div>
                                </div>
                              )}

                              {alert.type === "PROJECTED_STOCKOUT" && (
                                <div className="grid grid-cols-4 gap-4">
                                  <div>
                                    <p className="text-sm text-gray-600 mb-1">
                                      Current Quantity
                                    </p>
                                    <p className="text-2xl font-bold text-gray-900">
                                      {alert.currentQuantity}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-sm text-gray-600 mb-1">
                                      Daily Consumption
                                    </p>
                                    <p className="text-2xl font-bold text-gray-900">
                                      {alert.avgDailyConsumption?.toFixed(1)}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-sm text-gray-600 mb-1">
                                      Days Until Stockout
                                    </p>
                                    <p className="text-2xl font-bold text-red-600">
                                      {alert.daysUntilStockout} days
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-sm text-gray-600 mb-1">
                                      Estimated Date
                                    </p>
                                    <p className="text-lg font-bold text-red-600">
                                      {alert.estimatedStockoutDate &&
                                        formatDate(alert.estimatedStockoutDate)}
                                    </p>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      }
                    )}
                  </div>
                </div>
              ))}
            </div>
          );
        })()
      )}
    </div>
  );
}
