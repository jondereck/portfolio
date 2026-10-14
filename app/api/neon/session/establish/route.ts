import { NextResponse } from 'next/server';
import { syncNeonSessionToLocalUser } from '@/lib/auth/neon-sync';
import { normalizeProtectedPath } from '@/lib/auth/redirects';
import { consumeAdminAccessGrant } from '@/lib/server/admin-session';

/**
 * After Neon Google/OAuth lands, consume the short-lived access grant and mint
 * the admin Session TTL policy cookie. A leftover Neon session alone is not enough.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const nextPath = normalizeProtectedPath(url.searchParams.get('next'), origin) ?? '/admin';
  const loginUrl = new URL('/admin/login', origin);
  loginUrl.searchParams.set('callbackUrl', nextPath);

  try {
    const neonUser = await syncNeonSessionToLocalUser();
    if (!neonUser || neonUser.state !== 'active' || !neonUser.user) {
      if (neonUser?.state === 'pending') {
        loginUrl.searchParams.set('state', 'pending');
      } else if (neonUser?.state === 'suspended') {
        loginUrl.searchParams.set('state', 'suspended');
      }
      return NextResponse.redirect(loginUrl);
    }

    const response = NextResponse.redirect(new URL(nextPath, origin));
    const granted = await consumeAdminAccessGrant(request, response);
    if (!granted) {
      loginUrl.searchParams.set('error', 'admin-access-required');
      return NextResponse.redirect(loginUrl);
    }

    return response;
  } catch {
    loginUrl.searchParams.set('error', 'establish-failed');
    return NextResponse.redirect(loginUrl);
  }
}
