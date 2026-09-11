'use client';

import { Dialog, Transition } from '@headlessui/react';
import { Fragment, useMemo, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import MediaPreview from '@/app/admin/gallery/components/MediaPreview';
import { getAdminMediaUrl } from '@/app/admin/gallery/utils';

function getAlbumCount(album) {
  if (!album) return null;
  const count =
    typeof album?._count?.photos === 'number'
      ? album._count.photos
      : typeof album.mediaCount === 'number'
        ? album.mediaCount
        : typeof album.photoCount === 'number'
          ? album.photoCount
          : typeof album.count === 'number'
            ? album.count
            : null;
  return typeof count === 'number' ? count : null;
}

function getAlbumSortTime(album) {
  const candidate = album?.activityAt || album?.updatedAt || album?.createdAt;
  const date = candidate ? new Date(candidate) : null;
  return date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
}

function resolveAlbumCoverUrl(album) {
  const coverPhoto = album?.coverPhoto ?? null;
  if (!coverPhoto) return '';
  const url = getAdminMediaUrl(coverPhoto);
  return typeof url === 'string' ? url : '';
}

export default function GalleryAlbumMovePicker({
  open,
  onClose,
  albums,
  excludedAlbumId = null,
  selectedAlbumId = null,
  onConfirm,
  onCreateNew,
  title = 'Add to album',
  confirmLabel = 'Confirm move target',
}) {
  const [searchValue, setSearchValue] = useState('');
  const [sortMode, setSortMode] = useState('newest');
  const [pendingAlbumId, setPendingAlbumId] = useState(null);

  const normalizedAlbums = Array.isArray(albums) ? albums : [];

  const filteredAlbums = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    let next = normalizedAlbums;

    if (Number.isInteger(excludedAlbumId) && excludedAlbumId > 0) {
      next = next.filter((album) => album?.id !== excludedAlbumId);
    }

    if (query) {
      next = next.filter((album) => {
        const haystack = [album?.name, album?.slug, album?.description]
          .map((value) => (typeof value === 'string' ? value.toLowerCase() : ''))
          .filter(Boolean)
          .join(' ');
        return haystack.includes(query);
      });
    }

    if (sortMode === 'newest') {
      next = [...next].sort((a, b) => getAlbumSortTime(b) - getAlbumSortTime(a));
    } else if (sortMode === 'name') {
      next = [...next].sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
    }

    return next;
  }, [excludedAlbumId, normalizedAlbums, searchValue, sortMode]);

  const effectivePendingId = pendingAlbumId ?? selectedAlbumId ?? null;
  const canConfirm = Boolean(effectivePendingId) && effectivePendingId !== selectedAlbumId;

  return (
    <Transition appear show={open} as={Fragment}>
      <Dialog
        as="div"
        className="relative z-50"
        onClose={() => {
          setPendingAlbumId(null);
          onClose?.();
        }}
      >
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 flex items-end lg:items-center lg:justify-center">
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0 translate-y-6 lg:translate-y-2 lg:scale-95"
            enterTo="opacity-100 translate-y-0 lg:scale-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100 translate-y-0 lg:scale-100"
            leaveTo="opacity-0 translate-y-6 lg:translate-y-2 lg:scale-95"
          >
            <Dialog.Panel className="w-full overflow-hidden rounded-t-[32px] border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 lg:max-h-[min(46rem,calc(100dvh-3rem))] lg:max-w-xl lg:rounded-xl">
              <div className="px-4 pb-4 pt-3 sm:px-5">
                <div className="mx-auto h-1.5 w-14 rounded-full bg-slate-200 dark:bg-slate-700 lg:hidden" />

                <div className="mt-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                      Album picker
                    </p>
                    <Dialog.Title className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-50">
                      {title}
                    </Dialog.Title>
                    <Dialog.Description className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      Choose a destination album for the selected media.
                    </Dialog.Description>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setPendingAlbumId(null);
                      onClose?.();
                    }}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                    aria-label="Close"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                <div className="mt-4 space-y-3">
                  <label className="block">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                      <input
                        className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm text-slate-900 focus:border-slate-400 focus:outline-none dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-50"
                        placeholder="Search album name or description"
                        value={searchValue}
                        onChange={(event) => setSearchValue(event.target.value)}
                      />
                    </div>
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">Sort</span>
                    <select
                      className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 focus:border-slate-400 focus:outline-none dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-50"
                      value={sortMode}
                      onChange={(event) => setSortMode(event.target.value)}
                    >
                      <option value="newest">Newest first</option>
                      <option value="name">Name (A–Z)</option>
                    </select>
                  </label>
                </div>
              </div>

              <div className="max-h-[min(22rem,calc(100dvh-18rem))] overflow-y-auto px-4 pb-4 sm:px-5 lg:max-h-[min(28rem,calc(100dvh-18rem))]">
                {filteredAlbums.length === 0 ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300">
                    No albums match your search.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredAlbums.map((album) => {
                      const count = getAlbumCount(album);
                      const coverUrl = resolveAlbumCoverUrl(album);
                      const coverPhoto = album?.coverPhoto ?? null;
                      const isSelected = album.id === effectivePendingId;

                      return (
                        <button
                          key={album.id}
                          type="button"
                          onClick={() => setPendingAlbumId(album.id)}
                          className={`w-full rounded-xl border p-3 text-left transition ${
                            isSelected
                              ? 'border-slate-900 bg-slate-900 text-white shadow-sm dark:border-slate-50 dark:bg-slate-50 dark:text-slate-900'
                              : 'border-slate-200 bg-white text-slate-900 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl ${
                                isSelected ? 'bg-white/10 dark:bg-slate-900/10' : 'bg-slate-100 dark:bg-slate-800'
                              }`}
                            >
                              {coverUrl ? (
                                <div className="h-14 w-14 overflow-hidden rounded-2xl">
                                  <MediaPreview
                                    url={coverUrl}
                                    mimeType={coverPhoto?.mimeType}
                                    sourceType={coverPhoto?.sourceType}
                                    sourceId={coverPhoto?.sourceId}
                                    alt={album.name}
                                    className="h-full w-full object-cover"
                                    controls={false}
                                  />
                                </div>
                              ) : (
                                <span
                                  className={`text-xs font-semibold ${
                                    isSelected ? 'text-white dark:text-slate-900' : 'text-slate-500 dark:text-slate-300'
                                  }`}
                                >
                                  IMG
                                </span>
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold">{album.name}</p>
                                  <p
                                    className={`mt-1 text-xs ${
                                      isSelected ? 'text-slate-300 dark:text-slate-600' : 'text-slate-500 dark:text-slate-400'
                                    }`}
                                  >
                                    {typeof count === 'number' ? `${count} media items` : '—'}
                                  </p>
                                </div>

                                {isSelected ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-white dark:bg-slate-900/10 dark:text-slate-900">
                                    <Check className="h-3.5 w-3.5" />
                                    Selected
                                  </span>
                                ) : (
                                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200">
                                    Active
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="border-t border-slate-200 bg-white p-4 sm:px-5 dark:border-slate-800 dark:bg-slate-900">
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    className="inline-flex h-12 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-50"
                    onClick={() => {
                      setPendingAlbumId(null);
                      onClose?.();
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!canConfirm}
                    className="inline-flex h-12 items-center justify-center rounded-2xl bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm disabled:opacity-60 dark:bg-slate-50 dark:text-slate-900"
                    onClick={() => {
                      if (!canConfirm) return;
                      onConfirm?.(effectivePendingId);
                      setPendingAlbumId(null);
                    }}
                  >
                    {confirmLabel}
                  </button>
                </div>

                {onCreateNew ? (
                  <button
                    type="button"
                    onClick={() => {
                      setPendingAlbumId(null);
                      onClose?.();
                      onCreateNew?.();
                    }}
                    className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-50"
                  >
                    Create new album
                  </button>
                ) : null}
              </div>
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition>
  );
}

