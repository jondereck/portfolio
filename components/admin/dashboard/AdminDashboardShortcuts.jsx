'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Dialog, Transition } from '@headlessui/react';
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Folder,
  Image,
  LayoutGrid,
  Settings,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const storageKey = 'admin:dashboardShortcuts:v1';

const DEFAULT_SHORTCUTS = [
  {
    id: 'portfolio-admin',
    title: 'Portfolio Admin',
    description: 'Projects, skills, certificates, and experience entries.',
    icon: Folder,
    tone: 'emerald',
    href: '/admin/portfolio',
    moduleId: 'portfolio',
    newTab: false,
    defaultEnabled: true,
  },
  {
    id: 'gallery-admin',
    title: 'Gallery Admin',
    description: 'Albums, media, imports, and gallery workspace.',
    icon: Image,
    tone: 'sky',
    href: '/admin/gallery',
    moduleId: 'gallery',
    newTab: false,
    defaultEnabled: true,
  },
  {
    id: 'media-intake',
    title: 'Media Intake',
    description: 'Upload, review, and process current album media.',
    icon: LayoutGrid,
    tone: 'amber',
    href: '/admin/gallery/import',
    moduleId: 'gallery',
    newTab: false,
    defaultEnabled: true,
  },
  {
    id: 'main-portfolio',
    title: 'Main Portfolio',
    description: 'Open the public portfolio website in a new tab.',
    icon: ExternalLink,
    tone: 'violet',
    href: '/',
    newTab: true,
    defaultEnabled: true,
  },
  {
    id: 'live-gallery',
    title: 'Live Gallery',
    description: 'Jump to the public gallery page instantly.',
    icon: ExternalLink,
    tone: 'rose',
    href: '/gallery',
    newTab: true,
    defaultEnabled: true,
  },
  {
    id: 'site-settings',
    title: 'Manage Homepage',
    description: 'Homepage content plus logo and branding settings.',
    icon: Settings,
    tone: 'slate',
    href: '/admin/portfolio/homepage',
    moduleId: 'portfolio',
    newTab: false,
    defaultEnabled: false,
  },
];

const toneClasses = (tone) => {
  switch (tone) {
    case 'emerald':
      return 'border-emerald-200 bg-emerald-50/70 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200';
    case 'sky':
      return 'border-sky-200 bg-sky-50/70 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200';
    case 'amber':
      return 'border-amber-200 bg-amber-50/70 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200';
    case 'violet':
      return 'border-violet-200 bg-violet-50/70 text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-200';
    case 'rose':
      return 'border-rose-200 bg-rose-50/70 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200';
    default:
      return 'border-slate-200 bg-slate-50/70 text-slate-700 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-200';
  }
};

const buildDefaultConfig = () => ({
  order: DEFAULT_SHORTCUTS.map((item) => item.id),
  enabled: Object.fromEntries(DEFAULT_SHORTCUTS.map((item) => [item.id, Boolean(item.defaultEnabled)])),
});

const safeParseConfig = (raw) => {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const order = Array.isArray(parsed.order) ? parsed.order.filter((id) => typeof id === 'string') : null;
    const enabled = parsed.enabled && typeof parsed.enabled === 'object' ? parsed.enabled : null;
    if (!order || !enabled) return null;
    return { order, enabled };
  } catch {
    return null;
  }
};

const mergeConfig = (saved) => {
  const defaults = buildDefaultConfig();
  const knownIds = new Set(defaults.order);

  const savedOrder = Array.isArray(saved?.order) ? saved.order.filter((id) => knownIds.has(id)) : [];
  const mergedOrder = [...savedOrder, ...defaults.order.filter((id) => !savedOrder.includes(id))];

  const mergedEnabled = { ...defaults.enabled };
  if (saved?.enabled && typeof saved.enabled === 'object') {
    Object.entries(saved.enabled).forEach(([id, value]) => {
      if (!knownIds.has(id)) return;
      if (typeof value !== 'boolean') return;
      mergedEnabled[id] = value;
    });
  }

  return { order: mergedOrder, enabled: mergedEnabled };
};

const moveInArray = (list, fromIndex, toIndex) => {
  if (fromIndex === toIndex) return list;
  if (fromIndex < 0 || fromIndex >= list.length) return list;
  if (toIndex < 0 || toIndex >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
};

function ManageShortcutsModal({
  open,
  onClose,
  shortcuts,
  config,
  onToggleEnabled,
  onMoveUp,
  onMoveDown,
  onReset,
  onSave,
}) {
  const previewShortcuts = useMemo(() => {
    const enabledItems = config.order
      .filter((id) => config.enabled[id])
      .map((id) => shortcuts.find((item) => item.id === id))
      .filter(Boolean);
    return enabledItems.slice(0, 4);
  }, [config, shortcuts]);

  return (
    <Transition show={open} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto p-3 sm:p-4">
          <div className="flex min-h-full items-center justify-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 scale-95 translate-y-2"
              enterTo="opacity-100 scale-100 translate-y-0"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 scale-100 translate-y-0"
              leaveTo="opacity-0 scale-95 translate-y-2"
            >
              <Dialog.Panel className="w-full max-w-5xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-start sm:justify-between dark:border-slate-800">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Manage shortcuts
                    </p>
                    <Dialog.Title className="mt-1 text-xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">
                      Customize your dashboard
                    </Dialog.Title>
                    <p className="mt-1.5 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
                      Choose which shortcuts appear on the dashboard and arrange the most important ones at the top.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_280px]">
                  <div className="p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <h4 className="text-base font-semibold text-slate-950 dark:text-slate-50">Shortcut list</h4>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                          Use the arrows to reorder.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {config.order.map((id, index) => {
                        const shortcut = shortcuts.find((item) => item.id === id);
                        if (!shortcut) return null;
                        const Icon = shortcut.icon;
                        const enabled = Boolean(config.enabled[id]);

                        return (
                          <div
                            key={id}
                            className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/30"
                          >
                            <div className="flex items-start gap-3">
                              <div className="mt-0.5 flex h-10 w-10 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
                                <span className="h-1 w-1 rounded-full bg-current" />
                                <span className="h-1 w-1 rounded-full bg-current" />
                                <span className="h-1 w-1 rounded-full bg-current" />
                              </div>

                              <div
                                className={cn(
                                  'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border',
                                  toneClasses(shortcut.tone),
                                )}
                              >
                                <Icon className="h-4 w-4" />
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800">
                                        {String(index + 1).padStart(2, '0')}
                                      </span>
                                      <h5 className="truncate text-sm font-semibold text-slate-950 dark:text-slate-50">
                                        {shortcut.title}
                                      </h5>
                                    </div>
                                    <p className="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-400">
                                      {shortcut.description}
                                    </p>
                                  </div>

                                  <div className="flex flex-wrap items-center justify-end gap-2">
                                    <button
                                      type="button"
                                      onClick={() => onMoveUp(index)}
                                      disabled={index === 0}
                                      className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                                      aria-label="Move up"
                                      title="Move up"
                                    >
                                      <ChevronUp className="h-4 w-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => onMoveDown(index)}
                                      disabled={index === config.order.length - 1}
                                      className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                                      aria-label="Move down"
                                      title="Move down"
                                    >
                                      <ChevronDown className="h-4 w-4" />
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => onToggleEnabled(id)}
                                      className="inline-flex min-h-11 items-center gap-2 self-start rounded-xl bg-white px-3 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-800 dark:hover:bg-slate-800"
                                      aria-pressed={enabled}
                                    >
                                      <span
                                        className={cn(
                                          'h-2.5 w-2.5 rounded-full',
                                          enabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600',
                                        )}
                                      />
                                      {enabled ? 'Visible' : 'Hidden'}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <aside className="border-t border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/30 lg:border-l lg:border-t-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Preview</p>
                    <h4 className="mt-1.5 text-base font-semibold text-slate-950 dark:text-slate-50">Visible on dashboard</h4>
                    <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
                      Active shortcuts as they can appear in quick actions.
                    </p>

                    <div className="mt-3 grid gap-2">
                      {previewShortcuts.map((shortcut) => {
                        const Icon = shortcut.icon;
                        return (
                          <div
                            key={shortcut.id}
                            className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div
                                className={cn(
                                  'inline-flex h-10 w-10 items-center justify-center rounded-xl border',
                                  toneClasses(shortcut.tone),
                                )}
                              >
                                <Icon className="h-4 w-4" />
                              </div>
                              <ArrowRight className="h-4 w-4 text-slate-400" />
                            </div>
                            <h5 className="mt-2 text-sm font-semibold text-slate-950 dark:text-slate-50">{shortcut.title}</h5>
                            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{shortcut.description}</p>
                          </div>
                        );
                      })}
                    </div>

                    <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white/70 p-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
                      Tip: keep 4 to 6 shortcuts so the dashboard stays easy to scan.
                    </div>
                  </aside>
                </div>

                <div className="flex flex-col gap-3 border-t border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-slate-500 dark:text-slate-400">Changes here affect only the dashboard shortcut section.</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={onReset}
                      className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Reset
                    </button>
                    <button
                      type="button"
                      onClick={onSave}
                      className="inline-flex h-11 items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                    >
                      Save shortcuts
                    </button>
                  </div>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}

export default function AdminDashboardShortcuts({ moduleAccess = null }) {
  const shortcuts = useMemo(() => DEFAULT_SHORTCUTS, []);
  const accessibleShortcuts = useMemo(
    () => shortcuts.filter((item) => !item.moduleId || moduleAccess?.[item.moduleId]?.view === true),
    [moduleAccess, shortcuts],
  );
  const shortcutMap = useMemo(() => new Map(accessibleShortcuts.map((item) => [item.id, item])), [accessibleShortcuts]);

  const [savedConfig, setSavedConfig] = useState(() => buildDefaultConfig());
  const [draftConfig, setDraftConfig] = useState(() => buildDefaultConfig());
  const [isManageOpen, setIsManageOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const parsed = safeParseConfig(window.localStorage.getItem(storageKey));
    const merged = mergeConfig(parsed);
    setSavedConfig(merged);
  }, []);

  const visibleShortcuts = useMemo(() => {
    return savedConfig.order
      .filter((id) => savedConfig.enabled[id])
      .map((id) => shortcutMap.get(id))
      .filter(Boolean);
  }, [savedConfig, shortcutMap]);

  const handleOpenManage = () => {
    setDraftConfig(savedConfig);
    setIsManageOpen(true);
  };

  const handleCloseManage = () => setIsManageOpen(false);

  const handleToggleEnabled = (id) => {
    setDraftConfig((previous) => ({
      ...previous,
      enabled: { ...previous.enabled, [id]: !previous.enabled[id] },
    }));
  };

  const handleMoveUp = (index) => {
    setDraftConfig((previous) => ({ ...previous, order: moveInArray(previous.order, index, index - 1) }));
  };

  const handleMoveDown = (index) => {
    setDraftConfig((previous) => ({ ...previous, order: moveInArray(previous.order, index, index + 1) }));
  };

  const handleReset = () => setDraftConfig(buildDefaultConfig());

  const handleSave = () => {
    setSavedConfig(draftConfig);
    setIsManageOpen(false);
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ order: draftConfig.order, enabled: draftConfig.enabled }));
    } catch {
      // ignore persistence errors
    }
  };

  return (
    <>
      <ManageShortcutsModal
        open={isManageOpen}
        onClose={handleCloseManage}
        shortcuts={accessibleShortcuts}
        config={draftConfig}
        onToggleEnabled={handleToggleEnabled}
        onMoveUp={handleMoveUp}
        onMoveDown={handleMoveDown}
        onReset={handleReset}
        onSave={handleSave}
      />

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Quick shortcuts</p>
            <h3 className="mt-1 text-xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">Fast entry points</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Small shortcut cards for the pages you open every day.
            </p>
          </div>
          <button
            type="button"
            onClick={handleOpenManage}
            className="hidden h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 md:inline-flex"
          >
            Manage shortcuts
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visibleShortcuts.map((shortcut) => {
            const Icon = shortcut.icon;

            return (
              <Link
                key={shortcut.id}
                href={shortcut.href}
                target={shortcut.newTab ? '_blank' : undefined}
                rel={shortcut.newTab ? 'noopener noreferrer' : undefined}
                className="group rounded-xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 dark:border-slate-800 dark:bg-slate-950/30 dark:hover:border-slate-700 dark:hover:bg-slate-900 dark:focus-visible:ring-offset-slate-950"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className={cn('inline-flex h-10 w-10 items-center justify-center rounded-xl border', toneClasses(shortcut.tone))}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-slate-700 dark:group-hover:text-slate-200" />
                </div>
                <h4 className="mt-3 text-base font-semibold text-slate-950 dark:text-slate-50">{shortcut.title}</h4>
                <p className="mt-1.5 text-sm leading-5 text-slate-500 dark:text-slate-400">{shortcut.description}</p>
              </Link>
            );
          })}
        </div>

        <div className="mt-3 flex md:hidden">
          <button
            type="button"
            onClick={handleOpenManage}
            className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Manage shortcuts
          </button>
        </div>
      </section>
    </>
  );
}

