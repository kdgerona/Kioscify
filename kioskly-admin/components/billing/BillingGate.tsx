"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useBilling } from "@/contexts/BillingContext";
import { SubscriptionOverdueScreen } from "./SubscriptionOverdueScreen";

// Reachable while the subscription is locked: the overdue screen itself and
// the billing history / receipts (so the store can see what it owes).
function allowedWhileLocked(pathname: string): boolean {
  return pathname === "/subscription-overdue" || pathname === "/billing" || pathname.startsWith("/billing/");
}

/**
 * Subscription lock for the Store Portal. Uses the live billing status (so
 * paying unlocks without a reload) and falls back to the account-status
 * result until billing/me has loaded.
 */
export function BillingGate({
  initiallyLocked,
  primaryColor,
  children,
}: {
  initiallyLocked: boolean;
  primaryColor: string;
  children: React.ReactNode;
}) {
  const { me } = useBilling();
  const pathname = usePathname();
  const router = useRouter();
  const locked = me ? me.status.status === "LOCKED" : initiallyLocked;
  const onOverdue = pathname === "/subscription-overdue";

  useEffect(() => {
    if (locked && !allowedWhileLocked(pathname)) router.replace("/subscription-overdue");
    else if (!locked && me && onOverdue) router.replace("/dashboard");
  }, [locked, me, onOverdue, pathname, router]);

  if (onOverdue) {
    return (
      <div style={{ "--brand-primary": primaryColor } as React.CSSProperties}>
        <SubscriptionOverdueScreen />
      </div>
    );
  }

  if (locked && !allowedWhileLocked(pathname)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderBottomColor: primaryColor }} />
      </div>
    );
  }

  return <>{children}</>;
}
