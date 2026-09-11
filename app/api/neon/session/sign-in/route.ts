import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getNeonAuth, getNeonAuthConfigError } from '@/lib/auth/neon-server';
import { migrateLocalPasswordToNeonAuth } from '@/lib/auth/neon-password-sync';
import { mapNeonAuthError, resolveNeonSignInEmail } from '@/lib/auth/neon-route-helpers';
import { normalizeProtectedPath } from '@/lib/auth/redirects';

const signInSchema = z.object({
  callbackUrl: z.string().trim().optional(),
  identifier: z.string().trim().min(1).max(160),
  password: z.string().min(1).max(200),
  rememberMe: z.boolean().optional(),
});

function copyNeonAuthHeaders(from: Response, to: NextResponse) {
  for (const setCookie of from.headers.getSetCookie()) {
    to.headers.append('set-cookie', setCookie);
  }

  for (const headerName of ['set-auth-jwt', 'set-auth-token', 'x-neon-ret-request-id']) {
    const value = from.headers.get(headerName);
    if (value) {
      to.headers.set(headerName, value);
    }
  }
}

async function proxyNeonEmailSignIn(input: {
  auth: NonNullable<ReturnType<typeof getNeonAuth>>;
  request: Request;
  email: string;
  password: string;
  callbackURL: string;
  rememberMe: boolean;
}) {
  const handler = input.auth.handler();
  const proxyHeaders = new Headers(input.request.headers);
  proxyHeaders.set('content-type', 'application/json');

  const proxyRequest = new Request(new URL('/api/neon-auth/sign-in/email', input.request.url), {
    method: 'POST',
    headers: proxyHeaders,
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      callbackURL: input.callbackURL,
      rememberMe: input.rememberMe,
    }),
  });

  return handler.POST(proxyRequest, {
    params: Promise.resolve({ path: ['sign-in', 'email'] }),
  });
}

export async function POST(request: Request) {
  const auth = getNeonAuth();
  if (!auth) {
    return NextResponse.json(
      { error: getNeonAuthConfigError() ?? 'Neon Auth is not configured.', errorCode: 'NEON_NOT_CONFIGURED' },
      { status: 503 },
    );
  }

  const parsed = signInSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Provide a valid email or username and password.', errorCode: 'INVALID_SIGN_IN_PAYLOAD' },
      { status: 400 },
    );
  }

  const origin = new URL(request.url).origin;
  const redirectTo = normalizeProtectedPath(parsed.data.callbackUrl, origin) ?? '/admin';
  const callbackURL = new URL(redirectTo, origin).toString();
  const email = await resolveNeonSignInEmail(parsed.data.identifier);
  if (!email) {
    return NextResponse.json({ error: 'Invalid credentials.', errorCode: 'INVALID_CREDENTIALS' }, { status: 401 });
  }

  try {
    // Use the Neon Auth handler proxy so Origin is always set (it falls back to
    // `request.url` origin), even if the incoming request doesn't include
    // Origin/Referer headers.
    let proxyResponse = await proxyNeonEmailSignIn({
      auth,
      request,
      email,
      password: parsed.data.password,
      callbackURL,
      rememberMe: parsed.data.rememberMe ?? false,
    });

    let proxyPayload = await proxyResponse.json().catch(() => null);

    // Legacy admin password resets only updated public."User".passwordHash.
    // If Neon rejects the password but the local hash matches, sync into Neon and retry once.
    if (!proxyResponse.ok) {
      const mapped = mapNeonAuthError(proxyPayload, 'sign-in');
      if (mapped.body.errorCode === 'INVALID_CREDENTIALS') {
        const migrated = await migrateLocalPasswordToNeonAuth(email, parsed.data.password);
        if (migrated.migrated) {
          proxyResponse = await proxyNeonEmailSignIn({
            auth,
            request,
            email,
            password: parsed.data.password,
            callbackURL,
            rememberMe: parsed.data.rememberMe ?? false,
          });
          proxyPayload = await proxyResponse.json().catch(() => null);
        }
      }
    }

    if (!proxyResponse.ok) {
      const mapped = mapNeonAuthError(proxyPayload, 'sign-in');
      const body =
        mapped.body.errorCode === 'INVALID_CREDENTIALS'
          ? {
              ...mapped.body,
              error:
                'Invalid credentials. If you recently set a password in Admin Users, use Forgot password once to sync it to Neon Auth.',
            }
          : mapped.body;
      const outgoing = NextResponse.json(body, { status: mapped.status });
      copyNeonAuthHeaders(proxyResponse, outgoing);
      return outgoing;
    }

    const outgoing = NextResponse.json({ ok: true, redirectTo });
    copyNeonAuthHeaders(proxyResponse, outgoing);
    return outgoing;
  } catch (error) {
    const mapped = mapNeonAuthError(error, 'sign-in');
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
