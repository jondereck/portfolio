import { NextResponse } from 'next/server';
import { z } from 'zod';
import { canAccessAdminModuleAction } from '@/lib/auth/module-access';
import { getGoogleDriveAccessTokenForUser } from '@/lib/auth/google-drive';
import { toAuthErrorResponse } from '@/lib/auth/responses';
import { getAdminSettings } from '@/lib/server/admin-settings';
import { isRateLimited } from '@/lib/server/rate-limit';
import { toErrorResponse } from '@/lib/server/api-responses';
import { resolveManagedProfileFromRequest } from '@/lib/profile/resolve-profile';
import { GoogleDriveAdapter } from '@/src/modules/gallery/adapters/googleDriveAdapter';
import { galleryService } from '@/src/modules/gallery/services/galleryService';

type RouteContext = { params: Promise<{ id: string }> };

export const maxDuration = 60;

const driveAdapter = new GoogleDriveAdapter();

const mediaIdsSchema = z.object({
  folderId: z.string().trim().min(1),
  mediaTypeFilter: z.enum(['all', 'images', 'videos']).optional().default('all'),
});

const parseId = (value: string) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

export async function POST(request: Request, context: RouteContext) {
  if (await isRateLimited(request, 'admin-mutation', 60, 60_000)) {
    return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });
  }

  try {
    const body = await request.json();
    const { actor, profile } = await resolveManagedProfileFromRequest(request, body);
    if (!(await canAccessAdminModuleAction(actor.user.role, 'gallery', 'createUpdate'))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const settings = await getAdminSettings();
    if (!settings.integrations.googleDriveImportEnabled) {
      return NextResponse.json({ error: 'Google Drive imports are disabled.' }, { status: 403 });
    }

    const { id: idParam } = await context.params;
    const albumId = parseId(idParam);
    if (!albumId) {
      return NextResponse.json({ error: 'Invalid album id' }, { status: 400 });
    }

    const album = await galleryService.getAlbumById(albumId, profile.id, true);
    if (!album) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const parsed = mediaIdsSchema.parse(body);
    const accessToken = await getGoogleDriveAccessTokenForUser(actor.user.id);
    const fileIds = await driveAdapter.listFolderMediaIds({
      accessToken,
      folderId: parsed.folderId,
      mediaTypeFilter: parsed.mediaTypeFilter,
    });

    return NextResponse.json({ fileIds, count: fileIds.length });
  } catch (error) {
    const authError = toAuthErrorResponse(error);
    if (authError) {
      return authError;
    }
    if (error instanceof Error) {
      if (error.message === 'GOOGLE_DRIVE_NOT_CONNECTED') {
        return NextResponse.json({ error: 'Connect Google Drive before importing.' }, { status: 403 });
      }
      if (error.message === 'GOOGLE_DRIVE_OAUTH_NOT_CONFIGURED') {
        return NextResponse.json({ error: 'Google Drive OAuth is not configured.' }, { status: 503 });
      }
      if (error.message === 'GOOGLE_DRIVE_RECONNECT_REQUIRED') {
        return NextResponse.json({ error: 'Google Drive access expired. Reconnect and try again.' }, { status: 403 });
      }
      if (error.message === 'GOOGLE_DRIVE_TOKEN_REFRESH_FAILED') {
        return NextResponse.json({ error: 'Unable to refresh Google Drive access. Reconnect and try again.' }, { status: 502 });
      }
      if (error.message === 'Google Drive API is not enabled for this Google Cloud project. Enable the Drive API and try again in a few minutes.') {
        return NextResponse.json({ error: error.message }, { status: 503 });
      }
      if (error.message === 'Google Drive folder not found, or the connected Google account does not have access to it.') {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
      if (error.message === 'The connected Google account does not have permission to read that Google Drive folder.') {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
      if (error.message.startsWith('Google Drive error:')) {
        return NextResponse.json({ error: error.message }, { status: 502 });
      }
    }
    return toErrorResponse(error, 'Unable to list Google Drive media.');
  }
}
