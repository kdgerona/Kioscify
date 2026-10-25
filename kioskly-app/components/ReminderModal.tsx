import React, { useState } from "react";
import { Modal, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useBilling } from "../contexts/BillingContext";
import { apiRequest } from "../utils/api";
import PayNowSheet from "./PayNowSheet";

/** One-time notice per billing reminder — store admins only (the API returns none for cashiers). */
export default function ReminderModal() {
  const { me, refresh } = useBilling();
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const reminder = me?.pendingReminder;
  const visible = !!reminder && reminder.id !== dismissedId;

  const acknowledge = async (thenPay: boolean) => {
    if (!reminder) return;
    setDismissedId(reminder.id);
    if (thenPay) setPayOpen(true);
    try {
      await apiRequest(`/billing/me/reminders/${reminder.id}/ack`, { method: "POST" });
    } catch {
      // offline — it will show again next time, which is acceptable
    } finally {
      refresh();
    }
  };

  return (
    <>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => acknowledge(false)}>
        <View className="flex-1 bg-black/40 justify-center items-center p-6">
          <View className="bg-white rounded-2xl w-full max-w-sm p-6 items-center gap-3">
            <Ionicons name="notifications" size={36} color="#d97706" />
            <Text className="text-lg font-semibold text-gray-900 text-center">{reminder?.title}</Text>
            <Text className="text-sm text-gray-600 text-center">{reminder?.body}</Text>
            <View className="flex-row gap-2 w-full">
              <TouchableOpacity onPress={() => acknowledge(false)} className="flex-1 border border-gray-300 rounded-lg py-3 items-center">
                <Text className="text-gray-700">Later</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => acknowledge(true)} className="flex-1 bg-red-600 rounded-lg py-3 items-center">
                <Text className="text-white font-semibold">Pay now</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <PayNowSheet visible={payOpen} onClose={() => setPayOpen(false)} />
    </>
  );
}
