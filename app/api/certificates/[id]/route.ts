import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { canAccessAdminModuleAction } from '@/lib/auth/module-access';
import { toAuthErrorResponse } from '@/lib/auth/responses';
import { certificateSchema } from '@/lib/validators';
import { parseMultipartOrJson } from '@/lib/server/request-parsing';
import { uploadImageFile } from '@/lib/server/uploads';
import { toErrorResponse } from '@/lib/server/api-responses';
import { isRateLimited } from '@/lib/server/rate-limit';
import { resolveManagedProfileFromRequest, resolvePublicProfileFromRequest } from '@/lib/profile/resolve-profile';

type RouteContext = { params: Promise<{ id: string }> };

const parseId = (value: string) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const normalizeOptionalText = (value: unknown) => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const normalizeCertificatePayload = (data: Record<string, unknown>) => ({
  title: typeof data.title === 'string' ? data.title.trim() : data.title,
  issuer: typeof data.issuer === 'string' ? data.issuer.trim() : data.issuer,
  image: typeof data.image === 'string' ? data.image.trim() : data.image,
  link: typeof data.link === 'string' ? data.link.trim() : data.link,
  category: typeof data.category === 'string' ? data.category.trim() : data.category,
  issuedAt: data.issuedAt === '' ? null : data.issuedAt,
  expiresAt: data.expiresAt === '' ? null : data.expiresAt,
  credentialId: normalizeOptionalText(data.credentialId),
  sortOrder: data.sortOrder,
  isFeatured: data.isFeatured,
  isPublished: data.isPublished,
});

export async function GET(request: Request, context: RouteContext) {
  const { id: idParam } = await context.params;
  const id = parseId(idParam);
  if (!id) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const access = await resolvePublicProfileFromRequest(request);
  if (!access || (!access.profile.isPublic && !access.canViewDrafts)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const certificate = await prisma.certificate.findFirst({
    where: {
      id,
      profileId: access.profile.id,
      ...(access.canViewDrafts ? {} : { isPublished: true }),
    },
  });

  if (!certificate) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(certificate);
}

export async function PUT(request: Request, context: RouteContext) {
  if (await isRateLimited(request, 'admin-mutation', 120, 60_000)) {
    return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });
  }

  const { id: idParam } = await context.params;
  const id = parseId(idParam);
  if (!id) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  try {
    const { data, imageFile } = await parseMultipartOrJson(request);
    const { actor, profile } = await resolveManagedProfileFromRequest(request, data);
    if (!(await canAccessAdminModuleAction(actor.user.role, 'portfolio', 'createUpdate'))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const existing = await prisma.certificate.findFirst({ where: { id, profileId: profile.id } });
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const image =
      imageFile ? await uploadImageFile(imageFile, 'portfolio/certificates') : typeof data.image === 'string' ? data.image : undefined;
    const parsed = certificateSchema.parse({
      ...normalizeCertificatePayload(data),
      image,
    });

    const updated = await prisma.certificate.update({
      where: { id },
      data: {
        title: parsed.title,
        issuer: parsed.issuer,
        image: parsed.image,
        link: parsed.link,
        category: parsed.category,
        credentialId: parsed.credentialId ?? null,
        sortOrder: parsed.sortOrder ?? 0,
        isFeatured: parsed.isFeatured ?? false,
        isPublished: parsed.isPublished ?? true,
        issuedAt: parsed.issuedAt ? new Date(parsed.issuedAt) : null,
        expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : null,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    const authError = toAuthErrorResponse(error);
    if (authError) {
      return authError;
    }
    return toErrorResponse(error, 'Unable to update certificate.');
  }
}
