'use client';

import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';

const TONE_STYLES = {
  info: {
    wrap: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300',
    iconWrap: 'bg-white text-slate-600 shadow-sm dark:bg-slate-800 dark:text-slate-300',
    Icon: Info,
  },
  warning: {
    wrap: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100',
    iconWrap: 'bg-white text-amber-700 shadow-sm dark:bg-amber-950/40 dark:text-amber-200',
    Icon: AlertTriangle,
  },
  success: {
    wrap: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100',
    iconWrap: 'bg-white text-emerald-700 shadow-sm dark:bg-emerald-950/40 dark:text-emerald-200',
    Icon: CheckCircle2,
  },
};

export default function AdminHint({ tone = 'info', title, children, className = '' }) {
  const styles = TONE_STYLES[tone] || TONE_STYLES.info;
  const Icon = styles.Icon;

  return (
    <div
      className={`flex gap-3 rounded-2xl border px-3 py-3 text-sm leading-6 sm:px-4 ${styles.wrap} ${className}`.trim()}
    >
      <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${styles.iconWrap}`}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold text-inherit">{title}</p> : null}
        <div className={title ? 'mt-1 opacity-90' : ''}>{children}</div>
      </div>
    </div>
  );
}
