import { prisma } from '@/lib/prisma';
import { resolveGoogleMatchedProfile } from '@/lib/auth/avatar';
import { ensureUserProfile } from '@/lib/auth/user-profiles';
import { getNeonAuth, isNeonAuthConfigured } from '@/lib/auth/neon-server';

export type NeonSessionResolutionState = 'active' | 'pending' | 'suspended';

export type ResolvedNeonLocalUser = {
  profile: Awaited<ReturnType<typeof prisma.profile.findUnique>>;
  state: NeonSessionResolutionState;
  user: Awaited<ReturnType<typeof prisma.user.findUnique>>;
};

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function deriveLocalUserState(user: { isActive: boolean; emailVerified: Date | null; role: string }) {
  if (user.role === 'super_admin') {
    return user.isActive ? 'active' : 'suspended';
  }

  if (!user.emailVerified) {
    return 'pending';
  }

  return user.isActive ? 'active' : 'suspended';
}

async function resolveSessionProfile(
  email: string,
  sessionImage: string | null,
  sessionName: string | null,
  localImage?: string | null,
  localName?: string | null,
) {
  try {
    return await resolveGoogleMatchedProfile({
      email,
      sessionImage,
      sessionName,
      localImage,
      localName,
    });
  } catch {
    return {
      image:
        typeof sessionImage === 'string' && /^https:\/\//i.test(sessionImage)
          ? sessionImage.trim()
          : typeof localImage === 'string' && /^https:\/\//i.test(localImage)
            ? localImage.trim()
            : '',
      name:
        typeof sessionName === 'string' && sessionName.trim()
          ? sessionName.trim()
          : typeof localName === 'string' && localName.trim()
            ? localName.trim()
            : '',
    };
  }
}

/**
 * Link the current Neon Auth session to a local User/Profile.
 *
 * Intentionally avoids interactive `$transaction`s: Neon cold starts + Prisma's
 * default 2s maxWait frequently fail with
 * "Unable to start a transaction in the given time" during OTP/Google login.
 */
export async function syncNeonSessionToLocalUser() {
  if (!isNeonAuthConfigured()) {
    return null;
  }

  const auth = getNeonAuth();
  if (!auth) {
    return null;
  }

  const { data: session, error } = await auth.getSession();
  if (error || !session?.user?.id || !session.user.email) {
    return null;
  }

  const neonAuthUserId = String(session.user.id);
  const normalizedEmail = normalizeEmail(session.user.email);
  const sessionName =
    typeof session.user.name === 'string' && session.user.name.trim().length > 0
      ? session.user.name.trim()
      : null;
  const fallbackDisplayName = normalizedEmail.split('@')[0] || 'Pending User';
  const sessionImage =
    typeof session.user.image === 'string' && session.user.image.trim() ? session.user.image.trim() : null;

  const byNeonId = await prisma.user.findUnique({
    where: { neonAuthUserId },
    include: { profile: true },
  });

  if (byNeonId) {
    const resolved = await resolveSessionProfile(
      normalizedEmail,
      sessionImage,
      sessionName,
      byNeonId.image,
      byNeonId.name,
    );
    const displayName = resolved.name || byNeonId.name || sessionName || fallbackDisplayName;
    const shouldBackfillVerifiedAt = byNeonId.isActive && !byNeonId.emailVerified;
    const shouldBackfillImage = Boolean(resolved.image && resolved.image !== (byNeonId.image ?? ''));
    const shouldBackfillName = Boolean(resolved.name && resolved.name !== (byNeonId.name ?? ''));
    const user =
      shouldBackfillVerifiedAt || shouldBackfillImage || shouldBackfillName
        ? await prisma.user.update({
            where: { id: byNeonId.id },
            data: {
              ...(shouldBackfillImage ? { image: resolved.image } : {}),
              ...(shouldBackfillName
                ? {
                    name: resolved.name,
                    profile: byNeonId.profile
                      ? {
                          update: {
                            displayName: resolved.name,
                          },
                        }
                      : undefined,
                  }
                : {}),
              ...(shouldBackfillVerifiedAt ? { emailVerified: new Date() } : {}),
            },
            include: { profile: true },
          })
        : byNeonId;

    const profile =
      user.profile ??
      (await ensureUserProfile(prisma, user.id, user.name ?? displayName, user.name ?? displayName));

    return {
      profile,
      state: deriveLocalUserState(user),
      user,
    } as ResolvedNeonLocalUser;
  }

  const byEmail = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    include: { profile: true },
  });

  if (byEmail) {
    if (byEmail.neonAuthUserId && byEmail.neonAuthUserId !== neonAuthUserId) {
      throw new Error('NEON_AUTH_LINK_CONFLICT');
    }

    const resolved = await resolveSessionProfile(
      normalizedEmail,
      sessionImage,
      sessionName,
      byEmail.image,
      byEmail.name,
    );
    const displayName = resolved.name || byEmail.name || sessionName || fallbackDisplayName;
    const shouldBackfillVerifiedAt = byEmail.isActive && !byEmail.emailVerified;
    const updatedUser = await prisma.user.update({
      where: { id: byEmail.id },
      data: {
        neonAuthUserId,
        ...(resolved.image && resolved.image !== (byEmail.image ?? '') ? { image: resolved.image } : {}),
        ...(resolved.name && resolved.name !== (byEmail.name ?? '')
          ? {
              name: resolved.name,
              profile: byEmail.profile
                ? {
                    update: {
                      displayName: resolved.name,
                    },
                  }
                : undefined,
            }
          : {}),
        ...(shouldBackfillVerifiedAt ? { emailVerified: new Date() } : {}),
      },
      include: { profile: true },
    });

    const profile =
      updatedUser.profile ??
      (await ensureUserProfile(
        prisma,
        updatedUser.id,
        updatedUser.name ?? displayName,
        updatedUser.name ?? normalizedEmail.split('@')[0] ?? normalizedEmail,
      ));

    return {
      profile,
      state: deriveLocalUserState(updatedUser),
      user: updatedUser,
    } as ResolvedNeonLocalUser;
  }

  const resolved = await resolveSessionProfile(normalizedEmail, sessionImage, sessionName, null, null);
  const displayName = resolved.name || sessionName || fallbackDisplayName;

  try {
    const createdUser = await prisma.user.create({
      data: {
        email: normalizedEmail,
        name: displayName,
        image: resolved.image || null,
        role: 'viewer',
        isActive: false,
        emailVerified: null,
        neonAuthUserId,
      },
      include: { profile: true },
    });

    const profile = await ensureUserProfile(
      prisma,
      createdUser.id,
      createdUser.name ?? displayName,
      createdUser.name ?? normalizedEmail.split('@')[0] ?? normalizedEmail,
    );

    return {
      profile,
      state: deriveLocalUserState(createdUser),
      user: createdUser,
    } as ResolvedNeonLocalUser;
  } catch (createError) {
    const racedByNeonId = await prisma.user.findUnique({
      where: { neonAuthUserId },
      include: { profile: true },
    });
    if (racedByNeonId) {
      const profile =
        racedByNeonId.profile ??
        (await ensureUserProfile(
          prisma,
          racedByNeonId.id,
          racedByNeonId.name ?? displayName,
          racedByNeonId.name ?? displayName,
        ));
      return {
        profile,
        state: deriveLocalUserState(racedByNeonId),
        user: racedByNeonId,
      } as ResolvedNeonLocalUser;
    }

    const racedByEmail = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { profile: true },
    });
    if (racedByEmail) {
      if (racedByEmail.neonAuthUserId && racedByEmail.neonAuthUserId !== neonAuthUserId) {
        throw new Error('NEON_AUTH_LINK_CONFLICT');
      }

      const linked = await prisma.user.update({
        where: { id: racedByEmail.id },
        data: {
          neonAuthUserId,
          ...(resolved.image && resolved.image !== (racedByEmail.image ?? '') ? { image: resolved.image } : {}),
          ...(resolved.name && resolved.name !== (racedByEmail.name ?? '')
            ? {
                name: resolved.name,
                profile: racedByEmail.profile
                  ? {
                      update: {
                        displayName: resolved.name,
                      },
                    }
                  : undefined,
              }
            : {}),
        },
        include: { profile: true },
      });
      const profile =
        linked.profile ??
        (await ensureUserProfile(
          prisma,
          linked.id,
          linked.name ?? displayName,
          linked.name ?? normalizedEmail.split('@')[0] ?? normalizedEmail,
        ));
      return {
        profile,
        state: deriveLocalUserState(linked),
        user: linked,
      } as ResolvedNeonLocalUser;
    }

    throw createError;
  }
}
