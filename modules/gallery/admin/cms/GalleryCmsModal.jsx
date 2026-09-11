'use client';

import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';

export default function GalleryCmsModal({ open, onClose, onOpenChange, title, description, children }) {
  const handleClose =
    typeof onClose === 'function'
      ? onClose
      : typeof onOpenChange === 'function'
        ? () => onOpenChange(false)
        : () => {};

  return (
    <Transition appear show={open} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={handleClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto px-4 py-8">
          <div className="mx-auto flex min-h-full max-w-xl items-center justify-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 translate-y-3 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-3 sm:translate-y-0 sm:scale-95"
            >
              <Dialog.Panel className="w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
                <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
                  <Dialog.Title className="text-base font-semibold text-slate-900 dark:text-slate-50">{title}</Dialog.Title>
                  {description ? (
                    <Dialog.Description className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      {description}
                    </Dialog.Description>
                  ) : null}
                </div>
                <div className="px-5 py-5">{children}</div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}

