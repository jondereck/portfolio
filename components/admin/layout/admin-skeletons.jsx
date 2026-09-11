import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  metricCardStyles,
  topbarStyles,
  cardStyles,
} from '@/modules/system/admin/settingsShared';

/** Exact geometry of AdminOverviewCard */
export function AdminOverviewCardSkeleton({ className }) {
  return (
    <div
      className={cn(
        'relative flex h-full min-h-[140px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:min-h-[220px] sm:p-5',
        className,
      )}
    >
      <div className="relative flex h-full flex-col">
        <div className="flex items-start justify-between gap-3">
          <Skeleton className="size-9 rounded-2xl sm:size-11" />
          <Skeleton className="h-5 w-16 rounded-full sm:h-6 sm:w-[4.5rem]" />
        </div>

        <div className="mt-3 space-y-2 sm:mt-8 sm:space-y-3">
          <Skeleton className="h-4 w-32 sm:h-6 sm:w-48" />
          <Skeleton className="hidden h-4 w-full max-w-[34ch] sm:block" />
          <Skeleton className="hidden h-4 w-[88%] max-w-[30ch] sm:block" />
        </div>

        <div className="mt-auto flex items-center justify-between pt-3 sm:pt-8">
          <Skeleton className="size-4 rounded" />
        </div>
      </div>
    </div>
  );
}

/** Exact geometry of AdminTopbar header */
export function AdminTopbarSkeleton() {
  return (
    <header className={topbarStyles} aria-busy="true" aria-label="Loading page header">
      <div className="md:hidden">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-7 w-52 max-w-[70vw]" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-11 w-11 rounded-full" />
        </div>
      </div>

      <div className="hidden md:flex md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="mt-1 h-7 w-64 max-w-[40vw]" />
          <Skeleton className="mt-1 h-3 w-40" />
        </div>
      </div>
    </header>
  );
}

/** Exact geometry of dashboard shortcut cards */
export function AdminDashboardShortcutsSkeleton() {
  return (
    <section className={cn(cardStyles, 'p-4')}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-7 w-48 max-w-full" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        <Skeleton className="hidden h-10 w-32 rounded-xl md:block" />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={`dash-skel-${index}`}
            className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/30"
          >
            <div className="flex items-start justify-between gap-3">
              <Skeleton className="h-10 w-10 rounded-xl" />
              <Skeleton className="h-4 w-4 rounded" />
            </div>
            <Skeleton className="mt-3 h-4 w-32" />
            <Skeleton className="mt-2 h-3 w-full" />
            <Skeleton className="mt-1 h-3 w-[80%]" />
          </div>
        ))}
      </div>
    </section>
  );
}

/** Exact geometry of AdminMetricCard */
export function AdminMetricCardSkeleton() {
  return (
    <div className={cn(metricCardStyles, 'min-w-0 p-2.5 sm:p-4')}>
      <Skeleton className="h-3 w-12 sm:w-16" />
      <Skeleton className="mt-1.5 h-6 w-8 sm:mt-2 sm:h-8 sm:w-10" />
      <Skeleton className="mt-1 h-3 w-full sm:h-4 sm:w-28" />
    </div>
  );
}
