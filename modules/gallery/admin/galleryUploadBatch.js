'use client';

import { fetchJson, toRequestError, uploadFormDataWithProgress } from './galleryAdminShared';

const MAX_IMAGE_FILE_SIZE = 5 * 1024 * 1024;
const MAX_VIDEO_FILE_SIZE = 120 * 1024 * 1024;
const MAX_AUDIO_FILE_SIZE = 50 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const ALLOWED_VIDEO_MIME_TYPES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-matroska',
]);
const ALLOWED_AUDIO_MIME_TYPES = new Set([
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
const ALLOWED_VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'webm', 'mkv']);
const ALLOWED_AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'aac', 'ogg', 'm4a', 'flac']);

const DIRECT_UPLOAD_NOT_AVAILABLE = 'DIRECT_UPLOAD_NOT_AVAILABLE';
const DEFAULT_UPLOAD_CONCURRENCY = 3;

function getFileExtension(file) {
  return (file?.name?.split('.').pop() || '').toLowerCase();
}

function validateMediaFile(file) {
  const normalizedType = (file?.type || '').toLowerCase();
  const extension = getFileExtension(file);
  const isImage = ALLOWED_IMAGE_MIME_TYPES.has(normalizedType);
  const isVideo = ALLOWED_VIDEO_MIME_TYPES.has(normalizedType) || (!normalizedType && ALLOWED_VIDEO_EXTENSIONS.has(extension));
  const isAudio = ALLOWED_AUDIO_MIME_TYPES.has(normalizedType) || (!normalizedType && ALLOWED_AUDIO_EXTENSIONS.has(extension));

  if (isImage) {
    if ((file?.size || 0) > MAX_IMAGE_FILE_SIZE) {
      throw toRequestError(
        {
          error: 'Image files must be 5MB or smaller.',
          errorCode: 'IMAGE_TOO_LARGE',
        },
        'Image file is too large.',
        413,
      );
    }
    return;
  }

  if (isVideo) {
    if (!ALLOWED_VIDEO_EXTENSIONS.has(extension)) {
      throw toRequestError(
        {
          error: 'Video uploads must use MP4, MOV, WEBM, or MKV files.',
          errorCode: 'UNSUPPORTED_MEDIA_TYPE',
        },
        'Unsupported video format.',
        400,
      );
    }

    if ((file?.size || 0) > MAX_VIDEO_FILE_SIZE) {
      throw toRequestError(
        {
          error: 'Video files must be 120MB or smaller.',
          errorCode: 'VIDEO_TOO_LARGE',
        },
        'Video file is too large.',
        413,
      );
    }
    return;
  }

  if (isAudio) {
    if (!ALLOWED_AUDIO_EXTENSIONS.has(extension)) {
      throw toRequestError(
        {
          error: 'Audio uploads must use MP3, WAV, AAC, OGG, M4A, or FLAC files.',
          errorCode: 'UNSUPPORTED_MEDIA_TYPE',
        },
        'Unsupported audio format.',
        400,
      );
    }

    if ((file?.size || 0) > MAX_AUDIO_FILE_SIZE) {
      throw toRequestError(
        {
          error: 'Audio files must be 50MB or smaller.',
          errorCode: 'AUDIO_TOO_LARGE',
        },
        'Audio file is too large.',
        413,
      );
    }
    return;
  }

  throw toRequestError(
    {
      error: 'Only PNG, JPG, WEBP, GIF, MP4, MOV, WEBM, MKV, MP3, WAV, AAC, OGG, M4A, or FLAC files are supported.',
      errorCode: 'UNSUPPORTED_MEDIA_TYPE',
    },
    'Unsupported media type.',
    400,
  );
}

async function sha256Hex(file) {
  if (typeof window === 'undefined' || !window.crypto?.subtle) {
    return undefined;
  }

  const buffer = await file.arrayBuffer();
  const digest = await window.crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

function buildCloudinaryPlaybackUrl({ cloudName, publicId, resourceType, secureUrl, mimeType }) {
  const isAudio = typeof mimeType === 'string' && mimeType.toLowerCase().startsWith('audio/');
  if (resourceType !== 'video' || !cloudName || !publicId || isAudio) {
    return secureUrl;
  }

  return `https://res.cloudinary.com/${cloudName}/video/upload/f_mp4,q_auto,vc_h264,ac_aac/${publicId}.mp4`;
}

function uploadDirectToCloudinary(file, { folder, onProgress, signal } = {}) {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

  if (!cloudName || !uploadPreset) {
    throw toRequestError(
      {
        error: 'Direct media upload is not configured.',
        errorCode: DIRECT_UPLOAD_NOT_AVAILABLE,
      },
      'Direct media upload is not configured.',
      500,
    );
  }

  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', uploadPreset);
    formData.append('resource_type', 'auto');
    if (folder) {
      formData.append('folder', folder);
    }

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`);
    xhr.responseType = 'json';

    const abortError = () => Object.assign(new Error('Upload cancelled.'), { name: 'AbortError' });
    const onAbort = () => {
      xhr.abort();
      reject(abortError());
    };

    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || typeof onProgress !== 'function') {
        return;
      }

      onProgress({
        loaded: event.loaded,
        total: event.total,
        percent: event.total > 0 ? Math.round((event.loaded / event.total) * 100) : 0,
      });
    };

    xhr.onload = () => {
      signal?.removeEventListener('abort', onAbort);
      const payload = xhr.response ?? {};
      if (xhr.status >= 200 && xhr.status < 300 && payload.secure_url) {
        resolve(payload);
        return;
      }

      reject(
        toRequestError(
          {
            error:
              payload?.error?.message ||
              payload?.message ||
              'Direct media upload failed.',
            errorCode: payload?.error?.http_code ? `CLOUDINARY_${payload.error.http_code}` : 'DIRECT_UPLOAD_FAILED',
            details: payload,
          },
          'Direct media upload failed.',
          xhr.status || 500,
        ),
      );
    };

    xhr.onerror = () => {
      signal?.removeEventListener('abort', onAbort);
      reject(toRequestError({}, 'Network request failed during direct upload.'));
    };

    xhr.onabort = () => {
      signal?.removeEventListener('abort', onAbort);
      reject(abortError());
    };

    xhr.send(formData);
  });
}

async function saveUploadedAlbumPhoto({ albumId, file, uploaded, signal }) {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const contentHash = await sha256Hex(file);

  return fetchJson(`/api/gallery/albums/${albumId}/photos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      imageUrl: buildCloudinaryPlaybackUrl({
        cloudName,
        publicId: uploaded.public_id,
        resourceType: uploaded.resource_type,
        secureUrl: uploaded.secure_url,
        mimeType: file.type,
      }),
      caption: file.name,
      cloudinaryPublicId: typeof uploaded.public_id === 'string' ? uploaded.public_id : undefined,
      contentHash,
      originalFilename: file.name,
      mimeType: file.type || undefined,
      fileSizeBytes: file.size || undefined,
      sourceType: 'upload',
    }),
  });
}

async function uploadAlbumFileDirect({ albumId, file, onProgress, signal }) {
  validateMediaFile(file);
  const uploaded = await uploadDirectToCloudinary(file, {
    folder: `portfolio/gallery/${albumId}`,
    onProgress,
    signal,
  });

  await saveUploadedAlbumPhoto({ albumId, file, uploaded, signal });
}

async function uploadAlbumFileViaServer({ albumId, file, onProgress, signal }) {
  validateMediaFile(file);
  const formData = new FormData();
  formData.append('imageFile', file);
  formData.append('caption', file.name);

  await uploadFormDataWithProgress(`/api/gallery/albums/${albumId}/photos`, formData, {
    onProgress,
    signal,
  });
}

export function createEmptyUploadSummary() {
  return {
    totalFiles: 0,
    uploadedCount: 0,
    skippedCount: 0,
    failedCount: 0,
    results: [],
  };
}

const pluralize = (count, singular, plural = `${singular}s`) => `${count} ${count === 1 ? singular : plural}`;

export function isDuplicateUploadError(error) {
  return error?.errorCode === 'DUPLICATE_MEDIA' || error?.errorCode === 'DUPLICATE_SOURCE_MEDIA';
}

export function getUploadResultReason(error) {
  if (isDuplicateUploadError(error)) {
    const albumName = error?.duplicate?.album?.name;
    if (error.message) {
      return error.message;
    }
    return albumName
      ? `This media already exists in the album “${albumName}”.`
      : 'This media already exists in another album.';
  }

  return error?.message || 'Upload failed.';
}

export function getUploadSummaryToast(summary) {
  if (!summary || summary.totalFiles === 0) {
    return 'No files were processed.';
  }

  const parts = [];
  if (summary.uploadedCount > 0) {
    parts.push(pluralize(summary.uploadedCount, 'file'));
  }
  if (summary.skippedCount > 0) {
    parts.push(`${pluralize(summary.skippedCount, 'duplicate')} skipped`);
  }
  if (summary.failedCount > 0) {
    parts.push(`${pluralize(summary.failedCount, 'file')} failed`);
  }

  return parts.length > 0 ? parts.join(' · ') : 'No files were processed.';
}

export async function uploadAlbumFiles({
  albumId,
  files,
  onProgressChange,
  concurrency = DEFAULT_UPLOAD_CONCURRENCY,
  signal,
}) {
  const nextFiles = Array.from(files || []);
  if (!albumId || nextFiles.length === 0) {
    const emptySummary = createEmptyUploadSummary();
    onProgressChange?.(null);
    return emptySummary;
  }

  const totalBytes = Math.max(nextFiles.reduce((sum, file) => sum + (file.size || 0), 0), 1);
  let uploadedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  const results = new Array(nextFiles.length);
  const perFileLoadedBytes = new Array(nextFiles.length).fill(0);
  let lastResultIndex = -1;

  const assertNotAborted = () => {
    if (signal?.aborted) {
      const error = new Error('Upload cancelled.');
      error.name = 'AbortError';
      throw error;
    }
  };

  const getLoadedBytes = () =>
    nextFiles.reduce((sum, file, index) => {
      const fileSize = file?.size || 0;
      return sum + Math.min(perFileLoadedBytes[index] || 0, fileSize || perFileLoadedBytes[index] || 0);
    }, 0);

  const emitProgress = (index) => {
    const currentFile = nextFiles[index] ?? nextFiles[0] ?? null;
    onProgressChange?.({
      percent: Math.min(100, Math.round((getLoadedBytes() / totalBytes) * 100)),
      currentFileName: currentFile?.name ?? '',
      currentFileIndex: index + 1,
      totalFiles: nextFiles.length,
      uploadedCount,
      skippedCount,
      failedCount,
      lastResult: lastResultIndex >= 0 ? results[lastResultIndex] ?? null : null,
    });
  };

  const markFileProgress = (index, loaded) => {
    perFileLoadedBytes[index] = Math.max(perFileLoadedBytes[index] || 0, loaded || 0);
    emitProgress(index);
  };

  const finalizeFileProgress = (index) => {
    const file = nextFiles[index];
    perFileLoadedBytes[index] = file?.size || perFileLoadedBytes[index] || 0;
    emitProgress(index);
  };

  const processFile = async (index) => {
    assertNotAborted();
    const file = nextFiles[index];
    emitProgress(index);

    try {
      const emitFileProgress = ({ loaded }) => {
        markFileProgress(index, loaded);
      };

      try {
        await uploadAlbumFileDirect({
          albumId,
          file,
          onProgress: emitFileProgress,
          signal,
        });
      } catch (error) {
        if (error?.name === 'AbortError') {
          throw error;
        }
        if (error?.errorCode === DIRECT_UPLOAD_NOT_AVAILABLE) {
          await uploadAlbumFileViaServer({
            albumId,
            file,
            onProgress: emitFileProgress,
            signal,
          });
        } else {
          throw error;
        }
      }

      uploadedCount += 1;
      results[index] = {
        fileName: file.name,
        status: 'success',
        reason: 'Uploaded successfully.',
      };
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw error;
      }

      const duplicate = isDuplicateUploadError(error);
      if (duplicate) {
        skippedCount += 1;
      } else {
        failedCount += 1;
      }

      results[index] = {
        fileName: file.name,
        status: duplicate ? 'duplicate-skipped' : 'error',
        reason: getUploadResultReason(error),
        errorCode: error?.errorCode,
        duplicate: error?.duplicate ?? null,
      };
    } finally {
      lastResultIndex = index;
      finalizeFileProgress(index);
    }
  };

  const workerCount = Math.max(1, Math.min(Number(concurrency) || DEFAULT_UPLOAD_CONCURRENCY, nextFiles.length));
  let nextIndex = 0;

  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < nextFiles.length) {
      assertNotAborted();
      const index = nextIndex;
      nextIndex += 1;
      await processFile(index);
    }
  });

  await Promise.all(workers);

  return {
    totalFiles: nextFiles.length,
    uploadedCount,
    skippedCount,
    failedCount,
    results,
  };
}
