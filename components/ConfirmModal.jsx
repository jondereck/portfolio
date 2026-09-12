'use client';

import { Dialog, Transition } from '@headlessui/react';
import { Fragment, useEffect, useMemo, useState } from 'react';

export default function ConfirmModal({
  open,
  onOpenChange,
  title = 'Are you sure?',
  description = 'Please confirm to continue.',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  loading = false,
  destructive = false,
  onConfirm,
  onCancel,
  children,
  acknowledgementLabel = '',
  acknowledgementRequired = false,
  acknowledgementDefaultChecked = true,
}) {
  const [acknowledged, setAcknowledged] = useState(Boolean(acknowledgementDefaultChecked));

  useEffect(() => {
    if (!open) return;
    setAcknowledged(Boolean(acknowledgementDefaultChecked));
  }, [acknowledgementDefaultChecked, open]);

  const showAcknowledgement = Boolean(acknowledgementLabel);
  const confirmDisabled = loading || (acknowledgementRequired && showAcknowledgement && !acknowledged);

  const confirmButtonClassName = useMemo(() => {
    if (destructive) {
      return 'inline-flex h-12 w-full items-center justify-center rounded-2xl bg-red-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto';
    }

    return 'inline-flex h-12 w-full items-center justify-center rounded-2xl bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-50 dark:text-slate-900 dark:hover:bg-slate-200 sm:w-auto';
  }, [destructive]);

  return (
    <Transition appear show={Boolean(open)} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={() => onOpenChange?.(false)}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 z-50 flex items-end p-3 sm:items-center sm:justify-center">
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            enterTo="opacity-100 translate-y-0 sm:scale-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100 translate-y-0 sm:scale-100"
            leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
          >
            <Dialog.Panel className="w-full max-w-sm overflow-hidden rounded-[28px] bg-white shadow-2xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
              <div className="border-b border-slate-100 px-5 pb-4 pt-5 dark:border-slate-800">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-200">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 9v4m0 4h.01M10.29 3.86l-7.5 13A2 2 0 004.5 20h15a2 2 0 001.71-3.14l-7.5-13a2 2 0 00-3.42 0z"
                    />
                  </svg>
                </div>
                <div className="mt-4 text-center">
                  <Dialog.Title className="text-lg font-semibold text-slate-900 dark:text-slate-50">{title}</Dialog.Title>
                  <Dialog.Description className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                    {description}
                  </Dialog.Description>
                </div>
              </div>

              {children || showAcknowledgement ? (
                <div className="space-y-3 px-5 py-4">
                  {children}

                  {showAcknowledgement ? (
                    <label className="flex items-start gap-3 rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded border-slate-300 dark:border-slate-700"
                        checked={acknowledged}
                        onChange={(event) => setAcknowledged(event.target.checked)}
                      />
                      <span className="text-sm leading-6 text-slate-600 dark:text-slate-300">{acknowledgementLabel}</span>
                    </label>
                  ) : null}
                </div>
              ) : null}

              <div className="flex flex-col gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-950/20 sm:flex-row-reverse">
                <button
                  type="button"
                  className={confirmButtonClassName}
                  disabled={confirmDisabled}
                  onClick={onConfirm}
                >
                  {loading ? 'Processing...' : confirmLabel}
                </button>
                <button
                  type="button"
                  className="inline-flex h-12 w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-900/60 sm:w-auto"
                  disabled={loading}
                  onClick={() => {
                    if (typeof onCancel === 'function') {
                      onCancel();
                      return;
                    }
                    onOpenChange?.(false);
                  }}
                >
                  {cancelLabel}
                </button>
              </div>
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition>
  );
}
