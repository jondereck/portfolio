'use client';

import { Fragment, useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { ArrowDownAZ, ArrowUpDown, ChevronDown, MoveDown, MoveUp, RotateCcw, SortAsc, X } from 'lucide-react';
import { buttonStyles, ghostButtonStyles } from './galleryAdminShared';

export default function GalleryArrangeMobileControls({
  orderDirty,
  orderSaving,
  onSaveOrder,
  onManualOrder,
  onSortNewest,
  onSortOldest,
  onReverseOrder,
  onMoveTop,
  onMoveBottom,
  onUndo,
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <div className="sticky bottom-3 z-20 mt-4 md:hidden">
        <div className="mx-auto flex max-w-xl items-center gap-2 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-lg shadow-slate-950/10 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
          <button
            type="button"
            className={`${buttonStyles} flex-1`}
            disabled={!orderDirty || orderSaving}
            onClick={onSaveOrder}
          >
            {orderSaving ? 'Saving Order...' : 'Save Order'}
          </button>
          <button
            type="button"
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-300 px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            onClick={() => setIsOpen(true)}
          >
            More
            <ChevronDown className="size-4" />
          </button>
        </div>
      </div>

      <Transition show={isOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50 md:hidden" onClose={setIsOpen}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm" />
          </Transition.Child>

          <div className="fixed inset-0 flex items-end justify-center p-3">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 translate-y-4"
              enterTo="opacity-100 translate-y-0"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 translate-y-0"
              leaveTo="opacity-0 translate-y-4"
            >
              <Dialog.Panel className="flex max-h-[min(42rem,calc(100dvh-1.5rem))] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Arrange tools</p>
                    <h2 className="mt-1 text-base font-semibold text-slate-950 dark:text-slate-50">Quick actions</h2>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Keep Save Order in reach and move secondary actions into this drawer.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="rounded-md border border-slate-300 p-2 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    onClick={() => setIsOpen(false)}
                  >
                    <X className="size-4" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-4">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Sort</p>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <button type="button" className={ghostButtonStyles} onClick={onManualOrder}>
                          <span className="inline-flex items-center gap-2">
                            <ArrowUpDown className="size-4" />
                            Manual order
                          </span>
                        </button>
                        <button type="button" className={ghostButtonStyles} onClick={onSortNewest}>
                          <span className="inline-flex items-center gap-2">
                            <SortAsc className="size-4" />
                            Sort by newest
                          </span>
                        </button>
                        <button type="button" className={ghostButtonStyles} onClick={onSortOldest}>
                          <span className="inline-flex items-center gap-2">
                            <ArrowDownAZ className="size-4" />
                            Sort by oldest
                          </span>
                        </button>
                        <button type="button" className={ghostButtonStyles} onClick={onReverseOrder}>
                          <span className="inline-flex items-center gap-2">
                            <RotateCcw className="size-4" />
                            Reverse order
                          </span>
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Move</p>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <button type="button" className={ghostButtonStyles} onClick={onMoveTop}>
                          <span className="inline-flex items-center gap-2">
                            <MoveUp className="size-4" />
                            Move to top
                          </span>
                        </button>
                        <button type="button" className={ghostButtonStyles} onClick={onMoveBottom}>
                          <span className="inline-flex items-center gap-2">
                            <MoveDown className="size-4" />
                            Move to bottom
                          </span>
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">History</p>
                      <button type="button" className={ghostButtonStyles} onClick={onUndo}>
                        Undo last change
                      </button>
                    </div>
                  </div>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </Dialog>
      </Transition>
    </>
  );
}
