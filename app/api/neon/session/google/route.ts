import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getNeonAuth, getNeonAuthConfigError } from '@/lib/auth/neon-server';
import { getNeonResultData, mapNeonAuthError } from '@/lib/auth/neon-route-helpers';
import { normalizeProtectedPath } from '@/lib/auth/redirects';
import { setAdminAccessGrantCookie } from '@/lib/server/admin-session';

const googleSchema = z.object({
  callbackUrl: z.string().trim().optional(),
  mode: z.enum(['sign-in', 'sign-up']).optional(),
});

export async function POST(request: Request) {
  const auth = getNeonAuth();
  if (!auth) {
    return NextResponse.json(
      { error: getNeonAuthConfigError() ?? 'Neon Auth is not configured.', errorCode: 'NEON_NOT_CONFIGURED' },
      { status: 503 },
    );
  }

  const parsed = googleSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid Google auth request.', errorCode: 'INVALID_GOOGLE_PAYLOAD' }, { status: 400 });
  }

  const origin = new URL(request.url).origin;
  const callbackPath = normalizeProtectedPath(parsed.data.callbackUrl, origin) ?? '/admin';
  // Land on establish so Session TTL / Force Logout policy cookie is minted for Google.
  const establishUrl = new URL('/api/neon/session/establish', origin);
  establishUrl.searchParams.set('next', callbackPath);
  const callbackURL = establishUrl.toString();

  try {
    // Use the Neon Auth proxy handler and forward Set-Cookie headers.
    // OAuth flows often rely on state/PKCE cookies; dropping them prevents the
    // redirect/callback from completing.
    const handler = auth.handler();
    const proxyHeaders = new Headers(request.headers);
    proxyHeaders.set('content-type', 'application/json');

    const proxyRequest = new Request(new URL('/api/neon-auth/sign-in/social', request.url), {
      method: 'POST',
      headers: proxyHeaders,
      body: JSON.stringify({
        provider: 'google',
        callbackURL,
        disableRedirect: true,
        requestSignUp: parsed.data.mode === 'sign-up',
      }),
    });

    const proxyResponse = await handler.POST(proxyRequest, {
      params: Promise.resolve({ path: ['sign-in', 'social'] }),
    });

    const proxyPayload = await proxyResponse.json().catch(() => null);
    if (!proxyResponse.ok) {
      const mapped = mapNeonAuthError(proxyPayload, 'google');
      const outgoing = NextResponse.json(mapped.body, { status: mapped.status });
      for (const setCookie of proxyResponse.headers.getSetCookie()) {
        outgoing.headers.append('set-cookie', setCookie);
      }
      return outgoing;
    }

    const data = getNeonResultData<{ url?: string }>({ data: proxyPayload, error: null });
    if (!data?.url) {
      const outgoing = NextResponse.json(
        { error: 'Unable to start Google sign-in.', errorCode: 'GOOGLE_REDIRECT_MISSING' },
        { status: 400 },
      );
      for (const setCookie of proxyResponse.headers.getSetCookie()) {
        outgoing.headers.append('set-cookie', setCookie);
      }
      return outgoing;
    }

    const outgoing = NextResponse.json({ ok: true, redirectTo: data.url });
    for (const setCookie of proxyResponse.headers.getSetCookie()) {
      outgoing.headers.append('set-cookie', setCookie);
    }
    await setAdminAccessGrantCookie(outgoing);
    return outgoing;
  } catch (error) {
    const mapped = mapNeonAuthError(error, 'google');
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
