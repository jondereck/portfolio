'use client';

import { Skeleton } from '@/components/ui/skeleton';

const MOBILE_GRID_COL_CLASS = {
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
};

const SM_GRID_COL_CLASS = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-4',
  5: 'sm:grid-cols-5',
  6: 'sm:grid-cols-6',
  7: 'sm:grid-cols-7',
  8: 'sm:grid-cols-8',
};

const LG_GRID_COL_CLASS = {
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
  5: 'lg:grid-cols-5',
  6: 'lg:grid-cols-6',
  7: 'lg:grid-cols-7',
  8: 'lg:grid-cols-8',
};

const XL_GRID_COL_CLASS = {
  2: 'xl:grid-cols-2',
  3: 'xl:grid-cols-3',
  4: 'xl:grid-cols-4',
  5: 'xl:grid-cols-5',
  6: 'xl:grid-cols-6',
  7: 'xl:grid-cols-7',
  8: 'xl:grid-cols-8',
};

export default function GalleryMediaGridSkeleton({ gridColumns = 4, inspectorOpen = false }) {
  const normalizedGridColumns = Math.max(2, Math.min(8, Number(gridColumns) || 4));
  const mobileGridColumns = Math.max(2, Math.min(4, normalizedGridColumns));
  const largeGridColumns = inspectorOpen
    ? Math.max(2, Math.min(4, normalizedGridColumns))
    : normalizedGridColumns;
  const extraLargeGridColumns = inspectorOpen
    ? Math.max(2, Math.min(6, normalizedGridColumns))
    : normalizedGridColumns;

  const gridClassName = [
    MOBILE_GRID_COL_CLASS[mobileGridColumns] || 'grid-cols-2',
    SM_GRID_COL_CLASS[normalizedGridColumns] || 'sm:grid-cols-4',
    LG_GRID_COL_CLASS[largeGridColumns] || 'lg:grid-cols-4',
    XL_GRID_COL_CLASS[extraLargeGridColumns] || 'xl:grid-cols-4',
  ].join(' ');

  // Two full rows at the current desktop density (capped for very wide grids).
  const skeletonCount = Math.min(16, Math.max(mobileGridColumns, largeGridColumns) * 2);

  return (
    <div
      className={`grid ${gridClassName} gap-3 px-4 pb-6 sm:px-5 lg:px-6`}
      aria-busy="true"
      aria-label="Loading media"
    >
      {Array.from({ length: skeletonCount }, (_, index) => (
        <div
          key={`gallery-media-skeleton-${index}`}
          className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/20"
        >
          <Skeleton className="aspect-square w-full rounded-none bg-slate-200/80 dark:bg-slate-800/80" />
        </div>
      ))}
    </div>
  );
}
