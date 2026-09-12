'use client';

import { SlidersHorizontal } from 'lucide-react';

export default function GalleryMediaToolbar({
  title = 'Media library',
  searchValue,
  onSearchChange,
  showMobileSearch = true,
  activeChip,
  chips = [],
  onChipChange,
  onOpenFilter,
  gridColumns = 4,
  onGridColumnsChange,
  trailing,
}) {
  const canAdjustGrid = typeof onGridColumnsChange === 'function';
  const mobileGridValue = Math.max(2, Math.min(4, Number(gridColumns) || 4));
  const hasChips = Array.isArray(chips) && chips.length > 0;

  return (
    <div className="px-4 py-4 sm:px-5 lg:px-6 lg:py-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center justify-between gap-3 sm:block">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">{title}</h2>
          {onOpenFilter ? (
            <button
              type="button"
              onClick={onOpenFilter}
              className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-50 sm:hidden"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filter
            </button>
          ) : null}
        </div>

        {trailing ? <div className="hidden sm:flex sm:items-center sm:gap-2">{trailing}</div> : null}

        {canAdjustGrid ? (
          <label className="hidden min-w-[190px] items-center gap-3 text-sm text-slate-600 dark:text-slate-300 sm:flex">
            <span className="shrink-0 font-medium text-slate-900 dark:text-slate-50">Grid</span>
            <input
              type="range"
              min="2"
              max="8"
              step="1"
              value={gridColumns}
              onChange={(event) => {
                const nextValue = Number(event.target.value);
                onGridColumnsChange(Number.isFinite(nextValue) ? nextValue : 4);
              }}
              className="h-2 flex-1 accent-slate-900 dark:accent-slate-50"
              aria-label="Media grid columns"
            />
            <span className="w-5 text-right tabular-nums">{gridColumns}</span>
          </label>
        ) : null}
      </div>

      {showMobileSearch ? (
        <div className="mt-4 lg:hidden">
          <input
            id="gallery-media-search"
            value={searchValue}
            onChange={(event) => onSearchChange?.(event.target.value)}
            placeholder="Search media"
            className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-50"
          />
        </div>
      ) : null}

      {hasChips ? (
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {chips.map((chip) => {
            const isActive = chip.id === activeChip;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => onChipChange?.(chip.id)}
                className={`whitespace-nowrap rounded-2xl px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? 'bg-slate-900 text-white dark:bg-slate-50 dark:text-slate-900'
                    : 'border border-slate-200 bg-white text-slate-900 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-50 dark:hover:bg-slate-900/60'
                }`}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      ) : null}

      {canAdjustGrid ? (
        <label className="mt-3 flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300 sm:hidden">
          <span className="shrink-0 font-medium text-slate-900 dark:text-slate-50">Grid</span>
          <input
            type="range"
            min="2"
            max="4"
            step="1"
            value={mobileGridValue}
            onChange={(event) => {
              const nextValue = Number(event.target.value);
              onGridColumnsChange(Number.isFinite(nextValue) ? Math.max(2, Math.min(4, nextValue)) : 4);
            }}
            className="h-2 flex-1 accent-slate-900 dark:accent-slate-50"
            aria-label="Media grid columns"
          />
          <span className="w-5 text-right tabular-nums">{mobileGridValue}</span>
        </label>
      ) : null}
    </div>
  );
}
