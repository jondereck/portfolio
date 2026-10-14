import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getNeonAuth, getNeonAuthConfigError } from '@/lib/auth/neon-server';
import { mapNeonAuthError, normalizeEmail, normalizeOtp } from '@/lib/auth/neon-route-helpers';
import { normalizeProtectedPath } from '@/lib/auth/redirects';
import { issueAdminAccessCookie } from '@/lib/server/admin-session';

const verifyCodeSchema = z.object({
  callbackUrl: z.string().trim().optional(),
  email: z.string().trim().email().max(120),
  otp: z.string().trim().min(4).max(12),
});

export async function POST(request: Request) {
  const auth = getNeonAuth();
  if (!auth) {
    return NextResponse.json(
      { error: getNeonAuthConfigError() ?? 'Neon Auth is not configured.', errorCode: 'NEON_NOT_CONFIGURED' },
      { status: 503 },
    );
  }

  const parsed = verifyCodeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Provide your email and code.', errorCode: 'INVALID_VERIFY_CODE_PAYLOAD' }, { status: 400 });
  }

  const origin = new URL(request.url).origin;
  const redirectTo = normalizeProtectedPath(parsed.data.callbackUrl, origin) ?? '/admin';

  try {
    const handler = auth.handler();
    const proxyHeaders = new Headers(request.headers);
    proxyHeaders.set('content-type', 'application/json');

    const proxyRequest = new Request(new URL('/api/neon-auth/sign-in/email-otp', request.url), {
      method: 'POST',
      headers: proxyHeaders,
      body: JSON.stringify({
        email: normalizeEmail(parsed.data.email),
        otp: normalizeOtp(parsed.data.otp),
      }),
    });

    const proxyResponse = await handler.POST(proxyRequest, {
      params: Promise.resolve({ path: ['sign-in', 'email-otp'] }),
    });

    const proxyPayload = await proxyResponse.json().catch(() => null);
    if (!proxyResponse.ok) {
      const mapped = mapNeonAuthError(proxyPayload, 'verify-code');
      const outgoing = NextResponse.json(mapped.body, { status: mapped.status });
      for (const setCookie of proxyResponse.headers.getSetCookie()) {
        outgoing.headers.append('set-cookie', setCookie);
      }
      return outgoing;
    }

    const outgoing = NextResponse.json({ ok: true, redirectTo });
    for (const setCookie of proxyResponse.headers.getSetCookie()) {
      outgoing.headers.append('set-cookie', setCookie);
    }
    await issueAdminAccessCookie(outgoing);
    return outgoing;
  } catch (error) {
    const mapped = mapNeonAuthError(error, 'verify-code');
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
