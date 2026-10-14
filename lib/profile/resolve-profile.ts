import { ensurePrimaryProfile, getProfileBySlug } from '@/lib/profile/profile';
import { resolveRequestActor, canAccessProfile, resolveTargetProfile } from '@/lib/auth/session';
import { hasValidAdminAccessPolicy } from '@/lib/server/admin-session';

export async function resolvePublicProfileFromRequest(request: Request) {
  const url = new URL(request.url);
  const requestedSlug = url.searchParams.get('profile');
  const profile = requestedSlug ? await getProfileBySlug(requestedSlug) : await ensurePrimaryProfile();
  if (!profile) {
    return null;
  }

  const actor = await resolveRequestActor(request);
  const hasAdminAccess =
    actor?.source === 'legacy' ? true : actor ? await hasValidAdminAccessPolicy(request) : false;
  const canViewDrafts = Boolean(actor && hasAdminAccess && canAccessProfile(actor, profile.id));

  return {
    actor,
    profile,
    canViewDrafts,
  };
}

export async function resolveManagedProfileFromRequest(request: Request, body?: Record<string, unknown> | null) {
  const url = new URL(request.url);
  const queryProfile = url.searchParams.get('profile');
  const bodyProfileId = typeof body?.profileId === 'number' ? body.profileId : Number(body?.profileId);
  const bodyProfileSlug = typeof body?.profileSlug === 'string' ? body.profileSlug : null;

  return resolveTargetProfile({
    request,
    profileId: Number.isInteger(bodyProfileId) && bodyProfileId > 0 ? bodyProfileId : null,
    profileSlug: bodyProfileSlug || queryProfile,
  });
}
