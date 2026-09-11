import { auth } from '@/auth';
import { hasValidAdminSession } from '@/lib/server/admin-session';
import { prisma } from '@/lib/prisma';
import { LEGACY_PRIMARY_USER_ID } from '@/lib/auth/constants';
import { isNeonAuthConfigured } from '@/lib/auth/neon-server';
import { syncNeonSessionToLocalUser } from '@/lib/auth/neon-sync';
import { hasRequiredRole, isSuperAdmin } from '@/lib/auth/roles';
import { canAccessAdminModuleAction } from '@/lib/auth/module-access';
import type { AdminModuleId, ModuleAccessAction } from '@/lib/auth/module-access-config';
import type { Profile, User, UserRole } from '@prisma/client';
import { redirect } from 'next/navigation';

export type AuthenticatedActor = {
  user: User;
  profile: Profile | null;
  source: 'authjs' | 'legacy' | 'neon';
};

async function getCurrentAuthJsUser() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return null;
  }

  return prisma.user.findUnique({
    where: { id: userId },
    include: { profile: true },
  });
}

async function getResolvedNeonLocalUser() {
  if (!isNeonAuthConfigured()) {
    return null;
  }

  try {
    return await syncNeonSessionToLocalUser();
  } catch (error) {
    if (error instanceof Error && error.message === 'NEON_AUTH_LINK_CONFLICT') {
      return null;
    }

    console.error('[auth] Failed to resolve Neon local user', error);
    return null;
  }
}

export async function getCurrentUser() {
  const actor = await resolveRequestActor();
  return actor?.user ?? null;
}

export async function getCurrentProfile() {
  const actor = await resolveRequestActor();
  return actor?.profile ?? null;
}

export async function getCurrentAuthStatus(request?: Request) {
  if (isNeonAuthConfigured()) {
    try {
      const neonUser = await syncNeonSessionToLocalUser();
      if (neonUser) {
        return {
          authenticated: neonUser.state === 'active',
          errorCode: null,
          neonConfigured: true,
          source: 'neon' as const,
          state: neonUser.state,
          user: neonUser.user,
        };
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'NEON_AUTH_LINK_CONFLICT') {
        return {
          authenticated: false,
          errorCode: 'NEON_AUTH_LINK_CONFLICT',
          neonConfigured: true,
          source: 'neon' as const,
          state: 'conflict' as const,
          user: null,
        };
      }

      // Transient Neon/Prisma pool issues should not hard-crash login redirects.
      console.error('[auth] Failed to sync Neon session to local user', error);
      return {
        authenticated: false,
        errorCode: 'NEON_SYNC_FAILED',
        neonConfigured: true,
        source: 'neon' as const,
        state: 'error' as const,
        user: null,
      };
    }
  }

  const authJsUser = await getCurrentAuthJsUser();
  if (authJsUser?.isActive) {
    return {
      authenticated: true,
      errorCode: null,
      neonConfigured: isNeonAuthConfigured(),
      source: 'authjs' as const,
      state: 'active' as const,
      user: authJsUser,
    };
  }

  if (request && (await hasValidAdminSession(request))) {
    const legacyUser = await prisma.user.findUnique({
      where: { id: LEGACY_PRIMARY_USER_ID },
      include: { profile: true },
    });

    if (legacyUser) {
      return {
        authenticated: true,
        errorCode: null,
        neonConfigured: isNeonAuthConfigured(),
        source: 'legacy' as const,
        state: 'active' as const,
        user: legacyUser,
      };
    }
  }

  return {
    authenticated: false,
    errorCode: null,
    neonConfigured: isNeonAuthConfigured(),
    source: null,
    state: 'anonymous' as const,
    user: null,
  };
}

export async function resolveRequestActor(request?: Request): Promise<AuthenticatedActor | null> {
  const neonUser = await getResolvedNeonLocalUser();
  if (neonUser?.state === 'active') {
    return {
      user: neonUser.user,
      profile: neonUser.profile ?? null,
      source: 'neon',
    };
  }

  const authJsUser = await getCurrentAuthJsUser();
  if (authJsUser?.isActive) {
    return {
      user: authJsUser,
      profile: authJsUser.profile ?? null,
      source: 'authjs',
    };
  }

  if (request && (await hasValidAdminSession(request))) {
    const legacyUser = await prisma.user.findUnique({
      where: { id: LEGACY_PRIMARY_USER_ID },
      include: { profile: true },
    });
    if (legacyUser) {
      return {
        user: legacyUser,
        profile: legacyUser.profile ?? null,
        source: 'legacy',
      };
    }
  }

  return null;
}

export async function requireAuthActor(request?: Request) {
  const actor = await resolveRequestActor(request);
  if (!actor) {
    throw new Error('UNAUTHENTICATED');
  }

  return actor;
}

export async function requireRole(allowedRoles: UserRole[], request?: Request) {
  const actor = await requireAuthActor(request);
  if (!hasRequiredRole(actor.user.role, allowedRoles)) {
    throw new Error('FORBIDDEN');
  }

  return actor;
}

export async function requireModuleAccess(
  moduleId: AdminModuleId,
  action: ModuleAccessAction = 'view',
  request?: Request,
) {
  const actor = await requireAuthActor(request);
  if (!(await canAccessAdminModuleAction(actor.user.role, moduleId, action))) {
    throw new Error('FORBIDDEN');
  }

  return actor;
}

export async function requirePageRole(allowedRoles: UserRole[], loginPath = '/admin/login') {
  const actor = await resolveRequestActor();
  if (!actor) {
    redirect(loginPath);
  }
  if (!hasRequiredRole(actor.user.role, allowedRoles)) {
    redirect('/admin');
  }

  return actor;
}

export async function requirePageModuleAccess(
  moduleId: AdminModuleId,
  action: ModuleAccessAction = 'view',
  loginPath = '/admin/login',
) {
  const actor = await resolveRequestActor();
  if (!actor) {
    redirect(loginPath);
  }
  if (!(await canAccessAdminModuleAction(actor.user.role, moduleId, action))) {
    redirect('/admin');
  }

  return actor;
}

export function canAccessProfile(actor: AuthenticatedActor, profileId: number | null) {
  if (profileId === null) {
    return false;
  }

  if (isSuperAdmin(actor.user.role)) {
    return true;
  }

  return actor.profile?.id === profileId;
}

export async function requireProfileAccess(profileId: number, request?: Request) {
  const actor = await requireAuthActor(request);
  if (!canAccessProfile(actor, profileId)) {
    throw new Error('FORBIDDEN');
  }

  return actor;
}

export async function resolveTargetProfile(options: {
  request?: Request;
  profileId?: number | null;
  profileSlug?: string | null;
}) {
  const actor = await requireAuthActor(options.request);

  const requestedProfile =
    options.profileId != null
      ? await prisma.profile.findUnique({ where: { id: options.profileId } })
      : options.profileSlug
        ? await prisma.profile.findUnique({ where: { slug: options.profileSlug } })
        : null;

  const targetProfile = requestedProfile ?? actor.profile;
  if (!targetProfile || !canAccessProfile(actor, targetProfile.id)) {
    throw new Error('FORBIDDEN');
  }

  return {
    actor,
    profile: targetProfile,
  };
}
