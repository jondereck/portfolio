'use client';

import Link from 'next/link';
import { Dialog, Transition } from '@headlessui/react';
import { Fragment, useMemo, useRef, useState } from 'react';
import { Check, Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import { getAdminGridPreviewUrl } from '@/app/admin/gallery/utils';

export const inputStyles =
  'h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm focus:border-slate-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950';
export const buttonStyles =
  'h-10 rounded-md bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200';
export const ghostButtonStyles =
  'h-10 rounded-md border border-slate-300 px-3 text-sm text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800';

export function createEmptyAlbumForm() {
  return {
    name: '',
    slug: '',
    description: '',
    isPublished: true,
  };
}

export function normalizeAlbumForm(form = {}) {
  return {
    name: String(form.name ?? '').trim(),
    slug: String(form.slug ?? '').trim(),
    description: String(form.description ?? '').trim(),
    isPublished: Boolean(form.isPublished),
  };
}

export function toRequestError(data, fallbackMessage = 'Request failed', status) {
  const error = new Error(data?.message || data?.error || data?.status_text || fallbackMessage);
  error.status = status;
  error.errorCode = data?.errorCode || data?.error_code;
  error.details = data?.details;
  error.duplicate = data?.duplicate;
  error.payload = data;
  return error;
}

export const galleryPageMeta = {
  albums: {
    eyebrow: 'Album Management',
    title: 'Albums',
    description: 'Create, select, publish, and remove albums without the media intake or ordering tools crowding the screen.',
  },
  media: {
    eyebrow: 'Media Intake',
    title: 'Media',
    description: 'Upload files and add remote media to the selected album with only intake tools visible.',
  },
  arrange: {
    eyebrow: 'Sorting Workspace',
    title: 'Arrange',
    description: 'Reorder the selected album with a dedicated drag-and-drop workspace and no intake clutter.',
  },
  import: {
    eyebrow: 'Import Workflow',
    title: 'Import',
    description: 'Pull media from Google Drive with duplicate handling and import summaries in one focused page.',
  },
  workspace: {
    eyebrow: 'Advanced Workspace',
    title: 'Workspace',
    description: 'Use the all-in-one gallery workspace when you need every tool in one place.',
  },
};

export async function fetchJson(url, init) {
  const response = await fetch(url, {
    cache: 'no-store',
    ...init,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw toRequestError(data, 'Request failed', response.status);
  }

  return data;
}

export function uploadFormDataWithProgress(url, formData, { method = 'POST', onProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.open(method, url);
    xhr.responseType = 'json';
    xhr.withCredentials = true;

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
      const data = xhr.response ?? {};

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data);
        return;
      }

      reject(toRequestError(data, 'Request failed', xhr.status));
    };

    xhr.onerror = () => {
      signal?.removeEventListener('abort', onAbort);
      reject(toRequestError({}, 'Network request failed'));
    };

    xhr.onabort = () => {
      signal?.removeEventListener('abort', onAbort);
      reject(abortError());
    };

    xhr.send(formData);
  });
}

export function GalleryPageHeader({ eyebrow, title, description, actions }) {
  return (
    <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          {eyebrow ? (
            <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500 sm:text-xs">{eyebrow}</p>
          ) : null}
          <h1 className="text-xl font-semibold tracking-tight text-slate-950 dark:text-slate-50 sm:text-2xl">{title}</h1>
          {description ? (
            <p className="max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

export function GalleryEmptyState({ title, description, action }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center dark:border-slate-700 dark:bg-slate-900/60 sm:p-6">
      <p className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</p>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{description}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function GalleryAlbumPicker({
  albums,
  selectedAlbumId,
  loadingAlbums,
  onSelectAlbum,
  emptyTitle = 'No albums yet',
  emptyDescription = 'Create an album first to unlock this page.',
  createAlbumHref = '/admin/gallery/albums',
  createAlbumLabel = 'Add new album',
  onCreateAlbumClick,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [sortMode, setSortMode] = useState('newest');
  const [statusFilter, setStatusFilter] = useState('all');
  const [mobileFiltersCollapsed, setMobileFiltersCollapsed] = useState(false);
  const dialogInitialFocusRef = useRef(null);
  const resolveAlbumCoverUrl = (album) => getAdminGridPreviewUrl(album?.coverPhoto);

  const selectedAlbum = useMemo(
    () => albums.find((album) => album.id === selectedAlbumId) ?? null,
    [albums, selectedAlbumId],
  );

  const filteredAlbums = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    const visibleAlbums = albums.filter((album) => {
      if (album.id === selectedAlbumId) {
        return false;
      }

      if (statusFilter === 'published' && !album.isPublished) {
        return false;
      }

      if (statusFilter === 'draft' && album.isPublished) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const haystack = [album.name, album.slug, album.description]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });

    return [...visibleAlbums].sort((left, right) => {
      const leftCount = left._count?.photos ?? 0;
      const rightCount = right._count?.photos ?? 0;
      const leftCreatedAt = new Date(left.createdAt ?? 0).getTime();
      const rightCreatedAt = new Date(right.createdAt ?? 0).getTime();
      const leftActivityAt = new Date(left.activityAt ?? left.updatedAt ?? left.createdAt ?? 0).getTime();
      const rightActivityAt = new Date(right.activityAt ?? right.updatedAt ?? right.createdAt ?? 0).getTime();
      const leftName = (left.name ?? '').toLowerCase();
      const rightName = (right.name ?? '').toLowerCase();

      switch (sortMode) {
        case 'oldest':
          return leftCreatedAt - rightCreatedAt;
        case 'az':
          return leftName.localeCompare(rightName);
        case 'media':
          if (rightCount !== leftCount) {
            return rightCount - leftCount;
          }
          return rightCreatedAt - leftCreatedAt;
        case 'newest':
        default:
          if (rightActivityAt !== leftActivityAt) {
            return rightActivityAt - leftActivityAt;
          }
          return leftName.localeCompare(rightName);
      }
    });
  }, [albums, query, sortMode, statusFilter]);

  const selectedMediaCount = selectedAlbum?._count?.photos ?? 0;
  const selectedAlbumCoverUrl = resolveAlbumCoverUrl(selectedAlbum);
  const createAlbumAction = onCreateAlbumClick ? (
    <button
      type="button"
      className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-slate-300 px-3 text-sm text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 sm:w-auto"
      onClick={onCreateAlbumClick}
    >
      <Plus className="size-4" />
      {createAlbumLabel}
    </button>
  ) : (
    <Link
      href={createAlbumHref}
      className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-slate-300 px-3 text-sm text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 sm:w-auto"
    >
      <Plus className="size-4" />
      {createAlbumLabel}
    </Link>
  );

  const createAlbumEmptyAction = onCreateAlbumClick ? (
    <button
      type="button"
      className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 px-4 text-sm text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
      onClick={onCreateAlbumClick}
    >
      <Plus className="size-4" />
      {createAlbumLabel}
    </button>
  ) : (
    <Link
      href={createAlbumHref}
      className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 px-4 text-sm text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
    >
      <Plus className="size-4" />
      {createAlbumLabel}
    </Link>
  );

  return (
    <>
      <aside className="space-y-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-50">Current album</h2>
            <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">
              Keep the active album visible, then switch only when needed.
            </p>
          </div>
          <span className="rounded-full border border-slate-200 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:border-slate-700 dark:text-slate-400">
            Scalable
          </span>
        </div>

        {loadingAlbums ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Loading albums...</p>
        ) : selectedAlbum ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/40">
              <div className="flex items-start gap-3">
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800">
                  {selectedAlbumCoverUrl ? (
                    <img src={selectedAlbumCoverUrl} alt={selectedAlbum.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-200 via-slate-100 to-slate-300 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:from-slate-800 dark:via-slate-700 dark:to-slate-900 dark:text-slate-400">
                      No cover
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold text-slate-900 dark:text-slate-100 sm:text-sm">{selectedAlbum.name}</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {selectedMediaCount} media item{selectedMediaCount === 1 ? '' : 's'}
                  </p>
                  <span
                    className={`mt-2 inline-flex items-center justify-center rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${
                      selectedAlbum.isPublished
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                        : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                    }`}
                    aria-label={selectedAlbum.isPublished ? 'Published' : 'Draft'}
                    title={selectedAlbum.isPublished ? 'Published' : 'Draft'}
                  >
                    <span className={`h-2 w-2 rounded-full ${selectedAlbum.isPublished ? 'bg-emerald-600' : 'bg-slate-400'}`} />
                    <span className="sr-only">{selectedAlbum.isPublished ? 'Published' : 'Draft'}</span>
                  </span>
                </div>
              </div>
              <div className="mt-3 grid gap-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                {selectedAlbum.description ? (
                  <p className="line-clamp-2">
                    <span className="font-medium text-slate-700 dark:text-slate-200">Description:</span> {selectedAlbum.description}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="grid gap-2 sm:flex sm:flex-wrap">
              <button
                type="button"
                className={`${buttonStyles} w-full sm:w-auto`}
                onClick={() => {
                  setMobileFiltersCollapsed(false);
                  setIsOpen(true);
                }}
              >
                Change album
              </button>
              <button
                type="button"
                className="inline-flex h-10 w-full items-center justify-center rounded-md border border-slate-300 px-3 text-sm text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 sm:w-auto"
                onClick={() => {
                  setQuery('');
                  setStatusFilter('all');
                  setSortMode('newest');
                  setMobileFiltersCollapsed(false);
                  setIsOpen(true);
                }}
              >
                Browse all
              </button>
              {createAlbumAction}
            </div>
          </div>
        ) : (
          <GalleryEmptyState
            title={emptyTitle}
            description={emptyDescription}
            action={
              <div className="flex flex-col items-center gap-2 sm:flex-row">
                <button
                  type="button"
                  className={buttonStyles}
                  onClick={() => {
                    setMobileFiltersCollapsed(false);
                    setIsOpen(true);
                  }}
                >
                  Choose album
                </button>
                {createAlbumEmptyAction}
              </div>
            }
          />
        )}
      </aside>

      <Transition show={isOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={setIsOpen} initialFocus={dialogInitialFocusRef}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto p-0 sm:p-6">
            <div className="flex min-h-full items-center justify-center">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-200"
                enterFrom="opacity-0 scale-95 translate-y-2"
                enterTo="opacity-100 scale-100 translate-y-0"
                leave="ease-in duration-150"
                leaveFrom="opacity-100 scale-100 translate-y-0"
                leaveTo="opacity-0 scale-95 translate-y-2"
              >
                <Dialog.Panel className="flex h-[100dvh] w-full flex-col overflow-hidden rounded-none border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 sm:h-auto sm:max-h-[min(42rem,calc(100dvh-3rem))] sm:max-w-4xl sm:rounded-2xl">
                  <div className="border-b border-slate-200 px-4 py-4 dark:border-slate-800 sm:px-5">
                    <div className="flex items-start justify-between gap-4">
                      <div ref={dialogInitialFocusRef} tabIndex={-1} className="m-2 outline-none">
                        <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Album picker</p>
                        <Dialog.Title className="mt-1 text-lg font-semibold text-slate-950 dark:text-slate-50">
                          Search and switch albums
                        </Dialog.Title>
   
                      </div>

                      <button
                        type="button"
                        className="hidden rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 sm:inline-flex"
                        onClick={() => setIsOpen(false)}
                      >
                        Close
                      </button>
                    </div>

                    <div className="mt-4 space-y-3">
                    
                  <label className="block">
  <div className="relative">
    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />

    <input
      className="h-11 w-full rounded-md border border-slate-300 bg-white pl-10 pr-3 text-sm focus:border-slate-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950"
      placeholder="Search name, slug, or description"
      value={query}
      onChange={(event) => setQuery(event.target.value)}
    />
  </div>
</label>

                <div
  className={`space-y-3 transition-all duration-200 ${
    mobileFiltersCollapsed
      ? 'max-h-0 overflow-hidden opacity-0 sm:max-h-none sm:overflow-visible sm:opacity-100'
      : 'max-h-[18rem] opacity-100'
  }`}
>
  <div className="grid gap-3 sm:grid-cols-2">
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">
        Status
      </span>

      <div className="relative">
        <SlidersHorizontal className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />

        <select
          className="h-11 w-full rounded-md border border-slate-300 bg-white pl-10 pr-3 text-sm focus:border-slate-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
        </select>
      </div>
    </label>

    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">
        Sort
      </span>

      <div className="relative">
        <SlidersHorizontal className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />

        <select
          className="h-11 w-full rounded-md border border-slate-300 bg-white pl-10 pr-3 text-sm focus:border-slate-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950"
          value={sortMode}
          onChange={(event) => setSortMode(event.target.value)}
        >
          <option value="newest">Sort by newest</option>
          <option value="oldest">Sort by oldest</option>
          <option value="az">Sort A-Z</option>
          <option value="media">Sort by most media</option>
        </select>
      </div>
    </label>
  </div>

  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
    <p className="text-sm text-slate-500 dark:text-slate-400">
      {filteredAlbums.length} result{filteredAlbums.length === 1 ? '' : 's'}
    </p>

    <button
      type="button"
      className="inline-flex w-full items-center justify-center rounded-md border border-slate-300 px-3 py-2 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100 sm:w-auto"
      onClick={() => {
        setQuery('');
        setStatusFilter('all');
        setSortMode('newest');
        setMobileFiltersCollapsed(false);
      }}
    >
      Reset filters
    </button>
  </div>
</div>
                    </div>
                  </div>

                  <div
                    className="flex-1 overflow-auto px-3 py-3 sm:px-5 sm:py-4"
                    onScroll={(event) => {
                      setMobileFiltersCollapsed(event.currentTarget.scrollTop > 12);
                    }}
                  >
                    {!loadingAlbums && albums.length === 0 ? (
                      <GalleryEmptyState
                        title={emptyTitle}
                        description={emptyDescription}
                        action={
                          onCreateAlbumClick ? (
                            <button
                              type="button"
                              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 px-4 text-sm text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                              onClick={() => {
                                setIsOpen(false);
                                onCreateAlbumClick();
                              }}
                            >
                              <Plus className="size-4" />
                              {createAlbumLabel}
                            </button>
                          ) : (
                            <Link
                              href={createAlbumHref}
                              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 px-4 text-sm text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                              onClick={() => setIsOpen(false)}
                            >
                              <Plus className="size-4" />
                              {createAlbumLabel}
                            </Link>
                          )
                        }
                      />
                    ) : filteredAlbums.length === 0 ? (
                      <GalleryEmptyState
                        title="No matching albums"
                        description="Try a different search term, remove the current filters, or create a new album."
                        action={
                          onCreateAlbumClick ? (
                            <button
                              type="button"
                              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 px-4 text-sm text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                              onClick={() => {
                                setIsOpen(false);
                                onCreateAlbumClick();
                              }}
                            >
                              <Plus className="size-4" />
                              {createAlbumLabel}
                            </button>
                          ) : (
                            <Link
                              href={createAlbumHref}
                              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 px-4 text-sm text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                              onClick={() => setIsOpen(false)}
                            >
                              <Plus className="size-4" />
                              {createAlbumLabel}
                            </Link>
                          )
                        }
                      />
                    ) : (
                      <div className="space-y-2">
                        {filteredAlbums.map((album) => {
                          const isActive = selectedAlbumId === album.id;
                          const mediaCount = album._count?.photos ?? 0;
                          const coverUrl = resolveAlbumCoverUrl(album);

                          return (
                            <button
                              key={album.id}
                              type="button"
                              className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${
                                isActive
                                  ? 'border-slate-900 bg-slate-100 dark:border-slate-100 dark:bg-slate-800'
                                  : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
                              }`}
                              onClick={() => {
                                onSelectAlbum(album.id);
                                setIsOpen(false);
                              }}
                            >
                              <div className="relative h-20 w-16 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800">
                                {coverUrl ? (
                                  <img src={coverUrl} alt={album.name} className="h-full w-full object-cover" />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-200 via-slate-100 to-slate-300 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:from-slate-800 dark:via-slate-700 dark:to-slate-900 dark:text-slate-400">
                                    No cover
                                  </div>
                                )}
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="truncate text-base font-semibold text-slate-900 dark:text-slate-100 sm:text-sm">{album.name}</p>
                                  {isActive ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white dark:bg-slate-100 dark:text-slate-950">
                                      <Check className="size-3" />
                                      Selected
                                    </span>
                                  ) : null}
                                </div>
              
                              </div>

                              <div className="ml-auto flex flex-shrink-0 flex-wrap items-center gap-2">
                                <span className="rounded-full border border-slate-200 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:border-slate-700 dark:text-slate-400">
                                  {mediaCount} media
                                </span>
                                <span className="hidden rounded-full border border-slate-200 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:border-slate-700 dark:text-slate-400 sm:inline-flex">
                                  {album.isPublished ? 'Published' : 'Draft'}
                                </span>
                                <span
                                  className={`inline-flex items-center justify-center rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] sm:hidden ${
                                    album.isPublished
                                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                      : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                                  }`}
                                  aria-label={album.isPublished ? 'Published' : 'Draft'}
                                  title={album.isPublished ? 'Published' : 'Draft'}
                                >
                                  <span className={`h-2 w-2 rounded-full ${album.isPublished ? 'bg-emerald-600' : 'bg-slate-400'}`} />
                                  <span className="sr-only">{album.isPublished ? 'Published' : 'Draft'}</span>
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="border-t border-slate-200 bg-white/95 px-4 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 sm:px-5">
                    <div className="space-y-3">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/40">
                        <div className="flex items-start gap-3">
                          {selectedAlbum ? (
                            <div className="relative h-20 w-16 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800">
                              {selectedAlbumCoverUrl ? (
                                <img src={selectedAlbumCoverUrl} alt={selectedAlbum.name} className="h-full w-full object-cover" />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-200 via-slate-100 to-slate-300 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:from-slate-800 dark:via-slate-700 dark:to-slate-900 dark:text-slate-400">
                                  No cover
                                </div>
                              )}
                            </div>
                          ) : null}

                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                              Selected album
                            </p>
                            {selectedAlbum ? (
                              <>
                                <p className="mt-2 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                                  {selectedAlbum.name}
                                </p>
                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                  {selectedMediaCount} media item{selectedMediaCount === 1 ? '' : 's'}
                                </p>
                    
                              </>
                            ) : (
                              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                                No album selected.
                              </p>
                            )}
                          </div>

                          {selectedAlbum ? (
                            <span className="rounded-full border border-slate-200 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:border-slate-700 dark:text-slate-400">
                              {selectedAlbum.isPublished ? 'Published' : 'Draft'}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <button
                        type="button"
                        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 sm:hidden"
                        onClick={() => setIsOpen(false)}
                      >
                        <X className="size-4" />
                        Close picker
                      </button>
                    </div>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </>
  );
}

export function GalleryPanelCard({ title, description, children, className = '' }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5 ${className}`}>
      <div className="mb-4 space-y-1">
        <h2 className="text-base font-semibold tracking-tight text-slate-950 dark:text-slate-50 sm:text-lg">{title}</h2>
        {description ? <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function GalleryRouteLink({ href, children, className = '' }) {
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
