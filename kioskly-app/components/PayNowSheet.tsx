import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, Linking, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import Toast from "react-native-toast-message";
import { apiRequest } from "../utils/api";
import { formatCountdown, formatPeso } from "../utils/billingFormat";
import { useBilling } from "../contexts/BillingContext";
import { resolveStorageUrl } from "../utils/storageUrl";

const SUPPORT_EMAIL = "support@kioscify.com";

type PayResult =
  | { kind: "paymongo"; invoiceId: string; invoiceNumber: string; amountCentavos: number; qrImage: string; expiresAt: string; payUrl: string }
  | {
      kind: "fallback";
      invoiceId: string;
      invoiceNumber: string;
      amountCentavos: number;
      fallbackQrImageUrl: string;
      accountName: string | null;
      instructions: string | null;
      payUrl: string;
    }
  | { kind: "unavailable"; invoiceId: string; invoiceNumber: string; amountCentavos: number; message: string };

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    return typeof body?.message === "string" ? body.message : fallback;
  } catch {
    return fallback;
  }
}

/** QR Ph (or the fallback bank QR + "I've paid") for the store's open invoice. Store admins only. */
export function PayNowContent({ onPaid }: { onPaid?: () => void }) {
  const { me, refresh, announcePayment } = useBilling();
  const [result, setResult] = useState<PayResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiRequest("/billing/me/pay", { method: "POST" });
      if (!res.ok) {
        setError(await readError(res, "Could not start the payment. Please try again."));
        return;
      }
      setResult(await res.json());
    } catch {
      setError("You're offline. Connect to the internet to pay.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (result?.kind !== "paymongo") return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [result?.kind]);

  useEffect(() => {
    if (!result || result.kind === "unavailable" || paid) return;
    const poll = setInterval(async () => {
      try {
        const res = await apiRequest(`/billing/me/invoices/${result.invoiceId}/payment-status`);
        if (res.ok && (await res.json()).paid) {
          setPaid(true);
          announcePayment({ invoiceId: result.invoiceId, invoiceNumber: result.invoiceNumber, amountCentavos: result.amountCentavos });
          refresh();
          onPaid?.();
        }
      } catch {
        // offline — keep polling
      }
    }, Math.max(5, me?.pollSeconds ?? 30) * 1000);
    return () => clearInterval(poll);
  }, [result, paid, me?.pollSeconds, refresh, onPaid, announcePayment]);

  if (paid) {
    return (
      <View style={{ gap: 8 }} className="items-center py-8">
        <Ionicons name="checkmark-circle" size={56} color="#16a34a" />
        <Text className="text-lg font-semibold text-gray-900">Payment received — thank you!</Text>
      </View>
    );
  }
  if (error) {
    return (
      <View style={{ gap: 12 }} className="items-center py-6">
        <Text className="text-red-600 text-center">{error}</Text>
        <TouchableOpacity onPress={load} className="px-4 py-2 border border-gray-300 rounded-lg">
          <Text className="text-gray-700">Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (!result) {
    return (
      <View className="items-center py-12">
        <ActivityIndicator />
        <Text className="text-gray-400 mt-2">Preparing your QR code…</Text>
      </View>
    );
  }
  if (result.kind === "unavailable") {
    return (
      <View style={{ gap: 12 }} className="items-center py-6">
        <Text className="text-center text-gray-600">{result.message}</Text>
        <TouchableOpacity
          onPress={() =>
            Linking.openURL(
              `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Subscription payment ${result.invoiceNumber}`)}`,
            ).catch(() => {})
          }
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", alignSelf: "center" }}
          className="bg-gray-900 rounded-lg px-4 py-2.5"
        >
          <Ionicons name="mail-outline" size={16} color="#ffffff" style={{ marginRight: 8 }} />
          <Text className="text-white font-semibold">{SUPPORT_EMAIL}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (result.kind === "fallback") {
    return (
      <View style={{ gap: 12 }}>
        <Text className="text-center text-gray-600">Scan with GCash, Maya or any bank app and send exactly</Text>
        <Text className="text-center text-2xl font-bold text-gray-900">{formatPeso(result.amountCentavos)}</Text>
        <Image source={{ uri: resolveStorageUrl(result.fallbackQrImageUrl) ?? undefined }} style={{ width: 220, height: 220, alignSelf: "center" }} resizeMode="contain" />
        {result.accountName ? <Text className="text-center font-medium text-gray-800">{result.accountName}</Text> : null}
        {result.instructions ? <Text className="text-center text-xs text-gray-500">{result.instructions}</Text> : null}
        <ClaimForm invoiceId={result.invoiceId} amountCentavos={result.amountCentavos} />
      </View>
    );
  }

  const remaining = new Date(result.expiresAt).getTime() - now;
  const expired = remaining <= 0;
  return (
    <View style={{ gap: 12 }} className="items-center">
      <Text className="text-gray-600">Scan with GCash, Maya or any bank app</Text>
      <Text className="text-2xl font-bold text-gray-900">{formatPeso(result.amountCentavos)}</Text>
      <Image source={{ uri: result.qrImage }} style={{ width: 240, height: 240, opacity: expired ? 0.2 : 1 }} resizeMode="contain" />
      <Text className="text-xs text-gray-500">
        {expired ? "This code has expired." : `Expires in ${formatCountdown(remaining)} · ${result.invoiceNumber}`}
      </Text>
      <View style={{ gap: 8 }} className="flex-row">
        <TouchableOpacity onPress={load} className="px-4 py-2 border border-gray-300 rounded-lg">
          <Text className="text-gray-700">{expired ? "Get a new QR" : "Refresh"}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => WebBrowser.openBrowserAsync(result.payUrl).catch(() => {})}
          className="px-4 py-2 border border-gray-300 rounded-lg"
        >
          <Text className="text-gray-700">Open pay page</Text>
        </TouchableOpacity>
      </View>
      <Text className="text-xs text-gray-400 text-center">This screen updates automatically once your payment goes through.</Text>
    </View>
  );
}

function ClaimForm({ invoiceId, amountCentavos }: { invoiceId: string; amountCentavos: number }) {
  const { refresh } = useBilling();
  const [reference, setReference] = useState("");
  const [amount, setAmount] = useState(String(amountCentavos / 100));
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    const cents = Math.round(Number(amount.replace(/[₱,\s]/g, "")) * 100);
    if (!reference.trim()) {
      Toast.show({ type: "error", text1: "Enter the reference number from your bank or e-wallet" });
      return;
    }
    if (!Number.isFinite(cents) || cents <= 0) {
      Toast.show({ type: "error", text1: "Enter the amount you sent" });
      return;
    }
    setBusy(true);
    try {
      const res = await apiRequest(`/billing/me/invoices/${invoiceId}/claims`, {
        method: "POST",
        body: JSON.stringify({ amountCentavos: cents, reference: reference.trim(), paidAt: new Date().toISOString() }),
      });
      if (!res.ok) {
        Toast.show({ type: "error", text1: await readError(res, "Could not submit your payment") });
        return;
      }
      setDone(true);
      refresh();
    } catch {
      Toast.show({ type: "error", text1: "You're offline. Try again once connected." });
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Text className="text-center text-green-700 bg-green-50 rounded-lg px-3 py-2">
        Payment submitted. Your store stays open while Kioscify verifies it.
      </Text>
    );
  }
  return (
    <View style={{ gap: 8 }} className="border-t border-gray-200 pt-3">
      <Text className="font-medium text-gray-900">Already paid? Tell us so we can confirm it.</Text>
      <TextInput
        value={reference}
        onChangeText={setReference}
        placeholder="Reference number"
        className="border border-gray-300 rounded-lg px-3 py-2"
      />
      <TextInput
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        placeholder="Amount sent"
        className="border border-gray-300 rounded-lg px-3 py-2"
      />
      <TouchableOpacity onPress={submit} disabled={busy} className={`bg-gray-900 rounded-lg py-3 items-center ${busy ? "opacity-50" : ""}`}>
        <Text className="text-white font-semibold">{busy ? "Submitting…" : "I've paid"}</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function PayNowSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 bg-black/40 justify-center items-center p-4">
        <View className="bg-white rounded-2xl w-full max-w-md p-5" style={{ maxHeight: "90%" }}>
          <View className="flex-row justify-between items-center mb-4">
            <Text className="text-lg font-semibold text-gray-900">Pay subscription</Text>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color="#6b7280" />
            </TouchableOpacity>
          </View>
          {/* Paid: close, so the app-level "Payment successful" notice takes over */}
          <ScrollView>{visible && <PayNowContent onPaid={onClose} />}</ScrollView>
        </View>
      </View>
    </Modal>
  );
}
