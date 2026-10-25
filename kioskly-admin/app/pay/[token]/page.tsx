"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { PaymentView } from "@/components/billing/PaymentView";
import { formatManilaDate, formatPeso } from "@/lib/billing-format";
import type { PayPageData } from "@/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api/v1";

/** Public, shareable pay page for one invoice — no login needed to pay. */
export default function PayPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PayPageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/billing/pay/${encodeURIComponent(token)}`, { cache: "no-store" });
      if (res.status === 404) { setError("This payment link is not valid."); return; }
      if (res.status === 429) { setError("Too many requests — please wait a minute and refresh."); return; }
      if (!res.ok) { setError("Could not load this payment. Please try again."); return; }
      setData(await res.json());
    } catch {
      setError("Could not reach Kioscify. Check your connection and try again.");
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const pollStatus = useCallback(async () => {
    const res = await fetch(`${API_BASE_URL}/billing/pay/${encodeURIComponent(token)}/status`, { cache: "no-store" });
    return res.ok ? res.json() : { paid: false };
  }, [token]);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border p-6 space-y-4">
        <div>
          <p className="text-sm text-gray-500">Kioscify subscription</p>
          <h1 className="text-xl font-semibold text-gray-900">{data?.storeName || "Payment"}</h1>
          {data && (
            <p className="text-xs text-gray-500 mt-1">
              Invoice {data.invoiceNumber} · {formatPeso(data.amountCentavos)} · due {formatManilaDate(data.dueAt)}
            </p>
          )}
        </div>

        {error ? (
          <p className="text-sm text-red-600 py-6 text-center">{error}</p>
        ) : !data ? (
          <p className="text-sm text-gray-400 py-12 text-center">Loading…</p>
        ) : paid || data.status === "PAID" ? (
          <div className="py-8 text-center space-y-2">
            <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto" />
            <p className="font-semibold text-gray-900">This invoice is paid. Thank you!</p>
          </div>
        ) : !data.payment ? (
          <p className="text-sm text-gray-600 py-6 text-center">This invoice is no longer open for payment.</p>
        ) : (
          <PaymentView
            result={data.payment}
            pollSeconds={15}
            pollStatus={pollStatus}
            onRefresh={load}
            onPaid={() => setPaid(true)}
            allowClaim={false}
          />
        )}
      </div>
    </div>
  );
}
