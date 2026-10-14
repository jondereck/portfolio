import { NextResponse } from 'next/server';
import { getNeonAuth, getNeonAuthConfigError } from '@/lib/auth/neon-server';
import { clearAdminSessionCookie } from '@/lib/server/admin-session';

export async function POST() {
  const auth = getNeonAuth();
  if (!auth) {
    return NextResponse.json(
      { error: getNeonAuthConfigError() ?? 'Neon Auth is not configured.', errorCode: 'NEON_NOT_CONFIGURED' },
      { status: 503 },
    );
  }

  try {
    const result = await auth.signOut();
    if (result?.error) {
      const failed = NextResponse.json(
        { error: result.error.message || 'Unable to sign out from Neon.', errorCode: 'NEON_SIGN_OUT_FAILED' },
        { status: 400 },
      );
      clearAdminSessionCookie(failed);
      return failed;
    }

    const outgoing = NextResponse.json({ ok: true });
    clearAdminSessionCookie(outgoing);
    return outgoing;
  } catch (error) {
    const failed = NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unable to sign out from Neon.',
        errorCode: 'NEON_SIGN_OUT_FAILED',
      },
      { status: 400 },
    );
    clearAdminSessionCookie(failed);
    return failed;
  }
}
