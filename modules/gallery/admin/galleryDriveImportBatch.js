'use client';

/** Keep each import request under platform timeouts (hash + DB writes). */
export const DRIVE_IMPORT_CHUNK_SIZE = 25;

export function chunkArray(items, size) {
  const chunkSize = Math.max(1, Number(size) || 1);
  const list = Array.isArray(items) ? items : [];
  const chunks = [];
  for (let index = 0; index < list.length; index += chunkSize) {
    chunks.push(list.slice(index, index + chunkSize));
  }
  return chunks;
}

function parseSseMessages(buffer) {
  const messages = buffer.split('\n\n');
  const remainder = messages.pop() || '';
  const events = [];

  for (const message of messages) {
    const lines = message.split('\n');
    let eventName = 'message';
    let dataText = '';
    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataText += line.slice(5).trim();
      }
    }
    if (!dataText) {
      continue;
    }
    events.push({ eventName, payload: JSON.parse(dataText) });
  }

  return { events, remainder };
}

/**
 * Streams one Drive import chunk and returns the complete payload.
 * Calls onProgress with raw SSE progress events from the server.
 */
export async function importDriveChunk({
  albumId,
  folderId,
  selectedFileIds,
  mediaTypeFilter,
  signal,
  onProgress,
}) {
  const response = await fetch(`/api/gallery/albums/${albumId}/import/google-drive?stream=1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    cache: 'no-store',
    body: JSON.stringify({
      folderId,
      selectedFileIds,
      mediaTypeFilter: mediaTypeFilter || 'all',
    }),
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload?.error || 'Unable to import Google Drive folder.');
  }

  if (!response.body) {
    throw new Error('Import stream is unavailable.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result = null;

  const consume = (chunkText) => {
    buffer += chunkText;
    const { events, remainder } = parseSseMessages(buffer);
    buffer = remainder;
    for (const event of events) {
      if (event.eventName === 'progress') {
        onProgress?.(event.payload);
      } else if (event.eventName === 'complete') {
        result = event.payload;
      } else if (event.eventName === 'error') {
        throw new Error(event.payload?.error || 'Unable to import Google Drive folder.');
      }
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    consume(decoder.decode(value, { stream: true }));
  }
  consume(decoder.decode());

  if (!result) {
    throw new Error('Import finished without a final result.');
  }

  return result;
}

export async function resolveDriveImportFileIds({
  albumId,
  folderId,
  selectedFileIds,
  mediaTypeFilter,
  signal,
}) {
  const selected = Array.isArray(selectedFileIds)
    ? Array.from(new Set(selectedFileIds.filter(Boolean)))
    : [];
  if (selected.length > 0) {
    return selected;
  }

  const response = await fetch(`/api/gallery/albums/${albumId}/import/google-drive/media-ids`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    cache: 'no-store',
    body: JSON.stringify({
      folderId,
      mediaTypeFilter: mediaTypeFilter || 'all',
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || 'Unable to list Google Drive media.');
  }

  const fileIds = Array.isArray(payload.fileIds) ? payload.fileIds.filter(Boolean) : [];
  return Array.from(new Set(fileIds));
}
