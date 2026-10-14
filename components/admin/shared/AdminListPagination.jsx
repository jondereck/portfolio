'use client';

import { cn } from '@/lib/utils';

const buttonStyles =
  'inline-flex h-8 min-h-8 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800';

/**
 * Compact Prev / Page x / y / Next control. Hidden when there is only one page.
 */
export default function AdminListPagination({
  page = 1,
  totalPages = 1,
  onPageChange,
  className,
  label = 'Page',
}) {
  const safeTotal = Math.max(1, Number(totalPages) || 1);
  const safePage = Math.min(Math.max(1, Number(page) || 1), safeTotal);

  if (safeTotal <= 1) {
    return null;
  }

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-2 dark:border-slate-800',
        className,
      )}
    >
      <button
        type="button"
        className={buttonStyles}
        disabled={safePage <= 1}
        onClick={() => onPageChange?.(safePage - 1)}
        aria-label="Previous page"
      >
        Prev
      </button>
      <span className="text-xs text-slate-500 dark:text-slate-400">
        {label} {safePage} / {safeTotal}
      </span>
      <button
        type="button"
        className={buttonStyles}
        disabled={safePage >= safeTotal}
        onClick={() => onPageChange?.(safePage + 1)}
        aria-label="Next page"
      >
        Next
      </button>
    </div>
  );
}

export function getPagedSlice(list, page, pageSize) {
  const items = Array.isArray(list) ? list : [];
  const size = Math.max(1, Number(pageSize) || 10);
  const totalPages = Math.max(1, Math.ceil(items.length / size));
  const safePage = Math.min(Math.max(1, Number(page) || 1), totalPages);
  const start = (safePage - 1) * size;
  return {
    page: safePage,
    totalPages,
    pageItems: items.slice(start, start + size),
    pageSize: size,
  };
}
