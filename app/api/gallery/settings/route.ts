import { NextResponse } from 'next/server';
import { canAccessAdminModuleAction } from '@/lib/auth/module-access';
import { toAuthErrorResponse } from '@/lib/auth/responses';
import { requireAuthActor } from '@/lib/auth/session';
import { getAdminSettings, updateAdminSettings } from '@/lib/server/admin-settings';
import { toErrorResponse } from '@/lib/server/api-responses';
import { isRateLimited } from '@/lib/server/rate-limit';
import { galleryCmsPreferencesSchema } from '@/lib/validators';

function toGallerySettingsPayload(integrations: Awaited<ReturnType<typeof getAdminSettings>>['integrations']) {
  const mediaFilter = integrations.galleryLastMediaFilter;
  const mediaSort = integrations.galleryLastMediaSort;
  return {
    defaultGalleryView: integrations.defaultGalleryView === 'compact' ? 'compact' : 'cinematic',
    blurUnclothyGenerated: integrations.blurUnclothyGenerated !== false,
    galleryLastMediaFilter:
      mediaFilter === 'images' || mediaFilter === 'videos' || mediaFilter === 'audio' || mediaFilter === 'nsfw'
        ? mediaFilter
        : 'all',
    galleryLastMediaSort:
      mediaSort === 'dateDesc' || mediaSort === 'dateAsc' ? mediaSort : 'custom',
    galleryLastDriveFolderSort: integrations.galleryLastDriveFolderSort === 'name' ? 'name' : 'recent',
  };
}

export async function GET(request: Request) {
  try {
    await requireAuthActor(request);
    const { integrations } = await getAdminSettings();
    return NextResponse.json(toGallerySettingsPayload(integrations));
  } catch (error) {
    const authError = toAuthErrorResponse(error);
    if (authError) {
      return authError;
    }
    return toErrorResponse(error, 'Unable to load gallery settings.');
  }
}

export async function PATCH(request: Request) {
  if (await isRateLimited(request, 'admin-mutation', 120, 60_000)) {
    return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });
  }

  try {
    const actor = await requireAuthActor(request);
    if (!(await canAccessAdminModuleAction(actor.user.role, 'gallery', 'view'))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const parsed = galleryCmsPreferencesSchema.safeParse(body);
    if (!parsed.success) {
      return toErrorResponse(parsed.error, 'Unable to save gallery preferences.');
    }

    if (
      parsed.data.galleryLastMediaFilter === undefined &&
      parsed.data.galleryLastMediaSort === undefined &&
      parsed.data.galleryLastDriveFolderSort === undefined
    ) {
      const { integrations } = await getAdminSettings({ fresh: true });
      return NextResponse.json(toGallerySettingsPayload(integrations));
    }

    const updated = await updateAdminSettings({
      integrations: parsed.data,
    });

    return NextResponse.json(toGallerySettingsPayload(updated.integrations));
  } catch (error) {
    const authError = toAuthErrorResponse(error);
    if (authError) {
      return authError;
    }
    return toErrorResponse(error, 'Unable to save gallery preferences.');
  }
}
