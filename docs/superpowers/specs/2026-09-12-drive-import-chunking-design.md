# Drive import chunking (large folders)

## Problem
Importing 900+ Drive images fails with `Import finished without a final result` because one SSE request times out while hashing every file (full download per item).

## Decision
**A — seamless:** auto-list folder media IDs, then import in client-orchestrated chunks.

## Design
1. **List IDs API** — `POST .../import/google-drive/media-ids` returns `{ fileIds: string[] }` for a folder + mediaTypeFilter (no hashing).
2. **Client chunks** — resolve IDs (selection or list API), import batches of ~25 via existing `?stream=1`, merge progress/results, one cancel aborts all.
3. **Faster hash** — prefer Drive metadata `sha256Checksum` / `md5Checksum` when present; fall back to alt=media stream hash.
4. **Safety** — `maxDuration = 300` on import route.

## Out of scope
Background job queue, changing duplicate semantics, UI redesign.
