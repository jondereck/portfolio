const DB_NAME = 'gallery-admin-cache';
const DB_VERSION = 1;
const PHOTOS_STORE = 'albumPhotos';
const MEDIA_CACHE_NAME = 'gallery-admin-media-v1';
const MAX_WARM_URLS = 48;

function cacheKey(albumId, sort, scope = 'owner') {
  return `${Number(albumId)}:${String(sort || 'custom')}:${String(scope || 'owner')}`;
}

function openDb() {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => resolve(null);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(PHOTOS_STORE)) {
          db.createObjectStore(PHOTOS_STORE, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
    } catch {
      resolve(null);
    }
  });
}

export async function readCachedAlbumPhotos(albumId, sort = 'custom', scope = 'owner') {
  if (!albumId) return null;
  const db = await openDb();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(PHOTOS_STORE, 'readonly');
      const store = tx.objectStore(PHOTOS_STORE);
      const request = store.get(cacheKey(albumId, sort, scope));
      request.onerror = () => resolve(null);
      request.onsuccess = () => {
        const row = request.result;
        if (!row || !Array.isArray(row.photos)) {
          resolve(null);
          return;
        }
        resolve(row.photos);
      };
    } catch {
      resolve(null);
    }
  });
}

export async function writeCachedAlbumPhotos(albumId, sort = 'custom', photos = [], scope = 'owner') {
  if (!albumId || !Array.isArray(photos)) return;
  const db = await openDb();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(PHOTOS_STORE, 'readwrite');
      const store = tx.objectStore(PHOTOS_STORE);
      store.put({
        key: cacheKey(albumId, sort, scope),
        albumId: Number(albumId),
        sort: String(sort || 'custom'),
        scope: String(scope || 'owner'),
        photos,
        updatedAt: Date.now(),
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function clearCachedAlbumPhotos(albumId) {
  if (!albumId) return;
  const db = await openDb();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(PHOTOS_STORE, 'readwrite');
      const store = tx.objectStore(PHOTOS_STORE);
      const request = store.openCursor();
      request.onerror = () => resolve();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if (Number(cursor.value?.albumId) === Number(albumId)) {
          cursor.delete();
        }
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

function resolveWarmUrl(photo) {
  if (!photo) return '';

  if (typeof photo.imageUrl === 'string' && photo.imageUrl.trim()) {
    const raw = photo.imageUrl.trim();
    if (raw.startsWith('/')) return raw;
    if (typeof window !== 'undefined') {
      try {
        const url = new URL(raw, window.location.origin);
        if (url.origin === window.location.origin) {
          return `${url.pathname}${url.search}`;
        }
      } catch {
        // ignore
      }
    }
  }

  if (photo.sourceType === 'gdrive' && photo.sourceId) {
    return `/api/admin/integrations/google-drive/files/${encodeURIComponent(photo.sourceId)}`;
  }

  return '';
}

export async function warmAlbumMediaCache(photos = []) {
  if (typeof window === 'undefined' || !('caches' in window)) return;
  if (!Array.isArray(photos) || photos.length === 0) return;

  const urls = [];
  const seen = new Set();
  for (const photo of photos) {
    const url = resolveWarmUrl(photo);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
    if (urls.length >= MAX_WARM_URLS) break;
  }

  if (urls.length === 0) return;

  try {
    const cache = await caches.open(MEDIA_CACHE_NAME);
    await Promise.allSettled(
      urls.map(async (url) => {
        const existing = await cache.match(url);
        if (existing) return;
        const response = await fetch(url, {
          credentials: 'same-origin',
          cache: 'force-cache',
        });
        if (response.ok || response.status === 206) {
          await cache.put(url, response.clone());
        }
      }),
    );
  } catch {
    // Best-effort only.
  }
}
