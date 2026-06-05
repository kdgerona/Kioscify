import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import AppSafeAreaView from "../components/AppSafeAreaView";
import { useState, useEffect, useMemo } from "react";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  getLatestInventory,
  LatestInventoryItem,
  InventoryCategory,
} from "@/services/inventoryService";
import {
  submitInventoryReport,
  getInventoryReportStats,
  getSubmittedInventoryReports,
  InventoryReportStats,
  InventoryItemSnapshot,
  ExpirationBatch,
} from "@/services/submittedInventoryReportService";
import { enqueue } from "@/services/syncEngine";
import LastSubmissionBanner from "@/components/LastSubmissionBanner";
import { formatUserName } from "@/utils/formatUserName";
import { InventoryInput } from "@/components/inventory/types";
import {
  generateBatchId,
  getCategoryLabel,
} from "@/components/inventory/inventoryUtils";
import InventoryItemRow from "@/components/inventory/InventoryItemRow";
import InventoryItemSheet from "@/components/inventory/InventoryItemSheet";

export default function InventoryScreen() {
  const [inventoryItems, setInventoryItems] = useState<LatestInventoryItem[]>([]);
  const [inventoryInputs, setInventoryInputs] = useState<InventoryInput[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportStats, setReportStats] = useState<InventoryReportStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const { tenant, brand } = useTenant();
  const { user } = useAuth();
  const primaryColor =
    brand?.themeColors?.primary ??
    tenant?.themeColors?.primary ??
    "#ea580c";
  const textColor =
    brand?.themeColors?.text ?? tenant?.themeColors?.text ?? "#1f2937";
  const backgroundColor =
    brand?.themeColors?.background ??
    tenant?.themeColors?.background ??
    "#ffffff";

  useEffect(() => {
    if (!tenant || !user) {
      router.replace("/");
      return;
    }
    loadInventory();
  }, [tenant, user, router]);

  const loadInventory = async () => {
    try {
      setError(null);

      const [data, stats, reports] = await Promise.all([
        getLatestInventory(),
        getInventoryReportStats(),
        getSubmittedInventoryReports(),
      ]);

      setInventoryItems(data);
      setReportStats(stats);

      const batchesMap = new Map<string, ExpirationBatch[]>();
      if (reports.length > 0) {
        const latestReport = reports[0];
        if (latestReport.inventorySnapshot?.items) {
          latestReport.inventorySnapshot.items.forEach(
            (snapshotItem: InventoryItemSnapshot) => {
              if (
                snapshotItem.expirationBatches &&
                snapshotItem.expirationBatches.length > 0
              ) {
                batchesMap.set(
                  snapshotItem.inventoryItemId,
                  snapshotItem.expirationBatches
                );
              }
            }
          );
        }
      }

      setInventoryInputs(
        data.map((item) => {
          const savedBatches = batchesMap.get(item.id);
          let batches: InventoryInput["batches"] = [];

          if (item.requiresExpirationDate) {
            if (savedBatches && savedBatches.length > 0) {
              batches = savedBatches.map((b) => ({
                id: generateBatchId(),
                quantity: b.quantity.toString(),
                expirationDate: b.expirationDate
                  ? new Date(b.expirationDate)
                  : null,
              }));
            } else {
              batches = [
                {
                  id: generateBatchId(),
                  quantity: item.latestQuantity?.toString() || "",
                  expirationDate: null,
                },
              ];
            }
          }

          return {
            id: item.id,
            name: item.name,
            category: item.category,
            unit: item.unit,
            minStockLevel: item.minStockLevel,
            quantity: item.latestQuantity?.toString() || "",
            previousQuantity: item.previousQuantity,
            requiresExpirationDate: item.requiresExpirationDate,
            expirationWarningDays: item.expirationWarningDays,
            batches,
          };
        })
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load inventory"
      );
    } finally {
      setLoading(false);
      setStatsLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadInventory();
    setRefreshing(false);
  };

  const handleItemSave = (updated: InventoryInput) => {
    setInventoryInputs((prev) =>
      prev.map((i) => (i.id === updated.id ? updated : i))
    );
  };

  const submitReport = async (replaceExisting: boolean = false) => {
    setSaving(true);
    const now = new Date();
    const submittedAt = now.toISOString();
    try {
      const itemsWithQuantity = inventoryInputs.filter(
        (input) => input.quantity.trim() !== ""
      );
      const today = now.toISOString().split("T")[0];

      const inventorySnapshot = {
        items: itemsWithQuantity.map((input) => ({
          inventoryItemId: input.id,
          itemName: input.name,
          category: input.category,
          unit: input.unit,
          quantity: parseFloat(input.quantity),
          minStockLevel: input.minStockLevel,
          recordDate: submittedAt,
          requiresExpirationDate: input.requiresExpirationDate,
          expirationWarningDays: input.expirationWarningDays,
          expirationBatches: input.requiresExpirationDate
            ? input.batches
                .filter((b) => b.quantity.trim() !== "")
                .map((b) => ({
                  quantity: parseFloat(b.quantity),
                  expirationDate: b.expirationDate?.toISOString() || undefined,
                }))
            : undefined,
        })),
        totalItems: itemsWithQuantity.length,
        submittedBy: formatUserName(user) || "Unknown",
      };

      try {
        await submitInventoryReport({
          reportDate: today,
          inventorySnapshot,
          replaceExisting,
          submittedAt,
        });

        Alert.alert(
          "Success",
          replaceExisting
            ? "Inventory report updated successfully!"
            : "Inventory report submitted successfully!"
        );

        await loadInventory();
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : String(err);
        const isDuplicate = errorMessage.includes("already exists");

        if (isDuplicate && !replaceExisting) {
          Alert.alert(
            "Report Already Exists",
            "An inventory report for today has already been submitted. Do you want to replace it with the new data?",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Replace",
                style: "destructive",
                onPress: () => submitReport(true),
              },
            ]
          );
          return;
        }

        await enqueue(
          "submitted_inventory_report",
          "/submitted-inventory-reports",
          {
            reportDate: today,
            inventorySnapshot: inventorySnapshot as unknown as Record<
              string,
              unknown
            >,
            replaceExisting: true,
            submittedAt,
          } as Record<string, unknown>
        );

        Alert.alert(
          "Saved Offline",
          "You're offline. The inventory report has been saved and will sync automatically when you reconnect."
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitReport = async () => {
    const itemsWithQuantity = inventoryInputs.filter(
      (input) => input.quantity.trim() !== ""
    );

    if (itemsWithQuantity.length === 0) {
      Alert.alert(
        "No Data",
        "Please enter at least one quantity before submitting."
      );
      return;
    }

    Alert.alert(
      "Submit Inventory Report",
      `Are you sure you want to submit inventory report for ${itemsWithQuantity.length} items?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Submit", onPress: () => submitReport(false) },
      ]
    );
  };

  if (!tenant || !user) return null;

  const groupedItems = useMemo(
    () =>
      inventoryInputs.reduce(
        (acc, item) => {
          if (!acc[item.category]) acc[item.category] = [];
          acc[item.category].push(item);
          return acc;
        },
        {} as Record<InventoryCategory, InventoryInput[]>
      ),
    [inventoryInputs]
  );

  const categories = useMemo(
    () => Object.keys(groupedItems) as InventoryCategory[],
    [groupedItems]
  );

  const countedCount = useMemo(
    () => inventoryInputs.filter((i) => i.quantity.trim() !== "").length,
    [inventoryInputs]
  );

  const selectedItem = useMemo(
    () =>
      selectedItemId
        ? inventoryInputs.find((i) => i.id === selectedItemId) ?? null
        : null,
    [selectedItemId, inventoryInputs]
  );

  return (
    <AppSafeAreaView className="w-full h-full bg-gray-50">
      {/* Header */}
      <View
        className="px-6 py-4 flex-row items-center"
        style={{ backgroundColor }}
      >
        <TouchableOpacity onPress={() => router.back()} className="mr-4 p-2">
          <Ionicons name="arrow-back" size={24} color={textColor} />
        </TouchableOpacity>
        <View>
          <Text className="text-2xl font-bold" style={{ color: textColor }}>
            Daily Inventory
          </Text>
          <Text className="text-xs text-gray-500 mt-0.5">
            {new Date().toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <View className="flex-1 px-4 py-4">
          {!loading && !error && (
            <LastSubmissionBanner
              lastSubmission={reportStats?.lastSubmission ?? null}
              isLoading={statsLoading}
              primaryColor={primaryColor}
              textColor={textColor}
            />
          )}

          {/* Progress pill */}
          {!loading && !error && inventoryItems.length > 0 && (
            <View className="flex-row justify-end mb-3">
              <View className="bg-gray-200 rounded-full px-3 py-1">
                <Text className="text-xs text-gray-600 font-medium">
                  {countedCount} / {inventoryInputs.length} counted
                </Text>
              </View>
            </View>
          )}

          {loading ? (
            <View className="flex-1 justify-center items-center">
              <ActivityIndicator size="large" color={primaryColor} />
              <Text className="mt-4 text-gray-600">Loading inventory...</Text>
            </View>
          ) : error ? (
            <View className="flex-1 justify-center items-center">
              <Text className="text-red-600 text-center mb-4">{error}</Text>
              <TouchableOpacity
                className="rounded-lg px-6 py-3"
                style={{ backgroundColor: primaryColor }}
                onPress={loadInventory}
              >
                <Text className="text-white font-semibold">Retry</Text>
              </TouchableOpacity>
            </View>
          ) : inventoryItems.length === 0 ? (
            <View className="flex-1 justify-center items-center px-6">
              <Text className="text-gray-600 text-center text-lg font-semibold">
                No inventory items found
              </Text>
              <Text className="text-gray-500 text-center mt-2">
                Please add inventory items first
              </Text>
            </View>
          ) : (
            <>
              <ScrollView
                className="flex-1"
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                  />
                }
                showsVerticalScrollIndicator={false}
              >
                {categories.map((category) => (
                  <View key={category} className="mb-6">
                    <View
                      className="px-4 py-2 rounded-lg mb-2"
                      style={{ backgroundColor: primaryColor }}
                    >
                      <Text className="text-sm font-bold text-white">
                        {getCategoryLabel(category)}
                      </Text>
                    </View>

                    {groupedItems[category].map((item) => (
                      <InventoryItemRow
                        key={item.id}
                        item={item}
                        primaryColor={primaryColor}
                        textColor={textColor}
                        onPress={() => setSelectedItemId(item.id)}
                      />
                    ))}
                  </View>
                ))}
              </ScrollView>

              {/* Submit button — visible once at least one item is counted */}
              {countedCount > 0 && (
                <View className="pt-3 border-t border-gray-200 bg-white">
                  <TouchableOpacity
                    className="rounded-lg py-4 flex-row items-center justify-center"
                    style={{ backgroundColor: primaryColor }}
                    onPress={handleSubmitReport}
                    disabled={saving}
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color="white" />
                    ) : (
                      <>
                        <Ionicons
                          name="checkmark-circle-outline"
                          size={20}
                          color="white"
                          style={{ marginRight: 8 }}
                        />
                        <Text className="text-white font-bold text-lg">
                          Submit Report ({countedCount} items)
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </View>
      </KeyboardAvoidingView>

      <InventoryItemSheet
        item={selectedItem}
        primaryColor={primaryColor}
        textColor={textColor}
        onSave={handleItemSave}
        onClose={() => setSelectedItemId(null)}
      />
    </AppSafeAreaView>
  );
}
