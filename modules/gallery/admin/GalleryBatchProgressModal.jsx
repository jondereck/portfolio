'use client';

import { Dialog, Transition } from '@headlessui/react';
import { Fragment, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import GalleryBatchProgressCard from './GalleryBatchProgressCard';

export default function GalleryBatchProgressModal({
  open,
  progress,
  heading,
  currentItemFallback,
  currentItemTitle,
  itemUnit = 'file',
  uploadedLabel,
  skippedLabel,
  failedLabel,
  warningText = 'Do not go back or refresh while this is running. Use Cancel if you need to stop.',
  onCancel,
}) {
  useEffect(() => {
    if (!open) return undefined;

    const beforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', beforeUnload);

    const marker = { galleryBatchBlock: true };
    window.history.pushState(marker, '');
    const onPopState = () => {
      window.history.pushState(marker, '');
    };
    window.addEventListener('popstate', onPopState);

    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('popstate', onPopState);
    };
  }, [open]);

  return (
    <Transition show={Boolean(open && progress)} as={Fragment}>
      <Dialog as="div" className="relative z-[80]" onClose={() => {}}>
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:p-5">
            <Dialog.Title className="sr-only">{heading}</Dialog.Title>
            <GalleryBatchProgressCard
              progress={progress}
              heading={heading}
              currentItemFallback={currentItemFallback}
              currentItemTitle={currentItemTitle}
              itemUnit={itemUnit}
              uploadedLabel={uploadedLabel}
              skippedLabel={skippedLabel}
              failedLabel={failedLabel}
            />
            <div className="mt-4 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{warningText}</p>
            </div>
            <button
              type="button"
              className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-xl border border-slate-300 bg-white text-sm font-bold text-slate-800 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-800"
              onClick={onCancel}
            >
              Cancel
            </button>
          </Dialog.Panel>
        </div>
      </Dialog>
    </Transition>
  );
}
