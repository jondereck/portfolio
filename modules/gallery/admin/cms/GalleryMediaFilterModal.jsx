'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import GalleryCmsModal from './GalleryCmsModal';

const sortOptions = [
  {
    id: 'custom',
    title: 'Manual arrangement',
    description: 'Use the saved drag-and-drop order (Arrange page).',
  },
  {
    id: 'dateDesc',
    title: 'Newest first',
    description: 'Sort by date taken (fallback: uploaded date).',
  },
  {
    id: 'dateAsc',
    title: 'Oldest first',
    description: 'Sort by date taken (fallback: uploaded date).',
  },
];

const defaultFilterOptions = [
  { id: 'all', title: 'All media', description: 'Show every media item in the album.' },
  { id: 'images', title: 'Images', description: 'Show photos and still image files only.' },
  { id: 'videos', title: 'Videos', description: 'Show video media only.' },
  { id: 'audio', title: 'Audio', description: 'Show audio files only.' },
  { id: 'nsfw', title: 'NSFW images', description: 'Show images flagged by the NSFW scanner.' },
];

const defaultDensityOptions = [
  { id: 'small', title: 'Small', description: 'More items per row.' },
  { id: 'medium', title: 'Medium', description: 'Balanced grid spacing.' },
  { id: 'large', title: 'Large', description: 'Larger previews.' },
];

export default function GalleryMediaFilterModal({
  open,
  onClose,
  sortMode = 'custom',
  onApplySort,
  mediaFilter,
  onApplyFilter,
  filterOptions = defaultFilterOptions,
  density,
  onApplyDensity,
  densityOptions = defaultDensityOptions,
}) {
  const [pendingSort, setPendingSort] = useState(sortMode);
  const [pendingFilter, setPendingFilter] = useState(mediaFilter ?? 'all');
  const [pendingDensity, setPendingDensity] = useState(density ?? 'medium');
  const showFilters = typeof mediaFilter === 'string' && typeof onApplyFilter === 'function';
  const showDensity = typeof density === 'string' && typeof onApplyDensity === 'function';

  useEffect(() => {
    if (!open) return;
    setPendingSort(sortMode);
    setPendingFilter(mediaFilter ?? 'all');
    setPendingDensity(density ?? 'medium');
  }, [density, mediaFilter, open, sortMode]);

  const activeSortOption = useMemo(() => sortOptions.find((option) => option.id === pendingSort) ?? sortOptions[0], [pendingSort]);
  const activeFilterOption = useMemo(
    () => filterOptions.find((option) => option.id === pendingFilter) ?? filterOptions[0],
    [filterOptions, pendingFilter],
  );
  const activeDensityOption = useMemo(
    () => densityOptions.find((option) => option.id === pendingDensity) ?? densityOptions[1] ?? densityOptions[0],
    [densityOptions, pendingDensity],
  );
  const canApply =
    Boolean(pendingSort) &&
    (pendingSort !== sortMode ||
      (showFilters && pendingFilter !== mediaFilter) ||
      (showDensity && pendingDensity !== density));

  const resetPending = () => {
    setPendingSort(sortMode);
    setPendingFilter(mediaFilter ?? 'all');
    setPendingDensity(density ?? 'medium');
  };

  return (
    <GalleryCmsModal
      open={open}
      onClose={() => {
        resetPending();
        onClose?.();
      }}
      title="Filter & sort"
      description="Switch the album ordering without leaving the media page."
    >
      <div className="space-y-4">
        {showFilters ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">Filter</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {filterOptions.map((option) => {
                const isSelected = option.id === pendingFilter;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setPendingFilter(option.id)}
                    className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                      isSelected
                        ? 'border-slate-900 bg-slate-900 text-white shadow-sm dark:border-slate-50 dark:bg-slate-50 dark:text-slate-900'
                        : 'border-slate-200 bg-white text-slate-900 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-50 dark:hover:bg-slate-900/60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{option.title}</p>
                        <p className={`mt-1 text-xs ${isSelected ? 'text-slate-200 dark:text-slate-600' : 'text-slate-500 dark:text-slate-400'}`}>
                          {option.description}
                        </p>
                      </div>
                      {isSelected ? (
                        <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 dark:bg-slate-900/10">
                          <Check className="h-4 w-4" />
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">Sort</p>
          <div className="mt-3 space-y-2">
            {sortOptions.map((option) => {
              const isSelected = option.id === pendingSort;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setPendingSort(option.id)}
                  className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                    isSelected
                      ? 'border-slate-900 bg-slate-900 text-white shadow-sm dark:border-slate-50 dark:bg-slate-50 dark:text-slate-900'
                      : 'border-slate-200 bg-white text-slate-900 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-50 dark:hover:bg-slate-900/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{option.title}</p>
                      <p className={`mt-1 text-xs ${isSelected ? 'text-slate-200 dark:text-slate-600' : 'text-slate-500 dark:text-slate-400'}`}>
                        {option.description}
                      </p>
                    </div>
                    {isSelected ? (
                      <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 dark:bg-slate-900/10">
                        <Check className="h-4 w-4" />
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {showDensity ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">Density</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {densityOptions.map((option) => {
                const isSelected = option.id === pendingDensity;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setPendingDensity(option.id)}
                    className={`rounded-[18px] border px-3 py-3 text-left transition ${
                      isSelected
                        ? 'border-slate-900 bg-slate-900 text-white shadow-sm dark:border-slate-50 dark:bg-slate-50 dark:text-slate-900'
                        : 'border-slate-200 bg-white text-slate-900 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-50'
                    }`}
                  >
                    <p className="text-sm font-semibold">{option.title}</p>
                    <p className={`mt-1 text-xs ${isSelected ? 'text-slate-200 dark:text-slate-600' : 'text-slate-500 dark:text-slate-400'}`}>
                      {option.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300">
          <p className="font-semibold text-slate-700 dark:text-slate-200">Selected</p>
          <p className="mt-1">
            {[showFilters ? activeFilterOption?.title : null, activeSortOption?.title, showDensity ? activeDensityOption?.title : null]
              .filter(Boolean)
              .join(' / ')}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <button
            type="button"
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-50"
            onClick={() => {
              resetPending();
              onClose?.();
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canApply}
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm disabled:opacity-60 dark:bg-slate-50 dark:text-slate-900"
            onClick={() => {
              if (!pendingSort) return;
              onApplySort?.(pendingSort);
              if (showFilters) {
                onApplyFilter?.(pendingFilter);
              }
              if (showDensity) {
                onApplyDensity?.(pendingDensity);
              }
              onClose?.();
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </GalleryCmsModal>
  );
}
