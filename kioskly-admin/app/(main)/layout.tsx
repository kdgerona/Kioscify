'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { api } from '@/lib/api';
import { useTenant } from '@/contexts/TenantContext';
import type { AccountStatus } from '@/types';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [accountStatus, setAccountStatus] = useState<AccountStatus | null>(null);
  const { brand, tenant } = useTenant();

  const isAccountStatusRoute = pathname === '/account-status';

  useEffect(() => {
    const token = api.getToken();
    if (!token) {
      router.push('/login');
      return;
    }

    const userStr = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
    if (!userStr) {
      router.push('/login');
      return;
    }

    const user = JSON.parse(userStr);

    const allowedRoles = ['STORE_ADMIN', 'ADMIN'];
    if (!allowedRoles.includes(user.role)) {
      api.logout();
      return;
    }

    if (user.mustChangePassword || user.isFirstLogin) {
      router.push('/change-password');
      return;
    }

    // Post-login / session-restore account-status check — this must run
    // regardless of which route under (main)/ the user landed on, since the
    // gating effect below only acts once `accountStatus` is known. `loading`
    // is intentionally NOT cleared until this settles: it is the single gate
    // that keeps every sibling (main)/ route (children) from rendering
    // before we know the account is ACTIVE. Clearing it earlier (before this
    // fetch resolves) would let a GRACE_PERIOD/DEACTIVATED user's browser
    // paint the real protected page for one render before the redirect
    // effect below has a chance to fire.
    api
      .getAccountStatus()
      .then(res => setAccountStatus(res.status))
      .catch(() => {
        // A 401 (DEACTIVATED account) is already handled by the axios
        // interceptor's existing force-logout behavior; anything else fails
        // open so a transient error doesn't lock users out. `accountStatus`
        // stays null, which the redirect effect below treats as "nothing to
        // gate" and the render logic below treats as "allowed".
      })
      .finally(() => setLoading(false));
  }, [router]);

  // Gate every route under (main)/ behind an ACTIVE account status. Runs on
  // every navigation (not just mount) because this layout persists across
  // client-side route changes — a sibling route becoming the active
  // `children` re-renders this component via `usePathname()` changing, which
  // is what re-triggers this check.
  useEffect(() => {
    if (accountStatus && accountStatus !== 'ACTIVE' && !isAccountStatusRoute) {
      router.replace('/account-status');
    } else if (accountStatus === 'ACTIVE' && isAccountStatusRoute) {
      // Account was reactivated (or this was reached directly) — no reason
      // to keep the user parked on the status page.
      router.replace('/dashboard');
    }
  }, [accountStatus, isAccountStatusRoute, pathname, router]);

  const primaryColor = brand?.themeColors?.primary ?? tenant?.themeColors?.primary ?? '#ea580c';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto" style={{ borderBottomColor: primaryColor }} />
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // The account-status page renders full-bleed, without the sidebar-bearing
  // app shell — it's reachable precisely when no other (main)/ route is,
  // so it shouldn't offer navigation back into the gated app via the sidebar.
  if (isAccountStatusRoute) {
    return <>{children}</>;
  }

  // `loading` being false only tells us the account-status fetch has
  // settled — it does not by itself mean we're clear to render `children`.
  // If the fetch resolved to a non-ACTIVE status, the effect above has just
  // been scheduled to call router.replace('/account-status'), but that
  // navigation completes on its own tick. Without this check, this render
  // (with the now-known accountStatus, pre-redirect) would paint the actual
  // protected page for a frame. Keep showing the spinner until the redirect
  // takes effect and `pathname`/`isAccountStatusRoute` catches up.
  if (accountStatus && accountStatus !== 'ACTIVE') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto" style={{ borderBottomColor: primaryColor }} />
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex h-screen bg-gray-100"
      style={{ '--brand-primary': primaryColor } as React.CSSProperties}
    >
      <Sidebar />
      <main className="flex-1 overflow-auto w-full">
        <div className="pt-16 lg:pt-0">{children}</div>
      </main>
    </div>
  );
}
