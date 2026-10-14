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

const buildCertificateInput = async (data: Record<string, unknown>, imageFile?: File) => {
  const image =
    imageFile ? await uploadImageFile(imageFile, 'portfolio/certificates') : typeof data.image === 'string' ? data.image : undefined;

  const parsed = certificateSchema.parse({
    ...normalizeCertificatePayload(data),
    image,
  });

  return parsed;
};

export async function GET(request: Request) {
  const access = await resolvePublicProfileFromRequest(request);
  if (!access || (!access.profile.isPublic && !access.canViewDrafts)) {
    return NextResponse.json([]);
  }
  const certificates = await prisma.certificate.findMany({
    where: {
      profileId: access.profile.id,
      ...(access.canViewDrafts ? {} : { isPublished: true }),
    },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  });
  return NextResponse.json(certificates);
}

export async function POST(request: Request) {
  if (await isRateLimited(request, 'admin-mutation', 120, 60_000)) {
    return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });
  }

  try {
    const { data, imageFile } = await parseMultipartOrJson(request);
    const { actor, profile } = await resolveManagedProfileFromRequest(request, data);
    if (!(await canAccessAdminModuleAction(actor.user.role, 'portfolio', 'createUpdate'))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const parsed = await buildCertificateInput(data, imageFile);

    const hasExplicitSortOrder =
      typeof data?.sortOrder !== 'undefined' && data?.sortOrder !== null && String(data.sortOrder).trim() !== '';
    const nextSortOrder = hasExplicitSortOrder
      ? (parsed.sortOrder ?? 0)
      : await (async () => {
          const min = await prisma.certificate.aggregate({
            where: { profileId: profile.id },
            _min: { sortOrder: true },
          });
          const currentMin = typeof min._min.sortOrder === 'number' ? min._min.sortOrder : 0;
          return currentMin - 1;
        })();

    const created = await prisma.certificate.create({
      data: {
        profileId: profile.id,
        title: parsed.title,
        issuer: parsed.issuer,
        image: parsed.image,
        link: parsed.link,
        category: parsed.category,
        credentialId: parsed.credentialId ?? null,
        sortOrder: nextSortOrder,
        isFeatured: parsed.isFeatured ?? false,
        isPublished: parsed.isPublished ?? true,
        issuedAt: parsed.issuedAt ? new Date(parsed.issuedAt) : null,
        expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : null,
      },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    const authError = toAuthErrorResponse(error);
    if (authError) {
      return authError;
    }
    return toErrorResponse(error, 'Unable to create certificate.');
  }
}

export async function PUT(request: Request) {
  if (await isRateLimited(request, 'admin-mutation', 120, 60_000)) {
    return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });
  }

  try {
    const { data, imageFile } = await parseMultipartOrJson(request);
    const { actor, profile } = await resolveManagedProfileFromRequest(request, data);
    if (!(await canAccessAdminModuleAction(actor.user.role, 'portfolio', 'createUpdate'))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const id = Number(data?.id);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }
    const existing = await prisma.certificate.findFirst({ where: { id, profileId: profile.id } });
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const parsed = await buildCertificateInput(data, imageFile);

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

export async function DELETE(request: Request) {
  if (await isRateLimited(request, 'admin-mutation', 120, 60_000)) {
    return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });
  }

  try {
    const payload = await request.json();
    const { actor, profile } = await resolveManagedProfileFromRequest(request, payload);
    if (!(await canAccessAdminModuleAction(actor.user.role, 'portfolio', 'delete'))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const id = Number(payload?.id);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }
    const existing = await prisma.certificate.findFirst({ where: { id, profileId: profile.id } });
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    await prisma.certificate.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    const authError = toAuthErrorResponse(error);
    if (authError) {
      return authError;
    }
    return toErrorResponse(error, 'Unable to delete certificate.');
  }
}
