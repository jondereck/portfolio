import { NextResponse } from 'next/server';
import { getAdminSettings } from '@/lib/server/admin-settings';
import { toErrorResponse } from '@/lib/server/api-responses';
import { toAuthErrorResponse } from '@/lib/auth/responses';
import { requireAuthActor } from '@/lib/auth/session';

export async function GET(request: Request) {
  try {
    await requireAuthActor(request);
    const { integrations } = await getAdminSettings();
    return NextResponse.json({
      defaultGalleryView: integrations.defaultGalleryView === 'compact' ? 'compact' : 'cinematic',
      blurUnclothyGenerated: integrations.blurUnclothyGenerated !== false,
    });
  } catch (error) {
    const authError = toAuthErrorResponse(error);
    if (authError) {
      return authError;
    }
    return toErrorResponse(error, 'Unable to load gallery settings.');
  }
}
