'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, HelpCircle, Info } from 'lucide-react';

const TONE_ICONS = {
  info: Info,
  warning: AlertTriangle,
  success: CheckCircle2,
};

/**
 * Subtle click-to-reveal hint. Default is a small icon; click opens a compact popover.
 * Use variant="banner" only when a persistent callout is explicitly needed.
 */
export default function AdminHint({
  tone = 'info',
  title,
  children,
  className = '',
  variant = 'subtle',
  label = 'Show hint',
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const panelId = useId();
  const Icon = TONE_ICONS[tone] || Info;

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (variant === 'banner') {
    return (
      <div
        className={`flex gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-700 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300 sm:px-4 ${className}`.trim()}
      >
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-slate-600 shadow-sm dark:bg-slate-800 dark:text-slate-300">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          {title ? <p className="font-semibold text-inherit">{title}</p> : null}
          <div className={title ? 'mt-1 opacity-90' : ''}>{children}</div>
        </div>
      </div>
    );
  }

  return (
    <span ref={rootRef} className={`relative inline-flex align-middle ${className}`.trim()}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        className={`inline-flex h-11 w-11 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 ${
          open ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200' : ''
        }`}
        onClick={() => setOpen((value) => !value)}
      >
        <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
      </button>

      {open ? (
        <span
          id={panelId}
          role="tooltip"
          className="absolute right-0 top-full z-30 mt-1.5 w-[min(18rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs leading-5 text-slate-600 shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 sm:left-0 sm:right-auto"
        >
          {title ? <span className="mb-1 block font-semibold text-slate-800 dark:text-slate-100">{title}</span> : null}
          <span className="block">{children}</span>
        </span>
      ) : null}
    </span>
  );
}
