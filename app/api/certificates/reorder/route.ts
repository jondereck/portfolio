import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { canAccessAdminModuleAction } from '@/lib/auth/module-access';
import { toAuthErrorResponse } from '@/lib/auth/responses';
import { resolveManagedProfileFromRequest } from '@/lib/profile/resolve-profile';
import { isRateLimited } from '@/lib/server/rate-limit';
import { toErrorResponse } from '@/lib/server/api-responses';
import { certificateReorderSchema } from '@/lib/validators';

const normalizeIds = (value: unknown) =>
  Array.isArray(value)
    ? value
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item > 0)
    : [];

export async function PUT(request: Request) {
  if (await isRateLimited(request, 'admin-mutation', 120, 60_000)) {
    return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });
  }

  try {
    const body = await request.json();
    const { actor, profile } = await resolveManagedProfileFromRequest(request, body);
    if (!(await canAccessAdminModuleAction(actor.user.role, 'portfolio', 'createUpdate'))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const parsed = certificateReorderSchema.parse({
      featuredIds: normalizeIds(body?.featuredIds),
      regularIds: normalizeIds(body?.regularIds),
    });

    const nextIds = [...parsed.featuredIds, ...parsed.regularIds];
    const uniqueIds = new Set(nextIds);
    if (uniqueIds.size !== nextIds.length) {
      return NextResponse.json({ error: 'Duplicate certificate ids are not allowed.' }, { status: 400 });
    }

    const existing = await prisma.certificate.findMany({
      where: { profileId: profile.id },
      select: { id: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    const existingIds = existing.map((item) => item.id);

    if (existingIds.length !== nextIds.length) {
      return NextResponse.json({ error: 'Reorder payload must include every certificate exactly once.' }, { status: 400 });
    }

    const existingSet = new Set(existingIds);
    for (const id of nextIds) {
      if (!existingSet.has(id)) {
        return NextResponse.json({ error: 'Reorder payload contains an unknown certificate id.' }, { status: 400 });
      }
    }

    await prisma.$transaction(async (tx) => {
      const updates: Array<ReturnType<typeof tx.certificate.update>> = [];

      let order = 0;
      for (const id of parsed.featuredIds) {
        updates.push(
          tx.certificate.update({
            where: { id },
            data: { isFeatured: true, sortOrder: order++ },
          }),
        );
      }
      for (const id of parsed.regularIds) {
        updates.push(
          tx.certificate.update({
            where: { id },
            data: { isFeatured: false, sortOrder: order++ },
          }),
        );
      }

      await Promise.all(updates);
    });

    const updated = await prisma.certificate.findMany({
      where: { profileId: profile.id },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });

    return NextResponse.json({ certificates: updated });
  } catch (error) {
    const authError = toAuthErrorResponse(error);
    if (authError) {
      return authError;
    }
    return toErrorResponse(error, 'Unable to reorder certificates.');
  }
}
