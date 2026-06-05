import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Platform,
  Alert,
  KeyboardAvoidingView,
  Dimensions,
} from "react-native";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { useState, useEffect, useRef } from "react";
import { InventoryInput } from "./types";
import {
  generateBatchId,
  calculateTotalFromBatches,
  getCategoryLabel,
} from "./inventoryUtils";
import BatchRow from "./BatchRow";

const MAX_SHEET_HEIGHT = Dimensions.get("window").height * 0.85;

interface InventoryItemSheetProps {
  item: InventoryInput | null;
  primaryColor: string;
  textColor: string;
  onSave: (updated: InventoryInput) => void;
  onClose: () => void;
}

export default function InventoryItemSheet({
  item,
  primaryColor,
  textColor,
  onSave,
  onClose,
}: InventoryItemSheetProps) {
  const [localItem, setLocalItem] = useState<InventoryInput | null>(null);
  const [batchErrors, setBatchErrors] = useState<Record<string, string>>({});
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const isDirty = useRef(false);

  // Sync local state when sheet opens (item prop changes from null → value)
  useEffect(() => {
    if (item) {
      setLocalItem({
        ...item,
        batches: item.batches.map((b) => ({ ...b })),
      });
      setBatchErrors({});
      isDirty.current = false;
    }
  }, [item]);

  if (!localItem) return null;

  const updateSimpleQuantity = (value: string) => {
    isDirty.current = true;
    setLocalItem((prev) =>
      prev ? { ...prev, quantity: value.replace(/[^0-9.]/g, "") } : prev
    );
  };

  const updateBatchQuantity = (batchId: string, value: string) => {
    isDirty.current = true;
    setLocalItem((prev) => {
      if (!prev) return prev;
      const updatedBatches = prev.batches.map((b) =>
        b.id === batchId ? { ...b, quantity: value } : b
      );
      const total = calculateTotalFromBatches(updatedBatches);
      return {
        ...prev,
        batches: updatedBatches,
        quantity: total > 0 ? total.toString() : "",
      };
    });
    setBatchErrors((prev) => {
      const next = { ...prev };
      delete next[batchId];
      return next;
    });
  };

  const updateBatchDate = (batchId: string, date: Date) => {
    isDirty.current = true;
    setLocalItem((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        batches: prev.batches.map((b) =>
          b.id === batchId ? { ...b, expirationDate: date } : b
        ),
      };
    });
    setBatchErrors((prev) => {
      const next = { ...prev };
      delete next[batchId];
      return next;
    });
  };

  const clearBatchDate = (batchId: string) => {
    isDirty.current = true;
    setLocalItem((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        batches: prev.batches.map((b) =>
          b.id === batchId ? { ...b, expirationDate: null } : b
        ),
      };
    });
  };

  const addBatch = () => {
    isDirty.current = true;
    setLocalItem((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        batches: [
          ...prev.batches,
          { id: generateBatchId(), quantity: "", expirationDate: null },
        ],
      };
    });
  };

  const removeBatch = (batchId: string) => {
    isDirty.current = true;
    setLocalItem((prev) => {
      if (!prev) return prev;
      const updatedBatches = prev.batches.filter((b) => b.id !== batchId);
      const total = calculateTotalFromBatches(updatedBatches);
      return {
        ...prev,
        batches: updatedBatches,
        quantity: total > 0 ? total.toString() : "",
      };
    });
  };

  const validate = (): boolean => {
    if (!localItem.requiresExpirationDate) return true;
    const errors: Record<string, string> = {};
    for (const batch of localItem.batches) {
      const hasQty = batch.quantity.trim() !== "";
      const hasDate = batch.expirationDate !== null;
      if (hasQty && !hasDate) errors[batch.id] = "Set an expiry date for this batch";
      if (!hasQty && hasDate) errors[batch.id] = "Enter a quantity for this batch";
    }
    setBatchErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleDone = () => {
    if (!validate()) return;
    onSave(localItem);
    onClose();
  };

  const handleDismiss = () => {
    if (isDirty.current) {
      Alert.alert("Discard Changes?", "Your changes haven't been saved.", [
        { text: "Keep Editing", style: "cancel" },
        { text: "Discard", style: "destructive", onPress: onClose },
      ]);
    } else {
      onClose();
    }
  };

  const openDatePicker = (batchId: string) => {
    setActiveBatchId(batchId);
    setShowDatePicker(true);
  };

  const handleDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === "android") setShowDatePicker(false);
    if (selectedDate && activeBatchId) updateBatchDate(activeBatchId, selectedDate);
    if (Platform.OS === "android") setActiveBatchId(null);
  };

  const closeDatePicker = () => {
    setShowDatePicker(false);
    setActiveBatchId(null);
  };

  const activeBatchDate =
    localItem.batches.find((b) => b.id === activeBatchId)?.expirationDate ??
    new Date();

  return (
    <Modal
      visible={!!item}
      animationType="slide"
      transparent
      onRequestClose={handleDismiss}
    >
      {/* Backdrop — tap to dismiss */}
      <TouchableOpacity
        className="flex-1 bg-black/50"
        activeOpacity={1}
        onPress={handleDismiss}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1 justify-end"
        >
          {/* Sheet content — onStartShouldSetResponder absorbs touches so backdrop doesn't fire */}
          <View onStartShouldSetResponder={() => true}>
            <View className="bg-white rounded-t-2xl" style={{ maxHeight: MAX_SHEET_HEIGHT }}>
              {/* Drag handle */}
              <View className="items-center pt-3 pb-1">
                <View className="w-10 h-1 bg-gray-300 rounded-full" />
              </View>

              {/* Item header */}
              <View className="px-5 pt-3 pb-1">
                <Text
                  className="text-lg font-bold"
                  style={{ color: textColor }}
                  numberOfLines={2}
                >
                  {localItem.name}
                </Text>
                <Text className="text-xs text-gray-400 mt-0.5">
                  {getCategoryLabel(localItem.category)}
                </Text>
              </View>

              {/* Previous count reference */}
              {localItem.previousQuantity !== null && (
                <View className="px-5 pb-3">
                  <Text className="text-sm text-gray-400">
                    Previous count: {localItem.previousQuantity} {localItem.unit}
                  </Text>
                </View>
              )}

              {/* Body */}
              <ScrollView
                className="px-5"
                style={{ flex: 1 }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {!localItem.requiresExpirationDate ? (
                  /* Simple item — large centered qty input */
                  <View className="items-center py-6">
                    <View className="flex-row items-center">
                      <TextInput
                        className="border border-gray-300 rounded-xl px-6 py-4 text-3xl font-bold text-center bg-gray-50"
                        style={{ color: textColor, minWidth: 140 }}
                        placeholder="0"
                        keyboardType="decimal-pad"
                        value={localItem.quantity}
                        onChangeText={updateSimpleQuantity}
                        autoFocus
                      />
                      <Text className="ml-3 text-lg text-gray-500">
                        {localItem.unit}
                      </Text>
                    </View>
                  </View>
                ) : (
                  /* Expiry item — batch list */
                  <View className="pb-2">
                    {localItem.batches.map((batch, index) => (
                      <BatchRow
                        key={batch.id}
                        batch={batch}
                        index={index}
                        showRemove={localItem.batches.length > 1}
                        warningDays={localItem.expirationWarningDays}
                        textColor={textColor}
                        primaryColor={primaryColor}
                        error={batchErrors[batch.id]}
                        onQuantityChange={(v) => updateBatchQuantity(batch.id, v)}
                        onDatePress={() => openDatePicker(batch.id)}
                        onClearDate={() => clearBatchDate(batch.id)}
                        onRemove={() => removeBatch(batch.id)}
                      />
                    ))}

                    <TouchableOpacity
                      onPress={addBatch}
                      className="flex-row items-center py-2 mb-3"
                    >
                      <Ionicons
                        name="add-circle-outline"
                        size={18}
                        color={primaryColor}
                      />
                      <Text
                        className="ml-1 text-sm font-medium"
                        style={{ color: primaryColor }}
                      >
                        Add another batch
                      </Text>
                    </TouchableOpacity>

                    <View className="flex-row justify-between items-center py-3 border-t border-gray-200 mb-2">
                      <Text className="text-sm font-semibold text-gray-700">
                        Total:
                      </Text>
                      <Text
                        className="text-xl font-bold"
                        style={{ color: textColor }}
                      >
                        {localItem.quantity || "0"} {localItem.unit}
                      </Text>
                    </View>
                  </View>
                )}
              </ScrollView>

              {/* Done button */}
              <View className="px-5 pt-3 pb-8 border-t border-gray-100">
                <TouchableOpacity
                  onPress={handleDone}
                  className="rounded-xl py-4 items-center"
                  style={{ backgroundColor: primaryColor }}
                >
                  <Text className="text-base font-bold text-white">Done</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </TouchableOpacity>

      {/* iOS Date Picker — nested Modal (safe in RN 0.81.5) */}
      {Platform.OS === "ios" && showDatePicker && activeBatchId && (
        <Modal
          transparent
          animationType="slide"
          visible={showDatePicker}
          onRequestClose={closeDatePicker}
        >
          <View className="flex-1 justify-end bg-black/50">
            <View className="bg-white rounded-t-2xl">
              <View className="flex-row justify-between items-center px-4 py-3 border-b border-gray-200">
                <TouchableOpacity onPress={closeDatePicker}>
                  <Text className="text-gray-500 font-semibold">Close</Text>
                </TouchableOpacity>
                <Text className="text-base font-semibold">Expiry Date</Text>
                <TouchableOpacity onPress={closeDatePicker}>
                  <Text className="font-semibold" style={{ color: primaryColor }}>
                    Done
                  </Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={activeBatchDate}
                mode="date"
                display="spinner"
                onChange={handleDateChange}
                textColor={textColor}
              />
            </View>
          </View>
        </Modal>
      )}

      {/* Android Date Picker */}
      {Platform.OS === "android" && showDatePicker && activeBatchId && (
        <DateTimePicker
          value={activeBatchDate}
          mode="date"
          display="default"
          onChange={handleDateChange}
        />
      )}
    </Modal>
  );
}
