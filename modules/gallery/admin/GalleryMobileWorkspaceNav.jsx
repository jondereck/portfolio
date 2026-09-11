'use client';

export default function GalleryMobileWorkspaceNav({ tabs, activeTab, onSelectTab, disabledTabIds = [] }) {
  return (
    <div className="relative z-10 mb-1 md:hidden">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
          Workspace sections
        </p>

        <div className="mt-2.5 grid grid-cols-3 gap-2">
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            const disabled = disabledTabIds.includes(tab.id);

            return (
              <div key={tab.id} className="min-w-0">
                <button
                  type="button"
                  className={`flex h-full w-full flex-col rounded-xl border px-2.5 py-2 text-left transition sm:rounded-2xl sm:px-3 ${
                    active
                      ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-950'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-white dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-200 dark:hover:border-slate-700 dark:hover:bg-slate-800'
                  } ${disabled ? 'opacity-50' : ''}`}
                  disabled={disabled}
                  onClick={() => onSelectTab(tab.id)}
                >
                  <span className="block text-xs font-semibold uppercase tracking-[0.18em]">{tab.label}</span>
                  <span className="mt-1 hidden text-[11px] leading-4 opacity-80 sm:block">{tab.description}</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
