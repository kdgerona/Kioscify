// Loyalty Card panel. Rendered as a view swap INSIDE CheckoutModal (no nested
// Modal: unreliable on Android tablets). All state lives in home.tsx; this
// component only reads `selections` and reports changes.
// Styling: NativeWind classes; inline style only for theme colours and fixed sizes.

import { View, Text, TouchableOpacity, Switch, Alert } from "react-native";
import { useState } from "react";
import {
  loyaltyCard,
  type ActiveRewardProgram,
  type LoyaltyCardSelection,
  type MilestoneSlot,
  type RewardCartLine,
  type RewardSelections,
} from "@/utils/rewards";

type RewardsPanelProps = {
  programs: ActiveRewardProgram[];
  lines: RewardCartLine[];
  /** Total after every discount (item, reward, order); used for TRANSACTION_MIN_TOTAL. */
  finalTotal: number;
  selections: RewardSelections;
  onChange: (next: RewardSelections) => void;
  primaryColor: string;
  textColor: string;
  isPhone: boolean;
  notice?: string | null;
};

const peso = (n: number) => `₱${n.toFixed(2)}`;

export default function RewardsPanel({
  programs,
  lines,
  finalTotal,
  selections,
  onChange,
  primaryColor,
  textColor,
  isPhone,
  notice,
}: RewardsPanelProps) {
  return (
    <View>
      {notice ? <Text className="text-sm text-amber-700 mb-3">{notice}</Text> : null}
      {programs.map((program) => (
        <ProgramSection
          key={program.id}
          program={program}
          lines={lines}
          finalTotal={finalTotal}
          selection={selections[program.id] ?? loyaltyCard.emptySelection()}
          otherRewardOrderIds={Object.entries(selections)
            .filter(([pid, s]) => pid !== program.id && s.redemption)
            .map(([, s]) => s.redemption!.orderId)}
          onChange={(sel) => onChange({ ...selections, [program.id]: sel })}
          primaryColor={primaryColor}
          textColor={textColor}
          isPhone={isPhone}
        />
      ))}
    </View>
  );
}

function ProgramSection({
  program,
  lines,
  finalTotal,
  selection,
  otherRewardOrderIds,
  onChange,
  primaryColor,
  textColor,
  isPhone,
}: {
  program: ActiveRewardProgram;
  lines: RewardCartLine[];
  finalTotal: number;
  selection: LoyaltyCardSelection;
  otherRewardOrderIds: string[];
  onChange: (sel: LoyaltyCardSelection) => void;
  primaryColor: string;
  textColor: string;
  isPhone: boolean;
}) {
  const [redeemingKey, setRedeemingKey] = useState<string | null>(null);
  const [pickedOrderId, setPickedOrderId] = useState<string | null>(null);

  const circle = isPhone ? 64 : 88;
  const cloudW = isPhone ? 110 : 150;
  const statuses = new Map(
    loyaltyCard
      .eligibleStampSlots(program, lines, finalTotal, selection)
      .map((s) => [s.slot.key, s]),
  );
  const rows = loyaltyCard.slotRows(program);
  const onePerVisit = loyaltyCard.isOnePerVisit(program);

  // Redeem: no qualifying item -> explain what to add; otherwise confirm the
  // paper card first, then open the item picker.
  const onRedeemPress = (slot: MilestoneSlot) => {
    if (!lines.some((l) => checkFor(slot, l).eligible)) {
      const matchesFilters = lines.some((l) => loyaltyCard.rewardMatchesLine(slot.reward, l));
      const prompt = matchesFilters
        ? {
            title: "Remove the discount first",
            message: "The matching item already has a discount. Remove it, then tap Redeem again.",
          }
        : loyaltyCard.addItemPrompt(slot.reward);
      Alert.alert(prompt.title, prompt.message, [{ text: "OK" }]);
      return;
    }
    const prompt = loyaltyCard.cardCheckPrompt(program, slot.key);
    Alert.alert(prompt.title, prompt.message, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Yes, redeem",
        onPress: () => {
          setRedeemingKey(slot.key);
          setPickedOrderId(null);
        },
      },
    ]);
  };

  const checkFor = (slot: MilestoneSlot, line: RewardCartLine) =>
    loyaltyCard.computeRedemption(slot.reward, line, otherRewardOrderIds.includes(line.orderId));

  // ── Item picker step ──────────────────────────────────────────────────────
  const redeemingSlot = redeemingKey
    ? (loyaltyCard.getSlots(program).find((s) => s.key === redeemingKey) as MilestoneSlot | undefined)
    : undefined;

  const cancelRedeem = () => {
    setRedeemingKey(null);
    setPickedOrderId(null);
  };

  const applyRedeem = () => {
    if (!redeemingSlot || !pickedOrderId) return;
    const line = lines.find((l) => l.orderId === pickedOrderId);
    if (!line) return;
    const check = checkFor(redeemingSlot, line);
    if (!check.eligible || check.discountAmount <= 0) return;
    onChange({
      ...selection,
      redemption: { slotKey: redeemingSlot.key, orderId: line.orderId, discountAmount: check.discountAmount },
    });
    cancelRedeem();
  };

  const picked = redeemingSlot && pickedOrderId ? lines.find((l) => l.orderId === pickedOrderId) : undefined;
  const pickedCheck = redeemingSlot && picked ? checkFor(redeemingSlot, picked) : undefined;

  return (
    <View className="rounded-xl border border-gray-200 p-4 mb-4">
      {/* Header */}
      <View className="flex-row items-center justify-between mb-1">
        <Text className={`${isPhone ? "text-base" : "text-lg"} font-bold flex-1 mr-2`} style={{ color: textColor }}>
          {program.name}
        </Text>
        <View className={`px-2 py-0.5 rounded-full ${program.scope === "COMPANY" ? "bg-indigo-50" : "bg-gray-100"}`}>
          <Text className={`text-xs font-semibold ${program.scope === "COMPANY" ? "text-indigo-700" : "text-gray-600"}`}>
            {program.scope === "COMPANY" ? "Company" : "Store"}
          </Text>
        </View>
      </View>

      {redeemingSlot ? (
        <View className="mt-2">
          <View className="flex-row items-center justify-between mb-1">
            <Text className="text-base font-bold flex-1 mr-2" style={{ color: textColor }}>
              {redeemingSlot.label} · {loyaltyCard.describeReward(redeemingSlot.reward)}
            </Text>
            <TouchableOpacity onPress={cancelRedeem} className="px-3 py-2">
              <Text className="text-sm font-semibold text-gray-600">Cancel</Text>
            </TouchableOpacity>
          </View>
          <Text className="text-sm text-gray-500 mb-3">Choose the item to discount</Text>

          {lines.map((line) => {
            const check = checkFor(redeemingSlot, line);
            const selected = pickedOrderId === line.orderId;
            const title = [line.productName, line.sizeName].filter(Boolean).join(" · ");
            return (
              <TouchableOpacity
                key={line.orderId}
                disabled={!check.eligible}
                onPress={() => setPickedOrderId(line.orderId)}
                activeOpacity={0.7}
                accessibilityRole="radio"
                accessibilityState={{ selected, disabled: !check.eligible }}
                className="flex-row items-center justify-between px-4 rounded-lg mb-2"
                style={{
                  minHeight: 64,
                  borderWidth: selected ? 2 : 1,
                  borderColor: selected ? primaryColor : "#e5e7eb",
                  backgroundColor: selected ? `${primaryColor}10` : "#ffffff",
                  opacity: check.eligible ? 1 : 0.4,
                }}
              >
                <Text className="text-sm font-semibold flex-1 mr-2" style={{ color: textColor }} numberOfLines={2}>
                  {title}
                </Text>
                <Text className="text-sm text-gray-600 mr-3">{peso(line.unitPrice)}</Text>
                {check.eligible ? (
                  <Text className="text-sm font-bold text-green-700">→  −{peso(check.discountAmount)}</Text>
                ) : (
                  <Text className="text-xs text-gray-500">
                    {check.reason === "HAS_DISCOUNT" ? "Has a discount: remove it first" : "Not eligible"}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}

          {picked && pickedCheck?.eligible && (
            <View className="rounded-lg p-3 mt-1 mb-3 flex-row justify-between" style={{ backgroundColor: "#f0fdf4" }}>
              <Text className="text-sm font-semibold" style={{ color: "#15803d" }}>
                Discount: −{peso(pickedCheck.discountAmount)}
              </Text>
              <Text className="text-sm font-semibold" style={{ color: "#15803d" }}>
                New line total: {peso(picked.unitPrice * picked.quantity - pickedCheck.discountAmount)}
              </Text>
            </View>
          )}

          <View className="flex-row mt-2" style={{ gap: 12 }}>
            <TouchableOpacity
              onPress={cancelRedeem}
              className="rounded-lg border border-gray-300 items-center justify-center"
              style={{ flex: 1, minHeight: 52 }}
            >
              <Text className="font-semibold text-gray-700">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={applyRedeem}
              disabled={!pickedCheck?.eligible}
              className="rounded-lg items-center justify-center"
              style={{ flex: 2, minHeight: 52, backgroundColor: pickedCheck?.eligible ? primaryColor : "#d1d5db" }}
            >
              <Text className="font-bold" style={{ color: pickedCheck?.eligible ? textColor : "#ffffff" }}>
                Apply reward
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <>
          {/* New card issued */}
          <View className="flex-row items-center justify-between py-2" style={{ minHeight: 48 }}>
            <View className="flex-1 mr-3">
              <Text className="text-base font-semibold" style={{ color: textColor }}>
                New card issued
              </Text>
              {selection.issued && <Text className="text-xs text-gray-500">Hand the customer a new card.</Text>}
            </View>
            <Switch
              value={selection.issued}
              onValueChange={(v) => onChange({ ...selection, issued: v })}
              trackColor={{ true: primaryColor, false: "#d1d5db" }}
              // Without an explicit thumb, Android paints it the system accent (blue).
              thumbColor="#ffffff"
              ios_backgroundColor="#d1d5db"
              accessibilityLabel="New card issued"
            />
          </View>

          <Text className="text-sm text-gray-500 mb-3">
            {onePerVisit
              ? "Tap the circle you stamped on the card. One stamp per visit."
              : "Tap the circles you stamped. Highlighted ones match this order."}
          </Text>

          {rows.map((row, ri) => (
            <View key={ri} className="flex-row flex-wrap items-start mb-3" style={{ gap: 12 }}>
              {row.map((slot) => {
                if (slot.kind === "STAMP") {
                  const st = statuses.get(slot.key);
                  const checked = !!st?.checked;
                  const eligible = !!st && st.matches && !st.usedUp;
                  const disabled = !checked && !eligible;
                  const hint = !onePerVisit && slot.condition ? loyaltyCard.describeCondition(slot.condition) : "";
                  return (
                    <View key={slot.key} style={{ width: circle }} className="items-center">
                      <TouchableOpacity
                        disabled={disabled}
                        activeOpacity={0.7}
                        onPress={() =>
                          onChange(loyaltyCard.toggleStamp(program, lines, finalTotal, selection, slot.key))
                        }
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked, disabled }}
                        accessibilityLabel={`${slot.label}, ${
                          checked ? "stamped" : eligible ? "matches this order" : st?.usedUp ? "no more items" : "not in this order"
                        }`}
                        className="rounded-full items-center justify-center px-1"
                        style={{
                          width: circle,
                          height: circle,
                          borderWidth: checked ? 0 : eligible ? 3 : 2,
                          borderColor: eligible ? primaryColor : "#e5e7eb",
                          backgroundColor: checked ? primaryColor : eligible ? `${primaryColor}10` : "#ffffff",
                          opacity: disabled ? 0.4 : 1,
                        }}
                      >
                        {checked ? (
                          <Text className="text-3xl font-bold" style={{ color: textColor }}>
                            ✓
                          </Text>
                        ) : (
                          <Text
                            className="font-semibold text-center"
                            style={{ color: textColor, fontSize: isPhone ? 10 : 11 }}
                            numberOfLines={3}
                            adjustsFontSizeToFit
                          >
                            {slot.label}
                          </Text>
                        )}
                      </TouchableOpacity>
                      <Text className="text-gray-600 text-center mt-1" style={{ fontSize: 11 }} numberOfLines={2}>
                        {checked ? slot.label : st?.usedUp && !onePerVisit ? "No more items" : hint}
                      </Text>
                    </View>
                  );
                }

                // Milestone cloud + Redeem/Undo
                const redeemed = selection.redemption?.slotKey === slot.key;
                const otherRedeemed = !!selection.redemption && !redeemed;
                const anyEligible = lines.some((l) => checkFor(slot, l).eligible);
                const redeemedLine = redeemed
                  ? lines.find((l) => l.orderId === selection.redemption!.orderId)
                  : undefined;
                const caption = redeemed
                  ? `On ${redeemedLine?.productName ?? "item"}`
                  : otherRedeemed
                    ? "1 reward per order"
                    : !anyEligible
                      ? lines.some((l) => loyaltyCard.rewardMatchesLine(slot.reward, l))
                        ? "Remove the item's discount to redeem."
                        : loyaltyCard.addItemHint(slot.reward)
                      : null;
                return (
                  <View key={slot.key} className="flex-row items-center" style={{ gap: 8 }}>
                    <View className="items-center">
                      <View
                        className="items-center justify-center px-3"
                        style={{
                          width: cloudW,
                          height: circle,
                          borderRadius: circle / 2,
                          borderWidth: 2,
                          borderStyle: redeemed ? "solid" : "dashed",
                          borderColor: redeemed ? "#16a34a" : `${primaryColor}80`,
                          backgroundColor: redeemed ? "#16a34a" : "#ffffff",
                        }}
                      >
                        <Text
                          className={`${isPhone ? "text-xs" : "text-sm"} font-extrabold uppercase text-center`}
                          // Dark text, not the brand colour: a light brand (e.g. yellow) is unreadable on white.
                          style={{ color: redeemed ? "#ffffff" : "#1f2937" }}
                          numberOfLines={2}
                        >
                          {redeemed ? "✓ " : ""}
                          {slot.label}
                        </Text>
                        <Text
                          className="text-xs text-center"
                          style={{ color: redeemed ? "#ffffff" : "#4b5563" }}
                          numberOfLines={1}
                        >
                          {loyaltyCard.describeReward(slot.reward)}
                        </Text>
                      </View>
                      {caption && (
                        <Text className="text-gray-600 text-center mt-1" style={{ fontSize: 11, maxWidth: cloudW }}>
                          {caption}
                        </Text>
                      )}
                    </View>
                    {redeemed ? (
                      <TouchableOpacity
                        onPress={() => onChange({ issued: selection.issued, stamps: selection.stamps })}
                        className="px-4 rounded-lg border border-red-300 items-center justify-center"
                        style={{ minHeight: 48 }}
                      >
                        <Text className="font-bold text-red-600">Undo</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        // Stays tappable with no qualifying item (tapping explains what to add).
                        disabled={otherRedeemed}
                        onPress={() => onRedeemPress(slot)}
                        className="px-4 rounded-lg items-center justify-center"
                        style={{
                          minHeight: 48,
                          backgroundColor: otherRedeemed ? "#d1d5db" : primaryColor,
                        }}
                      >
                        <Text className="font-bold" style={{ color: otherRedeemed ? "#ffffff" : textColor }}>
                          Redeem
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          ))}

          {/* Legend */}
          <View className="flex-row flex-wrap mt-1" style={{ gap: 12 }}>
            <Text className="text-xs text-gray-500">{onePerVisit ? "◉ tap to stamp" : "◉ matches order"}</Text>
            <Text className="text-xs text-gray-500">✓ stamped</Text>
            {!onePerVisit && <Text className="text-xs text-gray-500">○ not in this order</Text>}
          </View>
        </>
      )}
    </View>
  );
}
