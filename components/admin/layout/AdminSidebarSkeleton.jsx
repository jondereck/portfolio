import { Skeleton } from '@/components/ui/skeleton';
import { adminNavigationSections } from '@/components/admin/navigation/admin-nav-config';

/**
 * Mirrors CollapsibleSidebar geometry exactly (header, section labels, nav rows, account).
 */
export default function AdminSidebarSkeleton({ collapsed = false }) {
  return (
    <aside
      className={`h-screen shrink-0 border-r border-slate-200 bg-white transition-all duration-200 dark:border-slate-800 dark:bg-slate-900 ${
        collapsed ? 'w-[76px]' : 'w-[280px]'
      }`}
      aria-busy="true"
      aria-label="Loading sidebar"
    >
      <div className="flex h-full flex-col">
        <div
          className={`flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-4 dark:border-slate-800 ${
            collapsed ? 'px-3' : ''
          }`}
        >
          {collapsed ? (
            <div className="sr-only">Admin Control Center</div>
          ) : (
            <div className="min-w-0">
              <Skeleton className="h-3 w-[9.5rem]" />
              <Skeleton className="mt-2 h-4 w-24" />
            </div>
          )}
          <Skeleton className="h-10 w-10 shrink-0 rounded-2xl" />
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="space-y-5">
            {adminNavigationSections.map((section) => (
              <section key={section.title} className="space-y-2">
                {collapsed ? null : <Skeleton className="mx-2 h-3 w-24" />}
                <div className="space-y-1">
                  {section.items.map((item) => (
                    <div
                      key={item.href + item.label}
                      className={`flex w-full items-center gap-3 px-3 py-3 ${collapsed ? 'justify-center px-2' : ''}`}
                    >
                      <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
                      {collapsed ? null : <Skeleton className="h-4 w-28" />}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </nav>

        <div className="mt-auto border-t border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <div
            className={`flex w-full items-center gap-3 rounded-[24px] border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/40 ${
              collapsed ? 'justify-center' : ''
            }`}
          >
            <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
            {collapsed ? null : <Skeleton className="h-4 w-20" />}
          </div>
        </div>
      </div>
    </aside>
  );
}
