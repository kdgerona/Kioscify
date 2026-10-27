"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { useBilling } from "@/contexts/BillingContext";
import { formatPeso } from "@/lib/billing-format";
import { PayNowPanel } from "./PayNowModal";

// Checks less often than the QR screen's own payment poll; this only catches a
// payment made elsewhere (another device, or a platform admin's Mark paid).
const STATUS_POLL_MS = 15_000;

/**
 * "Your subscription has ended" → Resubscribe, for a Store Admin of a store
 * that was switched off (account status SUBSCRIPTION_ENDED). Paying switches
 * the store back on (server side), then the portal reloads into the app.
 */
export function ResubscribePanel({ storeName }: { storeName: string | null }) {
  const { me, loadFailed } = useBilling();
  const [paying, setPaying] = useState(false);

  // The store is switched back on by the payment itself; leave as soon as the
  // account reads ACTIVE again, wherever the payment was made.
  useEffect(() => {
    const check = () =>
      api
        .getAccountStatus()
        .then(res => {
          if (res.status === "ACTIVE") window.location.href = "/dashboard";
        })
        .catch(() => {});
    const timer = window.setInterval(check, STATUS_POLL_MS);
    return () => window.clearInterval(timer);
  }, []);

  const amount = me?.openInvoice?.amountCentavos ?? me?.plan?.priceCentavos ?? null;

  if (paying) {
    return (
      <div className="text-left">
        <PayNowPanel onPaid={() => (window.location.href = "/dashboard")} />
        <button
          onClick={() => setPaying(false)}
          className="mt-3 w-full text-sm text-gray-500 hover:text-gray-700"
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-gray-600 text-sm">
        {!me && !loadFailed
          ? "Loading your billing details…"
          : amount != null
            ? `Pay ${formatPeso(amount)} to resubscribe and reactivate ${storeName ?? "your store"} right away.`
            : `Resubscribe to reactivate ${storeName ?? "your store"} right away.`}
      </p>
      <button
        onClick={() => setPaying(true)}
        className="w-full inline-flex items-center justify-center gap-2 font-semibold py-3 rounded-xl transition text-sm text-black hover:opacity-90"
        style={{ backgroundColor: "var(--brand-primary, #ea580c)" }}
      >
        <RefreshCw className="w-4 h-4" />
        Resubscribe
      </button>
    </div>
  );
}
