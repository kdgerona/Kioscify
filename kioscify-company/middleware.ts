import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

  // Maintenance check — runs first, before any routing logic
  if (pathname !== '/maintenance') {
    try {
      const res = await fetch(`${apiUrl}/platform/maintenance-status`, { cache: 'no-store' });
      if (res.ok) {
        const { companyPortalMaintenance } = await res.json();
        if (companyPortalMaintenance) {
          return NextResponse.rewrite(new URL('/maintenance', request.url));
        }
      }
    } catch {
      // fail open — API unreachable, let request through
    }
  }

  const host = request.headers.get('host') || '';
  const hostname = host.split(':')[0];

  // In development, skip subdomain check
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return NextResponse.next();
  }

  const platformDomain = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN || 'kioscify.com';
  const domainSuffix = `.${platformDomain}`;

  if (!hostname.endsWith(domainSuffix)) {
    return NextResponse.redirect(new URL('/invalid-subdomain', request.url));
  }

  const subdomain = hostname.slice(0, hostname.length - domainSuffix.length) || null;

  // Reserved subdomains — not company portals
  const reserved = ['www', 'platform', 'api', 'store'];
  if (!subdomain || reserved.includes(subdomain)) {
    return NextResponse.redirect(new URL('/invalid-subdomain', request.url));
  }

  // Store portal subdomains (<company>.store.<domain>) — not handled by company portal.
  // In production nginx routes these to the store frontend before they reach here.
  // In local dev they may arrive here if the dev proxy is misconfigured.
  if (subdomain.includes('.')) {
    return NextResponse.redirect(new URL('/invalid-subdomain', request.url));
  }

  // 'company' is the generic fallback — always pass through, no company context
  if (subdomain === 'company') {
    return NextResponse.next();
  }

  // Validate all other subdomains against the database
  try {
    const res = await fetch(`${apiUrl}/companies/validate-subdomain/${subdomain}`, {
      cache: 'no-store',
    });
    const data = await res.json();

    // Fully deactivated (past its grace period) — show the static
    // account-deactivated page instead of routing to /login. GRACE_PERIOD
    // does not hit this branch — it falls through to the existing
    // !isActive handling below, unchanged from today's behavior.
    if (data.accountStatus === 'DEACTIVATED' && pathname !== '/account-deactivated') {
      return NextResponse.rewrite(new URL('/account-deactivated', request.url));
    }

    if (!data.valid) {
      // Unknown or fully-deactivated company (DEACTIVATED was already
      // handled above) — redirect to the generic portal. GRACE_PERIOD
      // companies have data.valid: true (isActive is false but they should
      // still render their branded subdomain normally — the post-login
      // (main) layout gate is what routes them to /account-status).
      // Clone the incoming URL so the redirect inherits the correct protocol and port.
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.hostname = `company.${platformDomain}`;
      redirectUrl.pathname = '/login';
      return NextResponse.redirect(redirectUrl);
    }
  } catch {
    // API unreachable — let through so users aren't locked out during downtime
  }

  // Valid company subdomain — pass slug to server components via header
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-company-slug', subdomain);

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ['/((?!_next|api|favicon\\.ico|logo\\.png|logo-full\\.png|invalid-subdomain).*)'],
};
