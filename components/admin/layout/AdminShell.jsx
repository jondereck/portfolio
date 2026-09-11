'use client';

import { useEffect, useState } from 'react';
import { signOut } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import AdminSidebar from '@/components/admin/navigation/AdminSidebar';
import AdminSidebarSkeleton from '@/components/admin/layout/AdminSidebarSkeleton';
import AdminTopbar from '@/components/admin/layout/AdminTopbar';
import { AdminTopbarSkeleton } from '@/components/admin/layout/admin-skeletons';
import { adminNavigationSections, filterAdminNavigationSections } from '@/components/admin/navigation/admin-nav-config';
import { useLoadingStore } from '@/store/loading';
import UnclothyTaskNotifier from '@/components/admin/layout/UnclothyTaskNotifier';

const adminLastVisitedPathStorageKey = 'admin:lastVisitedPath';
const authLastVisitedPathStorageKey = 'auth:lastVisitedPath';
const sidebarCollapsedStorageKey = 'admin:sidebarCollapsed';
const accountNameStorageKey = 'admin:accountDisplayName';
const accountImageStorageKey = 'admin:accountImage';

export default function AdminShell({ children }) {
  const pathname = usePathname();
  const startGlobalLoading = useLoadingStore((state) => state.startLoading);
  const stopGlobalLoading = useLoadingStore((state) => state.stopLoading);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [moduleAccess, setModuleAccess] = useState(null);
  const [accountName, setAccountName] = useState('');
  const [accountImage, setAccountImage] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const isShellLoading = moduleAccess === null;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!pathname || pathname === '/admin/login') return;
    if (!pathname.startsWith('/admin')) return;
    window.localStorage.setItem(adminLastVisitedPathStorageKey, pathname);
    window.localStorage.setItem(authLastVisitedPathStorageKey, pathname);
  }, [pathname]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const controller = new AbortController();

    const loadAccount = async () => {
      try {
        try {
          setAccountName(window.localStorage.getItem(accountNameStorageKey) || '');
          setAccountImage(window.localStorage.getItem(accountImageStorageKey) || '');
          setSidebarCollapsed(window.localStorage.getItem(sidebarCollapsedStorageKey) === '1');
        } catch {
          // ignore persistence errors
        }

        const response = await fetch('/api/admin/account', {
          method: 'GET',
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error('Account request failed');
        }

        const payload = await response.json().catch(() => ({}));
        const account = payload?.account ?? null;
        const nextModuleAccess =
          payload?.moduleAccess && typeof payload.moduleAccess === 'object' ? payload.moduleAccess : {};
        const resolvedName = String(account?.name || account?.email || '').trim();
        const resolvedImage = String(account?.image || '').trim();

        setModuleAccess(nextModuleAccess);
        if (resolvedName) {
          setAccountName(resolvedName);
        }
        setAccountImage(resolvedImage);
        try {
          if (resolvedName) {
            window.localStorage.setItem(accountNameStorageKey, resolvedName);
          }
          if (resolvedImage) {
            window.localStorage.setItem(accountImageStorageKey, resolvedImage);
          } else {
            window.localStorage.removeItem(accountImageStorageKey);
          }
        } catch {
          // ignore persistence errors
        }
      } catch (error) {
        if (error?.name === 'AbortError') {
          return;
        }
        // ignore account refresh errors and keep the last known label
        setModuleAccess({});
      }
    };

    void loadAccount();

    return () => controller.abort();
  }, []);

  const handleLogout = async () => {
    if (isLoggingOut) {
      return;
    }

    setIsLoggingOut(true);
    startGlobalLoading('Signing out from admin');

    try {
      await fetch('/api/neon/session/sign-out', {
        method: 'POST',
      }).catch(() => null);
      await signOut({ callbackUrl: '/' });
    } finally {
      stopGlobalLoading();
      setIsLoggingOut(false);
    }
  };

  const navigationSections = filterAdminNavigationSections(adminNavigationSections, moduleAccess);

  const handleToggleSidebar = () => {
    setSidebarCollapsed((value) => {
      const next = !value;
      try {
        window.localStorage.setItem(sidebarCollapsedStorageKey, next ? '1' : '0');
      } catch {
        // ignore persistence errors
      }
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-50">
      <UnclothyTaskNotifier />
      <div className="flex min-h-screen items-stretch">
        <div className="sticky top-0 hidden h-screen self-stretch lg:block">
          {isShellLoading ? (
            <AdminSidebarSkeleton collapsed={sidebarCollapsed} />
          ) : (
            <AdminSidebar
              collapsed={sidebarCollapsed}
              onToggle={handleToggleSidebar}
              onLogout={handleLogout}
              isLoggingOut={isLoggingOut}
              accountName={accountName}
              accountImage={accountImage}
              sections={navigationSections}
            />
          )}
        </div>

        <div className="min-w-0 flex-1 p-3 sm:p-4">
          <div className="mx-auto max-w-[1920px] space-y-4">
            {isShellLoading ? (
              <AdminTopbarSkeleton />
            ) : (
              <AdminTopbar
                onLogout={handleLogout}
                isLoggingOut={isLoggingOut}
                accountName={accountName}
                accountImage={accountImage}
                sections={navigationSections}
              />
            )}
            <main className="min-w-0 flex-1 space-y-4">{children}</main>
          </div>
        </div>
      </div>
    </div>
  );
}
