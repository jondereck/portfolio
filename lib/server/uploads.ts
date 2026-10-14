import { createHash } from 'node:crypto';
import { v2 as cloudinary } from 'cloudinary';
import { getCloudinaryFolderPath } from '@/lib/server/admin-settings';
import {
  isObjectStorageConfigured,
  STORAGE_PROVIDER_CLOUDINARY,
  STORAGE_PROVIDER_NEON,
  uploadObjectBuffer,
  type StorageProvider,
} from '@/lib/server/object-storage';

export const MAX_IMAGE_FILE_SIZE = 5 * 1024 * 1024;
export const MAX_VIDEO_FILE_SIZE = 120 * 1024 * 1024;
export const MAX_AUDIO_FILE_SIZE = 50 * 1024 * 1024;
export const MAX_DOCUMENT_FILE_SIZE = 20 * 1024 * 1024;
export const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
export const ALLOWED_VIDEO_MIME_TYPES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-matroska',
]);
export const ALLOWED_AUDIO_MIME_TYPES = new Set([
  'audio/mpeg',
  'audio/mp4',
  'audio/aac',
  'audio/ogg',
  'audio/wav',
  'audio/x-wav',
  'audio/flac',
  'audio/x-flac',
  'audio/x-m4a',
]);
export const ALLOWED_DOCUMENT_MIME_TYPES = new Set(['application/pdf']);
export const ALLOWED_VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'webm', 'mkv']);
export const ALLOWED_AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'aac', 'ogg', 'm4a', 'flac']);
export const ALLOWED_DOCUMENT_EXTENSIONS = new Set(['pdf']);

export class RequestValidationError extends Error {
  status: number;
  details?: Record<string, string[]>;
  errorCode?: string;
  meta?: Record<string, unknown>;

  constructor(
    message: string,
    status = 400,
    details?: Record<string, string[]>,
    errorCode?: string,
    meta?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'RequestValidationError';
    this.status = status;
    this.details = details;
    this.errorCode = errorCode;
    this.meta = meta;
  }
}

export const isFile = (value: FormDataEntryValue | null | undefined): value is File => {
  return typeof File !== 'undefined' && value instanceof File;
};

export function validateImageFile(file: File, fieldName = 'imageFile') {
  if (!ALLOWED_IMAGE_MIME_TYPES.has(file.type)) {
    throw new RequestValidationError(
      `${fieldName} must be a PNG, JPG, WEBP, or GIF image.`,
      400,
      { [fieldName]: ['Unsupported file type.'] },
      'UNSUPPORTED_MEDIA_TYPE',
    );
  }

  if (file.size > MAX_IMAGE_FILE_SIZE) {
    throw new RequestValidationError(
      `${fieldName} must be 5MB or smaller.`,
      413,
      { [fieldName]: ['File is too large.'] },
      'IMAGE_TOO_LARGE',
    );
  }
}

export function validateMediaFile(file: File, fieldName = 'imageFile') {
  const normalizedType = (file.type || '').toLowerCase();
  const extension = (file.name.split('.').pop() || '').toLowerCase();

  if (ALLOWED_IMAGE_MIME_TYPES.has(file.type)) {
    validateImageFile(file, fieldName);
    return;
  }

  const isVideoByMime = ALLOWED_VIDEO_MIME_TYPES.has(normalizedType);
  const isVideoByExtension = ALLOWED_VIDEO_EXTENSIONS.has(extension);

  if (isVideoByMime || (!normalizedType && isVideoByExtension)) {
    if (!isVideoByExtension) {
      throw new RequestValidationError(
        `${fieldName} video format is not allowed. Use MP4, MOV, WEBM, or MKV.`,
        400,
        { [fieldName]: ['Unsupported video extension.'] },
        'UNSUPPORTED_MEDIA_TYPE',
      );
    }

    if (file.size > MAX_VIDEO_FILE_SIZE) {
      throw new RequestValidationError(
        `${fieldName} video must be 120MB or smaller.`,
        413,
        { [fieldName]: ['Video file is too large.'] },
        'VIDEO_TOO_LARGE',
      );
    }
    return;
  }

  const isAudioByMime = ALLOWED_AUDIO_MIME_TYPES.has(normalizedType);
  const isAudioByExtension = ALLOWED_AUDIO_EXTENSIONS.has(extension);

  if (isAudioByMime || (!normalizedType && isAudioByExtension)) {
    if (!isAudioByExtension) {
      throw new RequestValidationError(
        `${fieldName} audio format is not allowed. Use MP3, WAV, AAC, OGG, M4A, or FLAC.`,
        400,
        { [fieldName]: ['Unsupported audio extension.'] },
        'UNSUPPORTED_MEDIA_TYPE',
      );
    }

    if (file.size > MAX_AUDIO_FILE_SIZE) {
      throw new RequestValidationError(
        `${fieldName} audio must be 50MB or smaller.`,
        413,
        { [fieldName]: ['Audio file is too large.'] },
        'AUDIO_TOO_LARGE',
      );
    }
    return;
  }

  throw new RequestValidationError(
    `${fieldName} must be a supported image, video, or audio format.`,
    400,
    { [fieldName]: ['Unsupported media type.'] },
    'UNSUPPORTED_MEDIA_TYPE',
  );
}

export function validateCertificateAssetFile(file: File, fieldName = 'assetFile') {
  const normalizedType = (file.type || '').toLowerCase();
  const extension = (file.name.split('.').pop() || '').toLowerCase();

  if (ALLOWED_IMAGE_MIME_TYPES.has(normalizedType)) {
    validateImageFile(file, fieldName);
    return;
  }

  const isPdfByMime = ALLOWED_DOCUMENT_MIME_TYPES.has(normalizedType);
  const isPdfByExtension = ALLOWED_DOCUMENT_EXTENSIONS.has(extension);

  if (isPdfByMime || (!normalizedType && isPdfByExtension)) {
    if (!isPdfByExtension) {
      throw new RequestValidationError(
        `${fieldName} document format is not allowed. Use PDF.`,
        400,
        { [fieldName]: ['Unsupported document extension.'] },
        'UNSUPPORTED_MEDIA_TYPE',
      );
    }

    if (file.size > MAX_DOCUMENT_FILE_SIZE) {
      throw new RequestValidationError(
        `${fieldName} must be 20MB or smaller.`,
        413,
        { [fieldName]: ['File is too large.'] },
        'DOCUMENT_TOO_LARGE',
      );
    }
    return;
  }

  throw new RequestValidationError(
    `${fieldName} must be a supported image or PDF document.`,
    400,
    { [fieldName]: ['Unsupported file type.'] },
    'UNSUPPORTED_MEDIA_TYPE',
  );
}

const getCloudinaryConfig = () => {
  const cloudName =
    process.env.CLOUDINARY_NAME ||
    process.env.CLOUDINARY_CLOUD_NAME ||
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_KEY || process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_SECRET || process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new RequestValidationError('Upload service not configured.', 500, undefined, 'UPLOAD_NOT_CONFIGURED');
  }

  return { cloudName, apiKey, apiSecret };
};

const configureCloudinary = () => {
  const { cloudName, apiKey, apiSecret } = getCloudinaryConfig();
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
  });
};

async function resolveUploadFolder(folder: string) {
  const normalized = folder.trim().replace(/^\/+|\/+$/g, '');

  if (!normalized) {
    return getCloudinaryFolderPath();
  }

  if (normalized === 'portfolio') {
    return getCloudinaryFolderPath();
  }

  if (normalized.startsWith('portfolio/')) {
    return getCloudinaryFolderPath(normalized.slice('portfolio/'.length));
  }

  return normalized;
}

/** Prefer Neon Object Storage when configured; keep Cloudinary for legacy fallback. */
export function resolveActiveUploadProvider(): StorageProvider {
  const forced = (process.env.MEDIA_STORAGE_PROVIDER || '').trim().toLowerCase();
  if (forced === STORAGE_PROVIDER_NEON) {
    if (!isObjectStorageConfigured()) {
      throw new RequestValidationError(
        'MEDIA_STORAGE_PROVIDER=neon but Neon Object Storage env vars are missing.',
        500,
        undefined,
        'OBJECT_STORAGE_NOT_CONFIGURED',
      );
    }
    return STORAGE_PROVIDER_NEON;
  }
  if (forced === STORAGE_PROVIDER_CLOUDINARY) {
    return STORAGE_PROVIDER_CLOUDINARY;
  }
  if (isObjectStorageConfigured()) {
    return STORAGE_PROVIDER_NEON;
  }
  return STORAGE_PROVIDER_CLOUDINARY;
}

function mimeLooksLikeVideo(mimeType: string) {
  return mimeType.toLowerCase().startsWith('video/');
}

function mimeLooksLikeAudio(mimeType: string) {
  return mimeType.toLowerCase().startsWith('audio/');
}

function isSupportedImageBuffer(buffer: Buffer): boolean {
  // PNG
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return true;
  }

  // JPEG
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return true;
  }

  // GIF87a / GIF89a
  if (
    buffer.length >= 6 &&
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38 &&
    (buffer[4] === 0x37 || buffer[4] === 0x39) &&
    buffer[5] === 0x61
  ) {
    return true;
  }

  // WEBP (RIFF....WEBP)
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return true;
  }

  return false;
}

function isSupportedPdfBuffer(buffer: Buffer): boolean {
  return buffer.length >= 5 && buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46 && buffer[4] === 0x2d;
}

export async function uploadImageFile(file: File, folder: string) {
  validateImageFile(file);
  const resolvedFolder = await resolveUploadFolder(folder);

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!isSupportedImageBuffer(buffer)) {
    throw new RequestValidationError('Uploaded content does not match a supported image format.', 400, {
      imageFile: ['Invalid image content.'],
    }, 'INVALID_IMAGE_CONTENT');
  }

  if (resolveActiveUploadProvider() === STORAGE_PROVIDER_NEON) {
    const uploaded = await uploadObjectBuffer({
      body: buffer,
      folder: resolvedFolder,
      contentType: file.type || 'image/jpeg',
      filename: file.name,
    });
    return uploaded.publicUrl;
  }

  configureCloudinary();
  let result;
  try {
    result = await new Promise<{ secure_url?: string }>((resolve, reject) => {
      cloudinary.uploader
        .upload_stream({ folder: resolvedFolder }, (error, uploadResult) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(uploadResult ?? {});
        })
        .end(buffer);
    });
  } catch (error) {
    throw new RequestValidationError(
      error instanceof Error && error.message ? `Image upload failed: ${error.message}` : 'Image upload failed.',
      502,
      undefined,
      'IMAGE_UPLOAD_FAILED',
    );
  }

  if (!result.secure_url) {
    throw new RequestValidationError('Image upload failed.', 502, undefined, 'IMAGE_UPLOAD_FAILED');
  }

  return result.secure_url;
}

export async function uploadCertificateAssetFile(file: File, folder: string) {
  validateCertificateAssetFile(file);
  const resolvedFolder = await resolveUploadFolder(folder);

  const buffer = Buffer.from(await file.arrayBuffer());
  const normalizedType = (file.type || '').toLowerCase();
  const extension = (file.name.split('.').pop() || '').toLowerCase();
  const isImage = ALLOWED_IMAGE_MIME_TYPES.has(normalizedType);
  const isPdf = ALLOWED_DOCUMENT_MIME_TYPES.has(normalizedType) || (!normalizedType && ALLOWED_DOCUMENT_EXTENSIONS.has(extension));

  if (isImage && !isSupportedImageBuffer(buffer)) {
    throw new RequestValidationError(
      'Uploaded content does not match a supported image format.',
      400,
      { assetFile: ['Invalid image content.'] },
      'INVALID_IMAGE_CONTENT',
    );
  }

  if (isPdf && !isSupportedPdfBuffer(buffer)) {
    throw new RequestValidationError(
      'Uploaded content does not match a PDF document.',
      400,
      { assetFile: ['Invalid PDF content.'] },
      'INVALID_DOCUMENT_CONTENT',
    );
  }

  if (resolveActiveUploadProvider() === STORAGE_PROVIDER_NEON) {
    const uploaded = await uploadObjectBuffer({
      body: buffer,
      folder: resolvedFolder,
      contentType: file.type || (isPdf ? 'application/pdf' : 'application/octet-stream'),
      filename: file.name,
    });

    return {
      secureUrl: uploaded.publicUrl,
      publicId: undefined as string | undefined,
      resourceType: isPdf ? ('raw' as const) : ('image' as const),
      format: extension || undefined,
      originalFilename: file.name,
      storageProvider: STORAGE_PROVIDER_NEON as StorageProvider,
      storageKey: uploaded.storageKey,
    };
  }

  configureCloudinary();
  let result;
  try {
    result = await new Promise<{
      secure_url?: string;
      public_id?: string;
      resource_type?: 'image' | 'video' | 'raw' | 'auto';
      format?: string;
      original_filename?: string;
    }>((resolve, reject) => {
      cloudinary.uploader
        .upload_stream({ folder: resolvedFolder, resource_type: 'auto' }, (error, uploadResult) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(uploadResult ?? {});
        })
        .end(buffer);
    });
  } catch (error) {
    throw new RequestValidationError(
      error instanceof Error && error.message ? `Certificate asset upload failed: ${error.message}` : 'Certificate asset upload failed.',
      502,
      undefined,
      'CERTIFICATE_ASSET_UPLOAD_FAILED',
    );
  }

  if (!result.secure_url) {
    throw new RequestValidationError('Certificate asset upload failed.', 502, undefined, 'CERTIFICATE_ASSET_UPLOAD_FAILED');
  }

  return {
    secureUrl: result.secure_url,
    publicId: result.public_id,
    resourceType: result.resource_type && result.resource_type !== 'auto' ? result.resource_type : 'raw',
    format: result.format,
    originalFilename: result.original_filename,
    storageProvider: STORAGE_PROVIDER_CLOUDINARY as StorageProvider,
    storageKey: result.public_id,
  };
}

export type PreparedMediaUpload = {
  buffer: Buffer;
  contentHash: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
};

export async function prepareMediaUpload(file: File): Promise<PreparedMediaUpload> {
  validateMediaFile(file);

  const buffer = Buffer.from(await file.arrayBuffer());
  if (ALLOWED_IMAGE_MIME_TYPES.has(file.type) && !isSupportedImageBuffer(buffer)) {
    throw new RequestValidationError('Uploaded content does not match a supported image format.', 400, {
      imageFile: ['Invalid image content.'],
    }, 'INVALID_IMAGE_CONTENT');
  }

  return {
    buffer,
    contentHash: createHash('sha256').update(buffer).digest('hex'),
    originalFilename: file.name,
    mimeType: file.type,
    fileSizeBytes: file.size,
  };
}

export async function uploadPreparedMediaFile(prepared: PreparedMediaUpload, folder: string) {
  const resolvedFolder = await resolveUploadFolder(folder);

  if (resolveActiveUploadProvider() === STORAGE_PROVIDER_NEON) {
    const uploaded = await uploadObjectBuffer({
      body: prepared.buffer,
      folder: resolvedFolder,
      contentType: prepared.mimeType || 'application/octet-stream',
      filename: prepared.originalFilename,
    });

    const resourceType = mimeLooksLikeVideo(prepared.mimeType)
      ? 'video'
      : mimeLooksLikeAudio(prepared.mimeType)
        ? 'video'
        : prepared.mimeType.startsWith('image/')
          ? 'image'
          : 'raw';

    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.info('[media upload]', {
        provider: STORAGE_PROVIDER_NEON,
        name: prepared.originalFilename,
        mime: prepared.mimeType,
        size: prepared.fileSizeBytes,
        storageKey: uploaded.storageKey,
        publicUrl: uploaded.publicUrl,
      });
    }

    return {
      secureUrl: uploaded.publicUrl,
      playbackUrl: uploaded.publicUrl,
      publicId: undefined as string | undefined,
      resourceType: resourceType as 'image' | 'video' | 'raw',
      format: prepared.originalFilename.split('.').pop()?.toLowerCase(),
      bytes: uploaded.bytes,
      originalFilename: prepared.originalFilename,
      storageProvider: STORAGE_PROVIDER_NEON as StorageProvider,
      storageKey: uploaded.storageKey,
    };
  }

  configureCloudinary();

  let result;
  try {
    result = await new Promise<{
      secure_url?: string;
      public_id?: string;
      resource_type?: 'image' | 'video' | 'raw' | 'auto';
      format?: string;
      bytes?: number;
      original_filename?: string;
    }>((resolve, reject) => {
      cloudinary.uploader
        .upload_stream({ folder: resolvedFolder, resource_type: 'auto' }, (error, uploadResult) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(uploadResult ?? {});
        })
        .end(prepared.buffer);
    });
  } catch (error) {
    throw new RequestValidationError(
      error instanceof Error && error.message ? `Media upload failed: ${error.message}` : 'Media upload failed.',
      502,
      undefined,
      'MEDIA_UPLOAD_FAILED',
    );
  }

  if (!result.secure_url) {
    throw new RequestValidationError('Media upload failed.', 502, undefined, 'MEDIA_UPLOAD_FAILED');
  }

  const isAudioUpload = prepared.mimeType.startsWith('audio/');
  const isVideoResource = result.resource_type === 'video' && !isAudioUpload;
  const playbackUrl =
    isVideoResource && result.public_id
      ? cloudinary.url(result.public_id, {
          resource_type: 'video',
          secure: true,
          format: 'mp4',
          transformation: [{ quality: 'auto', video_codec: 'h264', audio_codec: 'aac' }],
        })
      : result.secure_url;

  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.info('[gallery upload]', {
      provider: STORAGE_PROVIDER_CLOUDINARY,
      name: prepared.originalFilename,
      mime: prepared.mimeType,
      size: prepared.fileSizeBytes,
      cloudinaryResourceType: result.resource_type,
      cloudinaryFormat: result.format,
      publicId: result.public_id,
      secureUrl: result.secure_url,
      playbackUrl,
    });
  }

  return {
    secureUrl: result.secure_url,
    playbackUrl,
    publicId: result.public_id,
    resourceType: result.resource_type && result.resource_type !== 'auto' ? result.resource_type : 'raw',
    format: result.format,
    bytes: result.bytes,
    originalFilename: result.original_filename,
    storageProvider: STORAGE_PROVIDER_CLOUDINARY as StorageProvider,
    storageKey: result.public_id,
  };
}

export async function uploadMediaFile(file: File, folder: string) {
  const prepared = await prepareMediaUpload(file);
  return uploadPreparedMediaFile(prepared, folder);
}
