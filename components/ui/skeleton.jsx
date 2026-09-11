import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }) {
  return (
    <div
      data-slot="skeleton"
      className={cn('animate-pulse rounded-md bg-slate-200/90 dark:bg-slate-800/90', className)}
      {...props}
    />
  );
}

export { Skeleton };
