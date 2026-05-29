import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const host = request.headers.get('host') || '';
  const hostname = host.split(':')[0]; // remove port for local dev

  // In development, skip subdomain check
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return NextResponse.next();
  }

  const platformDomain = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN || 'kioscify.com';
  const parts = hostname.replace(`.${platformDomain}`, '').split('.');
  const subdomain = parts.length === 1 ? parts[0] : null;

  // Reserved subdomains — not company portals
  const reserved = ['www', 'platform', 'api', 'store'];
  if (!subdomain || reserved.includes(subdomain)) {
    return NextResponse.redirect(new URL('/invalid-subdomain', request.url));
  }

  // Pass subdomain info via header for server components
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-company-slug', subdomain);

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ['/((?!_next|api|favicon.ico|invalid-subdomain).*)'],
};
