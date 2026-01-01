"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useTenant } from "@/contexts/TenantContext";
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";

type ViewMode = "day_over_day" | "weekly_trend";

export default function InventoryProgressionPage() {
  const { tenant } = useTenant();
  const primaryColor = tenant?.themeColors?.primary || "#4f46e5";

  const [viewMode, setViewMode] = useState<ViewMode>("day_over_day");
  const [progression, setProgression] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadProgression();
  }, [viewMode]);

  const loadProgression = async () => {
    try {
      const data = await api.getInventoryProgression({ viewMode });
      setProgression(data);
    } catch (error) {
      console.error("Failed to load progression:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadProgression();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
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

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-64 bg-gray-200 rounded-lg"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          Inventory Progression
        </h1>
        <p className="text-gray-600 mt-2">
          Track inventory changes and consumption patterns over time
        </p>
      </div>

      {/* Quick Actions */}
      <div className="flex space-x-4 mb-6">
        <Link
          href="/inventory-reports"
          className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium transition hover:bg-gray-50"
        >
          <Calendar className="w-4 h-4" />
          <span>View Reports</span>
        </Link>
        <Link
          href="/inventory-alerts"
          className="flex items-center space-x-2 px-4 py-2 bg-red-600 rounded-lg text-white font-medium transition hover:bg-red-700"
        >
          <AlertTriangle className="w-4 h-4" />
          <span>View Alerts</span>
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

      {/* View Mode Toggle */}
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200 mb-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">View Mode</h2>
          <div className="flex space-x-2 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode("day_over_day")}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                viewMode === "day_over_day"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Day-over-Day
            </button>
            <button
              onClick={() => setViewMode("weekly_trend")}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                viewMode === "weekly_trend"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Weekly Trend
            </button>
          </div>
        </div>
      </div>

      {/* Period Info */}
      {progression && (
        <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-200 mb-6">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Period:</span>
            <span className="font-semibold text-gray-900">
              {formatDate(progression.period.start)} -{" "}
              {formatDate(progression.period.end)}
            </span>
            <span className="text-gray-600">
              {progression.items.length} items tracked
            </span>
          </div>
        </div>
      )}

      {/* Progression Items */}
      {!progression || progression.items.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-12 border border-gray-200 text-center">
          <TrendingUp className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 text-lg font-semibold mb-2">
            No progression data available
          </p>
          <p className="text-gray-500">
            Submit more inventory reports to see trends
          </p>
        </div>
      ) : (
        (() => {
          // Group items by category
          const groupedItems = progression.items.reduce(
            (acc: any, item: any) => {
              const category = item.category || "Uncategorized";
              if (!acc[category]) {
                acc[category] = [];
              }
              acc[category].push(item);
              return acc;
            },
            {}
          );

          const sortedCategories = Object.keys(groupedItems).sort();

          return (
            <div className="space-y-8">
              {sortedCategories.map((category) => (
                <div key={category}>
                  {/* Category Header */}
                  <div className="flex items-center mb-4">
                    <h2 className="text-2xl font-bold text-gray-800">
                      {formatCategoryName(category)}
                    </h2>
                    <div className="flex-1 ml-4 border-t-2 border-gray-300"></div>
                    <span className="ml-4 px-3 py-1 text-sm rounded-full bg-gray-200 text-gray-700 font-semibold">
                      {groupedItems[category].length}{" "}
                      {groupedItems[category].length === 1 ? "item" : "items"}
                    </span>
                  </div>

                  {/* Items in Category */}
                  <div className="space-y-6">
                    {groupedItems[category].map((item: any) => (
                      <div
                        key={item.inventoryItemId}
                        className="bg-white rounded-xl shadow-sm p-6 border border-gray-200"
                      >
                        {/* Item Header */}
                        <div className="mb-6 pb-4 border-b border-gray-200">
                          <div className="flex items-start justify-between">
                            <div>
                              <h3 className="text-xl font-bold text-gray-900 mb-1">
                                {item.itemName}
                              </h3>
                              <p className="text-sm text-gray-600">
                                Unit: {item.unit}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm text-gray-600 mb-1">
                                Total Consumed
                              </p>
                              <p className="text-2xl font-bold text-black">
                                {item.totalConsumption}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Statistics */}
                        <div className="grid grid-cols-2 gap-4 mb-6">
                          <div className="bg-gray-50 rounded-lg p-4">
                            <p className="text-sm text-gray-600 mb-1">
                              {viewMode === "weekly_trend"
                                ? "Avg Weekly Consumption"
                                : "Avg Daily Consumption"}
                            </p>
                            <p className="text-xl font-bold text-gray-900">
                              {viewMode === "weekly_trend"
                                ? item.avgWeeklyConsumption?.toFixed(2) ||
                                  "0.00"
                                : item.avgDailyConsumption?.toFixed(2) ||
                                  "0.00"}
                            </p>
                          </div>
                          <div className="bg-gray-50 rounded-lg p-4">
                            <p className="text-sm text-gray-600 mb-1">
                              {viewMode === "weekly_trend"
                                ? "Weeks Tracked"
                                : "Days Tracked"}
                            </p>
                            <p className="text-xl font-bold text-gray-900">
                              {viewMode === "weekly_trend"
                                ? item.weeklyData?.length || 0
                                : item.dailyData?.length || 0}
                            </p>
                          </div>
                        </div>

                        {/* Data Table */}
                        <div className="overflow-x-auto">
                          {viewMode === "weekly_trend" && item.weeklyData ? (
                            <table className="w-full">
                              <thead>
                                <tr className="border-b border-gray-200">
                                  <th className="text-left py-2 px-3 font-semibold text-gray-700">
                                    Week
                                  </th>
                                  <th className="text-right py-2 px-3 font-semibold text-gray-700">
                                    Avg Qty
                                  </th>
                                  <th className="text-right py-2 px-3 font-semibold text-gray-700">
                                    Change
                                  </th>
                                  <th className="text-right py-2 px-3 font-semibold text-gray-700">
                                    %
                                  </th>
                                  <th className="text-right py-2 px-3 font-semibold text-gray-700">
                                    Consumed
                                  </th>
                                  <th className="text-right py-2 px-3 font-semibold text-gray-700">
                                    Days
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {item.weeklyData
                                  .slice(0, 10)
                                  .map((week: any) => {
                                    const isDecrease = week.weekChange < 0;
                                    const changeColor = isDecrease
                                      ? "#ef4444"
                                      : "#10b981";

                                    return (
                                      <tr
                                        key={week.weekStart}
                                        className="border-b border-gray-100"
                                      >
                                        <td className="py-2 px-3 text-gray-900">
                                          {week.weekRange}
                                        </td>
                                        <td className="py-2 px-3 text-right font-semibold text-gray-900">
                                          {week.avgQuantity}
                                        </td>
                                        <td className="py-2 px-3 text-right">
                                          {week.weekChange !== 0 && (
                                            <span
                                              className="flex items-center justify-end space-x-1"
                                              style={{ color: changeColor }}
                                            >
                                              {isDecrease ? (
                                                <ArrowDown className="w-3 h-3" />
                                              ) : (
                                                <ArrowUp className="w-3 h-3" />
                                              )}
                                              <span className="font-semibold">
                                                {Math.abs(
                                                  week.weekChange
                                                ).toFixed(1)}
                                              </span>
                                            </span>
                                          )}
                                        </td>
                                        <td className="py-2 px-3 text-right text-sm text-gray-600">
                                          {week.weekPercentChange !== 0
                                            ? `${week.weekPercentChange.toFixed(1)}%`
                                            : "-"}
                                        </td>
                                        <td className="py-2 px-3 text-right font-semibold text-red-600">
                                          {week.totalConsumption > 0
                                            ? week.totalConsumption.toFixed(1)
                                            : "-"}
                                        </td>
                                        <td className="py-2 px-3 text-right text-sm text-gray-600">
                                          {week.dataPoints}
                                        </td>
                                      </tr>
                                    );
                                  })}
                              </tbody>
                            </table>
                          ) : (
                            <table className="w-full">
                              <thead>
                                <tr className="border-b border-gray-200">
                                  <th className="text-left py-2 px-3 font-semibold text-gray-700">
                                    Date
                                  </th>
                                  <th className="text-right py-2 px-3 font-semibold text-gray-700">
                                    Quantity
                                  </th>
                                  <th className="text-right py-2 px-3 font-semibold text-gray-700">
                                    Change
                                  </th>
                                  <th className="text-right py-2 px-3 font-semibold text-gray-700">
                                    %
                                  </th>
                                  <th className="text-right py-2 px-3 font-semibold text-gray-700">
                                    Consumed
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {item.dailyData
                                  ?.slice(0, 10)
                                  .map((dataPoint: any) => {
                                    const isDecrease = dataPoint.change < 0;
                                    const changeColor = isDecrease
                                      ? "#ef4444"
                                      : "#10b981";

                                    return (
                                      <tr
                                        key={dataPoint.date}
                                        className="border-b border-gray-100"
                                      >
                                        <td className="py-2 px-3 text-gray-900">
                                          {formatDate(dataPoint.date)}
                                        </td>
                                        <td className="py-2 px-3 text-right font-semibold text-gray-900">
                                          {dataPoint.quantity}
                                        </td>
                                        <td className="py-2 px-3 text-right">
                                          {dataPoint.change !== 0 && (
                                            <span
                                              className="flex items-center justify-end space-x-1"
                                              style={{ color: changeColor }}
                                            >
                                              {isDecrease ? (
                                                <ArrowDown className="w-3 h-3" />
                                              ) : (
                                                <ArrowUp className="w-3 h-3" />
                                              )}
                                              <span className="font-semibold">
                                                {Math.abs(
                                                  dataPoint.change
                                                ).toFixed(1)}
                                              </span>
                                            </span>
                                          )}
                                        </td>
                                        <td className="py-2 px-3 text-right text-sm text-gray-600">
                                          {dataPoint.percentChange !== 0
                                            ? `${dataPoint.percentChange.toFixed(1)}%`
                                            : "-"}
                                        </td>
                                        <td className="py-2 px-3 text-right font-semibold text-red-600">
                                          {dataPoint.consumption > 0
                                            ? dataPoint.consumption.toFixed(1)
                                            : "-"}
                                        </td>
                                      </tr>
                                    );
                                  })}
                              </tbody>
                            </table>
                          )}
                          {((viewMode === "weekly_trend" &&
                            item.weeklyData?.length > 10) ||
                            (viewMode === "day_over_day" &&
                              item.dailyData?.length > 10)) && (
                            <p className="text-center text-sm text-gray-500 mt-3">
                              +
                              {viewMode === "weekly_trend"
                                ? item.weeklyData.length - 10
                                : item.dailyData.length - 10}{" "}
                              more records
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
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
