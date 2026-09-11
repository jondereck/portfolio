'use client';

import { useEffect, useRef, useState } from 'react';
import { Folder, Unplug } from 'lucide-react';
import { FaGoogleDrive } from 'react-icons/fa';
import DriveImportStepStrip, { getDriveImportActiveStep } from './DriveImportStepStrip';

export default function DriveImportWorkflow({
  connected,
  connectionBusy,
  connectionLabel,
  featureEnabled,
  oauthConfigured,
  driveForm,
  folderPathPreview,
  willImportLabel,
  albumLabel,
  browseDisabled,
  importDisabled,
  importingDrive,
  onConnect,
  onDisconnect,
  onBrowse,
  onClear,
  onImport,
  summary,
}) {
  const folderName = driveForm.folderName || 'Selected folder';
  const hasFolder = Boolean(driveForm.folderId);
  const canUseDrive = connected && featureEnabled && oauthConfigured;
  const [activeStep, setActiveStep] = useState(() =>
    getDriveImportActiveStep({ connected: canUseDrive, hasFolder, importing: importingDrive }),
  );
  const wasConnectedRef = useRef(canUseDrive);
  const hadFolderRef = useRef(hasFolder);

  useEffect(() => {
    if (canUseDrive && !wasConnectedRef.current) {
      setActiveStep(2);
    }
    if (!canUseDrive) {
      setActiveStep(1);
    }
    wasConnectedRef.current = canUseDrive;
  }, [canUseDrive]);

  useEffect(() => {
    if (hasFolder && !hadFolderRef.current) {
      setActiveStep(3);
    }
    if (!hasFolder && hadFolderRef.current && canUseDrive) {
      setActiveStep(2);
    }
    hadFolderRef.current = hasFolder;
  }, [canUseDrive, hasFolder]);

  useEffect(() => {
    if (importingDrive) {
      setActiveStep(3);
    }
  }, [importingDrive]);

  const handleStepSelect = (stepId) => {
    if (stepId === 1) {
      setActiveStep(1);
      return;
    }
    if (!canUseDrive) return;
    if (stepId === 2 || stepId === 3) {
      setActiveStep(stepId);
    }
  };

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          <Folder className="h-5 w-5" />
        </span>
        <div className="min-w-0 pt-0.5">
          <h3 className="text-[17px] font-semibold tracking-tight text-slate-950 dark:text-slate-50">
            Import from Drive
          </h3>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Import media directly from your Google Drive
          </p>
        </div>
      </div>

      <div className="mt-5">
        <DriveImportStepStrip activeStep={activeStep} connected={canUseDrive} onStepSelect={handleStepSelect} />
      </div>

      <div className="mt-4 space-y-3">
        {activeStep === 1 ? (
          <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
            <p className="text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Connect</p>
            {connectionBusy && !canUseDrive ? (
              <p className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">Checking Google Drive connection...</p>
            ) : !canUseDrive ? (
              <>
                <p className="mt-3 text-center text-sm text-slate-600 dark:text-slate-300">
                  {!featureEnabled
                    ? 'Google Drive import is disabled.'
                    : !oauthConfigured
                      ? 'OAuth setup is required before connecting.'
                      : 'Connect Google Drive to choose a folder.'}
                </p>
                <p className="mt-2 text-center text-xs font-medium text-slate-500">{connectionLabel}</p>
                <div className="mt-4 flex justify-center">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                    Disconnected
                  </span>
                </div>
                <button
                  type="button"
                  className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-50 dark:text-slate-900"
                  disabled={connectionBusy || !featureEnabled || !oauthConfigured}
                  onClick={onConnect}
                >
                  <FaGoogleDrive className="h-4 w-4" />
                  {connectionBusy ? 'Redirecting...' : 'Connect Google Drive'}
                </button>
              </>
            ) : (
              <div className="mt-4 flex flex-col items-center justify-center gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Connected
                </span>
                <button
                  type="button"
                  className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-800 dark:hover:text-slate-200"
                  disabled={connectionBusy}
                  onClick={onDisconnect}
                >
                  <Unplug className="h-3.5 w-3.5" />
                  {connectionBusy ? 'Disconnecting...' : 'Disconnect'}
                </button>
              </div>
            )}
          </div>
        ) : null}

        {activeStep === 2 ? (
          <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Folder</p>
            <div className="mt-3 flex min-w-0 items-start gap-3">
              <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center text-slate-400">
                <Folder className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold text-slate-950 dark:text-slate-50">
                  {hasFolder ? folderName : 'No folder selected yet'}
                </p>
                <p className="mt-0.5 truncate text-sm text-slate-400">
                  {hasFolder ? folderPathPreview || 'Selected folder is ready.' : 'Browse Google Drive to choose a source.'}
                </p>
              </div>
            </div>

            <div className="mt-4 flex w-full flex-col gap-2">
              <button
                type="button"
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-50 dark:text-slate-900"
                disabled={browseDisabled}
                onClick={onBrowse}
              >
                <Folder className="h-4 w-4" />
                {hasFolder ? 'Change folder' : 'Browse Google Drive'}
              </button>
              {hasFolder ? (
                <button
                  type="button"
                  className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  onClick={onClear}
                  disabled={importingDrive}
                >
                  Clear
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {activeStep === 3 ? (
          <>
            <form className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700" onSubmit={onImport}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Import</p>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                {hasFolder ? willImportLabel : 'Confirm a folder to enable import.'}
              </p>
              <button
                type="submit"
                className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-50 dark:text-slate-900"
                disabled={importDisabled}
              >
                <FaGoogleDrive className="h-4 w-4" />
                {importingDrive ? 'Importing...' : albumLabel}
              </button>
            </form>
            {summary}
          </>
        ) : null}
      </div>
    </div>
  );
}
