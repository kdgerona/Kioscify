"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, Sparkles, X } from "lucide-react";
import { useBilling } from "@/contexts/BillingContext";
import { useTenant } from "@/contexts/TenantContext";
import { manilaToday } from "@/lib/billing-format";
import type { StoreView } from "@/types";
import { PayNowModal } from "./PayNowModal";

/** Free-trial notice. Closing it hides it for the rest of the Manila day. */
function TrialBanner({ view }: { view: StoreView }) {
  const { tenant } = useTenant();
  const key = `kioscify_trial_banner_closed_${tenant?.id ?? ""}`;
  const [closed, setClosed] = useState(true);

  useEffect(() => {
    try {
      setClosed(localStorage.getItem(key) === manilaToday());
    } catch {
      setClosed(false); // storage unavailable — show it
    }
  }, [key]);

  if (closed) return null;

  const close = () => {
    setClosed(true);
    try {
      localStorage.setItem(key, manilaToday());
    } catch {
      // ignore
    }
  };

  return (
    <div className="border-b bg-blue-50 border-blue-200">
      <div className="px-4 lg:px-8 py-2.5 flex items-center gap-3">
        <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
        <div className="flex-1 min-w-0 text-sm">
          <span className="font-semibold text-gray-900">{view.title}</span>
          <span className="text-gray-700"> — {view.body}</span>
        </div>
        <button
          onClick={close}
          className="p-2 -m-1 text-gray-500 hover:text-gray-700 touch-manipulation"
          aria-label="Close notice"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

/** Global billing banner. The due banner can be collapsed for the session, never dismissed; the trial notice can be closed. */
export function BillingBanner() {
  const { me } = useBilling();
  const [collapsed, setCollapsed] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const key = `kioscify_billing_banner_collapsed_${me?.status.openInvoiceId ?? me?.status.dueAt ?? ""}`;

  useEffect(() => {
    try {
      setCollapsed(sessionStorage.getItem(key) === "1");
    } catch {
      // storage unavailable — stay expanded
    }
  }, [key]);

  if (me?.storeView.variant === "trial") return <TrialBanner view={me.storeView} />;
  if (!me || me.storeView.variant !== "banner") return null;
  const view = me.storeView;

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      sessionStorage.setItem(key, next ? "1" : "0");
    } catch {
      // ignore
    }
  };

  return (
    <>
      <div className={`border-b ${view.title.toLowerCase().includes("overdue") ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"}`}>
        <div className="px-4 lg:px-8 py-2.5 flex flex-wrap items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <div className="flex-1 min-w-0 text-sm">
            <span className="font-semibold text-gray-900">{view.title}</span>
            {!collapsed && <span className="text-gray-700"> — {view.body}</span>}
          </div>
          {view.showPayAction && (
            // Thumb-sized on phones (a small target needed several taps);
            // touch-manipulation skips the browser's double-tap-zoom wait
            <button
              onClick={() => setPayOpen(true)}
              className="min-h-[44px] px-4 py-2 rounded-md bg-red-600 text-white text-sm font-semibold shadow-sm hover:bg-red-700 touch-manipulation"
            >
              Pay now
            </button>
          )}
          <button
            onClick={toggle}
            className="p-2 -m-1 text-gray-500 hover:text-gray-700 touch-manipulation"
            aria-label={collapsed ? "Expand notice" : "Collapse notice"}
          >
            {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>
      <PayNowModal open={payOpen} onClose={() => setPayOpen(false)} />
    </>
  );
}
