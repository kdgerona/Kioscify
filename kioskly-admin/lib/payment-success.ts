"use client";

import { useCallback, useEffect, useState } from "react";

export interface PaymentSuccess {
  invoiceId: string;
  invoiceNumber: string;
  amountCentavos: number;
}

const KEY = "kioscify_payment_success";
const EVENT = "kioscify:payment-success";

/** Reads the notice handed over by a full-page reload, once: a later refresh won't show it again. */
function take(): PaymentSuccess | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return raw ? (JSON.parse(raw) as PaymentSuccess) : null;
  } catch {
    return null;
  }
}

/**
 * Raises the app-level "Payment successful" notice. The screen that saw the
 * payment often goes away right after it (the due banner hides, the overdue
 * screen unlocks), so PaymentSuccessModal in the app shell shows it instead.
 * Resubscribe does a full reload into the dashboard, so the notice is also
 * handed over through sessionStorage for that one load.
 */
export function announcePayment(payment: PaymentSuccess) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(payment));
  } catch {
    // storage unavailable: the event below still shows it on this page
  }
  window.dispatchEvent(new CustomEvent<PaymentSuccess>(EVENT, { detail: payment }));
}

export function usePaymentSuccess(): [PaymentSuccess | null, () => void] {
  const [payment, setPayment] = useState<PaymentSuccess | null>(null);

  useEffect(() => {
    const handedOver = take();
    if (handedOver) setPayment(handedOver);
    const onAnnounce = (e: Event) => setPayment((e as CustomEvent<PaymentSuccess>).detail);
    window.addEventListener(EVENT, onAnnounce);
    return () => window.removeEventListener(EVENT, onAnnounce);
  }, []);

  const dismiss = useCallback(() => setPayment(null), []);

  return [payment, dismiss];
}
