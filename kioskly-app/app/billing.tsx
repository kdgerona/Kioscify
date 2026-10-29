import { useCallback, useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl } from "react-native";
import AppSafeAreaView from "../components/AppSafeAreaView";
import PayNowSheet from "../components/PayNowSheet";
import { useRouter, Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTenant } from "../contexts/TenantContext";
import { useAuth } from "../contexts/AuthContext";
import { BillingStatus, useBilling } from "../contexts/BillingContext";
import { apiRequest } from "../utils/api";
import { formatManilaDate, formatPeso } from "../utils/billingFormat";

const STORE_ADMIN_ROLES = ["STORE_ADMIN", "ADMIN"];
const PAGE_SIZE = 10;

const STATUS_LABEL: Record<BillingStatus, string> = {
  EXEMPT: "No billing",
  NOT_ACTIVATED: "Not activated",
  TRIAL: "Trial",
  ACTIVE: "Active",
  DUE: "Due",
  LOCKED: "Locked",
};

const STATUS_STYLE: Record<BillingStatus, { bg: string; fg: string }> = {
  EXEMPT: { bg: "#f3f4f6", fg: "#4b5563" },
  NOT_ACTIVATED: { bg: "#f3f4f6", fg: "#4b5563" },
  TRIAL: { bg: "#eff6ff", fg: "#1d4ed8" },
  ACTIVE: { bg: "#f0fdf4", fg: "#15803d" },
  DUE: { bg: "#fffbeb", fg: "#b45309" },
  LOCKED: { bg: "#fef2f2", fg: "#b91c1c" },
};

type InvoiceStatus = "OPEN" | "PAID" | "WAIVED" | "VOID";

const INVOICE_STATUS: Record<InvoiceStatus, { label: string; bg: string; fg: string }> = {
  OPEN: { label: "Open", bg: "#fffbeb", fg: "#b45309" },
  PAID: { label: "Paid", bg: "#f0fdf4", fg: "#15803d" },
  WAIVED: { label: "Waived", bg: "#eff6ff", fg: "#1d4ed8" },
  VOID: { label: "Void", bg: "#f3f4f6", fg: "#6b7280" },
};

const METHOD_LABEL: Record<string, string> = { QRPH: "QRPH", MANUAL: "Manual", PREPAID: "Prepaid" };

interface InvoiceRow {
  id: string;
  number: string;
  periodStart: string;
  periodEnd: string;
  amountCentavos: number;
  dueAt: string;
  status: InvoiceStatus;
  paidAt: string | null;
  paymentMethod: string | null;
  reference: string | null;
}

/** Billing periods are stored with an exclusive end; show the last covered day. */
function formatPeriod(start: string, endExclusive: string): string {
  return `${formatManilaDate(start)} – ${formatManilaDate(new Date(new Date(endExclusive).getTime() - 1).toISOString())}`;
}

function Pill({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
      <Text style={{ color: fg, fontSize: 12, fontWeight: "600" }}>{label}</Text>
    </View>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ width: "50%", paddingVertical: 8 }}>
      <Text style={{ fontSize: 11, color: "#9ca3af", marginBottom: 2 }}>{label}</Text>
      <Text style={{ fontSize: 14, color: "#111827", fontWeight: "500" }}>{value}</Text>
    </View>
  );
}

/** The store's subscription and billing history. Store admins only, opened from Settings. */
export default function BillingScreen() {
  const router = useRouter();
  const { tenant, brand } = useTenant();
  const { user } = useAuth();
  const { me, refresh } = useBilling();
  const [invoices, setInvoices] = useState<InvoiceRow[] | null>(null);
  const [invoiceError, setInvoiceError] = useState(false);
  const [shown, setShown] = useState(PAGE_SIZE);
  const [payOpen, setPayOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const textColor = brand?.themeColors?.text ?? tenant?.themeColors?.text ?? "#1f2937";
  const backgroundColor = brand?.themeColors?.background ?? tenant?.themeColors?.background ?? "#ffffff";

  const isStoreAdmin = !!user && STORE_ADMIN_ROLES.includes(user.role);
  const billed = !!me && !(me.status.status === "EXEMPT" && me.plan?.billingEnabled !== true);

  // Cashiers never see the Settings entry; this covers a stray deep link.
  useEffect(() => {
    if (user && !isStoreAdmin) router.back();
  }, [user, isStoreAdmin, router]);

  const loadInvoices = useCallback(async () => {
    setInvoiceError(false);
    try {
      const res = await apiRequest("/billing/me/invoices");
      if (!res.ok) throw new Error(String(res.status));
      setInvoices(await res.json());
    } catch {
      setInvoiceError(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (billed && isStoreAdmin) loadInvoices();
  }, [billed, isStoreAdmin, loadInvoices, me?.status.openInvoiceId, me?.status.status]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refresh(), billed ? loadInvoices() : Promise.resolve()]);
    setRefreshing(false);
  };

  const header = (
    <View className="px-6 py-4 flex-row items-center" style={{ backgroundColor }}>
      <TouchableOpacity onPress={() => router.back()} className="mr-4 p-2">
        <Ionicons name="arrow-back" size={24} color={textColor} />
      </TouchableOpacity>
      <Text className="text-2xl font-bold" style={{ color: textColor }}>Billing</Text>
    </View>
  );

  if (!isStoreAdmin) return <AppSafeAreaView style={{ flex: 1, backgroundColor: "#f3f4f6" }}>{header}</AppSafeAreaView>;

  if (!me) {
    return (
      <AppSafeAreaView style={{ flex: 1, backgroundColor: "#f3f4f6" }}>
        {header}
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator />
          <Text style={{ color: "#9ca3af", marginTop: 8 }}>Loading billing…</Text>
        </View>
      </AppSafeAreaView>
    );
  }

  if (!billed) {
    return (
      <AppSafeAreaView style={{ flex: 1, backgroundColor: "#f3f4f6" }}>
        {header}
        <View style={{ margin: 16, backgroundColor: "white", borderRadius: 12, paddingVertical: 48, alignItems: "center" }}>
          <Ionicons name="card-outline" size={32} color="#d1d5db" />
          <Text style={{ color: "#6b7280", marginTop: 8 }}>No billing for this store.</Text>
        </View>
      </AppSafeAreaView>
    );
  }

  const s = me.status;
  const upcoming = !!s.upcomingDueAt;
  const owing = s.status === "DUE" || s.status === "LOCKED" || upcoming;
  const canPayNow = me.canPay && (owing || !!me.openInvoice);
  const statusStyle = STATUS_STYLE[s.status];
  const list = invoices ?? [];

  return (
    <AppSafeAreaView style={{ flex: 1, backgroundColor: "#f3f4f6" }}>
      {header}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, gap: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Subscription */}
        <View style={{ backgroundColor: "white", borderRadius: 12, padding: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
              <View style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: "#f3f4f6", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="card-outline" size={20} color="#4b5563" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, color: "#6b7280" }}>Kioscify subscription</Text>
                <Text style={{ fontSize: 20, fontWeight: "600", color: "#111827" }}>
                  {formatPeso(me.plan?.priceCentavos)}
                  <Text style={{ fontSize: 13, fontWeight: "400", color: "#6b7280" }}> / month</Text>
                </Text>
              </View>
            </View>
            <Pill label={STATUS_LABEL[s.status]} bg={statusStyle.bg} fg={statusStyle.fg} />
          </View>

          <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 12 }}>
            <Detail label="Trial ends" value={formatManilaDate(me.plan?.trialEndsAt)} />
            <Detail label="Paid through" value={formatManilaDate(me.plan?.paidThroughAt)} />
            {/* In the reminder window the invoice already exists, so plan.nextBillingAt has moved on a month. */}
            <Detail label="Next billing" value={formatManilaDate(s.upcomingDueAt ?? me.plan?.nextBillingAt)} />
            <Detail label="Amount due" value={owing ? formatPeso(s.amountCentavos) : "—"} />
          </View>

          {me.storeView.variant !== "none" && (
            <Text style={{ marginTop: 8, fontSize: 13, color: "#374151", backgroundColor: "#fffbeb", borderWidth: 1, borderColor: "#fef3c7", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 }}>
              {me.storeView.body}
            </Text>
          )}

          {canPayNow && (
            <TouchableOpacity
              onPress={() => setPayOpen(true)}
              style={{ marginTop: 12, minHeight: 48, borderRadius: 10, backgroundColor: "#dc2626", alignItems: "center", justifyContent: "center" }}
            >
              <Text style={{ color: "white", fontSize: 15, fontWeight: "600" }}>
                Pay now{me.openInvoice ? ` · ${formatPeso(me.openInvoice.amountCentavos)}` : ""}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Billing history */}
        <View style={{ backgroundColor: "white", borderRadius: 12, overflow: "hidden" }}>
          <Text style={{ fontSize: 15, fontWeight: "600", color: "#111827", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" }}>
            Billing history
          </Text>

          {invoiceError ? (
            <View style={{ alignItems: "center", paddingVertical: 32, gap: 10 }}>
              <Text style={{ color: "#6b7280" }}>Couldn't load your billing history.</Text>
              <TouchableOpacity onPress={loadInvoices} style={{ borderWidth: 1, borderColor: "#d1d5db", borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 }}>
                <Text style={{ color: "#374151" }}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : invoices === null ? (
            <View style={{ alignItems: "center", paddingVertical: 32 }}>
              <ActivityIndicator />
            </View>
          ) : list.length === 0 ? (
            <Text style={{ textAlign: "center", color: "#9ca3af", paddingVertical: 32 }}>No invoices yet.</Text>
          ) : (
            <>
              {list.slice(0, shown).map(inv => {
                const st = INVOICE_STATUS[inv.status] ?? INVOICE_STATUS.VOID;
                const isPaid = inv.status === "PAID";
                return (
                  <TouchableOpacity
                    key={inv.id}
                    disabled={!isPaid}
                    onPress={() => router.push(`/billing-receipt?id=${inv.id}` as Href)}
                    style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#f3f4f6", gap: 4 }}
                  >
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <Text style={{ fontSize: 14, color: "#111827", fontWeight: "500", flex: 1 }}>{formatPeriod(inv.periodStart, inv.periodEnd)}</Text>
                      <Text style={{ fontSize: 14, color: "#111827", fontWeight: "600" }}>{formatPeso(inv.amountCentavos)}</Text>
                    </View>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <Text style={{ fontSize: 12, color: "#6b7280", flex: 1 }}>
                        {inv.status === "PAID"
                          ? `Paid ${formatManilaDate(inv.paidAt)}${inv.paymentMethod ? ` · ${METHOD_LABEL[inv.paymentMethod] ?? inv.paymentMethod}` : ""}`
                          : `Due ${formatManilaDate(inv.dueAt)}`}
                      </Text>
                      <Pill label={st.label} bg={st.bg} fg={st.fg} />
                    </View>
                    {inv.reference ? <Text style={{ fontSize: 12, color: "#9ca3af" }}>Ref: {inv.reference}</Text> : null}
                    {isPaid && <Text style={{ fontSize: 13, color: "#2563eb", fontWeight: "600" }}>View receipt ›</Text>}
                  </TouchableOpacity>
                );
              })}
              {list.length > shown && (
                <TouchableOpacity onPress={() => setShown(n => n + PAGE_SIZE)} style={{ alignItems: "center", paddingVertical: 14 }}>
                  <Text style={{ color: "#2563eb", fontWeight: "600" }}>Show more ({list.length - shown} more)</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>

        <View style={{ height: 16 }} />
      </ScrollView>

      <PayNowSheet
        visible={payOpen}
        onClose={() => {
          setPayOpen(false);
          refresh();
        }}
      />
    </AppSafeAreaView>
  );
}
