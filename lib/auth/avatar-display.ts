/** Client-safe avatar helpers (no Prisma / Node-only deps). */

function cleanName(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim();
}

/** Initials for avatar fallback: first + last name when available. */
export function getAvatarInitials(name: string) {
  const parts = cleanName(name).split(' ').filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0].slice(0, 1)}${parts[parts.length - 1].slice(0, 1)}`.toUpperCase();
}
