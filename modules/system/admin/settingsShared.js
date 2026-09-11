'use client';

import { cn } from '@/lib/utils';
import { parseErrorResponse } from '@/lib/form-client';

export const cardStyles = 'rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900';
export const pageStackStyles = 'space-y-4';
export const contentPadStyles = 'p-3 sm:p-4';
export const sectionHeaderStyles =
  'flex flex-col gap-3 border-b border-slate-100 p-4 md:flex-row md:items-center md:justify-between dark:border-slate-800';
export const sectionTitleStyles = 'text-lg font-semibold text-slate-900 dark:text-slate-100';
export const sectionActionsStyles = 'flex flex-wrap items-center gap-2';
export const topbarStyles =
  'rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm sm:px-4 dark:border-slate-800 dark:bg-slate-900';
export const overviewCardStyles =
  'relative flex h-full min-h-[140px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition duration-300 ease-out hover:-translate-y-1 hover:shadow-xl dark:border-slate-800 dark:bg-slate-900 sm:min-h-[220px] sm:p-5';
export const metricCardStyles =
  'rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-4';
export const inputStyles =
  'h-10 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950';
export const textareaStyles =
  'w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950';
export const buttonStyles =
  'h-9 rounded-md bg-slate-900 px-3 text-sm text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900';

export const invalidFieldStyles = 'border-rose-500 focus-visible:ring-rose-400 dark:border-rose-400 dark:focus-visible:ring-rose-400';

export const withFieldError = (baseClassName, hasError) => cn(baseClassName, hasError && invalidFieldStyles);

export const fetcher = (url) =>
  fetch(url, { cache: 'no-store' }).then(async (response) => {
    const cloned = response.clone();
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw (data ? await parseErrorResponse(cloned, 'Request failed') : new Error('Request failed'));
    }

    return data;
  });

export function formatAuditEventLabel(type) {
  return String(type || '')
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function formatAuditEventDetails(details) {
  if (!details || typeof details !== 'object' || Array.isArray(details)) {
    return '';
  }

  return Object.entries(details)
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : String(value)}`)
    .join(' | ');
}
