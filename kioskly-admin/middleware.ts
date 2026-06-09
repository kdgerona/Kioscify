import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

  // Maintenance check
  if (pathname !== '/maintenance') {
    try {
      const res = await fetch(`${apiUrl}/platform/maintenance-status`, { cache: 'no-store' })
      if (res.ok) {
        const { storePortalMaintenance } = await res.json()
        if (storePortalMaintenance) {
          return NextResponse.rewrite(new URL('/maintenance', request.url))
        }
      }
    } catch {
      // fail open — API unreachable, let request through
    }
  }

  // Match /<companySlug>/<brandSlug> or /<companySlug>/<brandSlug>/<storeSlug> or /<companySlug>/<brandSlug>/<storeSlug>/<rest>
  const match = pathname.match(/^\/([a-z0-9-]+)\/([a-z0-9-]+)(?:\/([a-z0-9-]+))?(\/.*)?$/);

  // No match — /login, /dashboard, /_next, etc. — pass through unchanged
  if (!match) {
    return NextResponse.next();
  }

  const [, companySlug, brandSlug, storeSlug, rest] = match;
  try {
    const res = await fetch(
      `${apiUrl}/brands/validate-subdomain?companySlug=${encodeURIComponent(companySlug)}&brandSlug=${encodeURIComponent(brandSlug)}`,
      { cache: 'no-store' }
    );
    const data = await res.json();

    if (!data.valid) {
      // Unknown or inactive company/brand — send to generic login
      return NextResponse.redirect(new URL('/login', request.url));
    }
  } catch {
    // API unreachable — let through so users aren't locked out during downtime
  }

  // Rewrite to internal route, preserving company+brand context via headers
  const rewriteUrl = request.nextUrl.clone();
  rewriteUrl.pathname = rest || '/login';

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-company-slug', companySlug);
  requestHeaders.set('x-brand-slug', brandSlug);
  if (storeSlug) requestHeaders.set('x-store-slug', storeSlug);

  return NextResponse.rewrite(rewriteUrl, { request: { headers: requestHeaders } });
}

export const config = {
  matcher: ['/((?!_next|api|favicon\\.ico|logo\\.png|logo-full\\.png).*)'],
};
