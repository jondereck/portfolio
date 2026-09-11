import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/** Exact geometry of AdminOverviewCard */
export function AdminOverviewCardSkeleton({ className }) {
  return (
    <div
      className={cn(
        'relative flex h-full min-h-[180px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:min-h-[220px] sm:p-5',
        className,
      )}
    >
      <div className="relative flex h-full flex-col">
        <div className="flex items-start justify-between gap-3">
          <Skeleton className="size-10 rounded-2xl sm:size-11" />
          <Skeleton className="h-5 w-16 rounded-full sm:h-6 sm:w-[4.5rem]" />
        </div>

        <div className="mt-5 space-y-2 sm:mt-8 sm:space-y-3">
          <Skeleton className="h-5 w-40 sm:h-6 sm:w-48" />
          <Skeleton className="h-4 w-full max-w-[34ch]" />
          <Skeleton className="h-4 w-[88%] max-w-[30ch]" />
        </div>

        <div className="mt-auto flex items-center justify-between pt-5 sm:pt-8">
          <Skeleton className="size-4 rounded" />
        </div>
      </div>
    </div>
  );
}

/** Exact geometry of AdminTopbar header */
export function AdminTopbarSkeleton() {
  return (
    <header
      className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm md:p-4 dark:border-slate-800 dark:bg-slate-900"
      aria-busy="true"
      aria-label="Loading page header"
    >
      <div className="md:hidden">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-8 w-52 max-w-[70vw]" />
          </div>
          <Skeleton className="h-11 w-11 rounded-full" />
        </div>
      </div>

      <div className="hidden md:flex md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="mt-1 h-8 w-64 max-w-[40vw]" />
          <Skeleton className="mt-1 h-3 w-40" />
        </div>
      </div>
    </header>
  );
}

/** Exact geometry of dashboard shortcut cards */
export function AdminDashboardShortcutsSkeleton() {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-8 w-48 max-w-full" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        <Skeleton className="hidden h-11 w-36 rounded-2xl md:block" />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={`dash-skel-${index}`}
            className="rounded-[24px] border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/30"
          >
            <div className="flex items-start justify-between gap-3">
              <Skeleton className="h-11 w-11 rounded-2xl" />
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
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-4">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="mt-2 h-7 w-10 sm:mt-3 sm:h-8" />
      <Skeleton className="mt-1 h-3 w-28 sm:h-4" />
    </div>
  );
}
