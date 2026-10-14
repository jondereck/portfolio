import { PassThrough, Readable } from 'node:stream';
import { v2 as cloudinary } from 'cloudinary';
import { PhotoSourceType } from '@prisma/client';
import archiver from 'archiver';
import type { AlbumPhotoRecord } from '@/src/modules/gallery/repositories/galleryRepository';
import { RequestValidationError } from '@/lib/server/uploads';
import { getGoogleDriveAccessTokenForUserOrAny } from '@/lib/auth/google-drive';

type FetchResult = {
  response: Response;
  sourceUrl: string;
};

const DOWNLOAD_RETRY_ATTEMPTS = 2;
const DOWNLOAD_FETCH_TIMEOUT_MS = 15_000;

const MIME_EXTENSION_MAP: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/x-matroska': 'mkv',
};

const sanitizeFilenamePart = (value: string) => {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  const sanitized = trimmed.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-');
  return sanitized.slice(0, 120).trim() || 'file';
};

const getExtensionFromName = (value?: string | null) => {
  if (!value) return '';
  const match = value.toLowerCase().match(/\.([a-z0-9]{2,8})$/);
  return match ? match[1] : '';
};

const getExtensionFromUrl = (value?: string | null) => {
  if (!value) return '';
  const withoutQuery = value.split('?')[0];
  const match = withoutQuery.toLowerCase().match(/\.([a-z0-9]{2,8})$/);
  return match ? match[1] : '';
};

const getExtensionFromMime = (value?: string | null) => {
  if (!value) return '';
  return MIME_EXTENSION_MAP[value.toLowerCase()] || '';
};

const isVideoPhoto = (photo: AlbumPhotoRecord) => {
  const mime = (photo.mimeType || '').toLowerCase();
  if (mime.startsWith('video/')) return true;
  const url = (photo.imageUrl || '').toLowerCase();
  return ['/video/upload/', '.mp4', '.mov', '.webm', '.mkv'].some((token) => url.includes(token));
};

const getCloudinaryConfig = () => {
  const cloudName =
    process.env.CLOUDINARY_NAME ||
    process.env.CLOUDINARY_CLOUD_NAME ||
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_KEY || process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_SECRET || process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return null;
  }

  return { cloudName, apiKey, apiSecret };
};

const resolveOriginalCloudinaryUrl = (photo: AlbumPhotoRecord) => {
  if (!photo.cloudinaryPublicId) {
    return null;
  }

  const config = getCloudinaryConfig();
  if (!config) {
    return null;
  }

  cloudinary.config({
    cloud_name: config.cloudName,
    api_key: config.apiKey,
    api_secret: config.apiSecret,
  });

  return cloudinary.url(photo.cloudinaryPublicId, {
    secure: true,
    sign_url: false,
    resource_type: isVideoPhoto(photo) ? 'video' : 'image',
    type: 'upload',
  });
};

export const buildPhotoDownloadFilename = (photo: AlbumPhotoRecord) => {
  const preferredName =
    photo.originalFilename ||
    photo.caption ||
    `${isVideoPhoto(photo) ? 'video' : 'photo'}-${photo.id}`;
  const safeBase = sanitizeFilenamePart(preferredName.replace(/\.[a-z0-9]{2,8}$/i, ''));
  const extension =
    getExtensionFromName(photo.originalFilename) ||
    getExtensionFromMime(photo.mimeType) ||
    getExtensionFromUrl(photo.imageUrl) ||
    (isVideoPhoto(photo) ? 'mp4' : 'jpg');
  return `${safeBase}.${extension}`;
};

const fetchWithTimeoutAndRetry = async (
  url: string,
  attempts = DOWNLOAD_RETRY_ATTEMPTS,
  headers?: Record<string, string>,
): Promise<Response> => {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DOWNLOAD_FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        cache: 'no-store',
        headers,
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        throw new Error(`Upstream download failed with status ${response.status}.`);
      }

      return response;
    } catch (error) {
      lastError = error;
      if (attempt >= attempts) {
        break;
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  const errorMessage = lastError instanceof Error ? lastError.message : 'Unable to fetch media.';
  throw new RequestValidationError(`Failed to fetch media for download: ${errorMessage}`, 502, undefined, 'DOWNLOAD_FETCH_FAILED');
};

export const assertDownloadablePhoto = (photo: AlbumPhotoRecord) => {
  if (photo.sourceType !== PhotoSourceType.upload && photo.sourceType !== PhotoSourceType.gdrive) {
    throw new RequestValidationError(
      'This media cannot be downloaded.',
      422,
      undefined,
      'NON_DOWNLOADABLE_MEDIA',
    );
  }
};

export const resolvePhotoDownloadSourceUrl = (photo: AlbumPhotoRecord) => {
  if (photo.sourceType !== PhotoSourceType.upload) {
    return null;
  }

  const provider = (photo.storageProvider || '').toLowerCase();
  if (provider === 'neon') {
    return photo.imageUrl;
  }

  const cloudinaryOriginal = resolveOriginalCloudinaryUrl(photo);
  return cloudinaryOriginal || photo.imageUrl;
};

export const fetchPhotoDownload = async (photo: AlbumPhotoRecord): Promise<FetchResult> => {
  if (photo.sourceType === PhotoSourceType.gdrive) {
    if (!photo.sourceId) {
      throw new RequestValidationError('Media is not downloadable.', 422, undefined, 'NON_DOWNLOADABLE_MEDIA');
    }

    const accessToken = await getGoogleDriveAccessTokenForUserOrAny(null);
    const sourceUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(photo.sourceId)}?alt=media&supportsAllDrives=true`;
    const response = await fetchWithTimeoutAndRetry(sourceUrl, DOWNLOAD_RETRY_ATTEMPTS + 1, {
      Authorization: `Bearer ${accessToken}`,
    });
    return { response, sourceUrl };
  }

  const sourceUrl = resolvePhotoDownloadSourceUrl(photo);
  if (!sourceUrl) {
    throw new RequestValidationError('Media is not downloadable.', 422, undefined, 'NON_DOWNLOADABLE_MEDIA');
  }

  const response = await fetchWithTimeoutAndRetry(sourceUrl);
  return { response, sourceUrl };
};

export const buildAlbumZipFilename = (slug: string, now = new Date()) => {
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const safeSlug = sanitizeFilenamePart(slug.toLowerCase().replace(/[^a-z0-9-]/g, '-'));
  return `${safeSlug}-${yyyy}${mm}${dd}.zip`;
};

export const createAlbumZipStream = async (photos: AlbumPhotoRecord[]) => {
  const archive = archiver('zip', { zlib: { level: 9 } });
  const output = new PassThrough();
  const nameCounts = new Map<string, number>();
  let includedCount = 0;
  const sequenceWidth = Math.max(2, String(Math.max(photos.length, 1)).length);

  archive.pipe(output);

  const appendOne = async (photo: AlbumPhotoRecord, index: number) => {
    const { response } = await fetchPhotoDownload(photo);
    if (!response.body) {
      return;
    }

    const preferredName = buildPhotoDownloadFilename(photo);
    const seen = nameCounts.get(preferredName) ?? 0;
    nameCounts.set(preferredName, seen + 1);
    const dedupedName =
      seen === 0
        ? preferredName
        : `${preferredName.replace(/(\.[a-z0-9]{2,8})$/i, '')}-${seen + 1}${preferredName.match(/(\.[a-z0-9]{2,8})$/i)?.[1] || ''}`;

    const sequence = String(index + 1).padStart(sequenceWidth, '0');
    const orderedName = `${sequence}-${dedupedName}`;
    const stream = Readable.fromWeb(response.body as unknown as ReadableStream<Uint8Array>);
    archive.append(stream, { name: orderedName });
    includedCount += 1;
  };

  void (async () => {
    try {
      for (let index = 0; index < photos.length; index += 1) {
        const photo = photos[index];
        try {
          await appendOne(photo, index);
        } catch {
          // Skip individual media failures so the zip still completes.
        }
      }
      await archive.finalize();
    } catch (error) {
      output.destroy(error as Error);
    }
  })();

  return {
    stream: output,
    getIncludedCount: () => includedCount,
  };
};
