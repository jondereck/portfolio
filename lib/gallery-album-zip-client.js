'use client';

import JSZip from 'jszip';

const triggerBlobDownload = (blob, filename) => {
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(blobUrl);
};

const sanitizeZipPart = (value) => {
  const trimmed = String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-');
  return trimmed.slice(0, 120).trim() || 'file';
};

const uniqueZipName = (preferredName, nameCounts) => {
  const safe = sanitizeZipPart(preferredName);
  const seen = nameCounts.get(safe) ?? 0;
  nameCounts.set(safe, seen + 1);
  if (seen === 0) return safe;
  const match = safe.match(/(\.[a-z0-9]{2,8})$/i);
  const ext = match?.[1] || '';
  const base = ext ? safe.slice(0, -ext.length) : safe;
  return `${base}-${seen + 1}${ext}`;
};

/**
 * Packs an album ZIP on the client with live per-media progress (same shape as upload batch).
 */
export async function downloadAlbumZipWithProgress({
  albumId,
  shareToken = '',
  fallbackFilename = 'album.zip',
  signal,
  onProgressChange,
}) {
  if (!albumId) {
    throw new Error('Album is required.');
  }

  const emit = (next) => {
    onProgressChange?.(next);
  };

  emit({
    percent: 0,
    currentFileName: 'Preparing album…',
    currentFileIndex: 0,
    totalFiles: 0,
    uploadedCount: 0,
    skippedCount: 0,
    failedCount: 0,
    lastResult: null,
  });

  const manifestUrl = new URL(`/api/gallery/albums/${albumId}/download`, window.location.origin);
  manifestUrl.searchParams.set('manifest', '1');
  if (shareToken) {
    manifestUrl.searchParams.set('share', shareToken);
  }

  const manifestResponse = await fetch(`${manifestUrl.pathname}${manifestUrl.search}`, {
    method: 'GET',
    cache: 'no-store',
    credentials: 'same-origin',
    signal,
  });

  if (!manifestResponse.ok) {
    const body = await manifestResponse.json().catch(() => null);
    throw new Error(body?.error || 'Unable to prepare album download.');
  }

  const manifest = await manifestResponse.json();
  const photos = Array.isArray(manifest?.photos) ? manifest.photos : [];
  const skippedCount = Number(manifest?.skippedCount) || 0;
  const zipFilename = String(manifest?.filename || fallbackFilename).trim() || fallbackFilename;
  const totalFiles = photos.length;

  if (totalFiles === 0) {
    emit({
      percent: 100,
      currentFileName: 'No downloadable media',
      currentFileIndex: 0,
      totalFiles: 0,
      uploadedCount: 0,
      skippedCount,
      failedCount: 0,
      lastResult: null,
    });
    throw new Error('No downloadable media in this album.');
  }

  emit({
    percent: 1,
    currentFileName: 'Preparing media…',
    currentFileIndex: 0,
    totalFiles,
    uploadedCount: 0,
    skippedCount,
    failedCount: 0,
    lastResult: null,
  });

  const zip = new JSZip();
  const nameCounts = new Map();
  let uploadedCount = 0;
  let failedCount = 0;
  let lastResult = null;
  const sequenceWidth = Math.max(2, String(totalFiles).length);

  for (let index = 0; index < photos.length; index += 1) {
    if (signal?.aborted) {
      throw new DOMException('Download cancelled.', 'AbortError');
    }

    const photo = photos[index];
    const label = sanitizeZipPart(photo?.filename || `media-${photo?.id || index + 1}`);
    const progressBase = Math.round((index / totalFiles) * 90);

    emit({
      percent: Math.max(1, progressBase),
      currentFileName: label,
      currentFileIndex: index + 1,
      totalFiles,
      uploadedCount,
      skippedCount,
      failedCount,
      lastResult,
    });

    try {
      const itemUrl = new URL(
        `/api/gallery/albums/${albumId}/photos/${photo.id}/download`,
        window.location.origin,
      );
      if (shareToken) {
        itemUrl.searchParams.set('share', shareToken);
      }

      const response = await fetch(`${itemUrl.pathname}${itemUrl.search}`, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
        signal,
      });

      if (!response.ok) {
        failedCount += 1;
        lastResult = {
          fileName: label,
          reason: 'Download failed',
          status: 'failed',
        };
        continue;
      }

      const bytes = await response.blob();
      const headerName = response.headers.get('x-photo-filename');
      const orderedName = `${String(index + 1).padStart(sequenceWidth, '0')}-${uniqueZipName(
        headerName || label,
        nameCounts,
      )}`;
      zip.file(orderedName, bytes);
      uploadedCount += 1;
      lastResult = {
        fileName: label,
        reason: 'Packed',
        status: 'uploaded',
      };
    } catch (error) {
      if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
        throw new DOMException('Download cancelled.', 'AbortError');
      }
      failedCount += 1;
      lastResult = {
        fileName: label,
        reason: error instanceof Error ? error.message : 'Download failed',
        status: 'failed',
      };
    }

    emit({
      percent: Math.round(((index + 1) / totalFiles) * 90),
      currentFileName: label,
      currentFileIndex: index + 1,
      totalFiles,
      uploadedCount,
      skippedCount,
      failedCount,
      lastResult,
    });
  }

  if (signal?.aborted) {
    throw new DOMException('Download cancelled.', 'AbortError');
  }

  if (uploadedCount === 0) {
    throw new Error('Unable to pack any media into the ZIP.');
  }

  emit({
    percent: 92,
    currentFileName: 'Creating ZIP…',
    currentFileIndex: totalFiles,
    totalFiles,
    uploadedCount,
    skippedCount,
    failedCount,
    lastResult,
  });

  const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }, (metadata) => {
    if (signal?.aborted) {
      return;
    }
    const packPercent = 92 + Math.round((Number(metadata.percent) || 0) * 0.08);
    emit({
      percent: Math.min(99, packPercent),
      currentFileName: 'Creating ZIP…',
      currentFileIndex: totalFiles,
      totalFiles,
      uploadedCount,
      skippedCount,
      failedCount,
      lastResult,
    });
  });

  if (signal?.aborted) {
    throw new DOMException('Download cancelled.', 'AbortError');
  }

  triggerBlobDownload(zipBlob, zipFilename);

  emit({
    percent: 100,
    currentFileName: zipFilename,
    currentFileIndex: totalFiles,
    totalFiles,
    uploadedCount,
    skippedCount,
    failedCount,
    lastResult,
  });

  return {
    filename: zipFilename,
    includedCount: uploadedCount,
    skippedCount,
    failedCount,
  };
}
