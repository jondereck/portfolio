'use client';

export default function GalleryMobileStickyActionsBar({ title, description, actions }) {
  if (!title && !actions) return null;

  return (
    <div className="sticky bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-30 border-t border-slate-200 bg-white/95 p-3 backdrop-blur lg:bottom-0 lg:hidden dark:border-slate-800 dark:bg-slate-900/95">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          {title ? <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">{title}</p> : null}
          {description ? <p className="truncate text-xs text-slate-500 dark:text-slate-400">{description}</p> : null}
        </div>
        <div className="flex gap-2 overflow-x-auto">{actions}</div>
      </div>
    </div>
  );
}

