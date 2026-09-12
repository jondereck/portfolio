'use client';

import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ExternalLink, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import MediaPreview from '@/app/admin/gallery/components/MediaPreview';
import { buildPublicAlbumHref, getAdminGridPreviewUrl } from '@/app/admin/gallery/utils';
import { shouldBlurPhoto } from '@/lib/gallery-media';

function resolveAlbumCoverUrl(album) {
  const coverPhoto = album?.coverPhoto ?? null;
  if (!coverPhoto) return '';
  const url = getAdminGridPreviewUrl(coverPhoto);
  return typeof url === 'string' ? url : '';
}

export default function GalleryAlbumsSidebar({
  albums,
  selectedAlbumId,
  loadingAlbums = false,
  onSelectAlbum,
  onCreateAlbumClick,
  mobileAlbumName,
  mobileAlbumCountLabel,
  onMobileOpenFilter,
  onMobileOpenSwitch,
  onMobileOpenImport,
  onMobileFocusSearch,
  showMobileChips = true,
  blurUnclothyGenerated = true,
  collapsed = false,
  onToggleCollapsed,
  toggleDisabled = false,
}) {
  const resolvedAlbums = Array.isArray(albums) ? albums : [];
  const activeAlbum = resolvedAlbums.find((album) => album.id === selectedAlbumId) ?? null;
  const activeName = mobileAlbumName || activeAlbum?.name;
  const activePublicHref = buildPublicAlbumHref(activeAlbum);
  const activeCountLabel =
    mobileAlbumCountLabel ||
    (typeof activeAlbum?._count?.photos === 'number'
      ? `${activeAlbum._count.photos} items`
      : typeof activeAlbum?.mediaCount === 'number'
        ? `${activeAlbum.mediaCount} items`
        : '');

  const pageSize = 10;
  const [pageIndex, setPageIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredAlbums = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return resolvedAlbums;

    return resolvedAlbums.filter((album) => {
      const haystack = [album?.name, album?.slug, album?.description]
        .map((value) => (typeof value === 'string' ? value.toLowerCase() : ''))
        .filter(Boolean)
        .join(' ');
      return haystack.includes(query);
    });
  }, [resolvedAlbums, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredAlbums.length / pageSize));

  useEffect(() => {
    setPageIndex(0);
  }, [searchQuery]);

  useEffect(() => {
    const activeIndex = filteredAlbums.findIndex((album) => album.id === selectedAlbumId);
    if (activeIndex === -1) return;
    setPageIndex(Math.floor(activeIndex / pageSize));
  }, [filteredAlbums, selectedAlbumId]);

  useEffect(() => {
    setPageIndex((current) => Math.min(current, Math.max(totalPages - 1, 0)));
  }, [totalPages]);

  const visibleAlbums = useMemo(() => {
    const start = pageIndex * pageSize;
    return filteredAlbums.slice(start, start + pageSize);
  }, [filteredAlbums, pageIndex, pageSize]);

  const canGoPrev = pageIndex > 0;
  const canGoNext = pageIndex < totalPages - 1;

  return (
    <>
      <section className="border-b border-slate-200 px-4 py-3 sm:px-5 lg:hidden dark:border-slate-800">
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
                Current album
              </p>
              <p className="mt-1 truncate text-sm font-semibold text-slate-900 dark:text-slate-50">{activeName || 'Select album'}</p>
              {activeCountLabel ? (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{activeCountLabel}</p>
              ) : (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Active intake target for uploads and imports.</p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {activePublicHref ? (
                <Link
                  href={activePublicHref}
                  aria-label="Open album"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:text-slate-50"
                  onClick={(event) => event.stopPropagation()}
                >
                  <ExternalLink className="h-4 w-4" />
                </Link>
              ) : null}
              <button
                type="button"
                onClick={onMobileOpenSwitch}
                className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-50"
              >
                Switch
              </button>
            </div>
          </div>


        </div>
      </section>

      <aside
        className={`hidden h-full border-r border-slate-200 bg-white lg:block lg:overflow-hidden dark:border-slate-800 dark:bg-slate-900 ${collapsed ? 'p-4' : 'p-5'}`}
      >
        <div className="flex h-full flex-col">
          <div className={`flex items-center justify-between ${collapsed ? 'flex-col gap-2' : ''}`}>
            {collapsed ? null : (
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.26em] text-slate-500 dark:text-slate-400">
                  Albums
                </p>
                <h2 className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-50">Quick Switch</h2>
              </div>
            )}
            <div className={`flex items-center gap-2 ${collapsed ? 'w-full justify-center' : ''}`}>
              <button
                type="button"
                onClick={() => onToggleCollapsed?.()}
                className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-900 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-50 dark:hover:bg-slate-800 ${toggleDisabled || !onToggleCollapsed ? 'opacity-60' : ''}`}
                aria-label={collapsed ? 'Expand album sidebar' : 'Collapse album sidebar'}
                disabled={toggleDisabled || !onToggleCollapsed}
              >
                {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              </button>
              {!collapsed ? (
                <button
                  type="button"
                  onClick={onCreateAlbumClick}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-900 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-50 dark:hover:bg-slate-800"
                  aria-label="Add album"
                >
                  <Plus className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </div>

          {!collapsed ? (
            <div className="mt-4">
              <label className="flex h-11 items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3 dark:border-slate-800 dark:bg-slate-950/40">
                <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                <span className="sr-only">Search albums</span>
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search albums"
                  className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-50"
                />
              </label>
            </div>
          ) : null}

        <div className={`${collapsed ? 'mt-3' : 'mt-3'} flex min-h-0 flex-1 flex-col space-y-2`}>
   

          {!loadingAlbums && resolvedAlbums.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              Create an album to get started.
            </div>
          ) : null}

          {!loadingAlbums && resolvedAlbums.length > 0 && filteredAlbums.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              No albums matched your search.
            </div>
          ) : null}

          {collapsed ? (
            <div className="flex min-h-0 flex-1 flex-col items-center gap-3">
              <button
                type="button"
                onClick={() => setPageIndex((current) => Math.max(current - 1, 0))}
                disabled={!canGoPrev}
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                aria-label="Previous albums page"
              >
                <ChevronUp className="h-4 w-4" />
              </button>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pb-1">
                {visibleAlbums.map((album) => {
                  const isActive = album.id === selectedAlbumId;
                  const coverUrl = resolveAlbumCoverUrl(album);
                  const coverPhoto = album?.coverPhoto ?? null;
                  const shouldBlurCover =
                    Boolean(coverPhoto) && shouldBlurPhoto(coverPhoto, { blurEnabled: blurUnclothyGenerated });

                  return (
                    <div key={album.id} className="relative flex justify-center ml-4">
                      <button
                        type="button"
                        onClick={() => onSelectAlbum?.(album.id)}
                        title={album.name}
                        className={`relative h-14 w-14 overflow-hidden rounded-full border-2 transition ${
                          isActive
                            ? 'border-blue-500 ring-4 ring-blue-100 dark:ring-blue-950/40'
                            : 'border-white hover:border-slate-300 dark:border-slate-900 dark:hover:border-slate-700'
                        }`}
                        aria-label={`Select album ${album.name}`}
                      >
                        {coverUrl ? (
                          <MediaPreview
                            url={coverUrl}
                            mimeType={coverPhoto?.mimeType}
                            sourceType={coverPhoto?.sourceType}
                            sourceId={coverPhoto?.sourceId}
                            alt={album.name}
                            className={`h-full w-full object-cover ${shouldBlurCover ? 'blur-md' : ''}`}
                            controls={false}
                          />
                        ) : (
                          <div className="h-full w-full bg-gradient-to-br from-slate-200 via-slate-100 to-white dark:from-slate-800 dark:via-slate-900 dark:to-slate-950" />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => setPageIndex((current) => Math.min(current + 1, totalPages - 1))}
                disabled={!canGoNext}
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                aria-label="Next albums page"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {visibleAlbums.map((album) => {
                const isActive = album.id === selectedAlbumId;
                const countLabel =
                  typeof album?._count?.photos === 'number'
                    ? `${album._count.photos} items`
                    : typeof album.mediaCount === 'number'
                      ? `${album.mediaCount} items`
                      : typeof album.photoCount === 'number'
                        ? `${album.photoCount} items`
                        : typeof album.count === 'number'
                          ? `${album.count} items`
                          : '';
                const coverUrl = resolveAlbumCoverUrl(album);
                const coverPhoto = album?.coverPhoto ?? null;
                const publicHref = buildPublicAlbumHref(album);
                const shouldBlurCover = Boolean(coverPhoto) && shouldBlurPhoto(coverPhoto, { blurEnabled: blurUnclothyGenerated });

                return (
                  <div
                    key={album.id}
                    className={`w-full rounded-xl border p-2.5 text-left transition ${
                      isActive
                        ? 'border-slate-900 bg-slate-900 text-white shadow-sm dark:border-slate-50 dark:bg-slate-50 dark:text-slate-900'
                        : 'border-slate-200 bg-white text-slate-900 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-50 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onSelectAlbum?.(album.id)}
                        className="group flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-slate-100 shadow-sm dark:border-slate-800 dark:bg-slate-800">
                            {coverUrl ? (
                              <MediaPreview
                                url={coverUrl}
                                mimeType={coverPhoto?.mimeType}
                                sourceType={coverPhoto?.sourceType}
                                sourceId={coverPhoto?.sourceId}
                                alt={album.name}
                                className={`h-full w-full object-cover ${shouldBlurCover ? 'blur-md' : ''}`}
                                controls={false}
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-300">
                                IMG
                              </div>
                            )}
                            {shouldBlurCover ? (
                              <div className="pointer-events-none absolute left-1 top-1 rounded-full border border-white/25 bg-black/55 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-white">
                                NSFW
                              </div>
                            ) : null}
                          </div>

                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{album.name}</p>
                            {countLabel ? (
                              <p
                                className={`mt-1 text-xs ${
                                  isActive ? 'text-slate-300 dark:text-slate-600' : 'text-slate-500 dark:text-slate-400'
                                }`}
                              >
                                {countLabel}
                              </p>
                            ) : null}
                          </div>
                        </div>
                        <ChevronRight
                          className={`h-4 w-4 transition ${isActive ? 'text-slate-300 dark:text-slate-600' : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200'}`}
                        />
                      </button>

                      {publicHref ? (
                        <Link
                          href={publicHref}
                          aria-label="Open album"
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-slate-600 transition hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-50 ${
                            isActive ? 'border-white/15 bg-white/10' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/30'
                          }`}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!collapsed && !loadingAlbums && totalPages > 1 ? (
            <div className="shrink-0 bg-white pt-2 dark:bg-slate-900">
              <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setPageIndex((current) => Math.max(current - 1, 0))}
                disabled={!canGoPrev}
                className="inline-flex h-9 items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                aria-label="Previous albums page"
              >
                Prev
              </button>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Page {pageIndex + 1} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPageIndex((current) => Math.min(current + 1, totalPages - 1))}
                disabled={!canGoNext}
                className="inline-flex h-9 items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                aria-label="Next albums page"
              >
                Next
              </button>
              </div>
            </div>
          ) : null}
        </div>

      </div>
      </aside>
    </>
  );
}
