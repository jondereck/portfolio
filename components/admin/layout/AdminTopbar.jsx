'use client';
/* eslint-disable @next/next/no-img-element */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Dialog, Transition } from '@headlessui/react';
import { Fragment, useMemo, useState } from 'react';
import { LogOut, User, X } from 'lucide-react';
import AdminBreadcrumbs from '@/components/admin/layout/AdminBreadcrumbs';
import { adminNavigationSections } from '@/components/admin/navigation/admin-nav-config';
import { getAvatarInitials } from '@/lib/auth/avatar-display';
import { topbarStyles } from '@/modules/system/admin/settingsShared';
import { cn } from '@/lib/utils';

const pageTitles = {
  '/admin': 'Admin Dashboard',
  '/admin/portfolio': 'Portfolio Administration',
  '/admin/portfolio/manage': 'Portfolio Workspace',
  '/admin/portfolio/projects': 'Projects Administration',
  '/admin/portfolio/skills': 'Skills Administration',
  '/admin/portfolio/certificates': 'Certificates Administration',
  '/admin/portfolio/homepage': 'Homepage Administration',
  '/admin/portfolio/experience': 'Experience Administration',
  '/admin/portfolio/theme': 'Theme Administration',
  '/admin/gallery': 'Gallery Administration',
  '/admin/gallery/workspace': 'Gallery Workspace',
  '/admin/gallery/manage': 'Album Management',
  '/admin/gallery/albums': 'Album Management',
  '/admin/gallery/media': 'Media Management',
  '/admin/gallery/arrange': 'Media Arrangement',
  '/admin/gallery/import': 'Media Import',
  '/admin/gallery/settings': 'Gallery Settings',
  '/admin/account': 'My Account',
  '/admin/settings': 'Site Settings',
  '/admin/navigation': 'Navigation Settings',
  '/admin/integrations': 'Integrations',
  '/admin/security': 'Security & Access',
  '/admin/users': 'User Management',
  '/admin/media-scraper': 'Media Scraper',
};

function AccountAvatar({ accountImage = '', accountInitial = '', className = 'h-11 w-11', iconClassName = 'size-4' }) {
  const resolvedImage = String(accountImage || '').trim();

  return (
    <div
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200',
        className,
      )}
    >
      {resolvedImage ? (
        <img src={resolvedImage} alt="" className="h-full w-full rounded-full object-cover" referrerPolicy="no-referrer" />
      ) : accountInitial ? (
        <span className="text-sm font-semibold">{accountInitial}</span>
      ) : (
        <User className={iconClassName} />
      )}
    </div>
  );
}

export default function AdminTopbar({
  onLogout,
  isLoggingOut = false,
  accountName = '',
  accountImage = '',
  sections = adminNavigationSections,
}) {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const title = useMemo(() => pageTitles[pathname] ?? 'Admin Control Center', [pathname]);
  const showBreadcrumbs = useMemo(() => pathname !== '/admin' && pathname !== '/admin/login', [pathname]);
  const resolvedAccountName = String(accountName || '').trim();
  const accountInitial = getAvatarInitials(resolvedAccountName);

  const isActivePath = (href) => {
    if (href.includes('#')) {
      return pathname === href.split('#')[0];
    }

    if (href === '/admin') {
      return pathname === '/admin';
    }

    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <>
      {/* Desktop: stays at top */}
      <header className={cn(topbarStyles, 'hidden md:block')}>
        <div className="flex flex-row items-start justify-between">
          <div className="min-w-0 space-y-1">
            <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Control Center</p>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 lg:text-2xl">{title}</h1>
            <AdminBreadcrumbs />
          </div>
        </div>
      </header>

      {/* Mobile: bottom bar for one-hand access */}
      <header
        className={cn(
          topbarStyles,
          'fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 shadow-lg md:hidden',
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Control Center</p>
            <h1 className="truncate text-base font-bold leading-tight text-slate-900 dark:text-slate-100">{title}</h1>
            {showBreadcrumbs ? (
              <div className="pt-0.5">
                <AdminBreadcrumbs />
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => setIsMenuOpen(true)}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition hover:opacity-90"
            aria-label="Open admin menu"
            title="Open admin menu"
          >
            <AccountAvatar accountImage={accountImage} accountInitial={accountInitial} />
          </button>
        </div>
      </header>

      <Transition show={isMenuOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50 md:hidden" onClose={setIsMenuOpen}>
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

          <div className="fixed inset-0 flex items-end justify-center p-3">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 translate-y-4"
              enterTo="opacity-100 translate-y-0"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 translate-y-0"
              leaveTo="opacity-0 translate-y-4"
            >
              <Dialog.Panel className="flex max-h-[min(44rem,calc(100dvh-1.5rem))] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-3 py-3 dark:border-slate-800">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Admin menu</p>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Jump to a section</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsMenuOpen(false)}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    aria-label="Close menu"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto px-3 py-3">
                  <nav className="space-y-4">
                    {sections.map((section) => (
                      <section key={section.title} className="space-y-2">
                        <h3 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{section.title}</h3>
                        <div className="grid grid-cols-2 gap-2">
                          {section.items.map((item) => {
                            const active = isActivePath(item.href);

                            return (
                              <Link
                                key={item.href + item.label}
                                href={item.href}
                                onClick={() => setIsMenuOpen(false)}
                                className={cn(
                                  'inline-flex min-h-11 items-center rounded-xl px-3 py-2.5 text-sm font-medium transition',
                                  active
                                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                                    : 'bg-slate-50 text-slate-700 hover:bg-slate-100 dark:bg-slate-950/40 dark:text-slate-300 dark:hover:bg-slate-800',
                                )}
                              >
                                <span className="leading-5">{item.label}</span>
                              </Link>
                            );
                          })}
                        </div>
                      </section>
                    ))}
                  </nav>
                </div>

                <div className="border-t border-slate-200 px-3 py-3 dark:border-slate-800">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-800 dark:bg-slate-950/40">
                    <div className="flex items-center gap-3">
                      <AccountAvatar
                        accountImage={accountImage}
                        accountInitial={accountInitial}
                        className="h-11 w-11 border-0 bg-slate-950 text-white dark:bg-slate-50 dark:text-slate-900"
                        iconClassName="size-5"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">
                          {resolvedAccountName || 'Account'}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Signed in</p>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Link
                        href="/admin/account"
                        onClick={() => setIsMenuOpen(false)}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <User className="size-4" />
                        Account
                      </Link>

                      <button
                        type="button"
                        onClick={() => {
                          setIsMenuOpen(false);
                          onLogout?.();
                        }}
                        disabled={!onLogout || isLoggingOut}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <LogOut className="size-4" />
                        {isLoggingOut ? 'Logging out...' : 'Logout'}
                      </button>
                    </div>
                  </div>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </Dialog>
      </Transition>
    </>
  );
}
