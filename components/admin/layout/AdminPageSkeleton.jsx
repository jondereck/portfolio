'use client';

import { usePathname } from 'next/navigation';
import {
  AdminDashboardShortcutsSkeleton,
  AdminMetricCardSkeleton,
  AdminOverviewCardSkeleton,
} from '@/components/admin/layout/admin-skeletons';
import { Skeleton } from '@/components/ui/skeleton';

const PORTFOLIO_OVERVIEW_CARD_COUNT = 7;
const GALLERY_OVERVIEW_CARD_COUNT = 4;
const GALLERY_METRIC_COUNT = 3;

function OverviewCardGridSkeleton({ count, className = 'grid gap-4 md:grid-cols-2 xl:grid-cols-3' }) {
  return (
    <section className={className}>
      {Array.from({ length: count }).map((_, index) => (
        <AdminOverviewCardSkeleton key={`overview-skel-${index}`} />
      ))}
    </section>
  );
}

function GenericSectionSkeleton() {
  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="mt-2 h-4 w-full max-w-xl" />
        <div className="mt-6 space-y-3">
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      </section>
    </div>
  );
}

/**
 * Route-aware content skeleton: only mirrors blocks that exist on that page.
 */
export default function AdminPageSkeleton() {
  const pathname = usePathname() || '/admin';

  if (pathname === '/admin') {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Loading admin dashboard">
        <AdminDashboardShortcutsSkeleton />
        <section className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 dark:border-slate-700 dark:bg-slate-900/60">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="mt-2 h-4 w-full max-w-2xl" />
        </section>
      </div>
    );
  }

  if (pathname === '/admin/portfolio') {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Loading portfolio administration">
        <OverviewCardGridSkeleton count={PORTFOLIO_OVERVIEW_CARD_COUNT} />
      </div>
    );
  }

  if (pathname === '/admin/gallery') {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Loading gallery administration">
        <section className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {Array.from({ length: GALLERY_METRIC_COUNT }).map((_, index) => (
            <AdminMetricCardSkeleton key={`metric-skel-${index}`} />
          ))}
        </section>
        <OverviewCardGridSkeleton
          count={GALLERY_OVERVIEW_CARD_COUNT}
          className="grid auto-rows-fr gap-3 md:grid-cols-2 xl:grid-cols-3"
        />
      </div>
    );
  }

  if (
    pathname.startsWith('/admin/portfolio/') ||
    pathname.startsWith('/admin/gallery/') ||
    pathname.startsWith('/admin/settings') ||
    pathname.startsWith('/admin/navigation') ||
    pathname.startsWith('/admin/integrations') ||
    pathname.startsWith('/admin/security') ||
    pathname.startsWith('/admin/users') ||
    pathname.startsWith('/admin/account') ||
    pathname.startsWith('/admin/media-scraper')
  ) {
    return (
      <div aria-busy="true" aria-label="Loading admin page">
        <GenericSectionSkeleton />
      </div>
    );
  }

  return (
    <div aria-busy="true" aria-label="Loading admin page">
      <GenericSectionSkeleton />
    </div>
  );
}
