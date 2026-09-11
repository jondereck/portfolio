import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getNeonAuth, getNeonAuthConfigError } from '@/lib/auth/neon-server';
import { mapNeonAuthError, normalizeEmail } from '@/lib/auth/neon-route-helpers';
import { prisma } from '@/lib/prisma';

const sendCodeSchema = z.object({
  email: z.string().trim().email().max(120),
});

type NeonEmailRow = { email: string };

async function isRegisteredSignInEmail(email: string) {
  const localUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (localUser) {
    return true;
  }

  const neonUsers = await prisma.$queryRaw<NeonEmailRow[]>`
    SELECT email
    FROM neon_auth."user"
    WHERE lower(email) = ${email}
    LIMIT 1
  `;

  return neonUsers.length > 0;
}

export async function POST(request: Request) {
  const auth = getNeonAuth();
  if (!auth) {
    return NextResponse.json(
      { error: getNeonAuthConfigError() ?? 'Neon Auth is not configured.', errorCode: 'NEON_NOT_CONFIGURED' },
      { status: 503 },
    );
  }

  const parsed = sendCodeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Provide a valid email address.', errorCode: 'INVALID_SEND_CODE_PAYLOAD' }, { status: 400 });
  }

  const email = normalizeEmail(parsed.data.email);
  // Same success payload for registered and unregistered emails so callers
  // cannot enumerate admin/account existence from status/body differences.
  const genericSuccess = {
    ok: true,
    message: 'If this email is registered, a sign-in code has been sent.',
  };

  try {
    const registered = await isRegisteredSignInEmail(email);
    if (!registered) {
      return NextResponse.json(genericSuccess);
    }

    const result = await auth.emailOtp.sendVerificationOtp({
      email,
      type: 'sign-in',
    });

    if (result?.error) {
      // Avoid leaking "not found" / account existence via Neon error shapes.
      const mapped = mapNeonAuthError(result.error, 'send-code');
      if (mapped.body.errorCode === 'ACCOUNT_NOT_FOUND' || mapped.status === 404) {
        return NextResponse.json(genericSuccess);
      }
      return NextResponse.json(mapped.body, { status: mapped.status });
    }

    return NextResponse.json(genericSuccess);
  } catch (error) {
    const mapped = mapNeonAuthError(error, 'send-code');
    if (mapped.body.errorCode === 'ACCOUNT_NOT_FOUND' || mapped.status === 404) {
      return NextResponse.json(genericSuccess);
    }
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
