import { NextResponse } from 'next/server';
import { canAccessAdminModuleAction } from '@/lib/auth/module-access';
import { toAuthErrorResponse } from '@/lib/auth/responses';
import { resolveManagedProfileFromRequest } from '@/lib/profile/resolve-profile';
import { getCloudinaryFolderPath } from '@/lib/server/admin-settings';
import { isRateLimited } from '@/lib/server/rate-limit';
import { uploadMediaFile } from '@/lib/server/uploads';
import { toErrorResponse } from '@/lib/server/api-responses';
import { createFieldErrorResponse, createFormErrorResponse } from '@/lib/server/form-responses';

export const runtime = 'nodejs';

const isFile = (value: FormDataEntryValue | null): value is File => {
  return typeof File !== 'undefined' && value instanceof File;
};

export async function POST(request: Request) {
  if (await isRateLimited(request, 'admin-mutation', 120, 60_000)) {
    return createFormErrorResponse({ error: 'Too many requests. Try again later.', errorCode: 'RATE_LIMITED' }, 429);
  }

  try {
    const { actor } = await resolveManagedProfileFromRequest(request);
    if (!(await canAccessAdminModuleAction(actor.user.role, 'portfolio', 'createUpdate'))) {
      return createFormErrorResponse({ error: 'You are not allowed to upload media.', errorCode: 'FORBIDDEN' }, 403);
    }

    const formData = await request.formData();
    const fileValue = formData.get('file');

    if (!isFile(fileValue)) {
      return createFieldErrorResponse({ field: 'file', message: 'Choose a file to upload.', errorCode: 'FILE_REQUIRED' });
    }

    const uploaded = await uploadMediaFile(fileValue, await getCloudinaryFolderPath('uploads'));
    return NextResponse.json({
      secure_url: uploaded.secureUrl,
      playback_url: uploaded.playbackUrl,
      public_id: uploaded.publicId,
      resource_type: uploaded.resourceType,
      format: uploaded.format,
      bytes: uploaded.bytes,
      original_filename: uploaded.originalFilename,
      storage_provider: uploaded.storageProvider,
      storage_key: uploaded.storageKey,
    });
  } catch (error) {
    const authError = toAuthErrorResponse(error);
    if (authError) {
      return authError;
    }
    return toErrorResponse(error, 'Upload failed.');
  }
}
