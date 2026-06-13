import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  ScrollView,
  Modal,
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
  InventoryReportStats,
  ExpirationBatch,
} from "@/services/submittedInventoryReportService";
import { enqueue, uuidv4 } from "@/services/syncEngine";
import { submitShiftInventoryReport } from "@/services/shiftInventoryReportService";
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
  const [inventoryItems, setInventoryItems] = useState<LatestInventoryItem[]>(
    [],
  );
  const [inventoryInputs, setInventoryInputs] = useState<InventoryInput[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportStats, setReportStats] = useState<InventoryReportStats | null>(
    null,
  );
  const [statsLoading, setStatsLoading] = useState(true);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewType, setPreviewType] = useState<"daily" | "shift">("daily");

  const { tenant, brand } = useTenant();
  const { user } = useAuth();
  const primaryColor =
    brand?.themeColors?.primary ?? tenant?.themeColors?.primary ?? "#ea580c";
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
      setStatsLoading(true);

      const [data, stats] = await Promise.all([
        getLatestInventory(),
        getInventoryReportStats(),
      ]);

      setInventoryItems(data);
      setReportStats(stats);

      const batchesMap = new Map<string, ExpirationBatch[]>();
      data.forEach((item: any) => {
        if (item.expirationBatches && item.expirationBatches.length > 0) {
          batchesMap.set(item.id, item.expirationBatches);
        }
      });

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
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load inventory");
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
      prev.map((i) => (i.id === updated.id ? updated : i)),
    );
  };

  const submitReport = async () => {
    setSaving(true);
    const now = new Date();
    const submittedAt = now.toISOString();
    try {
      const itemsWithQuantity = inventoryInputs.filter(
        (input) => input.quantity.trim() !== "",
      );
      const today = now.toISOString().split("T")[0];

      const inventorySnapshot = {
        items: itemsWithQuantity.map((input) => ({
          inventoryItemId: input.id,
          itemName: input.name,
          category: input.category,
          unit: input.unit,
          quantity: parseFloat(input.quantity),
          previousQuantity: input.previousQuantity ?? null,
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

      const clientId = uuidv4();
      try {
        await submitInventoryReport({
          reportDate: today,
          inventorySnapshot,
          clientId,
          submittedAt,
        });

        Alert.alert("Success", "Inventory report submitted successfully!");

        await loadInventory();
      } catch {
        await enqueue(
          "submitted_inventory_report",
          "/submitted-inventory-reports",
          {
            reportDate: today,
            inventorySnapshot: inventorySnapshot as unknown as Record<
              string,
              unknown
            >,
            clientId,
            submittedAt,
          } as Record<string, unknown>,
        );

        Alert.alert(
          "Saved Offline",
          "You're offline. The inventory report has been saved and will sync automatically when you reconnect.",
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const executeShiftSubmit = async () => {
    setSaving(true);
    const now = new Date();
    const submittedAt = now.toISOString();
    const today = now.toISOString().split("T")[0];
    const itemsWithQuantity = inventoryInputs.filter(
      (input) => input.quantity.trim() !== "",
    );
    const inventorySnapshot = {
      items: itemsWithQuantity.map((input) => ({
        inventoryItemId: input.id,
        itemName: input.name,
        category: input.category,
        unit: input.unit,
        quantity: parseFloat(input.quantity),
        previousQuantity: input.previousQuantity ?? null,
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
    const clientId = uuidv4();
    try {
      await submitShiftInventoryReport({
        reportDate: today,
        inventorySnapshot,
        clientId,
        submittedAt,
      });
      Alert.alert("Success", "Shift inventory report submitted successfully!");
    } catch {
      await enqueue(
        "user_shift_inventory_report",
        "/user-shift-inventory-reports",
        {
          reportDate: today,
          inventorySnapshot: inventorySnapshot as unknown as Record<
            string,
            unknown
          >,
          clientId,
          submittedAt,
        } as Record<string, unknown>,
      );
      Alert.alert(
        "Saved Offline",
        "Shift inventory report saved — will sync when reconnected.",
      );
    } finally {
      setSaving(false);
    }
  };

  const openPreview = (type: "daily" | "shift") => {
    const hasItems = inventoryInputs.some(
      (input) => input.quantity.trim() !== "",
    );
    if (!hasItems) {
      Alert.alert(
        "No Data",
        "Please enter at least one quantity before submitting.",
      );
      return;
    }
    setPreviewType(type);
    setShowPreview(true);
  };

  const handleConfirmSubmit = () => {
    setShowPreview(false);
    if (previewType === "daily") {
      submitReport();
    } else {
      executeShiftSubmit();
    }
  };

  const groupedItems = useMemo(
    () =>
      inventoryInputs.reduce(
        (acc, item) => {
          if (!acc[item.category]) acc[item.category] = [];
          acc[item.category].push(item);
          return acc;
        },
        {} as Record<InventoryCategory, InventoryInput[]>,
      ),
    [inventoryInputs],
  );

  const categories = useMemo(
    () => Object.keys(groupedItems) as InventoryCategory[],
    [groupedItems],
  );

  const countedCount = useMemo(
    () => inventoryInputs.filter((i) => i.quantity.trim() !== "").length,
    [inventoryInputs],
  );

  const selectedItem = useMemo(
    () =>
      selectedItemId
        ? (inventoryInputs.find((i) => i.id === selectedItemId) ?? null)
        : null,
    [selectedItemId, inventoryInputs],
  );

  if (!tenant || !user) return null;

  return (
    <AppSafeAreaView className="w-full h-full bg-gray-50">
      {/* Header */}
      <View
        style={{
          backgroundColor,
          paddingHorizontal: 24,
          paddingVertical: 16,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center" }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ marginRight: 16, padding: 8 }}
          >
            <Ionicons name="arrow-back" size={24} color={textColor} />
          </TouchableOpacity>
          <View>
            <Text style={{ fontSize: 22, fontWeight: "700", color: textColor }}>
              Daily Inventory
            </Text>
            <Text style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
              {new Date().toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </Text>
          </View>
        </View>
        {countedCount > 0 && (
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <TouchableOpacity
              style={{
                backgroundColor: primaryColor,
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 8,
                flexDirection: "row",
                alignItems: "center",
              }}
              onPress={() => openPreview("shift")}
              disabled={saving}
            >
              <Ionicons
                name="person-circle-outline"
                size={18}
                color="#000000"
              />
              <Text
                style={{ color: "#000000", fontWeight: "600", marginLeft: 6 }}
              >
                Shift Inventory Report
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{
                backgroundColor: primaryColor,
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 8,
                flexDirection: "row",
                alignItems: "center",
                marginRight: 8,
              }}
              onPress={() => openPreview("daily")}
              disabled={saving}
            >
              <Ionicons name="document-text" size={18} color="#000000" />
              <Text
                style={{ color: "#000000", fontWeight: "600", marginLeft: 6 }}
              >
                Inventory Report
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

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
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
              }
              showsVerticalScrollIndicator={false}
            >
              {categories.map((category) => (
                <View key={category} className="mb-6">
                  <View
                    className="px-4 py-2 rounded-lg mb-2"
                    style={{ backgroundColor: primaryColor }}
                  >
                    <Text className="text-sm font-bold text-black">
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
          </>
        )}
      </View>

      <InventoryItemSheet
        item={selectedItem}
        primaryColor={primaryColor}
        textColor={textColor}
        onSave={handleItemSave}
        onClose={() => setSelectedItemId(null)}
      />

      {/* Pre-submission summary modal */}
      <Modal visible={showPreview} animationType="slide" transparent>
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "flex-end",
          }}
        >
          <View
            style={{
              backgroundColor: "#fff",
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              maxHeight: "88%",
              paddingBottom: 32,
            }}
          >
            {/* Modal header */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 20,
                paddingTop: 20,
                paddingBottom: 12,
                borderBottomWidth: 1,
                borderBottomColor: "#e5e7eb",
              }}
            >
              <View>
                <Text
                  style={{ fontSize: 18, fontWeight: "700", color: "#111827" }}
                >
                  Review & Submit
                </Text>
                <Text style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>
                  {previewType === "daily"
                    ? "Daily Inventory Report"
                    : "Shift Inventory Report"}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowPreview(false)}
                style={{ padding: 8 }}
              >
                <Ionicons name="close" size={22} color="#6b7280" />
              </TouchableOpacity>
            </View>

            {/* Item list */}
            <ScrollView
              style={{ paddingHorizontal: 20 }}
              showsVerticalScrollIndicator={false}
            >
              {inventoryInputs.filter((i) => i.quantity.trim() !== "")
                .length === 0 ? (
                <View style={{ paddingVertical: 48, alignItems: "center" }}>
                  <Text style={{ color: "#9ca3af", fontSize: 14 }}>
                    No items counted yet
                  </Text>
                </View>
              ) : (
                inventoryInputs
                  .filter((i) => i.quantity.trim() !== "")
                  .map((item, idx, arr) => (
                    <View
                      key={item.id}
                      style={{
                        paddingVertical: 14,
                        borderBottomWidth: idx < arr.length - 1 ? 1 : 0,
                        borderBottomColor: "#f3f4f6",
                      }}
                    >
                      {/* Item name + unit */}
                      <Text
                        style={{
                          fontSize: 15,
                          fontWeight: "600",
                          color: "#111827",
                          marginBottom: 6,
                        }}
                      >
                        {item.name}
                        <Text style={{ fontWeight: "400", color: "#6b7280" }}>
                          {" "}
                          ({item.unit})
                        </Text>
                      </Text>
                      {/* Prev → New qty */}
                      <View
                        style={{ flexDirection: "row", alignItems: "center" }}
                      >
                        <View
                          style={{
                            backgroundColor: "#f3f4f6",
                            borderRadius: 6,
                            paddingHorizontal: 10,
                            paddingVertical: 4,
                          }}
                        >
                          <Text style={{ fontSize: 13, color: "#6b7280" }}>
                            Prev:{" "}
                            {item.previousQuantity != null
                              ? item.previousQuantity
                              : "—"}
                          </Text>
                        </View>
                        <Ionicons
                          name="arrow-forward"
                          size={16}
                          color="#9ca3af"
                          style={{ marginHorizontal: 8 }}
                        />
                        <View
                          style={{
                            backgroundColor: "#dcfce7",
                            borderRadius: 6,
                            paddingHorizontal: 10,
                            paddingVertical: 4,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 13,
                              fontWeight: "700",
                              color: "#166534",
                            }}
                          >
                            Latest: {item.quantity} {item.unit}
                          </Text>
                        </View>
                      </View>
                      {/* Expiration batches */}
                      {item.requiresExpirationDate &&
                        item.batches.filter((b) => b.quantity.trim() !== "")
                          .length > 0 && (
                          <View
                            style={{
                              marginTop: 8,
                              backgroundColor: "#fffbeb",
                              borderRadius: 8,
                              padding: 10,
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 12,
                                fontWeight: "600",
                                color: "#92400e",
                                marginBottom: 6,
                              }}
                            >
                              Expiration Batches:
                            </Text>
                            {item.batches
                              .filter((b) => b.quantity.trim() !== "")
                              .map((batch, bi) => (
                                <View
                                  key={batch.id}
                                  style={{
                                    flexDirection: "row",
                                    alignItems: "center",
                                    marginBottom: 4,
                                  }}
                                >
                                  <Text
                                    style={{ fontSize: 12, color: "#78350f" }}
                                  >
                                    • {batch.quantity} {item.unit}
                                    {batch.expirationDate
                                      ? ` — expires ${batch.expirationDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
                                      : " — no expiry date"}
                                  </Text>
                                </View>
                              ))}
                          </View>
                        )}
                    </View>
                  ))
              )}
              <View style={{ height: 20 }} />
            </ScrollView>

            {/* Footer */}
            <View
              style={{
                paddingHorizontal: 20,
                paddingTop: 12,
                borderTopWidth: 1,
                borderTopColor: "#e5e7eb",
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  color: "#6b7280",
                  textAlign: "center",
                  marginBottom: 12,
                }}
              >
                {inventoryInputs.filter((i) => i.quantity.trim() !== "").length}{" "}
                item(s) will be submitted
              </Text>
              <View style={{ flexDirection: "row" }}>
                <TouchableOpacity
                  onPress={() => setShowPreview(false)}
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor: "#d1d5db",
                    borderRadius: 8,
                    paddingVertical: 14,
                    alignItems: "center",
                    marginRight: 8,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "600",
                      color: "#374151",
                    }}
                  >
                    Cancel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleConfirmSubmit}
                  disabled={saving}
                  style={{
                    flex: 2,
                    borderRadius: 8,
                    paddingVertical: 14,
                    alignItems: "center",
                    backgroundColor:
                      previewType === "daily" ? primaryColor : "#1f2937",
                  }}
                >
                  {saving ? (
                    <ActivityIndicator
                      size="small"
                      color={previewType === "daily" ? "#000000" : "#ffffff"}
                    />
                  ) : (
                    <Text
                      style={{
                        fontSize: 15,
                        fontWeight: "700",
                        color: previewType === "daily" ? "#000000" : "#ffffff",
                      }}
                    >
                      Confirm {previewType === "daily" ? "Daily" : "Shift"}{" "}
                      Submit
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </AppSafeAreaView>
  );
}
