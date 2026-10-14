import { NextResponse } from 'next/server';
import { z } from 'zod';
import { canAccessAdminModuleAction } from '@/lib/auth/module-access';
import { toAuthErrorResponse } from '@/lib/auth/responses';
import { resolveManagedProfileFromRequest } from '@/lib/profile/resolve-profile';
import { getCloudinaryFolderPath } from '@/lib/server/admin-settings';
import { toErrorResponse } from '@/lib/server/api-responses';
import { createFormErrorResponse } from '@/lib/server/form-responses';
import { createPresignedUpload, isObjectStorageConfigured } from '@/lib/server/object-storage';
import { isRateLimited } from '@/lib/server/rate-limit';
import { RequestValidationError } from '@/lib/server/uploads';

export const runtime = 'nodejs';

const bodySchema = z.object({
  filename: z.string().trim().min(1).max(300),
  contentType: z.string().trim().min(1).max(120),
  folder: z.string().trim().max(300).optional(),
});

export async function POST(request: Request) {
  if (await isRateLimited(request, 'admin-mutation', 120, 60_000)) {
    return createFormErrorResponse({ error: 'Too many requests. Try again later.', errorCode: 'RATE_LIMITED' }, 429);
  }

  try {
    const { actor } = await resolveManagedProfileFromRequest(request);
    const canPortfolio = await canAccessAdminModuleAction(actor.user.role, 'portfolio', 'createUpdate');
    const canGallery = await canAccessAdminModuleAction(actor.user.role, 'gallery', 'createUpdate');
    if (!canPortfolio && !canGallery) {
      return createFormErrorResponse({ error: 'You are not allowed to upload media.', errorCode: 'FORBIDDEN' }, 403);
    }

    if (!isObjectStorageConfigured()) {
      throw new RequestValidationError(
        'Neon Object Storage is not configured.',
        500,
        undefined,
        'OBJECT_STORAGE_NOT_CONFIGURED',
      );
    }

    const json = await request.json().catch(() => null);
    const parsed = bodySchema.parse(json);
    const folder =
      parsed.folder?.trim() ||
      (await getCloudinaryFolderPath('uploads'));

    const signed = await createPresignedUpload({
      folder,
      contentType: parsed.contentType,
      filename: parsed.filename,
    });

    return NextResponse.json({
      provider: signed.provider,
      storageKey: signed.storageKey,
      uploadUrl: signed.uploadUrl,
      publicUrl: signed.publicUrl,
      contentType: signed.contentType,
      bucket: signed.bucket,
    });
  } catch (error) {
    const authError = toAuthErrorResponse(error);
    if (authError) {
      return authError;
    }
    return toErrorResponse(error, 'Unable to create upload URL.');
  }
}
