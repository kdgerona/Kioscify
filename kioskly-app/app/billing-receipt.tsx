import { useCallback, useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import AppSafeAreaView from "../components/AppSafeAreaView";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTenant } from "../contexts/TenantContext";
import { useAuth } from "../contexts/AuthContext";
import { apiRequest } from "../utils/api";
import { formatManilaDate, formatPeso } from "../utils/billingFormat";

const STORE_ADMIN_ROLES = ["STORE_ADMIN", "ADMIN"];
const METHOD_LABEL: Record<string, string> = { QRPH: "QRPH", MANUAL: "Manual", PREPAID: "Prepaid" };

interface Receipt {
  invoice: {
    id: string;
    number: string;
    periodStart: string;
    periodEnd: string;
    amountCentavos: number;
    status: "OPEN" | "PAID" | "WAIVED" | "VOID";
    paidAt: string | null;
  };
  payments: { id: string; paidAt: string; amountCentavos: number; method: string; reference: string | null }[];
  store: { name: string; address: string | null; companyName: string | null; brandName: string | null };
}

/** Billing periods are stored with an exclusive end; show the last covered day. */
function formatPeriod(start: string, endExclusive: string): string {
  return `${formatManilaDate(start)} – ${formatManilaDate(new Date(new Date(endExclusive).getTime() - 1).toISOString())}`;
}

/** One subscription receipt (same content as Store Portal → Billing → Receipt). Store admins only. */
export default function BillingReceiptScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { tenant, brand } = useTenant();
  const { user } = useAuth();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState<string | null>(null);

  const textColor = brand?.themeColors?.text ?? tenant?.themeColors?.text ?? "#1f2937";
  const backgroundColor = brand?.themeColors?.background ?? tenant?.themeColors?.background ?? "#ffffff";
  const isStoreAdmin = !!user && STORE_ADMIN_ROLES.includes(user.role);

  useEffect(() => {
    if (user && !isStoreAdmin) router.back();
  }, [user, isStoreAdmin, router]);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const res = await apiRequest(`/billing/me/invoices/${id}`);
      if (!res.ok) {
        setError(res.status === 404 ? "Receipt not found." : "Couldn't load the receipt.");
        return;
      }
      setReceipt(await res.json());
    } catch {
      setError("You're offline. Connect to the internet to view the receipt.");
    }
  }, [id]);

  useEffect(() => {
    if (isStoreAdmin) load();
  }, [isStoreAdmin, load]);

  const header = (
    <View className="px-6 py-4 flex-row items-center" style={{ backgroundColor }}>
      <TouchableOpacity onPress={() => router.back()} className="mr-4 p-2">
        <Ionicons name="arrow-back" size={24} color={textColor} />
      </TouchableOpacity>
      <Text className="text-2xl font-bold" style={{ color: textColor }}>Receipt</Text>
    </View>
  );

  let body: React.ReactNode;
  if (error) {
    body = (
      <View style={{ alignItems: "center", paddingVertical: 48, gap: 12 }}>
        <Text style={{ color: "#6b7280", textAlign: "center" }}>{error}</Text>
        <TouchableOpacity onPress={load} style={{ borderWidth: 1, borderColor: "#d1d5db", borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 }}>
          <Text style={{ color: "#374151" }}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  } else if (!receipt) {
    body = (
      <View style={{ alignItems: "center", paddingVertical: 48 }}>
        <ActivityIndicator />
      </View>
    );
  } else {
    const { invoice, payments, store } = receipt;
    body = (
      <View style={{ backgroundColor: "white", borderRadius: 12, padding: 20 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" }}>
          <View>
            <Text style={{ fontSize: 18, fontWeight: "700", color: "#111827" }}>Kioscify</Text>
            <Text style={{ fontSize: 13, color: "#6b7280" }}>Subscription receipt</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontSize: 13, color: "#111827", fontFamily: "monospace" }}>{invoice.number}</Text>
            <Text style={{ fontSize: 13, color: invoice.status === "PAID" ? "#15803d" : "#6b7280" }}>
              {invoice.status === "PAID" ? `Paid ${formatManilaDate(invoice.paidAt)}` : invoice.status}
            </Text>
          </View>
        </View>

        <View style={{ paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: "#f3f4f6", gap: 2 }}>
          <Text style={{ fontSize: 14, fontWeight: "500", color: "#111827" }}>{store.name}</Text>
          {(store.companyName || store.brandName) && (
            <Text style={{ fontSize: 13, color: "#6b7280" }}>{[store.companyName, store.brandName].filter(Boolean).join(" · ")}</Text>
          )}
          {store.address ? <Text style={{ fontSize: 13, color: "#6b7280" }}>{store.address}</Text> : null}
        </View>

        <View style={{ paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: "#f3f4f6", gap: 10 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
            <Text style={{ fontSize: 14, color: "#374151", flex: 1 }}>
              Kioscify store subscription — {formatPeriod(invoice.periodStart, invoice.periodEnd)}
            </Text>
            <Text style={{ fontSize: 14, color: "#111827" }}>{formatPeso(invoice.amountCentavos)}</Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827" }}>Total</Text>
            <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827" }}>{formatPeso(invoice.amountCentavos)}</Text>
          </View>
        </View>

        <View style={{ paddingTop: 16, gap: 4 }}>
          <Text style={{ fontSize: 14, fontWeight: "500", color: "#111827" }}>Payment</Text>
          {payments.length === 0 ? (
            <Text style={{ fontSize: 13, color: "#6b7280" }}>—</Text>
          ) : (
            payments.map(p => (
              <Text key={p.id} style={{ fontSize: 13, color: "#4b5563" }}>
                {formatManilaDate(p.paidAt)} · {formatPeso(p.amountCentavos)} · {METHOD_LABEL[p.method] ?? p.method}
                {p.reference ? ` · Ref ${p.reference}` : ""}
              </Text>
            ))
          )}
        </View>
      </View>
    );
  }

  return (
    <AppSafeAreaView style={{ flex: 1, backgroundColor: "#f3f4f6" }}>
      {header}
      <ScrollView contentContainerStyle={{ padding: 16 }}>{isStoreAdmin ? body : null}</ScrollView>
    </AppSafeAreaView>
  );
}
