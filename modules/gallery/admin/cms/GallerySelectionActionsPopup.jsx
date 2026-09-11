'use client';

import { useEffect, useState } from 'react';
import { ChevronsUpDown, ChevronUp, X } from 'lucide-react';

export default function GallerySelectionActionsPopup({
  open,
  selectedCount,
  disabled = false,
  targetAlbumName = null,
  onPickAlbum,
  onMove,
  onCreateAlbum,
  onBlurModeChange,
  onDelete,
  onClear,
  savingBlurMode = false,
}) {
  const [expanded, setExpanded] = useState(false);

  // Collapse the mobile sheet whenever the selection clears or the bar hides.
  useEffect(() => {
    if (!open || !selectedCount) {
      setExpanded(false);
    }
  }, [open, selectedCount]);

  if (!open || !selectedCount) return null;

  const canMove = Boolean(targetAlbumName) && !disabled;
  const blurDisabled = disabled || savingBlurMode || typeof onBlurModeChange !== 'function';

  return (
    <>
      {/* Mobile: collapsed pill bar → expandable bottom sheet */}
      <div className="lg:hidden">
        {/* Collapsed dark pill bar */}
        {!expanded ? (
          <div className="fixed inset-x-0 bottom-3 z-40 px-3">
            <div
              role="button"
              tabIndex={0}
              onClick={() => setExpanded(true)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setExpanded(true);
                }
              }}
              className="mx-auto flex max-w-md cursor-pointer items-center justify-between gap-3 rounded-xl bg-slate-900 p-3 shadow-2xl ring-1 ring-slate-900/10 dark:bg-slate-950 dark:ring-white/10"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-white px-2 text-xs font-bold text-slate-900">
                  {selectedCount}
                </span>
                <span className="truncate text-sm font-semibold text-white">selected</span>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (canMove) {
                      onMove?.();
                    } else {
                      setExpanded(true);
                    }
                  }}
                  disabled={disabled}
                  className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-slate-900 transition hover:bg-slate-100 disabled:opacity-60"
                >
                  Move
                </button>
                <ChevronUp className="h-5 w-5 text-white/70" />
              </div>
            </div>
          </div>
        ) : null}

        {/* Expanded bottom sheet */}
        {expanded ? (
          <>
            <div
              className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm"
              onClick={() => setExpanded(false)}
            />
            <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-[24px] border-t border-slate-200 bg-white px-4 pb-6 pt-3 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => setExpanded(false)}
                aria-label="Collapse actions"
                className="mx-auto mb-4 block h-1.5 w-11 rounded-full bg-slate-200 dark:bg-slate-700"
              />

              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-slate-900 px-2 text-xs font-bold text-white dark:bg-slate-50 dark:text-slate-900">
                    {selectedCount}
                  </span>
                  <span className="text-base font-semibold text-slate-900 dark:text-slate-50">selected</span>
                </div>
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                  onClick={() => setExpanded(false)}
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Move, add to album, or set blur without leaving the grid.
              </p>

              <label className="mb-2 mt-5 block text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                Add to album
              </label>
              <button
                type="button"
                className="inline-flex h-12 w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-50 dark:hover:bg-slate-800"
                onClick={onPickAlbum}
                disabled={disabled}
              >
                <span className="truncate">{targetAlbumName || 'Select album'}</span>
                <ChevronsUpDown className="h-4 w-4 text-slate-400" />
              </button>

              <label className="mb-2 mt-4 block text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                Blur mode
              </label>
              <select
                className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 outline-none transition disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-50"
                defaultValue=""
                disabled={blurDisabled}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  if (!nextValue) return;
                  onBlurModeChange?.(nextValue);
                  event.target.value = '';
                }}
              >
                <option value="" disabled>
                  {savingBlurMode ? 'Saving...' : 'Set blur mode'}
                </option>
                <option value="auto">Auto</option>
                <option value="force_blur">Force blur</option>
                <option value="force_unblur">Force unblur</option>
              </select>

              <div className="mt-5 grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  className="inline-flex h-12 items-center justify-center rounded-2xl border border-slate-900 bg-slate-900 px-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60 dark:border-slate-50 dark:bg-slate-50 dark:text-slate-900 dark:hover:bg-slate-200"
                  onClick={onMove}
                  disabled={!canMove}
                >
                  Move
                </button>
                <button
                  type="button"
                  className="inline-flex h-12 items-center justify-center rounded-2xl border border-sky-200 bg-sky-50 px-3 text-sm font-semibold text-sky-700 transition hover:bg-sky-100 disabled:opacity-60 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-200 dark:hover:bg-sky-950/50"
                  onClick={onCreateAlbum}
                  disabled={disabled}
                >
                  Create album
                </button>
                <button
                  type="button"
                  className="inline-flex h-12 items-center justify-center rounded-2xl border border-red-200 bg-white px-3 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60 dark:border-red-900/40 dark:bg-slate-900 dark:text-red-300 dark:hover:bg-red-950/30"
                  onClick={onDelete}
                  disabled={disabled}
                >
                  Delete
                </button>
                <button
                  type="button"
                  className="inline-flex h-12 items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  onClick={onClear}
                  disabled={disabled}
                >
                  Clear
                </button>
              </div>
            </div>
          </>
        ) : null}
      </div>

      {/* Desktop */}
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-30 hidden px-6 lg:block">
        <div className="pointer-events-auto mx-auto flex w-full max-w-5xl items-center gap-4 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-2xl ring-1 ring-slate-200 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 dark:ring-slate-800">
          <div className="flex min-w-[240px] items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-800 dark:bg-slate-950/40">
            <span className="inline-flex h-9 min-w-9 items-center justify-center rounded-full bg-slate-900 px-2 text-xs font-semibold text-white dark:bg-slate-50 dark:text-slate-900">
              {selectedCount}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                {selectedCount} media selected
              </p>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                Bulk actions stay visible while browsing the grid.
              </p>
            </div>
          </div>

          <div className="min-w-[240px] flex-1 rounded-xl border border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-950/40">
            <label className="mb-1 block px-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              Add to album
            </label>
            <button
              type="button"
              className="inline-flex h-11 w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-50 dark:hover:bg-slate-800"
              onClick={onPickAlbum}
              disabled={disabled}
            >
              <span className="truncate">{targetAlbumName || 'Select album'}</span>
              <ChevronsUpDown className="h-4 w-4 text-slate-400" />
            </button>
          </div>

          <div className="min-w-[180px] rounded-xl border border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-950/40">
            <label className="mb-1 block px-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              Blur mode
            </label>
            <select
              className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 outline-none transition disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-50"
              defaultValue=""
              disabled={blurDisabled}
              onChange={(event) => {
                const nextValue = event.target.value;
                if (!nextValue) return;
                onBlurModeChange?.(nextValue);
                event.target.value = '';
              }}
            >
              <option value="" disabled>
                {savingBlurMode ? 'Saving...' : 'Set mode'}
              </option>
              <option value="auto">Auto</option>
              <option value="force_blur">Force blur</option>
              <option value="force_unblur">Force unblur</option>
            </select>
          </div>

          <div className="grid w-[220px] shrink-0 grid-cols-2 gap-2">
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center whitespace-nowrap rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-50 dark:hover:bg-slate-800"
              onClick={onMove}
              disabled={!canMove}
            >
              Move
            </button>
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center whitespace-nowrap rounded-2xl border border-sky-200 bg-sky-50 px-3 text-sm font-medium text-sky-700 transition hover:bg-sky-100 disabled:opacity-60 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-200 dark:hover:bg-sky-950/50"
              onClick={onCreateAlbum}
              disabled={disabled}
            >
              Create album
            </button>
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center whitespace-nowrap rounded-2xl border border-red-200 bg-red-50 px-3 text-sm font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-60 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200 dark:hover:bg-red-950/50"
              onClick={onDelete}
              disabled={disabled}
            >
              Delete
            </button>
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center whitespace-nowrap rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-60 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-200 dark:hover:bg-slate-800"
              onClick={onClear}
              disabled={disabled}
            >
              Clear
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
