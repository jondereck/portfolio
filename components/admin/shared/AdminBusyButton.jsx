'use client';

import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const variants = {
  primary:
    'bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200',
  ghost:
    'text-slate-700 hover:bg-slate-100 disabled:opacity-60 dark:text-slate-200 dark:hover:bg-slate-800',
  outline:
    'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900',
};

/**
 * Primary admin action control: idle label, spinner beside busyLabel while pending.
 */
export default function AdminBusyButton({
  type = 'button',
  loading = false,
  disabled = false,
  onClick,
  className,
  variant = 'primary',
  label,
  busyLabel,
  'aria-label': ariaLabel,
  children,
}) {
  const busy = Boolean(loading);
  const idleLabel = label ?? children;
  const pendingLabel = busyLabel ?? idleLabel;

  return (
    <button
      type={type}
      className={cn(
        'inline-flex h-9 min-h-9 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition disabled:cursor-not-allowed',
        variants[variant] ?? variants.primary,
        className,
      )}
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      aria-label={ariaLabel || (typeof pendingLabel === 'string' ? pendingLabel : undefined)}
    >
      {busy ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden /> : null}
      {busy ? pendingLabel : idleLabel}
    </button>
  );
}
