import { randomUUID } from 'node:crypto';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const STORAGE_PROVIDER_NEON = 'neon' as const;
export const STORAGE_PROVIDER_CLOUDINARY = 'cloudinary' as const;

export class ObjectStorageError extends Error {
  status: number;
  errorCode?: string;

  constructor(message: string, status = 500, errorCode?: string) {
    super(message);
    this.name = 'ObjectStorageError';
    this.status = status;
    this.errorCode = errorCode;
  }
}

export type StorageProvider = typeof STORAGE_PROVIDER_NEON | typeof STORAGE_PROVIDER_CLOUDINARY;

export type ObjectStorageConfig = {
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
  region: string;
  bucket: string;
};

export type UploadedObject = {
  provider: typeof STORAGE_PROVIDER_NEON;
  storageKey: string;
  publicUrl: string;
  contentType: string;
  bytes: number;
};

function trimSlash(value: string) {
  return value.replace(/\/+$/g, '');
}

export function getObjectStorageBucket() {
  return (
    process.env.NEON_OBJECT_STORAGE_BUCKET ||
    process.env.OBJECT_STORAGE_BUCKET ||
    'public-assets'
  ).trim();
}

export function getObjectStorageConfig(): ObjectStorageConfig | null {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();
  const endpoint = process.env.AWS_ENDPOINT_URL_S3?.trim();
  const region = (process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1').trim();
  const bucket = getObjectStorageBucket();

  if (!accessKeyId || !secretAccessKey || !endpoint || !bucket) {
    return null;
  }

  return {
    accessKeyId,
    secretAccessKey,
    endpoint: trimSlash(endpoint),
    region,
    bucket,
  };
}

export function isObjectStorageConfigured() {
  return getObjectStorageConfig() !== null;
}

export function createObjectStorageClient(config = getObjectStorageConfig()) {
  if (!config) {
    throw new ObjectStorageError(
      'Neon Object Storage is not configured. Set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_ENDPOINT_URL_S3 (and optional NEON_OBJECT_STORAGE_BUCKET).',
      500,
      'OBJECT_STORAGE_NOT_CONFIGURED',
    );
  }

  return {
    config,
    client: new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    }),
  };
}

export function buildObjectStoragePublicUrl(storageKey: string, config = getObjectStorageConfig()) {
  if (!config) {
    throw new ObjectStorageError(
      'Neon Object Storage is not configured.',
      500,
      'OBJECT_STORAGE_NOT_CONFIGURED',
    );
  }

  const key = storageKey.replace(/^\/+/, '');
  return `${config.endpoint}/${config.bucket}/${key}`;
}

function sanitizePathSegment(value: string) {
  return value
    .trim()
    .replace(/\\/g, '/')
    .replace(/[^a-zA-Z0-9/_.-]+/g, '-')
    .replace(/\/+/g, '/')
    .replace(/^\/+|\/+$/g, '');
}

function extensionFromFilename(filename?: string | null) {
  if (!filename) return '';
  const match = filename.toLowerCase().match(/\.([a-z0-9]{2,8})$/);
  return match ? match[1] : '';
}

function extensionFromContentType(contentType?: string | null) {
  const mime = (contentType || '').toLowerCase();
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
    'video/x-matroska': 'mkv',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/aac': 'aac',
    'audio/ogg': 'ogg',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/flac': 'flac',
    'audio/x-flac': 'flac',
    'audio/x-m4a': 'm4a',
    'application/pdf': 'pdf',
  };
  return map[mime] || '';
}

export function buildObjectStorageKey(folder: string, options: { filename?: string | null; contentType?: string | null } = {}) {
  const baseFolder = sanitizePathSegment(folder) || 'uploads';
  const ext =
    extensionFromFilename(options.filename) ||
    extensionFromContentType(options.contentType) ||
    'bin';
  return `${baseFolder}/${randomUUID()}.${ext}`;
}

export async function uploadObjectBuffer(args: {
  body: Buffer;
  folder: string;
  contentType: string;
  filename?: string | null;
  cacheControl?: string;
}): Promise<UploadedObject> {
  const { client, config } = createObjectStorageClient();
  const storageKey = buildObjectStorageKey(args.folder, {
    filename: args.filename,
    contentType: args.contentType,
  });

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: storageKey,
        Body: args.body,
        ContentType: args.contentType || 'application/octet-stream',
        CacheControl: args.cacheControl || 'public, max-age=31536000, immutable',
      }),
    );
  } catch (error) {
    throw new ObjectStorageError(
      error instanceof Error && error.message
        ? `Object storage upload failed: ${error.message}`
        : 'Object storage upload failed.',
      502,
      'OBJECT_STORAGE_UPLOAD_FAILED',
    );
  }

  return {
    provider: STORAGE_PROVIDER_NEON,
    storageKey,
    publicUrl: buildObjectStoragePublicUrl(storageKey, config),
    contentType: args.contentType || 'application/octet-stream',
    bytes: args.body.length,
  };
}

export async function createPresignedUpload(args: {
  folder: string;
  contentType: string;
  filename?: string | null;
  expiresIn?: number;
}) {
  const { client, config } = createObjectStorageClient();
  const storageKey = buildObjectStorageKey(args.folder, {
    filename: args.filename,
    contentType: args.contentType,
  });

  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: storageKey,
    ContentType: args.contentType || 'application/octet-stream',
    CacheControl: 'public, max-age=31536000, immutable',
  });

  const uploadUrl = await getSignedUrl(client, command, {
    expiresIn: args.expiresIn ?? 60 * 15,
  });

  return {
    provider: STORAGE_PROVIDER_NEON,
    storageKey,
    uploadUrl,
    publicUrl: buildObjectStoragePublicUrl(storageKey, config),
    contentType: args.contentType || 'application/octet-stream',
    bucket: config.bucket,
  };
}

export function isCloudinaryHostedUrl(value?: string | null) {
  if (!value || typeof value !== 'string') return false;
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === 'res.cloudinary.com' || host.endsWith('.cloudinary.com');
  } catch {
    return false;
  }
}

export function resolveStorageProvider(args: {
  storageProvider?: string | null;
  cloudinaryPublicId?: string | null;
  imageUrl?: string | null;
}): StorageProvider | null {
  const explicit = (args.storageProvider || '').trim().toLowerCase();
  if (explicit === STORAGE_PROVIDER_NEON || explicit === STORAGE_PROVIDER_CLOUDINARY) {
    return explicit;
  }
  if (args.cloudinaryPublicId) {
    return STORAGE_PROVIDER_CLOUDINARY;
  }
  if (isCloudinaryHostedUrl(args.imageUrl)) {
    return STORAGE_PROVIDER_CLOUDINARY;
  }
  if (args.imageUrl) {
    return STORAGE_PROVIDER_NEON;
  }
  return null;
}
