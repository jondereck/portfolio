'use client';

export function getDriveImportModeLabel(selectedFileIds) {
  const count = Array.isArray(selectedFileIds) ? selectedFileIds.length : 0;
  return count > 0 ? `${count} selected items` : 'All media in this folder';
}

export function getDriveImportWillLabel(selectedFileIds) {
  const count = Array.isArray(selectedFileIds) ? selectedFileIds.length : 0;
  return count > 0 ? `Will import ${count} checked items` : 'Will import all media in this folder';
}

export function getDriveImportActiveStep({ connected, hasFolder, importing }) {
  if (!connected) return 1;
  if (importing || hasFolder) return 3;
  return 2;
}

export function canSelectDriveImportStep(stepId, { connected } = {}) {
  if (stepId === 1) return true;
  return Boolean(connected) && (stepId === 2 || stepId === 3);
}

const STEPS = [
  { id: 1, label: 'Connect' },
  { id: 2, label: 'Folder' },
  { id: 3, label: 'Import' },
];

export default function DriveImportStepStrip({ activeStep, onStepSelect, connected = false }) {
  return (
    <ol className="flex items-start justify-between rounded-2xl bg-slate-50 px-3 py-4 dark:bg-slate-800/60 sm:px-6">
      {STEPS.map((step, index) => {
        const isActive = step.id === activeStep;
        const isDone = step.id < activeStep;
        const selectable = canSelectDriveImportStep(step.id, { connected }) && typeof onStepSelect === 'function';

        return (
          <li key={step.id} className="relative flex min-w-0 flex-1 flex-col items-center text-center">
            {index < STEPS.length - 1 ? (
              <span
                aria-hidden="true"
                className={`absolute left-[calc(50%+18px)] right-[calc(-50%+18px)] top-[13px] h-px ${
                  isDone ? 'bg-slate-400 dark:bg-slate-500' : 'bg-slate-200 dark:bg-slate-700'
                }`}
              />
            ) : null}
            <button
              type="button"
              disabled={!selectable}
              aria-current={isActive ? 'step' : undefined}
              aria-label={`${step.label} step ${step.id}`}
              onClick={() => onStepSelect?.(step.id)}
              className={`relative z-[1] inline-flex min-h-11 min-w-11 flex-col items-center justify-start rounded-xl px-1 ${
                selectable ? 'cursor-pointer' : 'cursor-default'
              }`}
            >
              <span
                className={`inline-flex h-[26px] w-[26px] items-center justify-center rounded-full text-[11px] font-semibold ${
                  isActive
                    ? 'bg-slate-950 text-white dark:bg-slate-50 dark:text-slate-900'
                    : selectable
                      ? 'border border-slate-400 bg-white text-slate-700 dark:border-slate-500 dark:bg-slate-900 dark:text-slate-200'
                      : 'border border-slate-300 bg-white text-slate-400 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-500'
                }`}
              >
                {step.id}
              </span>
              <span
                className={`mt-2 text-[13px] ${
                  isActive
                    ? 'font-semibold text-slate-950 dark:text-slate-50'
                    : selectable
                      ? 'font-medium text-slate-600 dark:text-slate-300'
                      : 'font-medium text-slate-400 dark:text-slate-500'
                }`}
              >
                {step.label}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
