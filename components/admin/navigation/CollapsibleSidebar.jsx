'use client';
/* eslint-disable @next/next/no-img-element */

import Link from 'next/link';
import { Menu, Transition } from '@headlessui/react';
import {
  Compass,
  Globe,
  FolderOpen,
  Images,
  LayoutDashboard,
  Map,
  Menu as MenuIcon,
  Plug,
  LogOut,
  Settings,
  Shield,
  Sparkles,
  User,
  Users,
} from 'lucide-react';
import { Fragment } from 'react';
import { getAvatarInitials } from '@/lib/auth/avatar-display';

const iconMap = {
  layoutDashboard: LayoutDashboard,
  folderOpen: FolderOpen,
  images: Images,
  user: User,
  settings: Settings,
  users: Users,
  map: Map,
  plug: Plug,
  shield: Shield,
  sparkles: Sparkles,
  compass: Compass,
  globe: Globe,
};

export default function CollapsibleSidebar({
  collapsed,
  onToggle,
  brandKicker,
  brandTitle,
  sections,
  pathname,
  isActivePath,
  onLogout,
  isLoggingOut = false,
  accountName = '',
  accountImage = '',
}) {
  const resolvedAccountName = String(accountName || '').trim();
  const resolvedAccountImage = String(accountImage || '').trim();
  const accountInitial = getAvatarInitials(resolvedAccountName);

  return (
    <aside
      className={`h-screen shrink-0 border-r border-slate-200 bg-white transition-all duration-200 dark:border-slate-800 dark:bg-slate-900 ${
        collapsed ? 'w-[76px]' : 'w-[280px]'
      }`}
    >
      <div className="flex h-full flex-col">
        <div className={`flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-4 dark:border-slate-800 ${collapsed ? 'px-3' : ''}`}>
          {collapsed ? (
            <div className="sr-only">
              <p>{brandKicker}</p>
              <p>{brandTitle}</p>
            </div>
          ) : (
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                {brandKicker}
              </p>
              <h2 className="mt-1 truncate text-base font-bold text-slate-900 dark:text-slate-50">{brandTitle}</h2>
            </div>
          )}

          <button
            type="button"
            onClick={onToggle}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <MenuIcon className="size-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="space-y-5">
            {sections.map((section) => (
              <section key={section.title} className="space-y-2">
                {collapsed ? null : (
                  <h3 className="px-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    {section.title}
                  </h3>
                )}

                <div className="space-y-1">
                  {section.items.map((item) => {
                    const active = isActivePath(pathname, item.href);
                    const Icon = iconMap[item.iconKey] ?? Compass;

                    return (
                      <Link
                        key={item.href + item.label}
                        href={item.href}
                        title={collapsed ? item.label : undefined}
                        aria-label={collapsed ? item.label : undefined}
                        className={`flex w-full items-center gap-3 px-3 py-3 text-left transition ${
                          active
                            ? 'rounded-xl bg-slate-950 text-white shadow-sm dark:bg-slate-50 dark:text-slate-900'
                            : 'rounded-xl text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                        } ${collapsed ? 'justify-center px-2' : ''}`}
                      >
                        <span
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                            active
                              ? 'bg-white/10 text-white dark:bg-slate-900/10 dark:text-slate-900'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200'
                          }`}
                        >
                          <Icon className="size-[18px] shrink-0" />
                        </span>

                        {collapsed ? null : (
                          <span
                            className={`truncate text-sm font-medium ${
                              active ? 'text-white dark:text-slate-900' : 'text-slate-900 dark:text-slate-50'
                            }`}
                          >
                            {item.label}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </nav>

        <div className="mt-auto border-t border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <Menu as="div" className={`relative ${collapsed ? '' : 'w-full'}`}>
            <Menu.Button
              className={`flex w-full items-center gap-3 rounded-[24px] border border-slate-200 bg-slate-50 p-3 text-left transition hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950/40 dark:hover:bg-slate-800 ${collapsed ? 'justify-center' : ''}`}
              aria-label="Account menu"
            >
              <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-950 text-white shadow-sm dark:bg-slate-50 dark:text-slate-900">
                {resolvedAccountImage ? (
                  <img src={resolvedAccountImage} alt="" className="h-full w-full rounded-full object-cover" referrerPolicy="no-referrer" />
                ) : accountInitial ? (
                  <span className="text-sm font-semibold">{accountInitial}</span>
                ) : (
                  <User className="size-5" />
                )}
              </div>

              {collapsed ? null : (
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">{resolvedAccountName || 'Account'}</p>
                </div>
              )}
            </Menu.Button>

            <Transition
              as={Fragment}
              enter="transition ease-out duration-120"
              enterFrom="opacity-0 translate-y-1"
              enterTo="opacity-100 translate-y-0"
              leave="transition ease-in duration-90"
              leaveFrom="opacity-100 translate-y-0"
              leaveTo="opacity-0 translate-y-1"
            >
              <Menu.Items
                className={`absolute z-[9999] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl focus:outline-none dark:border-slate-800 dark:bg-slate-900 ${
                  collapsed ? 'bottom-0 left-full ml-3 w-56' : 'bottom-full left-0 mb-2 w-full'
                }`}
              >
                <div className="p-2">
                  <Menu.Item>
                    {({ active }) => (
                      <Link
                        href="/admin/account"
                        className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition ${
                          active
                            ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-50'
                            : 'text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        <User className="size-4" />
                        Manage account
                      </Link>
                    )}
                  </Menu.Item>

                  <Menu.Item disabled={!onLogout || isLoggingOut}>
                    {({ active, disabled }) => (
                      <button
                        type="button"
                        onClick={() => onLogout?.()}
                        disabled={disabled}
                        className={`mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition ${
                          active
                            ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-50'
                            : 'text-slate-700 dark:text-slate-200'
                        } ${disabled ? 'opacity-60' : ''}`}
                      >
                        <LogOut className="size-4" />
                        {isLoggingOut ? 'Logging out...' : 'Logout'}
                      </button>
                    )}
                  </Menu.Item>
                </div>
              </Menu.Items>
            </Transition>
          </Menu>
        </div>
      </div>
    </aside>
  );
}
