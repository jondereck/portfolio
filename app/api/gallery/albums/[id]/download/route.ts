import { Readable } from 'node:stream';
import { NextResponse } from 'next/server';
import { toAuthErrorResponse } from '@/lib/auth/responses';
import { isRateLimited } from '@/lib/server/rate-limit';
import { toErrorResponse } from '@/lib/server/api-responses';
import { resolveManagedProfileFromRequest } from '@/lib/profile/resolve-profile';
import { buildAlbumZipFilename, createAlbumZipStream } from '@/lib/server/gallery-downloads';
import { galleryService } from '@/src/modules/gallery/services/galleryService';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ id: string }> };

const parseId = (value: string) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const url = new URL(request.url);
    const shareToken = url.searchParams.get('share')?.trim() ?? '';

    if (await isRateLimited(request, shareToken ? 'gallery-share-download' : 'admin-download', 40, 60_000)) {
      return NextResponse.json({ error: 'Too many download requests. Try again later.' }, { status: 429 });
    }

    const { id: idParam } = await context.params;
    const albumId = parseId(idParam);
    if (!albumId) {
      return NextResponse.json({ error: 'Invalid album id' }, { status: 400 });
    }

    if (shareToken) {
      const sharedPayload = await galleryService.getSharedAlbumDownloadPayload(albumId, shareToken);
      if (!sharedPayload) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }

      if (url.searchParams.get('manifest') === '1') {
        return NextResponse.json({
          albumId,
          slug: sharedPayload.album.slug,
          filename: buildAlbumZipFilename(sharedPayload.album.slug),
          skippedCount: sharedPayload.skippedPhotos.length,
          photos: sharedPayload.downloadablePhotos.map((photo) => ({
            id: photo.id,
            filename:
              photo.originalFilename ||
              photo.caption ||
              `media-${photo.id}`,
          })),
        });
      }

      const zip = await createAlbumZipStream(sharedPayload.downloadablePhotos);
      const filename = buildAlbumZipFilename(sharedPayload.album.slug);
      const headers = new Headers({
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Cache-Control': 'no-store',
        'X-Download-Included-Count': String(sharedPayload.downloadablePhotos.length),
        'X-Download-Skipped-Count': String(sharedPayload.skippedPhotos.length),
      });

      const stream = Readable.toWeb(zip.stream) as ReadableStream<Uint8Array>;
      return new Response(stream, { status: 200, headers });
    }

    let managedProfileId: number | null = null;
    try {
      managedProfileId = (await resolveManagedProfileFromRequest(request)).profile.id;
    } catch (managedError) {
      if (!(managedError instanceof Error) || (managedError.message !== 'UNAUTHENTICATED' && managedError.message !== 'FORBIDDEN')) {
        throw managedError;
      }
    }

    if (!managedProfileId) {
      return NextResponse.json({ error: 'Downloads are disabled for public viewers.' }, { status: 403 });
    }

    const payload = await galleryService.getAlbumDownloadPayload(albumId, managedProfileId, true);
    if (!payload) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (url.searchParams.get('manifest') === '1') {
      return NextResponse.json({
        albumId,
        slug: payload.album.slug,
        filename: buildAlbumZipFilename(payload.album.slug),
        skippedCount: payload.skippedPhotos.length,
        photos: payload.downloadablePhotos.map((photo) => ({
          id: photo.id,
          filename: photo.originalFilename || photo.caption || `media-${photo.id}`,
        })),
      });
    }

    const zip = await createAlbumZipStream(payload.downloadablePhotos);
    const filename = buildAlbumZipFilename(payload.album.slug);
    const headers = new Headers({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'no-store',
      'X-Download-Included-Count': String(payload.downloadablePhotos.length),
      'X-Download-Skipped-Count': String(payload.skippedPhotos.length),
    });

    const stream = Readable.toWeb(zip.stream) as ReadableStream<Uint8Array>;
    return new Response(stream, { status: 200, headers });
  } catch (error) {
    const authError = toAuthErrorResponse(error);
    if (authError) {
      return authError;
    }
    return toErrorResponse(error, 'Unable to download album.');
  }
}
