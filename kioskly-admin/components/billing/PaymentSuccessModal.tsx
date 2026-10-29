"use client";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { formatPeso } from "@/lib/billing-format";
import { usePaymentSuccess } from "@/lib/payment-success";

/** "Payment successful" with links to the receipt and Billing. Mounted once in the app shell. */
export function PaymentSuccessModal() {
  const [payment, dismiss] = usePaymentSuccess();
  if (!payment) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Payment successful">
      <div className="bg-white text-gray-900 rounded-2xl shadow-xl w-full max-w-sm p-6 text-center space-y-4">
        <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-8 h-8 text-green-600" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-gray-900">Payment successful</h2>
          <p className="text-sm text-gray-600">
            We received {formatPeso(payment.amountCentavos)} for invoice {payment.invoiceNumber}. Your subscription is up to date.
          </p>
        </div>
        <div className="space-y-2">
          <Link
            href={`/billing/receipts/${payment.invoiceId}`}
            onClick={dismiss}
            className="flex items-center justify-center w-full min-h-[44px] rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 touch-manipulation"
          >
            View receipt
          </Link>
          <div className="flex gap-2">
            <Link
              href="/billing"
              onClick={dismiss}
              className="flex-1 flex items-center justify-center min-h-[44px] border border-gray-300 rounded-lg text-sm hover:bg-gray-50 touch-manipulation"
            >
              Go to Billing
            </Link>
            <button
              onClick={dismiss}
              className="flex-1 min-h-[44px] border border-gray-300 rounded-lg text-sm hover:bg-gray-50 touch-manipulation"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
