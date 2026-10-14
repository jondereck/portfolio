'use client';

import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const defaultClassName =
  'inline-flex h-8 min-w-8 items-center justify-center rounded-md px-3 text-sm text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-200 dark:hover:bg-slate-800';

/**
 * Compact refresh control: label when idle, spinner only while loading.
 */
export default function AdminRefreshButton({
  loading = false,
  onClick,
  disabled = false,
  className,
  label = 'Refresh',
  'aria-label': ariaLabel,
}) {
  const busy = Boolean(loading);

  return (
    <button
      type="button"
      className={cn(defaultClassName, className)}
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      aria-label={ariaLabel || (busy ? 'Refreshing' : label)}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : label}
    </button>
  );
}
