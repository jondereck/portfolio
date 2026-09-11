'use client';

import { useState } from 'react';
import { AlertTriangle, Check, X } from 'lucide-react';

const truncateText = (text, max = 80) => {
  if (!text) return '';
  const normalized = String(text).replace(/\s+/g, ' ').trim();
  return normalized.length > max ? `${normalized.slice(0, max)}…` : normalized;
};

const truncateFileName = (name, max = 20) => {
  if (!name) return 'Untitled item';
  if (name.length <= max) return name;

  const lastDot = name.lastIndexOf('.');
  const hasExt = lastDot > 0;
  const ext = hasExt ? name.slice(lastDot) : '';
  const base = hasExt ? name.slice(0, lastDot) : name;
  const allowedBaseLength = Math.max(8, max - ext.length - 1);

  return `${base.slice(0, allowedBaseLength)}…${ext}`;
};

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
  const visibleFlagged =
    expanded || hiddenCount === 0 ? flaggedEntries : flaggedEntries.slice(0, initialVisibleCount);

  if (!hasSummary) {
    return null;
  }

  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900/80 sm:p-4 ${className}`.trim()}
    >
      <div className="grid gap-2 sm:grid-cols-3 sm:gap-3">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2.5 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100 sm:rounded-xl sm:px-3 sm:py-3">
          <div className="flex items-center gap-2">
            <Check className="size-4" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] sm:text-xs sm:tracking-[0.16em]">
              {uploadedLabel}
            </p>
          </div>
          <p className="mt-2 text-base font-semibold sm:text-lg">{summary.uploadedCount ?? 0}</p>
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2.5 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100 sm:rounded-xl sm:px-3 sm:py-3">
          <div className="flex items-center gap-2">
            <X className="size-4" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] sm:text-xs sm:tracking-[0.16em]">
              {skippedLabel}
            </p>
          </div>
          <p className="mt-2 text-base font-semibold sm:text-lg">{summary.skippedCount ?? 0}</p>
        </div>

        <div className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2.5 text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-100 sm:rounded-xl sm:px-3 sm:py-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] sm:text-xs sm:tracking-[0.16em]">
              {failedLabel}
            </p>
          </div>
          <p className="mt-2 text-base font-semibold sm:text-lg">{summary.failedCount ?? 0}</p>
        </div>
      </div>

      {flaggedEntries.length > 0 ? (
        <div className="mt-4 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400 sm:text-xs sm:tracking-[0.16em]">
            {flaggedHeading}
          </p>

          <div className="space-y-2">
            {visibleFlagged.map((entry, index) => (
              <div
                key={`${entry.fileName}-${entry.status}-${index}`}
                className={`min-w-0 overflow-hidden rounded-lg border px-2.5 py-2.5 text-sm sm:rounded-xl sm:px-3 sm:py-3 ${
                  entry.status === 'duplicate-skipped'
                    ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100'
                    : 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-100'
                }`}
              >
                <div className="min-w-0 overflow-hidden">
                  <p
                    className="block w-full min-w-0 overflow-hidden truncate text-sm font-semibold"
                    title={entry.fileName}
                  >
                    {truncateFileName(entry.fileName, 20)}
                  </p>

                  <p
                    className="mt-1 block w-full min-w-0 overflow-hidden break-all text-[11px] leading-4 opacity-80 sm:text-xs"
                    title={entry.reason}
                  >
                    {truncateText(entry.reason, 80)}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {hiddenCount > 0 ? (
            <button
              type="button"
              className="mt-2 text-xs font-bold text-slate-700 underline-offset-2 hover:underline dark:text-slate-200"
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? 'Show less' : `Show more (${hiddenCount})`}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
