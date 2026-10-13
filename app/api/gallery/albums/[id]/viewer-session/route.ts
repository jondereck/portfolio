import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuthActor, canAccessProfile } from '@/lib/auth/session';
import { toAuthErrorResponse } from '@/lib/auth/responses';
import { toErrorResponse } from '@/lib/server/api-responses';
import { isRateLimited } from '@/lib/server/rate-limit';
import {
  viewerSessionUpsertSchema,
  type ViewerMode,
  type ViewerSession,
} from '@/lib/gallery/viewer-session';

type RouteContext = { params: Promise<{ id: string }> };

const parseId = (value: string) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

/**
 * Authenticated users may read/write their own viewer session when they can
 * access the album as owner/admin OR via a valid share token (cross-device resume).
 */
async function resolveAlbumForActor(request: Request, idParam: string) {
  const actor = await requireAuthActor(request);
  const id = parseId(idParam);
  if (!id) {
    return { error: NextResponse.json({ error: 'Invalid id' }, { status: 400 }) } as const;
  }

  const album = await prisma.album.findUnique({
    where: { id },
    select: {
      id: true,
      profileId: true,
      shareToken: true,
      shareLinkEnabled: true,
    },
  });
  if (!album) {
    return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) } as const;
  }

  if (canAccessProfile(actor, album.profileId)) {
    return { actor, albumId: album.id } as const;
  }

  const url = new URL(request.url);
  const shareToken = url.searchParams.get('share')?.trim() ?? '';
  if (
    shareToken &&
    album.shareLinkEnabled &&
    album.shareToken &&
    album.shareToken === shareToken
  ) {
    return { actor, albumId: album.id } as const;
  }

  return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) } as const;
}

function serializeSession(row: {
  photoIndex: number;
  viewerMode: string;
  delayMs: number;
  isPlaying: boolean;
  splitLeftIndex: number | null;
  splitRightIndex: number | null;
  updatedAt: Date;
}): ViewerSession {
  return {
    photoIndex: row.photoIndex,
    viewerMode: row.viewerMode as ViewerMode,
    delayMs: row.delayMs,
    isPlaying: row.isPlaying,
    splitLeftIndex: row.splitLeftIndex,
    splitRightIndex: row.splitRightIndex,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id: idParam } = await context.params;
    const resolved = await resolveAlbumForActor(request, idParam);
    if ('error' in resolved) {
      return resolved.error;
    }

    const row = await prisma.galleryViewerSession.findUnique({
      where: { userId_albumId: { userId: resolved.actor.user.id, albumId: resolved.albumId } },
    });

    return NextResponse.json({
      userId: resolved.actor.user.id,
      session: row ? serializeSession(row) : null,
    });
  } catch (error) {
    const authError = toAuthErrorResponse(error);
    if (authError) {
      return authError;
    }
    return toErrorResponse(error, 'Unable to load viewer session.');
  }
}

export async function PUT(request: Request, context: RouteContext) {
  if (await isRateLimited(request, 'gallery-viewer-session', 240, 60_000)) {
    return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });
  }

  try {
    const { id: idParam } = await context.params;
    const resolved = await resolveAlbumForActor(request, idParam);
    if ('error' in resolved) {
      return resolved.error;
    }

    const body = await request.json().catch(() => ({}));
    const data = viewerSessionUpsertSchema.parse(body);

    const row = await prisma.galleryViewerSession.upsert({
      where: { userId_albumId: { userId: resolved.actor.user.id, albumId: resolved.albumId } },
      create: {
        userId: resolved.actor.user.id,
        albumId: resolved.albumId,
        ...data,
      },
      update: data,
    });

    return NextResponse.json({ userId: resolved.actor.user.id, session: serializeSession(row) });
  } catch (error) {
    const authError = toAuthErrorResponse(error);
    if (authError) {
      return authError;
    }
    return toErrorResponse(error, 'Unable to save viewer session.');
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  if (await isRateLimited(request, 'gallery-viewer-session', 240, 60_000)) {
    return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });
  }

  try {
    const { id: idParam } = await context.params;
    const resolved = await resolveAlbumForActor(request, idParam);
    if ('error' in resolved) {
      return resolved.error;
    }

    await prisma.galleryViewerSession.deleteMany({
      where: { userId: resolved.actor.user.id, albumId: resolved.albumId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const authError = toAuthErrorResponse(error);
    if (authError) {
      return authError;
    }
    return toErrorResponse(error, 'Unable to clear viewer session.');
  }
}
