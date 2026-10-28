"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { useBilling } from "@/contexts/BillingContext";
import { PayNowModal } from "./PayNowModal";

/** Global due banner. It can be collapsed for the session, never dismissed. */
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
