import { metricCardStyles } from '@/modules/system/admin/settingsShared';
import { cn } from '@/lib/utils';

export default function AdminMetricCard({ label, value, hint }) {
  return (
    <div className={cn(metricCardStyles, 'min-w-0 p-2.5 sm:p-4')}>
      <p className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 sm:text-xs sm:tracking-[0.16em]">
        {label}
      </p>
      <p className="mt-1.5 text-lg font-semibold tracking-tight text-slate-950 dark:text-slate-50 sm:mt-2 sm:text-2xl">
        {value}
      </p>
      {hint ? (
        <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-slate-500 sm:text-sm sm:leading-5">{hint}</p>
      ) : null}
    </div>
  );
}
