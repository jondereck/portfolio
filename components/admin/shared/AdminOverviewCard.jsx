import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const accentStyles = {
  slate: {
    glow: 'group-hover:border-slate-300 group-hover:shadow-slate-950/10 group-focus-visible:border-slate-300',
    gradient: 'from-slate-200/80 via-slate-100/40 to-transparent dark:from-slate-700/50 dark:via-slate-800/20',
    icon: 'border-slate-200 bg-slate-950 text-white shadow-lg shadow-slate-950/15 dark:border-slate-700 dark:bg-slate-100 dark:text-slate-950',
    badge: 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200',
    arrow: 'text-slate-500 group-hover:text-slate-900 dark:text-slate-400 dark:group-hover:text-slate-100',
  },
  sky: {
    glow: 'group-hover:border-sky-300/80 group-hover:shadow-sky-500/10 group-focus-visible:border-sky-300/80',
    gradient: 'from-sky-200/80 via-cyan-100/45 to-transparent dark:from-sky-500/20 dark:via-cyan-500/10',
    icon: 'border-sky-200 bg-sky-600 text-white shadow-lg shadow-sky-500/20 dark:border-sky-500/40 dark:bg-sky-500',
    badge: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200',
    arrow: 'text-sky-600 group-hover:text-sky-700 dark:text-sky-300 dark:group-hover:text-sky-200',
  },
  emerald: {
    glow: 'group-hover:border-emerald-300/80 group-hover:shadow-emerald-500/10 group-focus-visible:border-emerald-300/80',
    gradient: 'from-emerald-200/80 via-teal-100/45 to-transparent dark:from-emerald-500/20 dark:via-teal-500/10',
    icon: 'border-emerald-200 bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 dark:border-emerald-500/40 dark:bg-emerald-500',
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200',
    arrow: 'text-emerald-600 group-hover:text-emerald-700 dark:text-emerald-300 dark:group-hover:text-emerald-200',
  },
  amber: {
    glow: 'group-hover:border-amber-300/80 group-hover:shadow-amber-500/10 group-focus-visible:border-amber-300/80',
    gradient: 'from-amber-200/80 via-orange-100/45 to-transparent dark:from-amber-500/20 dark:via-orange-500/10',
    icon: 'border-amber-200 bg-amber-500 text-white shadow-lg shadow-amber-500/20 dark:border-amber-500/40 dark:bg-amber-400 dark:text-slate-950',
    badge: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200',
    arrow: 'text-amber-600 group-hover:text-amber-700 dark:text-amber-300 dark:group-hover:text-amber-200',
  },
  rose: {
    glow: 'group-hover:border-rose-300/80 group-hover:shadow-rose-500/10 group-focus-visible:border-rose-300/80',
    gradient: 'from-rose-200/80 via-pink-100/45 to-transparent dark:from-rose-500/20 dark:via-pink-500/10',
    icon: 'border-rose-200 bg-rose-600 text-white shadow-lg shadow-rose-500/20 dark:border-rose-500/40 dark:bg-rose-500',
    badge: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200',
    arrow: 'text-rose-600 group-hover:text-rose-700 dark:text-rose-300 dark:group-hover:text-rose-200',
  },
};

export default function AdminOverviewCard({
  title,
  description,
  href,
  icon: Icon,
  badge,
  accent = 'slate',
  className,
}) {
  const styles = accentStyles[accent] ?? accentStyles.slate;

  return (
    <Link
      href={href}
      className={cn(
        'group block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 dark:focus-visible:ring-offset-slate-950',
        className,
      )}
    >
      <article
        className={cn(
          'relative flex h-full min-h-[140px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition duration-300 ease-out hover:-translate-y-1 hover:shadow-xl dark:border-slate-800 dark:bg-slate-900 sm:min-h-[220px] sm:p-5',
          styles.glow,
        )}
      >
        <div
          className={cn(
            'pointer-events-none absolute inset-0 bg-gradient-to-br opacity-0 transition duration-300 group-hover:opacity-100 group-focus-visible:opacity-100',
            styles.gradient,
          )}
        />
        <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-transparent transition duration-300 group-hover:ring-slate-950/5 group-focus-visible:ring-slate-950/5 dark:group-hover:ring-white/10 dark:group-focus-visible:ring-white/10" />

        <div className="relative flex h-full flex-col">
          <div className="flex items-start justify-between gap-2 sm:gap-3">
            {Icon ? (
              <span
                className={cn(
                  'inline-flex size-9 items-center justify-center rounded-2xl border transition duration-300 group-hover:-translate-y-0.5 group-hover:scale-[1.02] group-focus-visible:-translate-y-0.5 group-focus-visible:scale-[1.02] sm:size-11',
                  styles.icon,
                )}
              >
                <Icon className="size-4 transition duration-300 group-hover:scale-110 group-focus-visible:scale-110 sm:size-5" strokeWidth={2.1} />
              </span>
            ) : (
              <span />
            )}

            {badge ? (
              <span
                className={cn(
                  'hidden items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] md:inline-flex',
                  styles.badge,
                )}
              >
                {badge}
              </span>
            ) : null}
          </div>

          <div className="mt-3 space-y-2 sm:mt-8 sm:space-y-3">
            <h3 className="text-sm font-semibold tracking-tight text-slate-950 dark:text-slate-50 sm:text-lg">{title}</h3>
            {description ? (
              <p className="hidden max-w-[34ch] text-sm leading-5 text-slate-600 dark:text-slate-300 sm:block sm:leading-6">
                {description}
              </p>
            ) : null}
          </div>

          <div className="mt-auto flex items-center justify-between pt-3 sm:pt-8">
            <ArrowRight
              className={cn(
                'size-4 transition duration-300 group-hover:translate-x-1 group-focus-visible:translate-x-1',
                styles.arrow,
              )}
              strokeWidth={2.2}
            />
          </div>
        </div>
      </article>
    </Link>
  );
}
