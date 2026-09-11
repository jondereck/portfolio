import { NextResponse } from 'next/server';
import { canAccessAdminModuleAction } from '@/lib/auth/module-access';
import { toAuthErrorResponse } from '@/lib/auth/responses';
import { canAccessProfile, resolveRequestActor } from '@/lib/auth/session';
import { isRateLimited } from '@/lib/server/rate-limit';
import { toErrorResponse } from '@/lib/server/api-responses';
import { resolveManagedProfileFromRequest } from '@/lib/profile/resolve-profile';
import { parseMultipartOrJson } from '@/lib/server/request-parsing';
import { bulkPhotoBlurOverrideSchema, gallerySortSchema, photoCreateSchema } from '@/src/modules/gallery/contracts';
import { galleryService } from '@/src/modules/gallery/services/galleryService';

type RouteContext = { params: Promise<{ id: string }> };

const parseId = (value: string) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id: idParam } = await context.params;
    const albumId = parseId(idParam);
    if (!albumId) {
      return NextResponse.json({ error: 'Invalid album id' }, { status: 400 });
    }

    const url = new URL(request.url);
    const sort = gallerySortSchema.parse(url.searchParams.get('sort') ?? 'custom');
    const shareToken = url.searchParams.get('share')?.trim() ?? '';

    if (shareToken) {
      const sharedResult = await galleryService.listSharedAlbumPhotos(albumId, shareToken, sort);
      if (!sharedResult) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }

      const actor = await resolveRequestActor(request);
      const isOwner = Boolean(actor && canAccessProfile(actor, sharedResult.album.profileId));
      return NextResponse.json({ ...sharedResult, accessMode: isOwner ? 'owner' : 'shared' });
    }

    // Private gallery: authenticated owner/admin only when no share token is provided.
    const { profile } = await resolveManagedProfileFromRequest(request);
    const ownedResult = await galleryService.listAlbumPhotos(albumId, profile.id, sort, true);
    if (!ownedResult) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ ...ownedResult, accessMode: 'owner' });
  } catch (error) {
    const authError = toAuthErrorResponse(error);
    if (authError) {
      return authError;
    }
    return toErrorResponse(error, 'Unable to load album photos.');
  }
}

export async function POST(request: Request, context: RouteContext) {
  if (await isRateLimited(request, 'admin-mutation', 120, 60_000)) {
    return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });
  }

  try {
    const { data, imageFile } = await parseMultipartOrJson(request);
    const { actor, profile } = await resolveManagedProfileFromRequest(request, data);
    if (!(await canAccessAdminModuleAction(actor.user.role, 'gallery', 'createUpdate'))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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
    const created = imageFile
      ? await galleryService.addUploadedAlbumPhoto(albumId, {
          file: imageFile,
          input: photoCreateSchema.omit({ imageUrl: true }).parse({
            ...data,
            sourceType: data.sourceType || 'upload',
          }),
        })
      : await galleryService.addAlbumPhoto(
          albumId,
          photoCreateSchema.parse({
            ...data,
            imageUrl: typeof data.imageUrl === 'string' ? data.imageUrl : '',
            cloudinaryPublicId: typeof data.cloudinaryPublicId === 'string' ? data.cloudinaryPublicId : undefined,
            sourceType: data.sourceType || 'upload',
          }),
        );

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    const authError = toAuthErrorResponse(error);
    if (authError) {
      return authError;
    }
    return toErrorResponse(error, 'Unable to add photo.');
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  if (await isRateLimited(request, 'admin-mutation', 120, 60_000)) {
    return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const parsedBody = bulkPhotoBlurOverrideSchema.parse(body);
    const { actor, profile } = await resolveManagedProfileFromRequest(request, body);
    if (!(await canAccessAdminModuleAction(actor.user.role, 'gallery', 'createUpdate'))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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

    const updated = await galleryService.updateAlbumPhotosBlurOverride(
      albumId,
      parsedBody.photoIds,
      parsedBody.blurOverride,
    );

    return NextResponse.json({ photos: updated });
  } catch (error) {
    const authError = toAuthErrorResponse(error);
    if (authError) {
      return authError;
    }
    return toErrorResponse(error, 'Unable to update photos.');
  }
}
