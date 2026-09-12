'use client';

import { useEffect, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import GalleryAlbumsPanel from '@/modules/gallery/admin/GalleryAlbumsPanel';
import GalleryArrangePanel from '@/modules/gallery/admin/GalleryArrangePanel';
import GalleryMediaPanel from '@/modules/gallery/admin/GalleryMediaPanel';
import GalleryMobileWorkspaceNav from '@/modules/gallery/admin/GalleryMobileWorkspaceNav';
import { useGalleryAdminController } from '@/modules/gallery/admin/useGalleryAdminController';
import { normalizeGalleryWorkspaceTab } from '@/modules/gallery/admin/workspaceConfig';
import { GalleryPageHeader } from './galleryAdminShared';

const workspaceTabCards = [
  {
    id: 'albums',
    label: 'Albums',
    accent: 'emerald',
  },
  {
    id: 'media',
    label: 'Media',
    accent: 'sky',
  },
  {
    id: 'arrange',
    label: 'Arrange',
    accent: 'amber',
  },
];

function WorkspaceTabCard({ tab, active, onClick }) {
  const accentStyles = {
    slate: active
      ? 'border-slate-900 bg-slate-900 text-white shadow-lg shadow-slate-950/10 dark:border-slate-100 dark:bg-slate-100 dark:text-slate-950'
      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-800',
    emerald: active
      ? 'border-emerald-600 bg-emerald-600 text-white shadow-lg shadow-emerald-500/10 dark:border-emerald-500 dark:bg-emerald-500 dark:text-slate-950'
      : 'border-emerald-200 bg-emerald-50/70 text-emerald-800 hover:border-emerald-300 hover:bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-200 dark:hover:border-emerald-800',
    sky: active
      ? 'border-sky-600 bg-sky-600 text-white shadow-lg shadow-sky-500/10 dark:border-sky-500 dark:bg-sky-500 dark:text-slate-950'
      : 'border-sky-200 bg-sky-50/70 text-sky-800 hover:border-sky-300 hover:bg-sky-50 dark:border-sky-900/40 dark:bg-sky-950/20 dark:text-sky-200 dark:hover:border-sky-800',
    amber: active
      ? 'border-amber-500 bg-amber-500 text-white shadow-lg shadow-amber-500/10 dark:border-amber-400 dark:bg-amber-400 dark:text-slate-950'
      : 'border-amber-200 bg-amber-50/70 text-amber-800 hover:border-amber-300 hover:bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200 dark:hover:border-amber-800',
    rose: active
      ? 'border-rose-600 bg-rose-600 text-white shadow-lg shadow-rose-500/10 dark:border-rose-500 dark:bg-rose-500 dark:text-slate-950'
      : 'border-rose-200 bg-rose-50/70 text-rose-800 hover:border-rose-300 hover:bg-rose-50 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-200 dark:hover:border-rose-800',
  };

  return (
    <button
      type="button"
      className={`flex min-h-11 items-center justify-center rounded-xl border px-3 py-2.5 text-center transition duration-200 ${accentStyles[tab.accent]}`}
      onClick={onClick}
    >
      <span className="text-xs font-semibold uppercase tracking-[0.18em]">{tab.label}</span>
    </button>
  );
}

export default function GalleryAdminWorkspace({ initialTab = 'albums' }) {
  const controller = useGalleryAdminController();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeTab = normalizeGalleryWorkspaceTab(searchParams?.get('tab') ?? initialTab);

  useEffect(() => {
    const currentTab = searchParams?.get('tab');

    if (currentTab) {
      return;
    }

    const normalizedInitialTab = normalizeGalleryWorkspaceTab(initialTab);
    const params = new URLSearchParams(searchParams?.toString());
    params.set('tab', normalizedInitialTab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [initialTab, pathname, router, searchParams]);

  const setActiveTab = (nextTab) => {
    const normalizedTab = normalizeGalleryWorkspaceTab(nextTab);
    const params = new URLSearchParams(searchParams?.toString());
    params.set('tab', normalizedTab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const activeTabLabel = useMemo(
    () => workspaceTabCards.find((tab) => tab.id === activeTab)?.label ?? 'Albums',
    [activeTab],
  );

  const sharedProps = { controller, embedded: true };

  const renderedPanel =
    activeTab === 'media' ? (
      <GalleryMediaPanel {...sharedProps} />
    ) : activeTab === 'arrange' ? (
      <GalleryArrangePanel {...sharedProps} />
    ) : (
      <GalleryAlbumsPanel {...sharedProps} />
    );

  return (
    <div className="space-y-4">
      <GalleryPageHeader
        eyebrow="Advanced Workspace"
        title="Gallery Workspace"
        description={`Work across albums, media, and arrange from one route. Current section: ${activeTabLabel}.`}
      />

      <GalleryMobileWorkspaceNav
        tabs={workspaceTabCards}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
      />

      <div className="hidden md:block">
        <div className="rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="grid grid-cols-3 gap-1.5">
            {workspaceTabCards.map((tab) => (
              <WorkspaceTabCard
                key={tab.id}
                tab={tab}
                active={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
              />
            ))}
          </div>
        </div>
      </div>

      <div>{renderedPanel}</div>
    </div>
  );
}
