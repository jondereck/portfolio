'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

export default function GalleryCmsShell({
  header,
  sidebar,
  main,
  inspector,
  mobileTabs,
  mobileFooterActions,
  sidebarCollapsed = false,
  embedded = false,
}) {
  const reduceMotion = useReducedMotion();
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mediaQuery = window.matchMedia('(min-width: 1024px)');
    const update = () => setIsDesktop(Boolean(mediaQuery.matches));
    update();
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', update);
      return () => mediaQuery.removeEventListener('change', update);
    }
    mediaQuery.addListener(update);
    return () => mediaQuery.removeListener(update);
  }, []);

  const disableMotion = reduceMotion || !isDesktop;
  const motionTransition = disableMotion
    ? { duration: 0 }
    : { type: 'spring', stiffness: 420, damping: 38, mass: 0.8 };

  // Tailwind needs these classes to be statically present for arbitrary grid template values.
  const desktopGridColumns = inspector
    ? sidebarCollapsed
      ? 'lg:grid-cols-[76px_minmax(0,1fr)] xl:grid-cols-[76px_minmax(0,1fr)_340px]'
      : 'lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_340px]'
    : sidebarCollapsed
      ? 'lg:grid-cols-[76px_minmax(0,1fr)]'
      : 'lg:grid-cols-[280px_minmax(0,1fr)]';

  const shell = (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      {header}

      <motion.div
        className={`grid transition-[grid-template-columns] duration-300 ease-out lg:h-[calc(100vh-160px)] lg:min-h-[520px] lg:overflow-hidden ${desktopGridColumns}`}
        layout
        transition={motionTransition}
      >
        <motion.div className="min-w-0 lg:h-full lg:overflow-hidden" layout transition={motionTransition}>
          {sidebar}
        </motion.div>
        {mobileTabs}
        <motion.div
          data-gallery-scroll-main
          className="min-w-0 lg:h-full lg:overflow-y-auto lg:overscroll-contain"
          layout
          transition={motionTransition}
        >
          {main}
        </motion.div>
        <AnimatePresence initial={false}>
          {inspector ? (
            <motion.div
              key="gallery-inspector"
              className="min-w-0 lg:h-full lg:overflow-y-auto lg:overscroll-contain"
              layout
              initial={disableMotion ? false : { opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              exit={disableMotion ? { opacity: 0 } : { opacity: 0, x: 18 }}
              transition={motionTransition}
            >
              {inspector}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.div>

      {mobileFooterActions}
    </div>
  );

  if (embedded) {
    return shell;
  }

  return (
    <div className="text-slate-900 dark:text-slate-50">
      <div className="mx-auto max-w-none">{shell}</div>
    </div>
  );
}
