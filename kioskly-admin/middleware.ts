import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const host = request.headers.get('host') || '';
  const hostname = host.split(':')[0];

  // Plain localhost in dev — skip subdomain logic
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return NextResponse.next();
  }

  const platformDomain = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN || 'kioscify.com';
  const genericStore = `store.${platformDomain}`;
  const storeSuffix = `.store.${platformDomain}`;

  // Generic portal (store.<domain>) — pass through, no company context
  if (hostname === genericStore) {
    return NextResponse.next();
  }

  // Must end with .store.<domain> — anything else isn't a valid store portal URL
  if (!hostname.endsWith(storeSuffix)) {
    return NextResponse.redirect(new URL('/invalid-subdomain', request.url));
  }

  const companySubdomain = hostname.slice(0, hostname.length - storeSuffix.length);

  if (!companySubdomain) {
    return NextResponse.next();
  }

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';
  try {
    const res = await fetch(`${apiUrl}/companies/validate-subdomain/${companySubdomain}`, {
      cache: 'no-store',
    });
    const data = await res.json();

    if (!data.valid || !data.isActive) {
      // Unknown or inactive company — redirect to generic portal
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.hostname = genericStore;
      redirectUrl.pathname = '/login';
      return NextResponse.redirect(redirectUrl);
    }
  } catch {
    // API unreachable — let through so users aren't locked out during downtime
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-company-slug', companySubdomain);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ['/((?!_next|api|favicon.ico|invalid-subdomain).*)'],
};
