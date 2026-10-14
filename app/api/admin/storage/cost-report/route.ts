import { NextResponse } from 'next/server';
import { canAccessAdminModuleAction } from '@/lib/auth/module-access';
import { toAuthErrorResponse } from '@/lib/auth/responses';
import { resolveManagedProfileFromRequest } from '@/lib/profile/resolve-profile';
import { toErrorResponse } from '@/lib/server/api-responses';
import { createFormErrorResponse } from '@/lib/server/form-responses';
import { isRateLimited } from '@/lib/server/rate-limit';
import { buildStorageCostReport } from '@/lib/server/storage-cost-report';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  if (await isRateLimited(request, 'admin-read', 60, 60_000)) {
    return createFormErrorResponse({ error: 'Too many requests. Try again later.', errorCode: 'RATE_LIMITED' }, 429);
  }

  try {
    const { actor } = await resolveManagedProfileFromRequest(request);
    const canGallery = await canAccessAdminModuleAction(actor.user.role, 'gallery', 'view');
    const canPortfolio = await canAccessAdminModuleAction(actor.user.role, 'portfolio', 'view');
    if (!canGallery && !canPortfolio) {
      return createFormErrorResponse({ error: 'Forbidden.', errorCode: 'FORBIDDEN' }, 403);
    }

    const report = await buildStorageCostReport();
    return NextResponse.json({ report });
  } catch (error) {
    const authError = toAuthErrorResponse(error);
    if (authError) {
      return authError;
    }
    return toErrorResponse(error, 'Unable to build storage cost report.');
  }
}
