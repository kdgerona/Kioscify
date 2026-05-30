import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState, useEffect } from "react";
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
import LastSubmissionBanner from "@/components/LastSubmissionBanner";

interface ExpirationBatchInput {
  id: string; // Unique ID for React key
  quantity: string;
  expirationDate: Date | null;
}

interface InventoryInput {
  id: string;
  name: string;
  category: InventoryCategory;
  unit: string;
  minStockLevel?: number;
  quantity: string;
  previousQuantity: number | null;
  requiresExpirationDate?: boolean;
  expirationWarningDays?: number;
  batches: ExpirationBatchInput[];
}

export default function InventoryScreen() {
  const [inventoryItems, setInventoryItems] = useState<LatestInventoryItem[]>(
    []
  );
  const [inventoryInputs, setInventoryInputs] = useState<InventoryInput[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportStats, setReportStats] = useState<InventoryReportStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [activeDatePicker, setActiveDatePicker] = useState<{
    itemId: string;
    batchId: string;
  } | null>(null);

  const { tenant } = useTenant();
  const { user } = useAuth();
  const primaryColor = tenant?.themeColors?.primary || "#ea580c";
  const textColor = tenant?.themeColors?.text || "#1f2937";
  const backgroundColor = tenant?.themeColors?.background || "#ffffff";

  // Generate unique batch ID
  const generateBatchId = () => `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Calculate total quantity from batches
  const calculateTotalFromBatches = (batches: ExpirationBatchInput[]) => {
    return batches.reduce((sum, batch) => {
      const qty = parseFloat(batch.quantity);
      return sum + (isNaN(qty) ? 0 : qty);
    }, 0);
  };

  // Get expiration status for a batch
  const getExpirationStatus = (
    expirationDate: Date | null,
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

  // Add batch to item
  const addBatch = (itemId: string) => {
    setInventoryInputs((prev) =>
      prev.map((input) =>
        input.id === itemId
          ? {
              ...input,
              batches: [
                ...input.batches,
                { id: generateBatchId(), quantity: "", expirationDate: null },
              ],
            }
          : input
      )
    );
  };

  // Remove batch from item
  const removeBatch = (itemId: string, batchId: string) => {
    setInventoryInputs((prev) =>
      prev.map((input) =>
        input.id === itemId
          ? {
              ...input,
              batches: input.batches.filter((b) => b.id !== batchId),
            }
          : input
      )
    );
  };

  // Update batch quantity
  const updateBatchQuantity = (itemId: string, batchId: string, value: string) => {
    const sanitizedValue = value.replace(/[^0-9.]/g, "");
    setInventoryInputs((prev) =>
      prev.map((input) => {
        if (input.id !== itemId) return input;
        const updatedBatches = input.batches.map((b) =>
          b.id === batchId ? { ...b, quantity: sanitizedValue } : b
        );
        // Update total quantity from batches
        const total = calculateTotalFromBatches(updatedBatches);
        return {
          ...input,
          batches: updatedBatches,
          quantity: total > 0 ? total.toString() : "",
        };
      })
    );
  };

  // Update batch expiration date
  const updateBatchExpirationDate = (itemId: string, batchId: string, date: Date) => {
    setInventoryInputs((prev) =>
      prev.map((input) =>
        input.id === itemId
          ? {
              ...input,
              batches: input.batches.map((b) =>
                b.id === batchId ? { ...b, expirationDate: date } : b
              ),
            }
          : input
      )
    );
  };

  // Open date picker for a batch
  const openDatePicker = (itemId: string, batchId: string) => {
    setActiveDatePicker({ itemId, batchId });
    setShowDatePicker(true);
  };

  // Handle date change from picker
  const handleDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === "android") {
      setShowDatePicker(false);
    }
    if (selectedDate && activeDatePicker) {
      updateBatchExpirationDate(activeDatePicker.itemId, activeDatePicker.batchId, selectedDate);
    }
    if (Platform.OS === "android") {
      setActiveDatePicker(null);
    }
  };

  // Close date picker (for iOS modal)
  const closeDatePicker = () => {
    setShowDatePicker(false);
    setActiveDatePicker(null);
  };

  // Format date for display
  const formatDate = (date: Date | null) => {
    if (!date) return "Set date";
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

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

      // Fetch inventory, stats, and latest report in parallel
      const [data, stats, reports] = await Promise.all([
        getLatestInventory(),
        getInventoryReportStats().catch((err) => {
          console.warn("Failed to fetch stats:", err);
          return null; // Non-blocking
        }),
        getSubmittedInventoryReports().catch((err) => {
          console.warn("Failed to fetch latest report:", err);
          return []; // Non-blocking
        }),
      ]);

      setInventoryItems(data);
      setReportStats(stats);

      // Build a map of itemId -> expirationBatches from the latest report
      const batchesMap = new Map<string, ExpirationBatch[]>();
      if (reports.length > 0) {
        const latestReport = reports[0]; // Reports are sorted by submittedAt desc
        if (latestReport.inventorySnapshot?.items) {
          latestReport.inventorySnapshot.items.forEach((snapshotItem: InventoryItemSnapshot) => {
            if (snapshotItem.expirationBatches && snapshotItem.expirationBatches.length > 0) {
              batchesMap.set(snapshotItem.inventoryItemId, snapshotItem.expirationBatches);
            }
          });
        }
      }

      // Initialize inputs with latest quantities and preserved batches
      setInventoryInputs(
        data.map((item) => {
          const savedBatches = batchesMap.get(item.id);

          // Convert saved batches to input format, or create default batch
          let batches: ExpirationBatchInput[] = [];
          if (item.requiresExpirationDate) {
            if (savedBatches && savedBatches.length > 0) {
              // Restore saved batches with their expiration dates
              batches = savedBatches.map((b) => ({
                id: generateBatchId(),
                quantity: b.quantity.toString(),
                expirationDate: b.expirationDate ? new Date(b.expirationDate) : null,
              }));
            } else {
              // No saved batches, create default one
              batches = [{
                id: generateBatchId(),
                quantity: item.latestQuantity?.toString() || "",
                expirationDate: null
              }];
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
      console.error("Error loading inventory:", err);
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

  const updateQuantity = (itemId: string, value: string) => {
    // Allow only numbers and decimal point
    const sanitizedValue = value.replace(/[^0-9.]/g, "");

    setInventoryInputs((prev) =>
      prev.map((input) =>
        input.id === itemId ? { ...input, quantity: sanitizedValue } : input
      )
    );
  };

  const submitReport = async (replaceExisting: boolean = false) => {
    setSaving(true);
    try {
      // Filter out items with no quantity entered
      const itemsWithQuantity = inventoryInputs.filter(
        (input) => input.quantity.trim() !== ""
      );

      const today = new Date().toISOString().split("T")[0];

      // Build inventory snapshot
      const inventorySnapshot = {
        items: itemsWithQuantity.map((input) => ({
          inventoryItemId: input.id,
          itemName: input.name,
          category: input.category,
          unit: input.unit,
          quantity: parseFloat(input.quantity),
          minStockLevel: input.minStockLevel,
          recordDate: new Date().toISOString(),
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
        submittedBy: user?.email || user?.username || "Unknown",
      };

      await submitInventoryReport({
        reportDate: today,
        inventorySnapshot,
        replaceExisting,
      });

      Alert.alert(
        "Success",
        replaceExisting
          ? "Inventory report updated successfully!"
          : "Inventory report submitted successfully!"
      );

      // Reload inventory to show updated data
      await loadInventory();
    } catch (err) {
      // Check if it's a duplicate error
      const errorMessage = err instanceof Error ? err.message : String(err);
      const isDuplicate = errorMessage.includes("already exists");

      if (isDuplicate && !replaceExisting) {
        // Ask user if they want to replace the existing report
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
      } else {
        Alert.alert(
          "Error",
          errorMessage
        );
        console.error("Error submitting inventory report:", err);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitReport = async () => {
    try {
      // Filter out items with no quantity entered
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

      // Confirm before submitting
      Alert.alert(
        "Submit Inventory Report",
        `Are you sure you want to submit inventory report for ${itemsWithQuantity.length} items?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Submit",
            onPress: () => submitReport(false),
          },
        ]
      );
    } catch (err) {
      Alert.alert(
        "Error",
        err instanceof Error ? err.message : "Failed to submit inventory report"
      );
    }
  };

  if (!tenant || !user) {
    return null;
  }

  const getCategoryLabel = (category: InventoryCategory) => {
    return category
      .split("_")
      .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
      .join(" ");
  };

  // Group items by category
  const groupedItems = inventoryInputs.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = [];
    }
    acc[item.category].push(item);
    return acc;
  }, {} as Record<InventoryCategory, InventoryInput[]>);

  const categories = Object.keys(groupedItems) as InventoryCategory[];

  return (
    <SafeAreaView className="w-full h-full bg-gray-50">
      {/* Header */}
      <View
        className="px-6 py-4 flex-row justify-between items-center"
        style={{ backgroundColor: backgroundColor }}
      >
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="mr-4 p-2">
            <Ionicons name="arrow-back" size={24} color={textColor} />
          </TouchableOpacity>
          <Text className="text-2xl font-bold" style={{ color: textColor }}>
            Daily Inventory
          </Text>
        </View>
      </View>

      {/* Content */}
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <View className="flex-1 px-4 py-4">
          {/* Last Submission Banner */}
          {!loading && !error && (
            <LastSubmissionBanner
              lastSubmission={reportStats?.lastSubmission || null}
              isLoading={statsLoading}
              primaryColor={primaryColor}
              textColor={textColor}
            />
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
              className="bg-gray-800 rounded-lg px-6 py-3"
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
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {categories.map((category) => (
                <View key={category} className="mb-6">
                  {/* Category Header */}
                  <View
                    className="px-4 py-2 rounded-lg mb-3"
                    style={{ backgroundColor: primaryColor }}
                  >
                    <Text
                      className="text-lg font-bold"
                      style={{ color: textColor }}
                    >
                      {getCategoryLabel(category)}
                    </Text>
                  </View>

                  {/* Category Items */}
                  {groupedItems[category].map((item) => (
                    <View
                      key={item.id}
                      className="bg-white rounded-lg p-4 mb-3 shadow-sm border border-gray-200"
                    >
                      <View className="flex-row justify-between items-start mb-2">
                        <View className="flex-1 mr-4">
                          <Text
                            className="text-base font-semibold"
                            style={{ color: textColor }}
                          >
                            {item.name}
                          </Text>
                          <Text className="text-sm text-gray-600 mt-1">
                            Unit: {item.unit}
                          </Text>
                          {item.previousQuantity !== null && (
                            <Text className="text-sm text-gray-500">
                              Previous: {item.previousQuantity}
                            </Text>
                          )}
                        </View>
                        {!item.requiresExpirationDate && (
                          <View className="w-24">
                            <TextInput
                              className="border border-gray-300 rounded-lg px-3 py-2 text-center text-lg font-semibold"
                              placeholder="0"
                              keyboardType="decimal-pad"
                              value={item.quantity}
                              onChangeText={(value) =>
                                updateQuantity(item.id, value)
                              }
                              style={{ color: textColor }}
                            />
                          </View>
                        )}
                      </View>

                      {/* Batch inputs for items requiring expiration date */}
                      {item.requiresExpirationDate && (
                        <View className="mt-3 pt-3 border-t border-gray-200">
                          {item.batches.map((batch, index) => {
                            const { status, daysLeft } = getExpirationStatus(
                              batch.expirationDate,
                              item.expirationWarningDays
                            );

                            const getBatchBgColor = () => {
                              switch (status) {
                                case "expired":
                                  return "#fee2e2"; // red-100
                                case "expiring-soon":
                                  return "#ffedd5"; // orange-100
                                case "warning":
                                  return "#fef3c7"; // amber-100
                                default:
                                  return "#f9fafb"; // gray-50
                              }
                            };

                            const getBatchBorderColor = () => {
                              switch (status) {
                                case "expired":
                                  return "#fca5a5"; // red-300
                                case "expiring-soon":
                                  return "#fdba74"; // orange-300
                                case "warning":
                                  return "#fcd34d"; // amber-300
                                default:
                                  return "#d1d5db"; // gray-300
                              }
                            };

                            return (
                              <View
                                key={batch.id}
                                className="mb-2 p-3 rounded-lg border"
                                style={{
                                  backgroundColor: getBatchBgColor(),
                                  borderColor: getBatchBorderColor(),
                                }}
                              >
                                <View className="flex-row items-center justify-between mb-2">
                                  <Text className="text-xs text-gray-600 font-medium">
                                    Batch {index + 1}
                                  </Text>
                                  {status === "expired" && (
                                    <View className="bg-red-600 px-2 py-0.5 rounded">
                                      <Text className="text-xs text-white font-bold">
                                        EXPIRED
                                      </Text>
                                    </View>
                                  )}
                                  {status === "expiring-soon" && daysLeft !== null && (
                                    <View className="bg-orange-500 px-2 py-0.5 rounded">
                                      <Text className="text-xs text-white font-bold">
                                        {daysLeft} day{daysLeft !== 1 ? "s" : ""} left
                                      </Text>
                                    </View>
                                  )}
                                  {status === "warning" && daysLeft !== null && (
                                    <View className="bg-amber-500 px-2 py-0.5 rounded">
                                      <Text className="text-xs text-white font-bold">
                                        {daysLeft} day{daysLeft !== 1 ? "s" : ""} left
                                      </Text>
                                    </View>
                                  )}
                                  {item.batches.length > 1 && (
                                    <TouchableOpacity
                                      onPress={() => removeBatch(item.id, batch.id)}
                                      className="p-1"
                                    >
                                      <Ionicons name="close-circle" size={20} color="#ef4444" />
                                    </TouchableOpacity>
                                  )}
                                </View>
                                <View className="flex-row items-center gap-2">
                                  <View className="flex-1">
                                    <TextInput
                                      className="border border-gray-300 rounded-lg px-3 py-2 text-center font-semibold bg-white"
                                      placeholder="Qty"
                                      keyboardType="decimal-pad"
                                      value={batch.quantity}
                                      onChangeText={(value) =>
                                        updateBatchQuantity(item.id, batch.id, value)
                                      }
                                      style={{ color: textColor }}
                                    />
                                  </View>
                                  <TouchableOpacity
                                    onPress={() => openDatePicker(item.id, batch.id)}
                                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 bg-white"
                                  >
                                    <Text
                                      className={`text-center ${
                                        batch.expirationDate ? "text-gray-900" : "text-gray-400"
                                      }`}
                                    >
                                      {formatDate(batch.expirationDate)}
                                    </Text>
                                  </TouchableOpacity>
                                </View>
                              </View>
                            );
                          })}

                          <TouchableOpacity
                            onPress={() => addBatch(item.id)}
                            className="flex-row items-center justify-center py-2 mt-1"
                          >
                            <Ionicons name="add-circle-outline" size={18} color={textColor} />
                            <Text className="ml-1 text-sm font-medium" style={{ color: textColor }}>
                              Add Batch
                            </Text>
                          </TouchableOpacity>

                          {/* Total quantity from batches */}
                          <View className="flex-row justify-between items-center mt-2 pt-2 border-t border-gray-200">
                            <Text className="text-sm font-semibold text-gray-700">
                              Total Quantity:
                            </Text>
                            <Text className="text-lg font-bold" style={{ color: textColor }}>
                              {item.quantity || "0"}
                            </Text>
                          </View>
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              ))}
            </ScrollView>

            {/* Submit Report Button */}
            <View className="p-4 border-t border-gray-200 bg-white">
              <TouchableOpacity
                className="bg-gray-800 rounded-lg py-4 flex-row items-center justify-center"
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
                      Submit Inventory Report
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}
        </View>
      </KeyboardAvoidingView>

      {/* Date Picker Modal for iOS */}
      {Platform.OS === "ios" && showDatePicker && activeDatePicker && (
        <Modal
          transparent={true}
          animationType="slide"
          visible={showDatePicker}
          onRequestClose={closeDatePicker}
        >
          <View className="flex-1 justify-end bg-black/50">
            <View className="bg-white rounded-t-2xl">
              <View className="flex-row justify-between items-center px-4 py-3 border-b border-gray-200">
                <TouchableOpacity onPress={closeDatePicker}>
                  <Text className="text-red-500 font-semibold">Cancel</Text>
                </TouchableOpacity>
                <Text className="text-lg font-semibold">Select Date</Text>
                <TouchableOpacity onPress={closeDatePicker}>
                  <Text className="font-semibold" style={{ color: primaryColor }}>
                    Done
                  </Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={
                  inventoryInputs
                    .find((i) => i.id === activeDatePicker.itemId)
                    ?.batches.find((b) => b.id === activeDatePicker.batchId)
                    ?.expirationDate || new Date()
                }
                mode="date"
                display="spinner"
                onChange={handleDateChange}
                textColor={textColor}
              />
            </View>
          </View>
        </Modal>
      )}

      {/* Date Picker for Android */}
      {Platform.OS === "android" && showDatePicker && activeDatePicker && (
        <DateTimePicker
          value={
            inventoryInputs
              .find((i) => i.id === activeDatePicker.itemId)
              ?.batches.find((b) => b.id === activeDatePicker.batchId)
              ?.expirationDate || new Date()
          }
          mode="date"
          display="default"
          onChange={handleDateChange}
        />
      )}
    </SafeAreaView>
  );
}
