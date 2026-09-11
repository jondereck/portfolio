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

  try {
    const registered = await isRegisteredSignInEmail(email);
    if (!registered) {
      return NextResponse.json(
        {
          error: 'This email is not registered. Create an account first or use Google sign-in.',
          errorCode: 'EMAIL_NOT_REGISTERED',
        },
        { status: 404 },
      );
    }

    const result = await auth.emailOtp.sendVerificationOtp({
      email,
      type: 'sign-in',
    });

    if (result?.error) {
      const mapped = mapNeonAuthError(result.error, 'send-code');
      return NextResponse.json(mapped.body, { status: mapped.status });
    }

    return NextResponse.json({ ok: true, message: 'A sign-in code has been sent to your email.' });
  } catch (error) {
    const mapped = mapNeonAuthError(error, 'send-code');
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
