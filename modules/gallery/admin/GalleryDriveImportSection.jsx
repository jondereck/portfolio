'use client';

import { useEffect, useMemo, useState } from 'react';
import { Cloud, FolderOpen, Info, Lock, Shield, Unplug, Upload } from 'lucide-react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  buttonStyles,
  ghostButtonStyles,
} from './galleryAdminShared';
import GalleryBatchResultSummary from './GalleryBatchResultSummary';
import GalleryDriveFolderPicker from './GalleryDriveFolderPicker';

const emptyDriveConnection = {
  loading: true,
  featureEnabled: true,
  oauthConfigured: true,
  connected: false,
  expiresAt: null,
  hasRefreshToken: false,
  scope: null,
};

export default function GalleryDriveImportSection({ controller, selectedAlbum, variant = 'full' }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    driveForm,
    setDriveForm,
    importingDrive,
    importSummary,
    handleDriveImport,
  } = controller;
  const [driveConnection, setDriveConnection] = useState(emptyDriveConnection);
  const [connectionBusy, setConnectionBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const mediaFilterLabel =
    driveForm.mediaTypeFilter === 'images' ? 'Images only' : driveForm.mediaTypeFilter === 'videos' ? 'Videos only' : 'Images + videos';

  const clearDriveSelection = () => {
    setDriveForm((previous) => ({
      ...previous,
      folderId: '',
      folderName: '',
      breadcrumbs: [],
      mediaCount: null,
      selectedFileIds: [],
      mediaTypeFilter: 'all',
    }));
  };

  const loadDriveConnection = async () => {
    setDriveConnection((current) => ({ ...current, loading: true }));

    try {
      const response = await fetch('/api/admin/integrations/google-drive', {
        method: 'GET',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to load Google Drive connection status.');
      }

      setDriveConnection({
        loading: false,
        featureEnabled: payload.featureEnabled !== false,
        oauthConfigured: payload.oauthConfigured !== false,
        connected: Boolean(payload.connected),
        expiresAt: typeof payload.expiresAt === 'number' ? payload.expiresAt : null,
        hasRefreshToken: Boolean(payload.hasRefreshToken),
        scope: typeof payload.scope === 'string' ? payload.scope : null,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load Google Drive connection status.');
      setDriveConnection({
        ...emptyDriveConnection,
        loading: false,
        featureEnabled: false,
        oauthConfigured: false,
      });
    }
  };

  useEffect(() => {
    loadDriveConnection();
  }, []);

  useEffect(() => {
    const driveState = searchParams.get('googleDrive');
    if (!driveState) {
      return;
    }

    if (driveState === 'connected') {
      toast.success('Google Drive connected.');
      loadDriveConnection();
    } else if (driveState === 'already-linked') {
      toast.error('This Google account is already linked to another admin.');
    } else if (driveState === 'connect-denied') {
      toast.error('Google Drive connection was not completed.');
    }

    const params = new URLSearchParams(searchParams.toString());
    params.delete('googleDrive');
    const nextQuery = params.toString();
    router.replace(nextQuery ? `?${nextQuery}` : window.location.pathname, { scroll: false });
  }, [router, searchParams]);

  useEffect(() => {
    if (driveConnection.loading) {
      return;
    }

    if (!driveConnection.connected || !driveConnection.featureEnabled || !driveConnection.oauthConfigured) {
      clearDriveSelection();
    }
  }, [
    driveConnection.connected,
    driveConnection.featureEnabled,
    driveConnection.loading,
    driveConnection.oauthConfigured,
  ]);

  const handleConnectGoogleDrive = async () => {
    setConnectionBusy(true);

    try {
      const response = await fetch('/api/admin/integrations/google-drive', {
        method: 'POST',
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to start Google Drive connection.');
      }

      await signIn('google', {
        callbackUrl: window.location.href,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to connect Google Drive.');
      setConnectionBusy(false);
    }
  };

  const handleDisconnectGoogleDrive = async () => {
    setConnectionBusy(true);

    try {
      const response = await fetch('/api/admin/integrations/google-drive', {
        method: 'DELETE',
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to disconnect Google Drive.');
      }

      toast.success('Google Drive disconnected.');
      clearDriveSelection();
      await loadDriveConnection();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to disconnect Google Drive.');
    } finally {
      setConnectionBusy(false);
    }
  };

  const importDisabled =
    importingDrive ||
    driveConnection.loading ||
    !driveConnection.featureEnabled ||
    !driveConnection.oauthConfigured ||
    !driveConnection.connected ||
    !driveForm.folderId;

  const connectionTone = useMemo(() => {
    if (!driveConnection.featureEnabled) {
      return 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-200';
    }
    if (!driveConnection.oauthConfigured) {
      return 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200';
    }
    if (driveConnection.connected) {
      return 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200';
    }
    return 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-200';
  }, [driveConnection.connected, driveConnection.featureEnabled, driveConnection.oauthConfigured]);

  const connectionLabel = !driveConnection.featureEnabled
    ? 'Disabled globally'
    : !driveConnection.oauthConfigured
      ? 'OAuth setup required'
      : driveConnection.connected
        ? 'Connected'
        : 'Not connected';

  const folderPreview = driveForm.folderName?.trim() || driveForm.folderId.trim() || '...';
  const folderPathPreview = Array.isArray(driveForm.breadcrumbs)
    ? driveForm.breadcrumbs.map((entry) => entry?.name).filter(Boolean).join(' / ')
    : '';
  const effectiveImportTotal = typeof driveForm.mediaCount === 'number' ? Math.max(0, driveForm.mediaCount) : null;

  return (
    <div className="space-y-4">
      {variant === 'compact' ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start gap-3">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200">
              <FolderOpen className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Import from Drive</h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Connect, browse a folder, and import directly into the active album.
              </p>
            </div>
          </div>

          <div className={`mt-4 rounded-2xl border px-3 py-3 ${connectionTone}`}>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] opacity-80">{connectionLabel}</p>
            <p className="mt-1 text-sm opacity-90">
              {driveConnection.connected
                ? 'Google Drive is ready for import.'
                : 'Connect Google Drive to browse a folder and import media.'}
            </p>
          </div>

          <div className="mt-4 flex flex-col gap-2">
            {driveConnection.connected ? (
              <>
                <button
                  type="button"
                  className={buttonStyles}
                  disabled={
                    connectionBusy ||
                    driveConnection.loading ||
                    !driveConnection.featureEnabled ||
                    !driveConnection.oauthConfigured ||
                    !driveConnection.connected
                  }
                  onClick={() => setPickerOpen(true)}
                >
                  Browse Google Drive
                </button>
                <button
                  type="button"
                  className={ghostButtonStyles}
                  disabled={connectionBusy || driveConnection.loading}
                  onClick={handleDisconnectGoogleDrive}
                >
                  {connectionBusy ? 'Disconnecting...' : 'Disconnect Google Drive'}
                </button>
              </>
            ) : (
              <button
                type="button"
                className={buttonStyles}
                disabled={
                  connectionBusy ||
                  driveConnection.loading ||
                  !driveConnection.featureEnabled ||
                  !driveConnection.oauthConfigured
                }
                onClick={handleConnectGoogleDrive}
              >
                {connectionBusy ? 'Redirecting...' : 'Connect Google Drive'}
              </button>
            )}
          </div>

          {driveForm.folderId ? (
            <form className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/30" onSubmit={handleDriveImport}>
              <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                {driveForm.folderName || 'Selected Google Drive folder'}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {Array.isArray(driveForm.selectedFileIds) && driveForm.selectedFileIds.length > 0
                  ? `${driveForm.selectedFileIds.length} selected media item(s) will be imported.`
                  : 'No media selected means the whole selected folder will be imported.'}
              </p>
              <button type="submit" className={`${buttonStyles} mt-3 w-full`} disabled={importDisabled}>
                {importingDrive ? 'Importing...' : 'Import Folder'}
              </button>
            </form>
          ) : null}

          {importSummary ? (
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/40">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Last import summary</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {effectiveImportTotal === null
                    ? 'Imported from the selected folder.'
                    : `Imported against ${effectiveImportTotal} discovered item${effectiveImportTotal === 1 ? '' : 's'}.`}
                </p>
              </div>

              <GalleryBatchResultSummary
                summary={importSummary}
                uploadedLabel="Imported"
                skippedLabel="Duplicates"
                failedLabel="Failed"
                flaggedHeading="Duplicate and failed imports"
              />
            </div>
          ) : null}

          <GalleryDriveFolderPicker
            open={pickerOpen}
            onClose={() => setPickerOpen(false)}
            selectedFolderId={driveForm.folderId}
            selectedFileIds={driveForm.selectedFileIds}
            selectedMediaTypeFilter={driveForm.mediaTypeFilter}
            onSelectFolder={(folder) => {
              setDriveForm((previous) => ({
                ...previous,
                folderId: folder.id,
                folderName: folder.name,
                breadcrumbs: Array.isArray(folder.breadcrumbs) ? folder.breadcrumbs : [],
                mediaCount: typeof folder.mediaCount === 'number' ? folder.mediaCount : null,
                selectedFileIds: Array.isArray(folder.selectedFileIds) ? folder.selectedFileIds : [],
                mediaTypeFilter: folder.mediaTypeFilter || previous.mediaTypeFilter || 'all',
              }));
            }}
          />
        </div>
      ) : null}

      {variant === 'compact' ? null : (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-4">
          <section className={`overflow-hidden rounded-xl border p-4 shadow-sm sm:p-4 ${driveConnection.connected ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30' : 'border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30'}`}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-sm ${driveConnection.connected ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white'}`}>
                  {driveConnection.connected ? <Shield className="h-6 w-6" /> : <Cloud className="h-6 w-6" />}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className={`text-xs font-black uppercase tracking-[0.22em] ${driveConnection.connected ? 'text-emerald-800 dark:text-emerald-200' : 'text-amber-800 dark:text-amber-200'}`}>
                      Google Drive connection
                    </p>
                    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.14em] ${driveConnection.connected ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-100' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-100'}`}>
                      <span className={`h-2 w-2 rounded-full ${driveConnection.connected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                      {connectionLabel}
                    </span>
                  </div>
                  <h2 className="mt-2 text-lg font-black text-slate-950 dark:text-slate-50">
                    {driveConnection.connected ? 'Drive is ready' : 'Connect your Google Drive'}
                  </h2>
                  <p className={`mt-1 max-w-2xl text-sm leading-6 ${driveConnection.connected ? 'text-emerald-800/80 dark:text-emerald-100/80' : 'text-amber-800/80 dark:text-amber-100/80'}`}>
                
                  </p>
                </div>
              </div>

              {driveConnection.connected ? (
                <button
                  type="button"
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-white/80 px-4 text-sm font-black text-emerald-900 shadow-sm transition hover:bg-white sm:w-auto"
                  disabled={connectionBusy || driveConnection.loading}
                  onClick={handleDisconnectGoogleDrive}
                >
                  <Unplug className="h-4 w-4" />
                  {connectionBusy ? 'Disconnecting...' : 'Disconnect'}
                </button>
              ) : (
                <button
                  type="button"
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-amber-200 bg-white/80 px-4 text-sm font-black text-amber-900 shadow-sm transition hover:bg-white sm:w-auto"
                  disabled={
                    connectionBusy ||
                    driveConnection.loading ||
                    !driveConnection.featureEnabled ||
                    !driveConnection.oauthConfigured
                  }
                  onClick={handleConnectGoogleDrive}
                >
                  {connectionBusy ? 'Redirecting...' : 'Connect Drive'}
                </button>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">Drive source folder</p>
                <h2 className="mt-2 text-lg font-black text-slate-950 dark:text-slate-50">
                  {driveForm.folderId ? driveForm.folderName || 'Selected folder' : 'No folder selected yet'}
                </h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                  {driveForm.folderId ? folderPathPreview || 'Selected folder is ready to import.' : 'Browse Google Drive and choose a folder to import.'}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-black text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  disabled={
                    connectionBusy ||
                    driveConnection.loading ||
                    !driveConnection.featureEnabled ||
                    !driveConnection.oauthConfigured ||
                    !driveConnection.connected
                  }
                  onClick={() => setPickerOpen(true)}
                >
                  <FolderOpen className="h-4 w-4" />
                  {driveForm.folderId ? 'Change folder' : 'Browse Google Drive'}
                </button>
                {driveForm.folderId ? (
                  <button
                    type="button"
                    className={ghostButtonStyles}
                    onClick={clearDriveSelection}
                    disabled={importingDrive}
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-3 sm:p-4 dark:border-slate-700 dark:bg-slate-950/30">
              {driveForm.folderId ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm shadow-blue-600/20">
                      <FolderOpen className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-950 dark:text-slate-50">{driveForm.folderName || 'Selected Google Drive folder'}</p>
                      <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                        {typeof driveForm.mediaCount === 'number'
                          ? `${driveForm.mediaCount} total items`
                          : 'Media count will appear after loading.'}
                      </p>
                    </div>
                  </div>
                  <details className="text-xs text-slate-500 dark:text-slate-400">
                    <summary className="cursor-pointer font-semibold">Advanced details</summary>
                    <p className="mt-2 break-all">Folder ID: {driveForm.folderId}</p>
                  </details>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm dark:bg-slate-900">
                    <Info className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-black text-slate-950 dark:text-slate-50">Select a Drive folder to enable import</p>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">The import button stays disabled until a source folder is selected.</p>
                  </div>
                </div>
              )}
            </div>

            {driveForm.folderId ? (
              <form className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" onSubmit={handleDriveImport}>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {Array.isArray(driveForm.selectedFileIds) && driveForm.selectedFileIds.length > 0
                    ? `${driveForm.selectedFileIds.length} selected media item(s) will be imported.`
                    : 'No media selected means the whole selected folder will be imported.'}
                </p>
                <button
                  type="submit"
                  className={buttonStyles}
                  disabled={importDisabled}
                >
                  {importingDrive ? 'Importing...' : 'Import Folder'}
                </button>
              </form>
            ) : null}

            {importSummary ? (
              <div className="mt-4 space-y-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/40">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Last import summary</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {effectiveImportTotal === null
                      ? 'Imported from the selected folder.'
                      : `Imported against ${effectiveImportTotal} discovered item${effectiveImportTotal === 1 ? '' : 's'}.`}
                  </p>
                </div>

                <GalleryBatchResultSummary
                  summary={importSummary}
                  uploadedLabel="Imported"
                  skippedLabel="Duplicates"
                  failedLabel="Failed"
                  flaggedHeading="Duplicate and failed imports"
                />
              </div>
            ) : null}
          </section>

            <GalleryDriveFolderPicker
              open={pickerOpen}
              onClose={() => setPickerOpen(false)}
              selectedFolderId={driveForm.folderId}
              selectedFileIds={driveForm.selectedFileIds}
              selectedMediaTypeFilter={driveForm.mediaTypeFilter}
              onSelectFolder={(folder) => {
                setDriveForm((previous) => ({
                  ...previous,
                  folderId: folder.id,
                  folderName: folder.name,
                  breadcrumbs: Array.isArray(folder.breadcrumbs) ? folder.breadcrumbs : [],
                  mediaCount: typeof folder.mediaCount === 'number' ? folder.mediaCount : null,
                  selectedFileIds: Array.isArray(folder.selectedFileIds) ? folder.selectedFileIds : [],
                  mediaTypeFilter: folder.mediaTypeFilter || previous.mediaTypeFilter || 'all',
                }));
              }}
            />
        </div>
      )}
    </div>
  );
}
