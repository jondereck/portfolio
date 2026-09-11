'use client';

import { Dialog, Transition } from '@headlessui/react';
import { Fragment, useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Copy, ExternalLink, Search, X } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import MediaPreview from '@/app/admin/gallery/components/MediaPreview';
import { buildPublicAlbumHref, getAdminMediaUrl } from '@/app/admin/gallery/utils';

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

export default function GalleryAlbumSwitchSheet({
  open,
  onClose,
  albums,
  selectedAlbumId,
  onConfirm,
  onCreateNew,
}) {
  const [searchValue, setSearchValue] = useState('');
  const [sortMode, setSortMode] = useState('newest');
  const [pendingAlbumId, setPendingAlbumId] = useState(null);

  const normalizedAlbums = Array.isArray(albums) ? albums : [];

  const filteredAlbums = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    let next = normalizedAlbums;

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
  }, [normalizedAlbums, searchValue, sortMode]);

  const effectivePendingId = pendingAlbumId ?? selectedAlbumId ?? null;

  return (
    <Transition appear show={open} as={Fragment}>
      <Dialog
        as="div"
        className="relative z-50 lg:hidden"
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

        <div className="fixed inset-0 flex items-end">
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0 translate-y-6"
            enterTo="opacity-100 translate-y-0"
            leave="ease-in duration-150"
            leaveFrom="opacity-100 translate-y-0"
            leaveTo="opacity-0 translate-y-6"
          >
            <Dialog.Panel className="w-full overflow-hidden rounded-t-[32px] border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
              <div className="px-4 pb-4 pt-3 sm:px-5">
                <div className="mx-auto h-1.5 w-14 rounded-full bg-slate-200 dark:bg-slate-700" />

                <div className="mt-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                      Album picker
                    </p>
                    <Dialog.Title className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-50">
                      Search and switch albums
                    </Dialog.Title>
                    <Dialog.Description className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      Use a bottom sheet on mobile so users switch albums without leaving the page.
                    </Dialog.Description>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setPendingAlbumId(null);
                      onClose?.();
                    }}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 text-slate-600 dark:border-slate-800 dark:text-slate-300"
                    aria-label="Close album picker"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-4 space-y-3">
                  <div className="flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 dark:border-slate-800 dark:bg-slate-950/40">
                    <Search className="h-4 w-4 text-slate-400" />
                    <input
                      value={searchValue}
                      onChange={(event) => setSearchValue(event.target.value)}
                      placeholder="Search album name or description"
                      className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-50"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      className="inline-flex h-12 items-center justify-between rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                      onClick={() => {
                        // UI parity only (no statuses yet)
                      }}
                    >
                      <span className="truncate">All statuses</span>
                      <ChevronsUpDown className="h-4 w-4 text-slate-400" />
                    </button>

                    <label className="relative">
                      <span className="sr-only">Sort</span>
                      <select
                        value={sortMode}
                        onChange={(event) => setSortMode(event.target.value)}
                        className="h-12 w-full appearance-none rounded-2xl border border-slate-200 bg-white px-3 pr-10 text-sm font-medium text-slate-600 outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                      >
                        <option value="newest">Newest first</option>
                        <option value="name">Name (A–Z)</option>
                      </select>
                      <ChevronsUpDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    </label>
                  </div>

                  <div className="flex items-center justify-between">
                    <p className="text-sm text-slate-500 dark:text-slate-400">{filteredAlbums.length} results</p>
                    <button
                      type="button"
                      onClick={() => {
                        setSearchValue('');
                        setSortMode('newest');
                        setPendingAlbumId(null);
                      }}
                      className="text-sm font-medium text-slate-600 dark:text-slate-300"
                    >
                      Reset filters
                    </button>
                  </div>
                </div>
              </div>

              <div className="max-h-[46vh] space-y-3 overflow-y-auto border-t border-slate-200 bg-slate-50/60 px-4 py-4 sm:px-5 dark:border-slate-800 dark:bg-slate-950/20">
                {filteredAlbums.map((album) => {
                  const isSelected = album.id === effectivePendingId;
                  const count = getAlbumCount(album);
                  const coverUrl = resolveAlbumCoverUrl(album);
                  const coverPhoto = album?.coverPhoto ?? null;
                  const publicHref = buildPublicAlbumHref(album);
                  return (
                    <div
                      key={album.id}
                      className={`w-full rounded-xl border p-3 text-left shadow-sm transition ${
                        isSelected
                          ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-50 dark:bg-slate-50 dark:text-slate-900'
                          : 'border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (album.id !== selectedAlbumId) {
                              onConfirm?.(album.id);
                            }
                            setPendingAlbumId(null);
                            onClose?.();
                          }}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        >
                          <div
                          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${
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
                              <p className={`mt-1 text-xs ${isSelected ? 'text-slate-300 dark:text-slate-600' : 'text-slate-500 dark:text-slate-400'}`}>
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
                        </button>

                        {publicHref ? (
                          <div className="flex shrink-0 items-center gap-2">
                            <button
                              type="button"
                              aria-label="Copy album link"
                              className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border text-slate-600 transition hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-50 ${
                                isSelected ? 'border-white/15 bg-white/10' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/30'
                              }`}
                              onClick={async (event) => {
                                event.stopPropagation();
                                try {
                                  await navigator.clipboard.writeText(publicHref);
                                  toast.success('Album link copied');
                                } catch {
                                  toast.error('Unable to copy album link.');
                                }
                              }}
                            >
                              <Copy className="h-4 w-4" />
                            </button>
                            <Link
                              href={publicHref}
                              aria-label="Open album"
                              className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border text-slate-600 transition hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-50 ${
                                isSelected ? 'border-white/15 bg-white/10' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/30'
                              }`}
                              onClick={(event) => event.stopPropagation()}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Link>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-slate-200 bg-white p-4 sm:px-5 dark:border-slate-800 dark:bg-slate-900">
                {onCreateNew ? (
                  <button
                    type="button"
                    onClick={() => {
                      setPendingAlbumId(null);
                      onClose?.();
                      onCreateNew?.();
                    }}
                    className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-50"
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
