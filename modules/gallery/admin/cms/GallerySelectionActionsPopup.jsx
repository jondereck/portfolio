'use client';

import { useEffect, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  FolderPlus,
  Image as ImageIcon,
  Move,
  Trash2,
  X,
} from 'lucide-react';

const iconBtnBase =
  'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition disabled:cursor-not-allowed disabled:opacity-45';

export default function GallerySelectionActionsPopup({
  open,
  selectedCount,
  disabled = false,
  targetAlbumName = null,
  onPickAlbum,
  onMove,
  onCreateAlbum,
  onBlurModeChange,
  onSetCover,
  onDelete,
  onClear,
  savingBlurMode = false,
  canSetCover = false,
}) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!open || !selectedCount) {
      setExpanded(false);
    }
  }, [open, selectedCount]);

  if (!open || !selectedCount) return null;

  const canMove = Boolean(targetAlbumName) && !disabled;
  const blurDisabled = disabled || savingBlurMode || typeof onBlurModeChange !== 'function';
  const showSetCover = Boolean(canSetCover) && typeof onSetCover === 'function';
  const setCoverDisabled = disabled || !showSetCover;

  const actionIcons = (
    <>
      {showSetCover ? (
        <button
          type="button"
          className={`${iconBtnBase} border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700`}
          onClick={onSetCover}
          disabled={setCoverDisabled}
          aria-label="Set cover"
          title="Set cover"
        >
          <ImageIcon className="h-4 w-4" strokeWidth={1.75} />
        </button>
      ) : null}
      <button
        type="button"
        className={`${iconBtnBase} border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700`}
        onClick={onCreateAlbum}
        disabled={disabled}
        aria-label="Create album"
        title="Create album"
      >
        <FolderPlus className="h-4 w-4" strokeWidth={1.75} />
      </button>
      <button
        type="button"
        className={`${iconBtnBase} border border-rose-100 bg-rose-50 text-rose-500 hover:bg-rose-100 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-950/60`}
        onClick={onDelete}
        disabled={disabled}
        aria-label="Delete"
        title="Delete"
      >
        <Trash2 className="h-4 w-4" strokeWidth={1.75} />
      </button>
      <button
        type="button"
        className={`${iconBtnBase} bg-blue-600 text-white shadow-sm hover:bg-blue-500 dark:bg-blue-500 dark:hover:bg-blue-400`}
        onClick={onMove}
        disabled={!canMove}
        aria-label="Move to album"
        title="Move to album"
      >
        <Move className="h-4 w-4" strokeWidth={1.75} />
      </button>
    </>
  );

  return (
    <>
      {/* Mobile: collapsed pill → expandable sheet */}
      <div className="lg:hidden">
        {!expanded ? (
          <div className="fixed inset-x-0 bottom-3 z-40 px-3 pb-[env(safe-area-inset-bottom)]">
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
              className="mx-auto flex max-w-lg cursor-pointer items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-sky-100 px-2 text-sm font-bold text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                  {selectedCount}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">media selected</p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">Add to album</p>
                </div>
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
                  className="inline-flex h-9 items-center justify-center rounded-xl bg-blue-600 px-3 text-sm font-semibold text-white disabled:opacity-60"
                >
                  Move
                </button>
                <ChevronUp className="h-5 w-5 text-slate-400" />
              </div>
            </div>
          </div>
        ) : null}

        {expanded ? (
          <>
            <div
              className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm"
              onClick={() => setExpanded(false)}
            />
            <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-[24px] border-t border-slate-200 bg-white px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => setExpanded(false)}
                aria-label="Collapse actions"
                className="mx-auto mb-4 block h-1.5 w-11 rounded-full bg-slate-200 dark:bg-slate-700"
              />

              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-sky-100 px-2 text-sm font-bold text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                    {selectedCount}
                  </span>
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-slate-900 dark:text-slate-50">media selected</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Add to album</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                  onClick={onClear}
                  disabled={disabled}
                  aria-label="Clear selection"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <button
                type="button"
                className="mt-4 inline-flex h-11 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50 dark:hover:bg-slate-800"
                onClick={onPickAlbum}
                disabled={disabled}
              >
                <span className="truncate">{targetAlbumName || 'Select album'}</span>
                <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
              </button>

              {typeof onBlurModeChange === 'function' ? (
                <select
                  className="mt-3 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 outline-none transition disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
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
                    {savingBlurMode ? 'Saving...' : 'Blur mode'}
                  </option>
                  <option value="auto">Auto</option>
                  <option value="force_blur">Force blur</option>
                  <option value="force_unblur">Force unblur</option>
                </select>
              ) : null}

              <div className="mt-4 flex items-center justify-end gap-2">{actionIcons}</div>
            </div>
          </>
        ) : null}
      </div>

      {/* Desktop / web — compact floating bar */}
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-30 hidden px-6 lg:block">
        <div className="pointer-events-auto mx-auto flex w-fit max-w-full items-center gap-3 rounded-2xl border border-slate-200/90 bg-white px-3 py-2.5 shadow-[0_12px_40px_rgba(15,23,42,0.12)] dark:border-slate-700 dark:bg-slate-900 dark:shadow-[0_12px_40px_rgba(0,0,0,0.45)]">
          <div className="flex min-w-0 items-center gap-2.5 pl-0.5">
            <span className="inline-flex h-9 min-w-9 items-center justify-center rounded-full bg-sky-100 px-2 text-sm font-bold tabular-nums text-sky-700 dark:bg-sky-950 dark:text-sky-300">
              {selectedCount}
            </span>
            <div className="min-w-0 pr-1">
              <p className="whitespace-nowrap text-sm font-semibold leading-tight text-slate-900 dark:text-slate-50">
                media selected
              </p>
              <p className="whitespace-nowrap text-xs leading-tight text-slate-500 dark:text-slate-400">Add to album</p>
            </div>
          </div>

          <div className="h-8 w-px shrink-0 bg-slate-200 dark:bg-slate-700" aria-hidden="true" />

          <button
            type="button"
            className="inline-flex h-10 min-w-[9.5rem] max-w-[14rem] items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50 dark:hover:bg-slate-800"
            onClick={onPickAlbum}
            disabled={disabled}
          >
            <span className="truncate">{targetAlbumName || 'Select album'}</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
          </button>

          <div className="flex items-center gap-1.5">{actionIcons}</div>

          <button
            type="button"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            onClick={onClear}
            disabled={disabled}
            aria-label="Clear selection"
            title="Clear"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  );
}
