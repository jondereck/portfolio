'use client';

import { Images, Info, Upload } from 'lucide-react';

const defaultTabs = [
  { id: 'media', label: 'Media', icon: Images },
  { id: 'upload', label: 'Upload', icon: Upload },
  { id: 'details', label: 'Details', icon: Info },
];

function formatBadge(badge) {
  if (badge === null || badge === undefined) return null;
  const value = typeof badge === 'number' ? badge : Number(badge);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value > 9 ? '9+' : String(Math.floor(value));
}

export default function GalleryMobileTabs({ activeTab, onChange, tabs = defaultTabs }) {
  return (
    <section className="border-b border-slate-200 px-4 py-3 sm:px-5 lg:hidden dark:border-slate-800">
      <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-100 p-1.5 dark:bg-slate-950/40">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const badgeLabel = formatBadge(tab.badge);
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange?.(tab.id)}
              className={`inline-flex items-center justify-center gap-2 rounded-2xl px-3 py-3 text-sm font-medium transition ${
                isActive
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-50'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="inline-flex items-center gap-2">
                <span>{tab.label}</span>
                {badgeLabel ? (
                  <span
                    className={`inline-flex min-w-6 items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
                      isActive
                        ? 'bg-slate-900 text-white dark:bg-slate-50 dark:text-slate-900'
                        : 'bg-white text-slate-700 dark:bg-slate-900 dark:text-slate-200'
                    }`}
                  >
                    {badgeLabel}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

