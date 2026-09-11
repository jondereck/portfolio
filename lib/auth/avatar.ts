import { prisma } from '@/lib/prisma';

type NeonAuthUserRow = {
  id: string;
  image: string | null;
  name: string | null;
};

type NeonGoogleAccountRow = {
  accessToken: string | null;
  idToken: string | null;
};

type GoogleUserInfoResponse = {
  email?: string;
  picture?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
};

export type ResolvedGoogleProfile = {
  image: string;
  name: string;
};

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function isHttpsImageUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https:\/\//i.test(value.trim());
}

function cleanName(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim();
}

function buildFullName(givenName?: unknown, familyName?: unknown, fallbackName?: unknown) {
  const given = cleanName(givenName);
  const family = cleanName(familyName);
  const combined = [given, family].filter(Boolean).join(' ').trim();
  if (combined) return combined;
  return cleanName(fallbackName);
}

function shouldPreferResolvedName(localName: string | null | undefined, resolvedName: string) {
  const local = cleanName(localName);
  const next = cleanName(resolvedName);
  if (!next) return false;
  if (!local) return true;
  if (local.toLowerCase() === next.toLowerCase()) return false;
  // Prefer fuller Google/Neon name when local looks truncated (e.g. "Jon" vs "Jon Dereck").
  if (next.toLowerCase().startsWith(local.toLowerCase()) && next.length > local.length) {
    return true;
  }
  // Prefer multi-word Google name over single-token local nickname.
  if (!local.includes(' ') && next.includes(' ')) {
    return true;
  }
  return false;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payloadPart = token.split('.')[1];
    if (!payloadPart) return null;
    const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const json = Buffer.from(padded, 'base64').toString('utf8');
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function fetchGoogleProfileWithAccessToken(accessToken: string, expectedEmail: string) {
  const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  });
  if (!response.ok) {
    return null;
  }

  const payload = (await response.json().catch(() => null)) as GoogleUserInfoResponse | null;
  const email = typeof payload?.email === 'string' ? normalizeEmail(payload.email) : '';
  if (!email || email !== expectedEmail) {
    return null;
  }

  return {
    picture: typeof payload?.picture === 'string' ? payload.picture.trim() : '',
    name: buildFullName(payload?.given_name, payload?.family_name, payload?.name),
  };
}

/**
 * Prefer Google/Neon profile photo + full name (incl. last name) when emails match.
 * Works for OTP and Google login.
 */
export async function resolveGoogleMatchedProfile(input: {
  email: string;
  sessionImage?: string | null;
  sessionName?: string | null;
  localImage?: string | null;
  localName?: string | null;
}): Promise<ResolvedGoogleProfile> {
  const email = normalizeEmail(input.email);
  const localImage = isHttpsImageUrl(input.localImage) ? input.localImage!.trim() : '';
  const localName = cleanName(input.localName);
  const sessionImage = isHttpsImageUrl(input.sessionImage) ? input.sessionImage!.trim() : '';
  const sessionName = cleanName(input.sessionName);

  let image = sessionImage || localImage;
  let name = sessionName || localName;

  if (!email) {
    return { image, name };
  }

  const neonUsers = await prisma.$queryRaw<NeonAuthUserRow[]>`
    SELECT id::text AS id, image, name
    FROM neon_auth."user"
    WHERE lower(email) = ${email}
    LIMIT 1
  `;
  const neonUser = neonUsers[0];

  if (isHttpsImageUrl(neonUser?.image) && !sessionImage) {
    image = neonUser.image!.trim();
  }
  if (shouldPreferResolvedName(name, neonUser?.name ?? '')) {
    name = cleanName(neonUser?.name);
  }

  if (!neonUser?.id) {
    return { image, name };
  }

  const googleAccounts = await prisma.$queryRaw<NeonGoogleAccountRow[]>`
    SELECT
      "accessToken" AS "accessToken",
      "idToken" AS "idToken"
    FROM neon_auth.account
    WHERE "userId" = ${neonUser.id}::uuid
      AND "providerId" = 'google'
    ORDER BY "updatedAt" DESC
    LIMIT 1
  `;
  const googleAccount = googleAccounts[0];
  if (!googleAccount) {
    return { image, name };
  }

  if (googleAccount.idToken) {
    const claims = decodeJwtPayload(googleAccount.idToken);
    const claimEmail = typeof claims?.email === 'string' ? normalizeEmail(claims.email) : '';
    if (claimEmail === email) {
      const claimPicture = typeof claims?.picture === 'string' ? claims.picture.trim() : '';
      const claimName = buildFullName(claims?.given_name, claims?.family_name, claims?.name);

      if (isHttpsImageUrl(claimPicture)) {
        image = claimPicture;
        await prisma.$executeRaw`
          UPDATE neon_auth."user"
          SET image = ${claimPicture},
              "updatedAt" = NOW()
          WHERE id = ${neonUser.id}::uuid
            AND (image IS NULL OR image = '')
        `;
      }

      if (shouldPreferResolvedName(name, claimName)) {
        name = claimName;
        await prisma.$executeRaw`
          UPDATE neon_auth."user"
          SET name = ${claimName},
              "updatedAt" = NOW()
          WHERE id = ${neonUser.id}::uuid
            AND (name IS NULL OR length(btrim(name)) < length(${claimName}))
        `;
      }

      return { image, name };
    }
  }

  if (googleAccount.accessToken) {
    const googleProfile = await fetchGoogleProfileWithAccessToken(googleAccount.accessToken, email);
    if (googleProfile) {
      if (isHttpsImageUrl(googleProfile.picture)) {
        image = googleProfile.picture;
        await prisma.$executeRaw`
          UPDATE neon_auth."user"
          SET image = ${googleProfile.picture},
              "updatedAt" = NOW()
          WHERE id = ${neonUser.id}::uuid
            AND (image IS NULL OR image = '')
        `;
      }

      if (shouldPreferResolvedName(name, googleProfile.name)) {
        name = googleProfile.name;
        await prisma.$executeRaw`
          UPDATE neon_auth."user"
          SET name = ${googleProfile.name},
              "updatedAt" = NOW()
          WHERE id = ${neonUser.id}::uuid
            AND (name IS NULL OR length(btrim(name)) < length(${googleProfile.name}))
        `;
      }
    }
  }

  return { image, name };
}

/** @deprecated Prefer resolveGoogleMatchedProfile */
export async function resolveGoogleMatchedAvatar(input: {
  email: string;
  sessionImage?: string | null;
  localImage?: string | null;
}) {
  const profile = await resolveGoogleMatchedProfile(input);
  return profile.image;
}

export async function persistUserAvatarProfile(
  userId: string,
  input: { image?: string | null; name?: string | null },
) {
  const nextImage = isHttpsImageUrl(input.image) ? input.image!.trim() : undefined;
  const nextName = cleanName(input.name) || undefined;

  if (!nextImage && !nextName) {
    return { image: '', name: '' };
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(nextImage ? { image: nextImage } : {}),
      ...(nextName
        ? {
            name: nextName,
            profile: {
              update: {
                displayName: nextName,
              },
            },
          }
        : {}),
    },
    select: {
      image: true,
      name: true,
    },
  });

  return {
    image: updated.image ?? '',
    name: updated.name ?? '',
  };
}

export async function persistUserAvatarImage(userId: string, image: string) {
  const result = await persistUserAvatarProfile(userId, { image });
  return result.image;
}

export { getAvatarInitials } from '@/lib/auth/avatar-display';

