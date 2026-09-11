import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
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
          <Skeleton className="hidden h-5 w-16 rounded-full md:block md:h-6 md:w-[4.5rem]" />
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
    <>
      <header className={cn(topbarStyles, 'hidden md:block')} aria-busy="true" aria-label="Loading page header">
        <div className="flex flex-row items-start justify-between">
          <div className="space-y-1">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mt-1 h-7 w-64 max-w-[40vw]" />
            <Skeleton className="mt-1 h-3 w-40" />
          </div>
        </div>
      </header>

      <header
        className={cn(
          topbarStyles,
          'fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 shadow-lg md:hidden',
        )}
        aria-busy="true"
        aria-label="Loading page header"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-5 w-40 max-w-[55vw]" />
            <Skeleton className="h-3 w-28" />
          </div>
          <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
        </div>
      </header>
    </>
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

      <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={`dash-skel-${index}`}
            className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/30"
          >
            <div className="flex items-start justify-between gap-3">
              <Skeleton className="h-9 w-9 rounded-xl sm:h-10 sm:w-10" />
              <Skeleton className="h-4 w-4 rounded" />
            </div>
            <Skeleton className="mt-3 h-4 w-24 sm:w-32" />
            <Skeleton className="mt-2 hidden h-3 w-full sm:block" />
            <Skeleton className="mt-1 hidden h-3 w-[80%] sm:block" />
          </div>
        ))}
      </div>
    </section>
  );
}

/** Exact geometry of AdminMetricCard */
export function AdminMetricCardSkeleton() {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-4">
      <Skeleton className="h-3 w-12 sm:w-16" />
      <Skeleton className="mt-2 h-7 w-10 sm:mt-3 sm:h-8" />
      <Skeleton className="mt-1 h-3 w-full sm:h-4 sm:w-28" />
    </div>
  );
}
