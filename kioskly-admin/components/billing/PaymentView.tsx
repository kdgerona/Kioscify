"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Copy, Mail, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { formatCountdown, formatPeso } from "@/lib/billing-format";
import type { PayResult } from "@/types";
import { ClaimForm } from "./ClaimForm";

const SUPPORT_EMAIL = "support@kioscify.com";

/**
 * Renders one Pay now result: a PayMongo QRPH code (with countdown, refresh
 * and a payment-status poll), the owner's fallback bank QR, or an
 * "unavailable" notice. Shared by the Pay now modal, the overdue page and
 * the public /pay/<token> page.
 */
export function PaymentView({
  result,
  pollSeconds,
  pollStatus,
  onRefresh,
  onPaid,
  allowClaim,
}: {
  result: PayResult;
  pollSeconds: number;
  pollStatus: () => Promise<{ paid: boolean }>;
  onRefresh: () => Promise<void>;
  onPaid: () => void;
  allowClaim: boolean;
}) {
  const [now, setNow] = useState(Date.now());
  const [paid, setPaid] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (result.kind !== "paymongo") return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [result.kind]);

  useEffect(() => {
    if (result.kind === "unavailable" || paid) return;
    const poll = window.setInterval(async () => {
      try {
        const res = await pollStatus();
        if (res.paid) {
          setPaid(true);
          onPaid();
        }
      } catch {
        // keep polling; a transient error must not stop the unlock
      }
    }, Math.max(5, pollSeconds) * 1000);
    return () => window.clearInterval(poll);
  }, [result.kind, paid, pollSeconds, pollStatus, onPaid]);

  if (paid) {
    return (
      <div className="py-8 text-center space-y-2">
        <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto" />
        <p className="font-semibold text-gray-900">Payment received — thank you!</p>
        <p className="text-sm text-gray-500">Your subscription is up to date.</p>
      </div>
    );
  }

  if (result.kind === "unavailable") {
    return (
      <div className="py-6 text-center space-y-3">
        <p className="text-sm text-gray-600">{result.message}</p>
        <a
          href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Subscription payment ${result.invoiceNumber}`)}`}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800"
        >
          <Mail className="w-4 h-4" />
          {SUPPORT_EMAIL}
        </a>
      </div>
    );
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(result.payUrl);
      toast.success("Pay link copied");
    } catch {
      toast.error("Could not copy the link");
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  if (result.kind === "fallback") {
    return (
      <div className="space-y-4">
        <div className="text-center space-y-2">
          <p className="text-sm text-gray-600">Scan with GCash, Maya or any bank app and send exactly</p>
          <p className="text-2xl font-bold text-gray-900">{formatPeso(result.amountCentavos)}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={result.fallbackQrImageUrl} alt="Bank QR code" className="w-56 h-56 object-contain mx-auto border rounded-lg bg-white" />
          {result.accountName && <p className="text-sm font-medium text-gray-800">{result.accountName}</p>}
          {result.instructions && <p className="text-xs text-gray-500 whitespace-pre-line">{result.instructions}</p>}
        </div>
        {allowClaim ? (
          <ClaimForm invoiceId={result.invoiceId} amountCentavos={result.amountCentavos} />
        ) : (
          <p className="text-xs text-gray-500 text-center">
            After paying, a store admin submits &ldquo;I&apos;ve paid&rdquo; in the Store Portal or Kiosk app so Kioscify can confirm it.
          </p>
        )}
      </div>
    );
  }

  const remaining = new Date(result.expiresAt).getTime() - now;
  const expired = remaining <= 0;

  return (
    <div className="space-y-4 text-center">
      <p className="text-sm text-gray-600">Scan with GCash, Maya or any bank app</p>
      <p className="text-2xl font-bold text-gray-900">{formatPeso(result.amountCentavos)}</p>
      <div className="relative w-56 h-56 mx-auto">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={result.qrImage}
          alt="QR Ph payment code"
          className={`w-56 h-56 object-contain border rounded-lg bg-white ${expired ? "opacity-20" : ""}`}
        />
        {expired && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm font-medium text-gray-700">QR expired</span>
          </div>
        )}
      </div>
      <p className="text-xs text-gray-500">
        {expired ? "This code has expired." : `Expires in ${formatCountdown(remaining)} · Invoice ${result.invoiceNumber}`}
      </p>
      <div className="flex justify-center gap-2">
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          {expired ? "Get a new QR" : "Refresh"}
        </button>
        <button
          type="button"
          onClick={copyLink}
          className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          <Copy className="w-4 h-4" />
          Copy pay link
        </button>
      </div>
      <p className="text-xs text-gray-400">This page updates automatically once your payment goes through.</p>
    </div>
  );
}
