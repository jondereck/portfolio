# Google Drive Import UX + Shared Upload Blocking Modal

**Date:** 2026-09-11  
**Status:** Approved for planning  
**Scope:** Gallery Google Drive folder picker UX, reusable admin hints, blocking progress modal for Drive import and local uploads, capped post-batch warnings.

## Goals

1. Simplify Drive folder browsing so folder click navigates and selects without a separate Folders/Preview tab flow.
2. Fix doubled breadcrumb path (`Drive > My Drive > My Drive`).
3. Move inline hint copy into a reusable `AdminHint` used first in the Drive picker, available system-wide.
4. Show a full-screen blocking progress modal for **both** Google Drive import and local album file uploads, with cancel and leave/refresh protection until cancel or completion.
5. Cap long duplicate/error lists in batch summaries behind Show more / Show less.

## Non-goals

- Changing Drive OAuth / API import semantics (still non-recursive, folder or checked files).
- Redesigning admin chrome outside this flow.
- Building a new progress UI from scratch (reuse `GalleryBatchProgressCard`).

## Architecture

```
AdminHint (shared)
  └─ used by GalleryDriveFolderPicker (and later any admin surface)

GalleryBatchProgressModal (gallery)
  ├─ wraps GalleryBatchProgressCard
  ├─ leave guards (beforeunload + history trap)
  └─ Cancel → abort controller (upload or import)

GalleryBatchResultSummary
  └─ initialVisibleCount=5 + Show more / Show less

Controllers
  ├─ useGalleryAdminController opens one modal for importingDrive or uploadingFiles
  └─ abort for Drive (existing) + local upload (new)
```

## 1. Folder picker behavior

**File:** `modules/gallery/admin/GalleryDriveFolderPicker.jsx`

### Layout

- Remove mobile Folders / Preview tab switcher.
- Single scrollable body: breadcrumbs, subfolder list, then media preview for the **current** folder.
- Desktop may keep a split layout (folders | media) if it already fits one continuous browse model, but must not force a tab switch on folder click. Prefer one continuous stack on mobile; split only as layout, not as separate modes.

### Selection

- Clicking a folder row:
  - Navigates into that folder (`loadFolders(folder.id)`).
  - Marks that folder as the selected import source immediately (local selection state + visual Selected treatment).
  - Does **not** close the dialog.
- Remove the per-row **Select** button.
- Footer primary action remains the confirm/close action (“Use this folder” / “Select this media”) with optional checked media IDs.
- If no media is checked, import source is the whole selected folder (existing behavior).

### Breadcrumbs

- UI currently prefixes a static `Drive` chip and then renders API breadcrumbs that already start with `{ id: 'root', name: 'My Drive' }`, which produces `Drive > My Drive` at root and can double when the chain also includes a My Drive folder entry.
- Fix (single choice): keep the static home chip labeled **Drive**; render breadcrumbs **excluding** the root `My Drive` entry. Example at root: `Drive`. Example in a child: `Drive > Photos`.
- Never show two consecutive root labels (`Drive` then `My Drive`).

### Hints in picker

Replace the two long paragraph hints with `AdminHint`:

1. Import source: *This folder is the import source. If no media is checked, the whole selected folder will be imported.*
2. Preview: *Preview only. Use checks for manual import; leave all unchecked to import the whole folder.*

Keep the existing “Safe import behavior” callout or convert it to `AdminHint` with the same copy (no new messaging).

## 2. Reusable `AdminHint`

**File:** `components/admin/shared/AdminHint.jsx`

### API

```jsx
<AdminHint tone="info" title={optional}>
  {children}
</AdminHint>
```

- `tone`: `info` | `warning` | `success` (default `info`)
- Compact slate admin styling (border, soft bg, optional lucide icon by tone)
- No Drive-specific styles or copy inside the component

## 3. Blocking progress modal

**File:** `modules/gallery/admin/GalleryBatchProgressModal.jsx` (new)

### When open

Open when either:

- `uploadingFiles && uploadProgress`, or
- `importingDrive && importProgress`

Mount once from gallery admin shell / media panel / import surfaces that already own controller state so both flows share one modal.

### Behavior

- Full-viewport overlay (`z-index` above dialogs used for pickers when import runs after picker close).
- Pointer events blocked on the rest of the page (overlay captures all taps/clicks).
- Backdrop and Escape do **not** dismiss.
- Content: existing `GalleryBatchProgressCard` + warning line: do not go back or refresh while uploading/importing + **Cancel** button.
- On Cancel: abort the active operation (`cancelDriveImport` or new `cancelUpload`), close modal, toast cancelled message.
- While open, install leave guards:
  - History trap (`pushState` + `popstate`): browser/app back stays on the page and keeps the modal open; back does **not** cancel the job. Only Cancel (or natural completion) ends it.
  - `beforeunload`: refresh / tab close shows the browser’s native leave confirmation. Browsers cannot hard-block refresh without that prompt; staying on the page continues the job.
- Guards removed when the operation ends or Cancel completes.
- Modal warning copy: do not go back or refresh while uploading/importing; use Cancel if you need to stop.

### Integration

- Remove inline `GalleryBatchProgressCard` under Drive import forms and upload dropzone while the modal is the live progress UI (avoid double progress).
- Keep `GalleryBatchResultSummary` after completion in place.
- Local uploads: add `AbortController` through `uploadAlbumFiles` / `uploadFormDataWithProgress` so Cancel works mid-batch (skip remaining files after abort; treat abort as cancelled, not failure spam).

## 4. Capped warnings in batch summary

**File:** `modules/gallery/admin/GalleryBatchResultSummary.jsx`

- Default `initialVisibleCount = 5`.
- If flagged entries (duplicates + failures) exceed that count, show the first 5 and a **Show more (N)** control; expanded state shows all with **Show less**.
- Applies to Drive import and local upload summaries (same component).

## Error handling

| Case | Behavior |
|------|----------|
| User Cancels | Abort; toast cancelled; clear progress; no fake success summary |
| Network/API failure | Existing toast + clear importing/uploading flags; modal closes |
| Duplicates / partial success | Modal closes on complete; summary shows capped flagged list |
| Refresh attempted during run | Browser `beforeunload` prompt; operation continues only if user stays |

## Testing (manual)

1. Drive picker: no Folders/Preview tabs; click folder navigates + selects; no row Select; confirm footer still works.
2. Breadcrumbs never show doubled My Drive.
3. Hints render via `AdminHint`.
4. Local upload opens blocking modal; cannot interact with page; Cancel aborts; refresh prompts.
5. Drive import opens same modal pattern; Cancel aborts; back does not dismiss without Cancel.
6. Summary with >5 duplicates/errors shows Show more / Show less.

## Out of scope follow-ups

- Applying `AdminHint` to unrelated admin pages beyond Drive picker (component only needs to be ready).
- Changing import concurrency or server SSE protocol.
