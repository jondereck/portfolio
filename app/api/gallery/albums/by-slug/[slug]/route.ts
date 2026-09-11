import { NextResponse } from 'next/server';
import { toErrorResponse } from '@/lib/server/api-responses';
import { toAuthErrorResponse } from '@/lib/auth/responses';
import { resolveManagedProfileFromRequest } from '@/lib/profile/resolve-profile';
import { galleryService } from '@/src/modules/gallery/services/galleryService';

type RouteContext = { params: Promise<{ slug: string }> };

/**
 * Private gallery: album-by-slug requires an authenticated owner/admin actor.
 * Anonymous public reads are intentionally disabled; use share tokens instead.
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const { profile } = await resolveManagedProfileFromRequest(request);
    const { slug } = await context.params;
    const album = await galleryService.getAlbumBySlug(slug, profile.id, true);
    if (!album) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({
      ...album,
      accessMode: 'owner',
    });
  } catch (error) {
    const authError = toAuthErrorResponse(error);
    if (authError) {
      return authError;
    }
    return toErrorResponse(error, 'Unable to load album.');
  }
}
