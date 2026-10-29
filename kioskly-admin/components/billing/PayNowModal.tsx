"use client";

import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/utils";
import { useBilling } from "@/contexts/BillingContext";
import { announcePayment } from "@/lib/payment-success";
import type { PayResult } from "@/types";
import { PaymentView } from "./PaymentView";

/** Loads (or reuses) a QR for the store's open invoice and shows it. */
export function PayNowPanel({ invoiceId, onPaid }: { invoiceId?: string; onPaid?: () => void }) {
  const { me, refresh } = useBilling();
  const [result, setResult] = useState<PayResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setResult(await api.payNow(invoiceId));
    } catch (err) {
      setError(getErrorMessage(err, "Could not start the payment. Please try again."));
    }
  }, [invoiceId]);

  useEffect(() => { load(); }, [load]);

  const pollStatus = useCallback(
    () => (result ? api.getInvoicePaymentStatus(result.invoiceId) : Promise.resolve({ paid: false })),
    [result],
  );
  const handlePaid = useCallback(() => {
    // Shown by the app shell: this panel often unmounts right after (banner hides, store unlocks)
    if (result) announcePayment({ invoiceId: result.invoiceId, invoiceNumber: result.invoiceNumber, amountCentavos: result.amountCentavos });
    refresh();
    onPaid?.();
  }, [result, refresh, onPaid]);

  if (error) {
    return (
      <div className="py-6 text-center space-y-3">
        <p className="text-sm text-red-600">{error}</p>
        <button onClick={load} className="px-3 py-2 text-sm border rounded-lg hover:bg-gray-50">Try again</button>
      </div>
    );
  }
  if (!result) {
    return <div className="py-12 text-center text-sm text-gray-400">Preparing your QR code…</div>;
  }
  return (
    <PaymentView
      result={result}
      pollSeconds={me?.pollSeconds ?? 30}
      pollStatus={pollStatus}
      onRefresh={load}
      onPaid={handlePaid}
      allowClaim
    />
  );
}

export function PayNowModal({ open, onClose, invoiceId }: { open: boolean; onClose: () => void; invoiceId?: string }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Pay subscription">
      <div className="bg-white text-gray-900 rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600" aria-label="Close">
          <X className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Pay subscription</h2>
        {/* Paid: close, so the app-level "Payment successful" notice takes over */}
        <PayNowPanel invoiceId={invoiceId} onPaid={onClose} />
      </div>
    </div>
  );
}
