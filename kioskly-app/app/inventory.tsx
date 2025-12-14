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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState, useEffect } from "react";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  getLatestInventory,
  bulkCreateInventoryRecords,
  LatestInventoryItem,
  InventoryCategory,
} from "@/services/inventoryService";

interface InventoryInput {
  id: string;
  name: string;
  category: InventoryCategory;
  unit: string;
  quantity: string;
  previousQuantity: number | null;
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

  const { tenant } = useTenant();
  const { user } = useAuth();
  const primaryColor = tenant?.themeColors?.primary || "#ea580c";
  const textColor = tenant?.themeColors?.text || "#1f2937";
  const backgroundColor = tenant?.themeColors?.background || "#ffffff";

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
      const data = await getLatestInventory();
      setInventoryItems(data);

      // Initialize inputs with latest quantities
      setInventoryInputs(
        data.map((item) => ({
          id: item.id,
          name: item.name,
          category: item.category,
          unit: item.unit,
          quantity: item.latestQuantity?.toString() || "",
          previousQuantity: item.latestQuantity,
        }))
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load inventory"
      );
      console.error("Error loading inventory:", err);
    } finally {
      setLoading(false);
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

  const handleSaveInventory = async () => {
    try {
      // Filter out items with no quantity entered
      const recordsToSave = inventoryInputs.filter(
        (input) => input.quantity.trim() !== ""
      );

      if (recordsToSave.length === 0) {
        Alert.alert(
          "No Data",
          "Please enter at least one quantity before saving."
        );
        return;
      }

      // Confirm before saving
      Alert.alert(
        "Save Inventory",
        `Are you sure you want to save inventory for ${recordsToSave.length} items?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Save",
            onPress: async () => {
              setSaving(true);
              try {
                await bulkCreateInventoryRecords({
                  records: recordsToSave.map((input) => ({
                    inventoryItemId: input.id,
                    quantity: parseFloat(input.quantity),
                    date: new Date().toISOString(),
                  })),
                });

                Alert.alert("Success", "Inventory saved successfully!");
                await loadInventory(); // Reload to show updated values
              } catch (err) {
                Alert.alert(
                  "Error",
                  err instanceof Error
                    ? err.message
                    : "Failed to save inventory"
                );
                console.error("Error saving inventory:", err);
              } finally {
                setSaving(false);
              }
            },
          },
        ]
      );
    } catch (err) {
      Alert.alert(
        "Error",
        err instanceof Error ? err.message : "Failed to save inventory"
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
                      <View className="flex-row justify-between items-center mb-2">
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
                      </View>
                    </View>
                  ))}
                </View>
              ))}
            </ScrollView>

            {/* Save Button */}
            <View className="p-4 border-t border-gray-200 bg-white">
              <TouchableOpacity
                className="bg-gray-800 rounded-lg py-4 flex-row items-center justify-center"
                onPress={handleSaveInventory}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <>
                    <Ionicons
                      name="save-outline"
                      size={20}
                      color="white"
                      style={{ marginRight: 8 }}
                    />
                    <Text className="text-white font-bold text-lg">
                      Save Inventory
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
