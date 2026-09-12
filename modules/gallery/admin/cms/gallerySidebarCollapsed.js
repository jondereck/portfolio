export const GALLERY_SIDEBAR_COLLAPSED_KEY = 'gallery:sidebarCollapsed:v2';
const GALLERY_SIDEBAR_COLLAPSED_LEGACY_KEY = 'gallery:sidebarCollapsed:v1';

export function readGallerySidebarCollapsed(defaultValue = true) {
  if (typeof window === 'undefined') return defaultValue;

  const stored = window.localStorage.getItem(GALLERY_SIDEBAR_COLLAPSED_KEY);
  if (stored !== null) return stored === 'true';

  const legacy = window.localStorage.getItem(GALLERY_SIDEBAR_COLLAPSED_LEGACY_KEY);
  if (legacy !== null) return legacy === 'true';

  return defaultValue;
}

export function writeGallerySidebarCollapsed(collapsed) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(GALLERY_SIDEBAR_COLLAPSED_KEY, collapsed ? 'true' : 'false');
}
