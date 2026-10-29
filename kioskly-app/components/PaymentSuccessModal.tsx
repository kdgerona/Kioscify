import React from "react";
import { Modal, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, Href } from "expo-router";
import { useBilling } from "../contexts/BillingContext";
import { formatPeso } from "../utils/billingFormat";

/** "Payment successful" with links to the receipt and Billing. Mounted once in the root layout. */
export default function PaymentSuccessModal() {
  const { paymentSuccess, dismissPaymentSuccess } = useBilling();
  const router = useRouter();

  const go = (route: Href) => {
    dismissPaymentSuccess();
    router.push(route);
  };

  return (
    <Modal visible={!!paymentSuccess} transparent animationType="fade" onRequestClose={dismissPaymentSuccess}>
      <View className="flex-1 bg-black/40 justify-center items-center p-6">
        <View className="bg-white rounded-2xl w-full max-w-sm p-6 items-center" style={{ gap: 12 }}>
          <View className="w-16 h-16 rounded-full bg-green-50 items-center justify-center">
            <Ionicons name="checkmark-circle" size={44} color="#16a34a" />
          </View>
          <Text className="text-lg font-semibold text-gray-900 text-center">Payment successful</Text>
          {paymentSuccess && (
            <Text className="text-sm text-gray-600 text-center">
              We received {formatPeso(paymentSuccess.amountCentavos)} for invoice {paymentSuccess.invoiceNumber}. Your subscription is up to
              date.
            </Text>
          )}
          <View className="w-full" style={{ gap: 8 }}>
            <TouchableOpacity
              onPress={() => paymentSuccess && go(`/billing-receipt?id=${paymentSuccess.invoiceId}` as Href)}
              className="bg-green-600 rounded-lg py-3 items-center"
            >
              <Text className="text-white font-semibold">View receipt</Text>
            </TouchableOpacity>
            <View className="flex-row" style={{ gap: 8 }}>
              <TouchableOpacity onPress={() => go("/billing" as Href)} className="flex-1 border border-gray-300 rounded-lg py-3 items-center">
                <Text className="text-gray-700">Go to Billing</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={dismissPaymentSuccess} className="flex-1 border border-gray-300 rounded-lg py-3 items-center">
                <Text className="text-gray-700">Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
