# Inventory Screen Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat scrollable form in `kioskly-app/app/inventory.tsx` with a list + bottom sheet pattern so cashiers can count 50+ inventory items without being overwhelmed.

**Architecture:** The main screen becomes a scannable list (one row per item, grouped by category) with a progress pill. Tapping an item opens a focused `Modal`-based bottom sheet for that item only. Simple items get a large quantity input; expiry-tracked items get a batch list with quantity + date per batch. The data model, API calls, submission logic, and offline sync are all unchanged.

**Tech Stack:** React Native 0.81.5, Expo SDK 54, NativeWind v2 (use `className` prop), `@react-native-community/datetimepicker`, `@expo/vector-icons`. No new dependencies. No test framework exists in this project — each task ends with a manual verification checklist instead of automated tests.

**Spec:** `docs/superpowers/specs/2026-06-05-inventory-redesign-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `kioskly-app/components/inventory/types.ts` | **Create** | Shared TypeScript interfaces (`ExpirationBatchInput`, `InventoryInput`) |
| `kioskly-app/components/inventory/inventoryUtils.ts` | **Create** | Pure helper functions (`generateBatchId`, `getExpirationStatus`, `getItemWorstExpiryStatus`, `calculateTotalFromBatches`, `formatDate`) |
| `kioskly-app/components/inventory/InventoryItemRow.tsx` | **Create** | Tappable list row — name, unit, last count, status dot, chevron |
| `kioskly-app/components/inventory/BatchRow.tsx` | **Create** | Single batch row inside the expiry sheet — qty input + date button + status line |
| `kioskly-app/components/inventory/InventoryItemSheet.tsx` | **Create** | Modal bottom sheet — handles both simple and expiry item input, owns DateTimePicker |
| `kioskly-app/app/inventory.tsx` | **Modify** | Remove flat form; add list rendering + sheet wiring + progress pill |

---

## Task 1: Shared Types and Utils

**Files:**
- Create: `kioskly-app/components/inventory/types.ts`
- Create: `kioskly-app/components/inventory/inventoryUtils.ts`

- [ ] **Step 1: Create the `inventory` components directory**

```bash
mkdir -p kioskly-app/components/inventory
```

- [ ] **Step 2: Create `types.ts`**

Write `kioskly-app/components/inventory/types.ts`:

```typescript
import { InventoryCategory } from "@/services/inventoryService";

export interface ExpirationBatchInput {
  id: string;
  quantity: string;
  expirationDate: Date | null;
}

export interface InventoryInput {
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
```

- [ ] **Step 3: Create `inventoryUtils.ts`**

Write `kioskly-app/components/inventory/inventoryUtils.ts`:

```typescript
import { ExpirationBatchInput, InventoryInput } from "./types";

export type ExpiryStatus = "expired" | "expiring-soon" | "warning" | "ok";

export const generateBatchId = (): string =>
  `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

export const calculateTotalFromBatches = (batches: ExpirationBatchInput[]): number =>
  batches.reduce((sum, batch) => {
    const qty = parseFloat(batch.quantity);
    return sum + (isNaN(qty) ? 0 : qty);
  }, 0);

export const getExpirationStatus = (
  expirationDate: Date | null,
  warningDays: number = 7
): { status: ExpiryStatus; daysLeft: number | null } => {
  if (!expirationDate) return { status: "ok", daysLeft: null };

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const expDate = new Date(expirationDate);
  expDate.setHours(0, 0, 0, 0);

  const daysLeft = Math.ceil(
    (expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysLeft < 0) return { status: "expired", daysLeft };
  if (daysLeft <= 3) return { status: "expiring-soon", daysLeft };
  if (daysLeft <= warningDays) return { status: "warning", daysLeft };
  return { status: "ok", daysLeft };
};

// Returns the worst expiry status across all batches for a given item.
// Returns "none" for non-expiry items, "uncounted" if the item has no quantity yet.
export const getItemWorstExpiryStatus = (
  item: InventoryInput
): ExpiryStatus | "none" | "uncounted" => {
  if (!item.requiresExpirationDate) return "none";
  if (!item.quantity || item.quantity.trim() === "") return "uncounted";

  let worst: ExpiryStatus = "ok";
  for (const batch of item.batches) {
    if (!batch.quantity || batch.quantity.trim() === "") continue;
    const { status } = getExpirationStatus(
      batch.expirationDate,
      item.expirationWarningDays
    );
    if (status === "expired") return "expired";
    if (status === "expiring-soon") worst = "expiring-soon";
    else if (status === "warning" && worst !== "expiring-soon") worst = "warning";
  }
  return worst;
};

export const formatDate = (date: Date | null): string => {
  if (!date) return "Set date";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

export const getCategoryLabel = (category: string): string =>
  category
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd kioskly-app && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors in the two new files (other pre-existing errors are fine to ignore for now).

- [ ] **Step 5: Commit**

```bash
git add kioskly-app/components/inventory/types.ts kioskly-app/components/inventory/inventoryUtils.ts
git commit -m "feat(inventory): add shared types and utility helpers"
```

---

## Task 2: InventoryItemRow Component

**Files:**
- Create: `kioskly-app/components/inventory/InventoryItemRow.tsx`

- [ ] **Step 1: Create the component**

Write `kioskly-app/components/inventory/InventoryItemRow.tsx`:

```typescript
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { InventoryInput } from "./types";
import { getItemWorstExpiryStatus } from "./inventoryUtils";

interface InventoryItemRowProps {
  item: InventoryInput;
  primaryColor: string;
  textColor: string;
  onPress: () => void;
}

const STATUS_DOT_COLORS: Record<string, string> = {
  expired: "#ef4444",
  "expiring-soon": "#f97316",
  warning: "#eab308",
  ok: "#22c55e",
  uncounted: "#9ca3af",
  none: "#9ca3af",
};

export default function InventoryItemRow({
  item,
  primaryColor,
  textColor,
  onPress,
}: InventoryItemRowProps) {
  const isCounted = item.quantity.trim() !== "";
  const expiryStatus = getItemWorstExpiryStatus(item);

  const renderStatusIndicator = () => {
    if (isCounted) {
      if (!item.requiresExpirationDate) {
        return <Ionicons name="checkmark-circle" size={20} color="#22c55e" />;
      }
      const dotColor = STATUS_DOT_COLORS[expiryStatus] ?? "#9ca3af";
      return (
        <View
          style={{
            width: 12,
            height: 12,
            borderRadius: 6,
            backgroundColor: dotColor,
          }}
        />
      );
    }

    // Not yet counted
    if (item.requiresExpirationDate) {
      // Hollow circle draws attention
      return (
        <View
          style={{
            width: 12,
            height: 12,
            borderRadius: 6,
            borderWidth: 2,
            borderColor: primaryColor,
          }}
        />
      );
    }
    return (
      <View
        style={{
          width: 12,
          height: 12,
          borderRadius: 6,
          backgroundColor: "#9ca3af",
        }}
      />
    );
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      className="bg-white flex-row items-center px-4 py-3 mb-2 rounded-lg border border-gray-200"
      activeOpacity={0.7}
    >
      <View className="mr-3 items-center justify-center" style={{ width: 20 }}>
        {renderStatusIndicator()}
      </View>

      <View className="flex-1">
        <Text
          className="text-sm font-semibold"
          style={{ color: textColor }}
          numberOfLines={1}
        >
          {item.name}
        </Text>
        <Text className="text-xs text-gray-500">{item.unit}</Text>
      </View>

      <View className="items-end mr-2">
        {isCounted ? (
          <Text className="text-sm font-bold" style={{ color: primaryColor }}>
            {item.quantity} {item.unit}
          </Text>
        ) : (
          item.previousQuantity !== null && (
            <Text className="text-xs text-gray-400">
              last: {item.previousQuantity}
            </Text>
          )
        )}
      </View>

      <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
    </TouchableOpacity>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd kioskly-app && npx tsc --noEmit 2>&1 | grep "InventoryItemRow" | head -20
```

Expected: no errors for this file.

- [ ] **Step 3: Commit**

```bash
git add kioskly-app/components/inventory/InventoryItemRow.tsx
git commit -m "feat(inventory): add InventoryItemRow list component"
```

---

## Task 3: BatchRow Component

**Files:**
- Create: `kioskly-app/components/inventory/BatchRow.tsx`

- [ ] **Step 1: Create the component**

Write `kioskly-app/components/inventory/BatchRow.tsx`:

```typescript
import { View, Text, TextInput, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ExpirationBatchInput } from "./types";
import { getExpirationStatus, formatDate } from "./inventoryUtils";

interface BatchRowProps {
  batch: ExpirationBatchInput;
  index: number;
  showRemove: boolean;
  warningDays?: number;
  textColor: string;
  primaryColor: string;
  error?: string | null;
  onQuantityChange: (value: string) => void;
  onDatePress: () => void;
  onClearDate: () => void;
  onRemove: () => void;
}

const BG_COLORS: Record<string, string> = {
  expired: "#fee2e2",
  "expiring-soon": "#ffedd5",
  warning: "#fef3c7",
  ok: "#f9fafb",
};

const BORDER_COLORS: Record<string, string> = {
  expired: "#fca5a5",
  "expiring-soon": "#fdba74",
  warning: "#fcd34d",
  ok: "#e5e7eb",
};

export default function BatchRow({
  batch,
  index,
  showRemove,
  warningDays,
  textColor,
  primaryColor,
  error,
  onQuantityChange,
  onDatePress,
  onClearDate,
  onRemove,
}: BatchRowProps) {
  const { status, daysLeft } = getExpirationStatus(
    batch.expirationDate,
    warningDays
  );

  const getStatusLine = (): { text: string; color: string } | null => {
    if (status === "expired") return { text: "● Expired", color: "#ef4444" };
    if (status === "expiring-soon" && daysLeft !== null)
      return {
        text: `● ${daysLeft} day${daysLeft !== 1 ? "s" : ""} left`,
        color: "#f97316",
      };
    if (status === "warning" && daysLeft !== null)
      return {
        text: `● ${daysLeft} day${daysLeft !== 1 ? "s" : ""} left`,
        color: "#eab308",
      };
    return null;
  };

  const statusLine = getStatusLine();

  return (
    <View
      className="mb-3 p-3 rounded-lg border"
      style={{
        backgroundColor: BG_COLORS[status] ?? "#f9fafb",
        borderColor: BORDER_COLORS[status] ?? "#e5e7eb",
      }}
    >
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-xs text-gray-500 font-medium">
          Batch {index + 1}
        </Text>
        {showRemove && (
          <TouchableOpacity
            onPress={onRemove}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close-circle" size={18} color="#ef4444" />
          </TouchableOpacity>
        )}
      </View>

      <View className="flex-row gap-2">
        <View className="flex-1">
          <TextInput
            className="border border-gray-300 rounded-lg px-3 py-2 text-center font-semibold bg-white"
            placeholder="Qty"
            keyboardType="decimal-pad"
            value={batch.quantity}
            onChangeText={(v) => onQuantityChange(v.replace(/[^0-9.]/g, ""))}
            style={{ color: textColor }}
          />
        </View>

        <View className="flex-1 flex-row items-center border border-gray-300 rounded-lg bg-white overflow-hidden">
          <TouchableOpacity onPress={onDatePress} className="flex-1 px-2 py-2">
            <Text
              className="text-center text-xs"
              style={{ color: batch.expirationDate ? textColor : "#9ca3af" }}
              numberOfLines={1}
            >
              {formatDate(batch.expirationDate)}
            </Text>
          </TouchableOpacity>
          {batch.expirationDate && (
            <TouchableOpacity onPress={onClearDate} className="pr-2">
              <Ionicons name="close-circle" size={14} color="#9ca3af" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {statusLine && (
        <Text className="text-xs mt-1" style={{ color: statusLine.color }}>
          {statusLine.text}
        </Text>
      )}

      {error && (
        <Text className="text-xs text-red-500 mt-1">{error}</Text>
      )}
    </View>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd kioskly-app && npx tsc --noEmit 2>&1 | grep "BatchRow" | head -20
```

Expected: no errors for this file.

- [ ] **Step 3: Commit**

```bash
git add kioskly-app/components/inventory/BatchRow.tsx
git commit -m "feat(inventory): add BatchRow component for expiry batch input"
```

---

## Task 4: InventoryItemSheet Component

**Files:**
- Create: `kioskly-app/components/inventory/InventoryItemSheet.tsx`

This is the bottom sheet Modal. It owns all editing state for the open item and the DateTimePicker. It renders a nested Modal for the iOS date picker — this is safe in RN 0.81.5.

- [ ] **Step 1: Create the component**

Write `kioskly-app/components/inventory/InventoryItemSheet.tsx`:

```typescript
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

const MAX_SHEET_HEIGHT = Dimensions.get("window").height * 0.85;
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { useState, useEffect, useRef } from "react";
import { InventoryInput } from "./types";
import {
  generateBatchId,
  calculateTotalFromBatches,
  getCategoryLabel,
} from "./inventoryUtils";
import BatchRow from "./BatchRow";

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

  const handleDateChange = (event: any, selectedDate?: Date) => {
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
          {/* Sheet content — inner TouchableOpacity absorbs touches so backdrop doesn't fire */}
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
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
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {!localItem.requiresExpirationDate ? (
                  /* Simple item — large centered qty input */
                  <View className="items-center py-6">
                    <View className="flex-row items-center gap-3">
                      <TextInput
                        className="border border-gray-300 rounded-xl px-6 py-4 text-3xl font-bold text-center bg-gray-50"
                        style={{ color: textColor, minWidth: 140 }}
                        placeholder="0"
                        keyboardType="decimal-pad"
                        value={localItem.quantity}
                        onChangeText={updateSimpleQuantity}
                        autoFocus
                      />
                      <Text className="text-lg text-gray-500">
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
          </TouchableOpacity>
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
                  <Text className="text-red-500 font-semibold">Cancel</Text>
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd kioskly-app && npx tsc --noEmit 2>&1 | grep "InventoryItemSheet\|BatchRow" | head -20
```

Expected: no errors for these files.

- [ ] **Step 3: Commit**

```bash
git add kioskly-app/components/inventory/InventoryItemSheet.tsx
git commit -m "feat(inventory): add InventoryItemSheet bottom sheet component"
```

---

## Task 5: Restructure inventory.tsx

**Files:**
- Modify: `kioskly-app/app/inventory.tsx`

Replace the entire file. The data-fetching logic, `loadInventory`, `submitReport`, and `handleSubmitReport` are unchanged. Everything else (state, rendering) is restructured.

- [ ] **Step 1: Replace `inventory.tsx` with the restructured version**

Write `kioskly-app/app/inventory.tsx`:

```typescript
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
    const submittedAt = new Date().toISOString();
    try {
      const itemsWithQuantity = inventoryInputs.filter(
        (input) => input.quantity.trim() !== ""
      );
      const today = new Date().toISOString().split("T")[0];

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

  const groupedItems = inventoryInputs.reduce(
    (acc, item) => {
      if (!acc[item.category]) acc[item.category] = [];
      acc[item.category].push(item);
      return acc;
    },
    {} as Record<InventoryCategory, InventoryInput[]>
  );

  const categories = Object.keys(groupedItems) as InventoryCategory[];
  const countedCount = inventoryInputs.filter(
    (i) => i.quantity.trim() !== ""
  ).length;
  const selectedItem =
    selectedItemId
      ? inventoryInputs.find((i) => i.id === selectedItemId) ?? null
      : null;

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
        <Text className="text-2xl font-bold" style={{ color: textColor }}>
          Daily Inventory
        </Text>
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
                      <Text
                        className="text-sm font-bold"
                        style={{ color: textColor }}
                      >
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
                          color="black"
                          style={{ marginRight: 8 }}
                        />
                        <Text className="text-black font-bold text-lg">
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
```

- [ ] **Step 2: Verify TypeScript compiles with no new errors**

```bash
cd kioskly-app && npx tsc --noEmit 2>&1 | head -40
```

Expected: no errors introduced by this change (pre-existing errors elsewhere are acceptable).

- [ ] **Step 3: Commit**

```bash
git add kioskly-app/app/inventory.tsx
git commit -m "feat(inventory): restructure to list + bottom sheet pattern"
```

---

## Task 6: Manual QA Checklist

Run the app and verify each behaviour listed below. Fix any issue before moving to the next item.

- [ ] **Step 1: Start the dev server**

```bash
cd kioskly-app && npm start
```

Open on iOS simulator or Android emulator.

- [ ] **Step 2: Main list**
  - [ ] Items appear grouped by category
  - [ ] Each row shows: name, unit, last count (grayed), status indicator, chevron
  - [ ] Items without expiry show a gray dot when uncounted
  - [ ] Items with expiry show a hollow circle when uncounted
  - [ ] Progress pill shows `"0 / N counted"` at start
  - [ ] Submit button is hidden until an item is counted

- [ ] **Step 3: Simple item sheet**
  - [ ] Tapping a simple item opens the bottom sheet
  - [ ] Item name, category label, and previous count are visible
  - [ ] Keyboard opens immediately on the large qty input
  - [ ] Entering a value and tapping Done: sheet closes, row shows green checkmark + entered value
  - [ ] Progress pill increments
  - [ ] Tapping outside without editing: sheet closes immediately
  - [ ] Tapping outside after editing: "Discard Changes?" alert appears
  - [ ] Tapping item again: previously entered value is pre-filled

- [ ] **Step 4: Expiry item sheet**
  - [ ] Tapping an expiry item opens the sheet showing batch rows
  - [ ] Each batch has a qty input and a "Set date" button
  - [ ] Tapping "Set date" opens the date picker (iOS: slide-up modal; Android: native picker)
  - [ ] Selecting a date shows it formatted in the button (e.g., "Jun 10, 2026")
  - [ ] Total auto-updates as qty values change
  - [ ] Batch with expired date: row tinted red, "● Expired" status line
  - [ ] Batch in warning: row tinted amber, "● X days left" status line
  - [ ] "Add another batch" adds a new empty batch row
  - [ ] Remove (×) button only shows when there are 2+ batches; tapping it removes that batch
  - [ ] Tapping Done with a batch that has qty but no date: inline error shown, sheet stays open
  - [ ] Tapping Done with a batch that has date but no qty: inline error shown, sheet stays open
  - [ ] Empty batches (both blank) are ignored silently on Done
  - [ ] After Done: row shows status dot matching worst batch expiry status

- [ ] **Step 5: Submit flow**
  - [ ] After counting ≥1 item, submit button appears with `"Submit Report (X items)"`
  - [ ] Tapping Submit shows confirmation alert with correct item count
  - [ ] Confirming submits successfully (or queues offline)
  - [ ] After successful submit, list reloads and progress resets
  - [ ] Pull-to-refresh works
  - [ ] Last Submission Banner updates after submit

- [ ] **Step 6: Final commit (if any fixes were made during QA)**

```bash
git add -p  # stage only the fix files
git commit -m "fix(inventory): <describe what was fixed>"
```
