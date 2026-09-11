# Google Drive Import UX + Blocking Upload Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify the Drive folder picker, add reusable `AdminHint`, show one blocking progress modal for Drive import and local uploads (with cancel + leave guards), and cap batch warning lists behind Show more.

**Architecture:** Shared `AdminHint` for copy; picker becomes a single browse surface (click folder = navigate + pending select); `GalleryBatchProgressModal` wraps existing `GalleryBatchProgressCard` and mounts once from gallery media/import UIs; upload/import abort via AbortController; `GalleryBatchResultSummary` gains a 5-item collapse.

**Tech Stack:** Next.js App Router, React client components, Headless UI Dialog (picker already), XHR uploads in `galleryAdminShared.js`, SSE Drive import in `useGalleryAdminController.js`, Tailwind admin slate patterns.

**Spec:** `docs/superpowers/specs/2026-09-11-google-drive-import-ux-design.md`

## Global Constraints

- Do not redesign admin chrome; preserve Gallery CMS density and established slate look (`AGENTS.md`).
- Reuse `GalleryBatchProgressCard` — do not invent a new progress UI.
- Drive import remains non-recursive; unchecked media = whole selected folder.
- Breadcrumbs: static **Drive** home chip + API crumbs **excluding** root `My Drive`.
- Blocking modal for both `uploadingFiles` and `importingDrive`; back/refresh protected until Cancel or completion.
- Default warning list shows 5 flagged rows, then Show more / Show less.
- No automated unit-test runner in this repo — each task ends with an explicit manual verification checklist.

---

## File map

| File | Responsibility |
|------|----------------|
| `components/admin/shared/AdminHint.jsx` | Reusable hint callout |
| `modules/gallery/admin/GalleryBatchResultSummary.jsx` | Capped flagged list + Show more |
| `modules/gallery/admin/GalleryDriveFolderPicker.jsx` | Tabs removed, auto-select on navigate, breadcrumb fix, AdminHint |
| `modules/gallery/admin/galleryAdminShared.js` | XHR abort support on `uploadFormDataWithProgress` |
| `modules/gallery/admin/galleryUploadBatch.js` | Accept `signal`, stop workers on abort |
| `modules/gallery/admin/useGalleryAdminController.js` | Upload abort + `cancelUpload`; export cancel handlers |
| `modules/gallery/admin/GalleryBatchProgressModal.jsx` | Blocking modal + leave guards |
| `modules/gallery/admin/GalleryUploadDropzone.jsx` | Drop inline progress card |
| `modules/gallery/admin/GalleryDriveImportSection.jsx` | Drop inline progress; mount modal if needed |
| `modules/gallery/admin/GalleryImportPanel.jsx` | Drop inline progress; mount modal if needed |
| `modules/gallery/admin/GalleryMediaPanel.jsx` | Mount single shared progress modal |

---

### Task 1: `AdminHint` shared component

**Files:**
- Create: `components/admin/shared/AdminHint.jsx`
- Modify: none yet (wired in Task 3)

**Interfaces:**
- Produces: `AdminHint({ tone?: 'info' | 'warning' | 'success', title?: string, children, className?: string })`

- [ ] **Step 1: Create `AdminHint.jsx`**

```jsx
'use client';

import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';

const TONE_STYLES = {
  info: {
    wrap: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300',
    iconWrap: 'bg-white text-slate-600 shadow-sm dark:bg-slate-800 dark:text-slate-300',
    Icon: Info,
  },
  warning: {
    wrap: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100',
    iconWrap: 'bg-white text-amber-700 shadow-sm dark:bg-amber-950/40 dark:text-amber-200',
    Icon: AlertTriangle,
  },
  success: {
    wrap: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100',
    iconWrap: 'bg-white text-emerald-700 shadow-sm dark:bg-emerald-950/40 dark:text-emerald-200',
    Icon: CheckCircle2,
  },
};

export default function AdminHint({ tone = 'info', title, children, className = '' }) {
  const styles = TONE_STYLES[tone] || TONE_STYLES.info;
  const Icon = styles.Icon;

  return (
    <div className={`flex gap-3 rounded-2xl border px-3 py-3 text-sm leading-6 sm:px-4 ${styles.wrap} ${className}`.trim()}>
      <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${styles.iconWrap}`}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold text-inherit">{title}</p> : null}
        <div className={title ? 'mt-1 opacity-90' : ''}>{children}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Manual verify**

Open any admin page after later wiring, or temporarily render in Drive picker. Expected: compact slate hint with icon, no Drive-specific classes inside the component file.

- [ ] **Step 3: Commit**

```bash
git add components/admin/shared/AdminHint.jsx
git commit -m "$(cat <<'EOF'
feat(admin): add reusable AdminHint callout

EOF
)"
```

---

### Task 2: Cap flagged warnings in `GalleryBatchResultSummary`

**Files:**
- Modify: `modules/gallery/admin/GalleryBatchResultSummary.jsx`

**Interfaces:**
- Produces: optional prop `initialVisibleCount` (default `5`); Show more / Show less when flagged rows exceed that count

- [ ] **Step 1: Add expandable flagged list**

Add `useState` import from React. Change the component signature and flagged list block:

```jsx
'use client';

import { useState } from 'react';
import { AlertTriangle, Check, X } from 'lucide-react';

// ... keep truncate helpers ...

export default function GalleryBatchResultSummary({
  summary,
  uploadedLabel = 'Uploaded',
  skippedLabel = 'Duplicates',
  failedLabel = 'Failed',
  flaggedHeading = 'Skipped and failed files',
  initialVisibleCount = 5,
  className = '',
}) {
  const [expanded, setExpanded] = useState(false);
  const hasSummary = summary && Number(summary.totalFiles) > 0;
  const resultEntries = Array.isArray(summary?.results) ? summary.results : [];
  const flaggedEntries = resultEntries.filter((entry) => entry.status !== 'success');
  const hiddenCount = Math.max(0, flaggedEntries.length - initialVisibleCount);
  const visibleFlagged = expanded || hiddenCount === 0
    ? flaggedEntries
    : flaggedEntries.slice(0, initialVisibleCount);

  // ... keep the three metric cards unchanged ...

  // Replace the flaggedEntries.map block to map `visibleFlagged` instead,
  // then after the list add:

  {hiddenCount > 0 ? (
    <button
      type="button"
      className="mt-2 text-xs font-bold text-slate-700 underline-offset-2 hover:underline dark:text-slate-200"
      onClick={() => setExpanded((value) => !value)}
    >
      {expanded ? 'Show less' : `Show more (${hiddenCount})`}
    </button>
  ) : null}
```

- [ ] **Step 2: Manual verify**

Use a batch with >5 duplicates/errors (or temporarily set `initialVisibleCount={1}`). Expected: only first N rows, Show more (remaining), then Show less.

- [ ] **Step 3: Commit**

```bash
git add modules/gallery/admin/GalleryBatchResultSummary.jsx
git commit -m "$(cat <<'EOF'
feat(gallery): collapse long batch warning lists

EOF
)"
```

---

### Task 3: Drive folder picker UX (tabs, select, breadcrumbs, hints)

**Files:**
- Modify: `modules/gallery/admin/GalleryDriveFolderPicker.jsx`
- Consumes: `AdminHint` from Task 1

**Interfaces:**
- Produces: unchanged `onSelectFolder({ id, name, breadcrumbs, mediaCount, selectedFileIds, mediaTypeFilter })` on footer confirm only
- Local pending selection while browsing; folder row click navigates + sets pending selection

- [ ] **Step 1: Add pending selection + remove tab mode**

Near other state, replace `mobileTab` with pending selection:

```jsx
import AdminHint from '@/components/admin/shared/AdminHint';

// Remove: const [mobileTab, setMobileTab] = useState('folders');
const [pendingFolder, setPendingFolder] = useState(null);
```

On `open` effect, initialize pending from props and drop tab logic:

```jsx
useEffect(() => {
  if (!open) return;
  setQuery('');
  setSelectedMediaIds(Array.isArray(selectedFileIds) ? selectedFileIds : []);
  setMediaPreviewFilter(['all', 'images', 'videos'].includes(selectedMediaTypeFilter) ? selectedMediaTypeFilter : 'all');
  setFailedPreviewIds([]);
  setPendingFolder(
    selectedFolderId
      ? { id: selectedFolderId, name: null }
      : null,
  );
  loadFolders(selectedFolderId || null, {
    keepSelectedMedia: true,
    retryToken: Date.now(),
  });
}, [open, selectedFolderId]);
```

After `loadFolders` succeeds in navigation handlers, set pending from `payload.currentFolder` when present.

- [ ] **Step 2: Fix breadcrumbs**

Replace the breadcrumb block so the static Drive chip is the only root, and map crumbs with `id !== 'root'`:

```jsx
<div className="mt-4 flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
  <button
    type="button"
    className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition ${
      !currentParentId ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
    }`}
    onClick={() => {
      setPendingFolder(null);
      loadFolders(null, { keepSelectedMedia: false });
    }}
  >
    <Home className="h-3.5 w-3.5" />
    Drive
  </button>
  {browseState.breadcrumbs
    .filter((crumb) => crumb.id !== 'root')
    .map((crumb, index, crumbs) => {
      const isCurrent = index === crumbs.length - 1;
      return (
        <Fragment key={`${crumb.id}-${index}`}>
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
          <button
            type="button"
            className={`h-8 max-w-[150px] shrink-0 truncate rounded-full px-3 text-xs font-semibold transition sm:max-w-[220px] ${
              isCurrent
                ? 'bg-slate-950 text-white'
                : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
            }`}
            onClick={() => {
              setPendingFolder({ id: crumb.id, name: crumb.name });
              loadFolders(crumb.id, { keepSelectedMedia: false });
            }}
          >
            {crumb.name}
          </button>
        </Fragment>
      );
    })}
</div>
```

Delete the mobile Folders/Preview tab grid entirely.

- [ ] **Step 3: Folder row click = navigate + select; remove Select button**

```jsx
const navigateIntoFolder = (folder) => {
  setPendingFolder({ id: folder.id, name: folder.name });
  loadFolders(folder.id, { keepSelectedMedia: false });
};

// On folder row:
onClick={() => navigateIntoFolder(folder)}
// Remove the Select <button> and its stopPropagation wrapper.
// Treat selected as: pendingFolder?.id === folder.id || selectedFolderId === folder.id
```

Also when `loadFolders` returns `currentFolder`, sync:

```jsx
if (payload?.currentFolder) {
  setPendingFolder({
    id: payload.currentFolder.id,
    name: payload.currentFolder.name,
  });
}
```

(Only when navigating into a real folder parentId — not when landing on Drive root with `currentFolder: null`.)

- [ ] **Step 4: Always show folders + media (no tab hiding)**

Change aside/section classes from `mobileTab === ...` to always visible stacked:

```jsx
<aside className="border-b border-slate-200 bg-slate-50/60 p-4 lg:block lg:min-h-0 lg:overflow-y-auto lg:border-b-0 lg:border-r lg:p-5">
<section className="bg-white p-4 pb-28 lg:min-h-0 lg:overflow-y-auto lg:p-6 lg:pb-6">
```

Outer content stays `lg:grid lg:grid-cols-[390px_1fr]`.

- [ ] **Step 5: Swap hint paragraphs for `AdminHint`**

```jsx
<AdminHint className="mt-2">
  This folder is the import source. If no media is checked, the whole selected folder will be imported.
</AdminHint>

<AdminHint className="mt-2">
  Preview only. Use checks for manual import; leave all unchecked to import the whole folder.
</AdminHint>
```

Optionally convert the Safe import callout to `<AdminHint tone="info" title="Safe import behavior">...</AdminHint>`.

- [ ] **Step 6: Footer confirm uses pending folder**

```jsx
const confirmFolder =
  browseState.currentFolder ||
  (pendingFolder?.id
    ? { id: pendingFolder.id, name: pendingFolder.name || pendingFolder.id }
    : null);

// Footer button:
onClick={() => {
  if (confirmFolder) void selectFolder(confirmFolder);
}}
disabled={!confirmFolder}
```

Update `selectedFolderName` to prefer `pendingFolder?.name`, then `browseState.currentFolder?.name`, then `'My Drive'` only when at root with no pending folder (footer may stay disabled at root if no folder selected — keep existing “must select a folder” behavior).

- [ ] **Step 7: Manual verify**

1. Open Drive import picker on phone width: no Folders/Preview tabs; scroll shows folders then media.
2. Click a folder: navigate into it; row shows Selected; dialog stays open.
3. No Select button on rows.
4. Breadcrumbs: `Drive` only at root; `Drive > Child` when nested — never `Drive > My Drive > My Drive`.
5. Footer confirms and closes with optional checked media.

- [ ] **Step 8: Commit**

```bash
git add modules/gallery/admin/GalleryDriveFolderPicker.jsx
git commit -m "$(cat <<'EOF'
fix(gallery): simplify Drive picker browse and breadcrumbs

EOF
)"
```

---

### Task 4: Abortable local uploads

**Files:**
- Modify: `modules/gallery/admin/galleryAdminShared.js` (`uploadFormDataWithProgress`)
- Modify: `modules/gallery/admin/galleryUploadBatch.js` (`uploadAlbumFiles` + direct/server helpers)
- Modify: `modules/gallery/admin/useGalleryAdminController.js`

**Interfaces:**
- Consumes: `AbortSignal`
- Produces: `uploadAlbumFiles({ ..., signal })`; controller `cancelUpload()`; export `cancelUpload` alongside `cancelDriveImport`

- [ ] **Step 1: Teach XHR to abort**

In `uploadFormDataWithProgress`:

```js
export function uploadFormDataWithProgress(url, formData, { method = 'POST', onProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    // ... existing open/setup ...

    const onAbort = () => {
      xhr.abort();
      reject(Object.assign(new Error('Upload cancelled.'), { name: 'AbortError' }));
    };

    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }

    xhr.onload = () => {
      signal?.removeEventListener('abort', onAbort);
      // ... existing resolve/reject ...
    };

    xhr.onerror = () => {
      signal?.removeEventListener('abort', onAbort);
      reject(toRequestError({}, 'Network request failed'));
    };

    xhr.onabort = () => {
      signal?.removeEventListener('abort', onAbort);
      reject(Object.assign(new Error('Upload cancelled.'), { name: 'AbortError' }));
    };

    xhr.send(formData);
  });
}
```

Pass `signal` through `uploadAlbumFileViaServer` / `uploadAlbumFileDirect` into whatever fetch/XHR they use. For `fetch`, pass `{ signal }`.

- [ ] **Step 2: Stop batch workers on abort**

In `uploadAlbumFiles`, accept `signal` and check before each file:

```js
export async function uploadAlbumFiles({
  albumId,
  files,
  onProgressChange,
  concurrency = DEFAULT_UPLOAD_CONCURRENCY,
  signal,
}) {
  // ... setup ...

  const assertNotAborted = () => {
    if (signal?.aborted) {
      const error = new Error('Upload cancelled.');
      error.name = 'AbortError';
      throw error;
    }
  };

  const processFile = async (index) => {
    assertNotAborted();
    // pass signal into uploadAlbumFileDirect / uploadAlbumFileViaServer
    // if catch AbortError, rethrow (do not count as failed file)
  };

  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < nextFiles.length) {
      assertNotAborted();
      const index = nextIndex;
      nextIndex += 1;
      await processFile(index);
    }
  });

  try {
    await Promise.all(workers);
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw error;
    }
    throw error;
  }

  // return summary as today
}
```

- [ ] **Step 3: Controller cancel for uploads**

In `useGalleryAdminController.js`:

```js
const uploadAbortControllerRef = useRef(null);

const uploadFiles = async (files) => {
  // ...
  uploadAbortControllerRef.current = new AbortController();
  try {
    const summary = await uploadAlbumFiles({
      albumId: selectedAlbumId,
      files: nextFiles,
      onProgressChange: setUploadProgress,
      signal: uploadAbortControllerRef.current.signal,
    });
    // ... existing success handling ...
  } catch (error) {
    if (error?.name === 'AbortError') {
      toast.message('Upload cancelled.');
      setUploadProgress(null);
      setUploadSummary(createEmptyUploadSummary());
    } else {
      toast.error(error.message);
    }
  } finally {
    uploadAbortControllerRef.current = null;
    setUploadingFiles(false);
  }
};

const cancelUpload = () => {
  if (!uploadingFiles) return;
  uploadAbortControllerRef.current?.abort();
  setUploadingFiles(false);
  setUploadProgress(null);
};

// export cancelUpload in the returned controller object
```

- [ ] **Step 4: Manual verify**

Start a multi-file upload, call cancel from temporary button or later modal. Expected: upload stops, toast “Upload cancelled.”, no full failure summary spam.

- [ ] **Step 5: Commit**

```bash
git add modules/gallery/admin/galleryAdminShared.js modules/gallery/admin/galleryUploadBatch.js modules/gallery/admin/useGalleryAdminController.js
git commit -m "$(cat <<'EOF'
feat(gallery): support cancelling in-progress album uploads

EOF
)"
```

---

### Task 5: `GalleryBatchProgressModal` with leave guards

**Files:**
- Create: `modules/gallery/admin/GalleryBatchProgressModal.jsx`
- Consumes: `GalleryBatchProgressCard`

**Interfaces:**
- Produces: `GalleryBatchProgressModal({ open, progress, heading, currentItemFallback, itemUnit, uploadedLabel?, skippedLabel?, failedLabel?, warningText, onCancel })`

- [ ] **Step 1: Create the modal**

```jsx
'use client';

import { Dialog, Transition } from '@headlessui/react';
import { Fragment, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import GalleryBatchProgressCard from './GalleryBatchProgressCard';

export default function GalleryBatchProgressModal({
  open,
  progress,
  heading,
  currentItemFallback,
  currentItemTitle,
  itemUnit = 'file',
  uploadedLabel,
  skippedLabel,
  failedLabel,
  warningText = 'Do not go back or refresh while this is running. Use Cancel if you need to stop.',
  onCancel,
}) {
  useEffect(() => {
    if (!open) return undefined;

    const beforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', beforeUnload);

    const marker = { galleryBatchBlock: true };
    window.history.pushState(marker, '');
    const onPopState = () => {
      window.history.pushState(marker, '');
    };
    window.addEventListener('popstate', onPopState);

    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('popstate', onPopState);
    };
  }, [open]);

  return (
    <Transition show={Boolean(open && progress)} as={Fragment}>
      <Dialog as="div" className="relative z-[80]" onClose={() => {}}>
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:p-5">
            <Dialog.Title className="sr-only">{heading}</Dialog.Title>
            <GalleryBatchProgressCard
              progress={progress}
              heading={heading}
              currentItemFallback={currentItemFallback}
              currentItemTitle={currentItemTitle}
              itemUnit={itemUnit}
              uploadedLabel={uploadedLabel}
              skippedLabel={skippedLabel}
              failedLabel={failedLabel}
            />
            <div className="mt-4 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{warningText}</p>
            </div>
            <button
              type="button"
              className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-xl border border-slate-300 bg-white text-sm font-bold text-slate-800 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-800"
              onClick={onCancel}
            >
              Cancel
            </button>
          </Dialog.Panel>
        </div>
      </Dialog>
    </Transition>
  );
}
```

Notes:
- `onClose={() => {}}` so Escape/backdrop do not dismiss.
- Overlay covers full viewport and blocks pointer events underneath.

- [ ] **Step 2: Manual verify** (after Task 6 wiring)

Back stays on page; refresh prompts; Cancel fires handler.

- [ ] **Step 3: Commit**

```bash
git add modules/gallery/admin/GalleryBatchProgressModal.jsx
git commit -m "$(cat <<'EOF'
feat(gallery): add blocking batch progress modal

EOF
)"
```

---

### Task 6: Wire modal for upload + Drive import; remove inline progress

**Files:**
- Modify: `modules/gallery/admin/GalleryMediaPanel.jsx`
- Modify: `modules/gallery/admin/GalleryUploadDropzone.jsx`
- Modify: `modules/gallery/admin/GalleryDriveImportSection.jsx`
- Modify: `modules/gallery/admin/GalleryImportPanel.jsx`
- Consumes: `GalleryBatchProgressModal`, `cancelUpload`, `cancelDriveImport`

- [ ] **Step 1: Mount one modal in `GalleryMediaPanel`**

Pull from controller:

```jsx
import GalleryBatchProgressModal from './GalleryBatchProgressModal';

const {
  // existing...
  uploadingFiles,
  uploadProgress,
  importingDrive,
  importProgress,
  cancelDriveImport,
  cancelUpload,
} = controller;

const batchModalOpen = Boolean((uploadingFiles && uploadProgress) || (importingDrive && importProgress));
const batchIsUpload = Boolean(uploadingFiles && uploadProgress);

// Near root of the panel return (once, not per-tab):
<GalleryBatchProgressModal
  open={batchModalOpen}
  progress={batchIsUpload ? uploadProgress : importProgress}
  heading={batchIsUpload ? 'Upload in progress' : 'Google Drive import in progress'}
  currentItemFallback={batchIsUpload ? 'Uploading file' : 'Importing Google Drive folder'}
  currentItemTitle={
    batchIsUpload
      ? uploadProgress?.currentFileName || 'Uploading file'
      : importProgress?.currentFileName || 'Importing Google Drive folder'
  }
  itemUnit={batchIsUpload ? 'file' : 'item'}
  uploadedLabel={batchIsUpload ? 'Uploaded' : 'Imported'}
  skippedLabel={batchIsUpload ? 'Skipped' : 'Skipped'}
  failedLabel="Failed"
  onCancel={batchIsUpload ? cancelUpload : cancelDriveImport}
/>
```

- [ ] **Step 2: Also mount on `GalleryImportPanel` if that page can run without MediaPanel**

If `/admin/gallery/...` import page uses `GalleryImportPanel` alone, add the same modal there with the same controller props so Drive import is covered on both surfaces.

- [ ] **Step 3: Remove inline `GalleryBatchProgressCard` usages**

- `GalleryUploadDropzone.jsx`: remove the `uploading && uploadProgress` card block (keep summary). Stop requiring `uploadProgress` for display if unused, or keep prop for API stability but unused.
- `GalleryDriveImportSection.jsx`: remove both compact/full inline progress cards.
- `GalleryImportPanel.jsx`: remove inline progress card.

- [ ] **Step 4: Manual verify**

1. Local upload → full blocking modal; cannot click album UI; Cancel aborts; refresh prompts.
2. Drive import → same modal with import labels; Cancel aborts; browser back keeps modal.
3. After finish, summary still appears with Show more when many duplicates.
4. No double progress (inline + modal).

- [ ] **Step 5: Commit**

```bash
git add modules/gallery/admin/GalleryMediaPanel.jsx modules/gallery/admin/GalleryUploadDropzone.jsx modules/gallery/admin/GalleryDriveImportSection.jsx modules/gallery/admin/GalleryImportPanel.jsx
git commit -m "$(cat <<'EOF'
feat(gallery): block UI with shared upload and Drive progress modal

EOF
)"
```

---

### Task 7: Spec commit + final pass

**Files:**
- Add (if untracked): `docs/superpowers/specs/2026-09-11-google-drive-import-ux-design.md`
- Add: `docs/superpowers/plans/2026-09-11-google-drive-import-ux.md` (this file)

- [ ] **Step 1: Commit docs**

```bash
git add docs/superpowers/specs/2026-09-11-google-drive-import-ux-design.md docs/superpowers/plans/2026-09-11-google-drive-import-ux.md
git commit -m "$(cat <<'EOF'
docs: add Drive import UX spec and implementation plan

EOF
)"
```

- [ ] **Step 2: End-to-end checklist vs spec**

Confirm every Goals item in the spec is covered by Tasks 1–6.

---

## Plan self-review

| Spec requirement | Task |
|------------------|------|
| Remove Folders/Preview tabs; single browse | Task 3 |
| Click folder navigates + selects; no row Select | Task 3 |
| Fix doubled My Drive breadcrumb | Task 3 |
| Reusable AdminHint + two hint strings | Tasks 1, 3 |
| Blocking modal for upload + Drive | Tasks 5, 6 |
| Cancel + beforeunload + back trap | Tasks 4, 5 |
| Cap warnings with Show more | Task 2 |
| Reuse GalleryBatchProgressCard | Task 5 |
| No recursive import change | untouched |

No TBD placeholders. Prop/handler names aligned across tasks (`cancelUpload`, `pendingFolder`, `initialVisibleCount`).
