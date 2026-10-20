import { z } from 'zod';

export const VIEWER_MODES = ['focus', 'slideshow', 'split'] as const;
export type ViewerMode = (typeof VIEWER_MODES)[number];

/**
 * Persisted viewer session payload (core + playback fields) as defined in
 * docs/superpowers/specs/2026-09-05-gallery-slideshow-ux-design.md.
 */
export type ViewerSessionPayload = {
  photoIndex: number;
  viewerMode: ViewerMode;
  delayMs: number;
  isPlaying: boolean;
  splitLeftIndex: number | null;
  splitRightIndex: number | null;
};

export type ViewerSession = ViewerSessionPayload & {
  updatedAt: string | null;
};

const nonNegativeInt = z.coerce.number().int().min(0).max(1_000_000);

export const viewerSessionUpsertSchema = z.object({
  photoIndex: nonNegativeInt.default(0),
  viewerMode: z.enum(VIEWER_MODES).default('focus'),
  // 0 = timer off; otherwise clamp to 0.5s – 5min so PUT is not rejected mid-slideshow.
  delayMs: z.coerce.number().int().min(0).max(300_000).default(5000),
  isPlaying: z.coerce.boolean().default(false),
  splitLeftIndex: nonNegativeInt.nullable().default(null),
  splitRightIndex: nonNegativeInt.nullable().default(null),
});

export type ViewerSessionUpsertInput = z.infer<typeof viewerSessionUpsertSchema>;

/**
 * A session is only worth resuming if the user actually moved past the very
 * first frame or engaged a non-default (slideshow/split) playback mode.
 * A brand-new "never viewed" default state should not trigger the resume prompt.
 */
export function isResumableSession(session: ViewerSession | null | undefined): boolean {
  if (!session) return false;
  if (session.viewerMode === 'slideshow' || session.viewerMode === 'split') return true;
  if (session.photoIndex > 0) return true;
  if ((session.splitLeftIndex ?? 0) > 0) return true;
  if ((session.splitRightIndex ?? 0) > 0) return true;
  return session.isPlaying === true;
}

/**
 * Pick the newer of remote (server) vs local cache for cross-device resume.
 * Prefer remote when timestamps are missing/equal so another device wins over
 * a stale same-browser localStorage entry.
 */
export function pickNewerViewerSession(
  remote: ViewerSession | null | undefined,
  local: ViewerSession | null | undefined,
): ViewerSession | null {
  const remoteOk = isResumableSession(remote) ? remote : null;
  const localOk = isResumableSession(local) ? local : null;
  if (!remoteOk) return localOk;
  if (!localOk) return remoteOk;

  const remoteAt = typeof remoteOk.updatedAt === 'string' ? remoteOk.updatedAt : '';
  const localAt = typeof localOk.updatedAt === 'string' ? localOk.updatedAt : '';
  if (localAt && remoteAt && localAt > remoteAt) return localOk;
  return remoteOk;
}

/** localStorage key for the immediate client-side cache, scoped per user + album. */
export function viewerSessionStorageKey(userId: string, albumId: number | string): string {
  return `gallery:viewer-session:${userId}:${albumId}`;
}

/** Device-local fallback key when userId is not known yet (same browser only). */
export function albumViewerSessionStorageKey(albumId: number | string): string {
  return `gallery:viewer-session:album:${albumId}`;
}

/**
 * Best-effort read of a cached viewer session when the server GET fails or
 * returns no userId yet. Scans localStorage for any key matching this album.
 */
export function readLocalViewerSession(
  albumId: number | string,
  preferredUserId?: string | null,
): { userId: string | null; session: ViewerSession } | null {
  if (typeof window === 'undefined') return null;

  const tryParse = (
    key: string,
    userId: string | null,
  ): { userId: string | null; session: ViewerSession } | null => {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as ViewerSession;
      if (!parsed || typeof parsed !== 'object') return null;
      return { userId, session: parsed };
    } catch {
      return null;
    }
  };

  if (preferredUserId) {
    const preferred = tryParse(
      viewerSessionStorageKey(preferredUserId, albumId),
      preferredUserId,
    );
    if (preferred) return preferred;
  }

  const albumLocal = tryParse(albumViewerSessionStorageKey(albumId), preferredUserId ?? null);
  if (albumLocal) return albumLocal;

  try {
    const prefix = 'gallery:viewer-session:';
    const suffix = `:${albumId}`;
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key || !key.startsWith(prefix) || !key.endsWith(suffix)) continue;
      if (key === albumViewerSessionStorageKey(albumId)) continue;
      const userId = key.slice(prefix.length, key.length - suffix.length);
      if (!userId || userId === 'album') continue;
      const matched = tryParse(key, userId);
      if (matched) return matched;
    }
  } catch {
    // ignore storage errors (private mode, quota)
  }

  return null;
}

export function writeLocalViewerSession(
  albumId: number | string,
  session: ViewerSession,
  userId?: string | null,
): void {
  if (typeof window === 'undefined') return;
  const stamped: ViewerSession = {
    ...session,
    updatedAt: session.updatedAt ?? new Date().toISOString(),
  };
  const raw = JSON.stringify(stamped);
  try {
    window.localStorage.setItem(albumViewerSessionStorageKey(albumId), raw);
    if (userId) {
      window.localStorage.setItem(viewerSessionStorageKey(userId, albumId), raw);
    }
  } catch {
    // ignore storage errors (private mode, quota)
  }
}

export function clearLocalViewerSession(
  albumId: number | string,
  userId?: string | null,
): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(albumViewerSessionStorageKey(albumId));
    if (userId) {
      window.localStorage.removeItem(viewerSessionStorageKey(userId, albumId));
    }
  } catch {
    // ignore
  }
}
