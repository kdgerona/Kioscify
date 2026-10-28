"use client";

import { useState } from "react";
import { BellRing } from "lucide-react";
import { api } from "@/lib/api";
import { useBilling } from "@/contexts/BillingContext";
import { PayNowModal } from "./PayNowModal";

/** One-time notice per reminder (day 0 / 3 / 7 by default), for store admins. */
export function ReminderModal() {
  const { me, refresh } = useBilling();
  const [payOpen, setPayOpen] = useState(false);
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const reminder = me?.pendingReminder;

  if (!reminder || reminder.id === dismissedId) {
    return <PayNowModal open={payOpen} onClose={() => setPayOpen(false)} />;
  }

  const acknowledge = async (thenPay: boolean) => {
    setDismissedId(reminder.id);
    if (thenPay) setPayOpen(true);
    try {
      await api.ackBillingReminder(reminder.id);
    } finally {
      refresh();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={reminder.title}>
      <div className="bg-white text-gray-900 rounded-2xl shadow-xl w-full max-w-sm p-6 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mx-auto">
          <BellRing className="w-6 h-6 text-amber-600" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900">{reminder.title}</h2>
        <p className="text-sm text-gray-600">{reminder.body}</p>
        <div className="flex gap-2">
          <button
            onClick={() => acknowledge(false)}
            className="flex-1 min-h-[44px] py-2 border border-gray-300 rounded-lg text-sm touch-manipulation"
          >
            Later
          </button>
          <button
            onClick={() => acknowledge(true)}
            className="flex-1 min-h-[44px] py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 touch-manipulation"
          >
            Pay now
          </button>
        </div>
      </div>
    </div>
  );
}
