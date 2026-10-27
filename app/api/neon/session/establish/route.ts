import { NextResponse } from 'next/server';
import { syncNeonSessionToLocalUser } from '@/lib/auth/neon-sync';
import { normalizeProtectedPath } from '@/lib/auth/redirects';
import { consumeAdminAccessGrant, hasValidAdminSession } from '@/lib/server/admin-session';
import { getNeonAuth } from '@/lib/auth/neon-server';

/**
 * After Neon Google/OAuth lands, the browser arrives here with:
 *   ?neon_auth_session_verifier=<token>  (from Neon's backend redirect)
 *   __Secure-neon-auth.session_challange cookie  (set during the initial OAuth kick-off)
 *
 * Without Next.js middleware, nobody has yet exchanged the verifier for a real
 * session token. We forward it to Neon's `/get-session` handler, return the
 * resulting cookies to the browser, then make one clean follow-up request.
 * That second request can safely resolve the Neon user and consume the short-lived
 * admin-access grant.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const nextPath = normalizeProtectedPath(url.searchParams.get('next'), origin) ?? '/admin';
  const loginUrl = new URL('/admin/login', origin);
  loginUrl.searchParams.set('callbackUrl', nextPath);

  try {
    // If there is a session verifier query param, the Neon OAuth callback flow
    // has not been completed yet. Forward to the Neon proxy handler so it can
    // exchange the verifier for a real session token using next/headers cookies().
    const verifier = url.searchParams.get('neon_auth_session_verifier');
    if (verifier) {
      const auth = getNeonAuth();
      if (auth) {
        const handler = auth.handler();
        // Preserve the verifier query parameter as well as the challenge cookie.
        // `auth.handler()` is a route proxy, so it only sees query params present
        // on this internal `/api/neon-auth/get-session` request.
        const exchangeUrl = new URL('/api/neon-auth/get-session', request.url);
        exchangeUrl.search = url.search;
        const proxyRequest = new Request(exchangeUrl, {
          method: 'GET',
          headers: request.headers,
        });
        try {
          const proxyResponse = await handler.GET(proxyRequest, {
            params: Promise.resolve({ path: ['get-session'] }),
          });
          // If the exchange failed, redirect back to login.
          if (!proxyResponse.ok) {
            loginUrl.searchParams.set('error', 'oauth-exchange-failed');
            return NextResponse.redirect(loginUrl);
          }

          // The exchange response owns the new Neon session cookies. They are not
          // visible to this request's cookie jar, so send them to the browser and
          // redirect back here without the one-time verifier. The next request can
          // then resolve the user and mint the admin session cookie.
          const continueUrl = new URL('/api/neon/session/establish', origin);
          continueUrl.searchParams.set('next', nextPath);
          const response = NextResponse.redirect(continueUrl);
          for (const setCookie of proxyResponse.headers.getSetCookie()) {
            response.headers.append('set-cookie', setCookie);
          }
          return response;
        } catch {
          loginUrl.searchParams.set('error', 'oauth-exchange-failed');
          return NextResponse.redirect(loginUrl);
        }
      }
    }

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
    let granted = await consumeAdminAccessGrant(request, response);
    if (!granted && (await hasValidAdminSession(request))) {
      granted = true;
    }
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
