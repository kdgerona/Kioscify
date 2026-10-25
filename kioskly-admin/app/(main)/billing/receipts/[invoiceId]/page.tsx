"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Printer } from "lucide-react";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/utils";
import { formatManilaDate, formatPeriod, formatPeso, PAYMENT_METHOD_LABELS } from "@/lib/billing-format";
import type { StoreInvoiceReceipt } from "@/types";

export default function ReceiptPage() {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const [receipt, setReceipt] = useState<StoreInvoiceReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getMyInvoice(invoiceId).then(setReceipt).catch(err => setError(getErrorMessage(err, "Receipt not found")));
  }, [invoiceId]);

  if (error) return <div className="p-8 text-sm text-red-600">{error}</div>;
  if (!receipt) return <div className="p-8 text-sm text-gray-400">Loading…</div>;

  const { invoice, payments, store } = receipt;

  return (
    <div className="p-6 lg:p-8 text-gray-900">
      <div className="flex items-center justify-between max-w-2xl mb-4 print:hidden">
        <Link href="/billing" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ChevronLeft className="w-4 h-4" /> Billing
        </Link>
        <button onClick={() => window.print()} className="flex items-center gap-2 px-3 py-2 text-sm border rounded-lg bg-white hover:bg-gray-50">
          <Printer className="w-4 h-4" /> Print / save as PDF
        </button>
      </div>

      <div className="bg-white rounded-lg border max-w-2xl p-8 print:border-0 print:p-0">
        <div className="flex justify-between items-start border-b pb-6">
          <div>
            <p className="text-xl font-bold text-gray-900">Kioscify</p>
            <p className="text-sm text-gray-500">Subscription receipt</p>
          </div>
          <div className="text-right text-sm">
            <p className="font-mono">{invoice.number}</p>
            <p className="text-gray-500">{invoice.status === "PAID" ? `Paid ${formatManilaDate(invoice.paidAt)}` : invoice.status}</p>
          </div>
        </div>

        <div className="py-6 text-sm space-y-1 border-b">
          <p className="font-medium text-gray-900">{store.name}</p>
          {(store.companyName || store.brandName) && (
            <p className="text-gray-500">{[store.companyName, store.brandName].filter(Boolean).join(" · ")}</p>
          )}
          {store.address && <p className="text-gray-500">{store.address}</p>}
        </div>

        <table className="w-full text-sm my-6">
          <tbody>
            <tr>
              <td className="py-2 text-gray-700">Kioscify store subscription — {formatPeriod(invoice.periodStart, invoice.periodEnd)}</td>
              <td className="py-2 text-right tabular-nums">{formatPeso(invoice.amountCentavos)}</td>
            </tr>
            <tr className="border-t font-semibold">
              <td className="py-2">Total</td>
              <td className="py-2 text-right tabular-nums">{formatPeso(invoice.amountCentavos)}</td>
            </tr>
          </tbody>
        </table>

        <div className="text-sm space-y-1">
          <p className="font-medium text-gray-900">Payment</p>
          {payments.length === 0 ? (
            <p className="text-gray-500">—</p>
          ) : (
            payments.map(p => (
              <p key={p.id} className="text-gray-600">
                {formatManilaDate(p.paidAt)} · {formatPeso(p.amountCentavos)} · {PAYMENT_METHOD_LABELS[p.method]}
                {p.reference ? ` · Ref ${p.reference}` : ""}
              </p>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
