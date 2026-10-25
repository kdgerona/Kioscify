"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Lock, LogOut } from "lucide-react";
import { api } from "@/lib/api";
import { useBilling } from "@/contexts/BillingContext";
import { formatManilaDate, formatPeso } from "@/lib/billing-format";
import { PayNowPanel } from "./PayNowModal";

/** Full-screen lock: amount, Pay now (QR inline), billing history, log out. */
export function SubscriptionOverdueScreen() {
  const { me, loadFailed, refresh } = useBilling();

  // Poll so the store unlocks soon after paying, even from another device.
  useEffect(() => {
    const seconds = Math.max(10, me?.pollSeconds ?? 30);
    const timer = window.setInterval(refresh, seconds * 1000);
    return () => window.clearInterval(timer);
  }, [me?.pollSeconds, refresh]);

  const s = me?.status;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 text-gray-900 px-4 py-10">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-200 p-8 space-y-5">
        <div className="text-center">
          <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-7 h-7 text-red-500" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900">{me?.storeView.title || "Subscription overdue"}</h1>
          <p className="text-sm text-gray-600 mt-2">
            {me?.storeView.body ||
              (s
                ? `${formatPeso(s.amountCentavos)} was due on ${formatManilaDate(s.dueAt)}.`
                : loadFailed
                  ? "We couldn't load your billing details. Check your connection and try again."
                  : "Loading your billing details…")}
          </p>
          {!me && loadFailed && (
            <button
              onClick={() => refresh()}
              className="mt-3 text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline"
            >
              Try again
            </button>
          )}
        </div>

        {me?.canPay && !me.status.verificationPending && <PayNowPanel onPaid={refresh} />}

        <div className="flex justify-between text-sm pt-2 border-t">
          <Link href="/billing" className="font-medium text-blue-600 hover:text-blue-700 hover:underline">
            View billing
          </Link>
          <button onClick={() => api.logout()} className="flex items-center gap-1 text-gray-500 hover:text-gray-700">
            <LogOut className="w-4 h-4" /> Log out
          </button>
        </div>
      </div>
    </div>
  );
}
