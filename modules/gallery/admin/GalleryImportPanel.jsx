'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { toast } from 'sonner';
import {
  GalleryAlbumPicker,
  GalleryPageHeader,
  GalleryPanelCard,
  buttonStyles,
  ghostButtonStyles,
} from './galleryAdminShared';
import GalleryCreateAlbumModal from './GalleryCreateAlbumModal';
import GalleryBatchProgressCard from './GalleryBatchProgressCard';
import GalleryDriveFolderPicker from './GalleryDriveFolderPicker';
import GalleryBatchResultSummary from './GalleryBatchResultSummary';

const emptyDriveConnection = {
  loading: true,
  featureEnabled: true,
  oauthConfigured: true,
  connected: false,
  expiresAt: null,
  hasRefreshToken: false,
  scope: null,
};

export default function GalleryImportPanel({ controller, embedded = false }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    albums,
    selectedAlbum,
    selectedAlbumId,
    loadingAlbums,
    driveForm,
    setDriveForm,
    importingDrive,
    importProgress,
    importSummary,
    handleDriveImport,
    savingAlbum,
    createAlbumRecord,
    loadAlbums,
    setSelectedAlbumId,
  } = controller;
  const [driveConnection, setDriveConnection] = useState(emptyDriveConnection);
  const [connectionBusy, setConnectionBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [createAlbumOpen, setCreateAlbumOpen] = useState(false);

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

  return (
    <div className="space-y-4">
      <GalleryCreateAlbumModal
        open={createAlbumOpen}
        onOpenChange={setCreateAlbumOpen}
        loading={savingAlbum}
        onCreate={async (albumData) => {
          const created = await createAlbumRecord(albumData);
          if (!created) {
            return null;
          }

          await loadAlbums();
          setSelectedAlbumId(created.id);
          return created;
        }}
      />

      {!embedded ? (
        <GalleryPageHeader
          eyebrow="Import Workflow"
          title="Import"
          description="Import Google Drive media into a selected album with duplicate-aware handling and a focused workflow."
        />
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)]">
        <GalleryAlbumPicker
          albums={albums}
          selectedAlbumId={selectedAlbumId}
          loadingAlbums={loadingAlbums}
          onSelectAlbum={setSelectedAlbumId}
          emptyDescription="Create an album before importing external media."
          onCreateAlbumClick={() => setCreateAlbumOpen(true)}
        />

        {selectedAlbum ? (
          <div className="space-y-4">
            <GalleryPanelCard
              title={`Import into ${selectedAlbum.name}`}
              description="The import route is intentionally limited to import-related controls."
            >
              <div className="space-y-4">
                <div className={`rounded-xl border px-4 py-4 ${connectionTone}`}>
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-80">Google Drive connection</p>
                      <p className="mt-2 text-sm font-semibold">{connectionLabel}</p>
            
                      <p className="mt-3 text-xs opacity-80">
                        Imported images stay linked to Google Drive in this version. Choose a folder from Drive, then import it into the selected album.
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {driveConnection.connected ? (
                        <button
                          type="button"
                          className={ghostButtonStyles}
                          disabled={connectionBusy || driveConnection.loading}
                          onClick={handleDisconnectGoogleDrive}
                        >
                          {connectionBusy ? 'Disconnecting...' : 'Disconnect Google Drive'}
                        </button>
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
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                        Drive source folder
                      </p>
                      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                        {driveForm.folderId
                          ? 'Selected folder is ready to import.'
                          : 'Browse Google Drive and choose a folder to import.'}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
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
                        {driveForm.folderId ? 'Change folder' : 'Browse Google Drive'}
                      </button>
                      {driveForm.folderId ? (
                        <button
                          type="button"
                          className={ghostButtonStyles}
                          onClick={clearDriveSelection}
                          disabled={importingDrive}
                        >
                          Clear selection
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {driveForm.folderId ? (
                    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/30">
                      <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
                        {driveForm.folderName || 'Selected Google Drive folder'}
                      </p>
                      {folderPathPreview ? (
                        <p className="mt-1 text-xs text-emerald-900/80 dark:text-emerald-100/80">
                          {folderPathPreview}
                        </p>
                      ) : null}
                      <details className="mt-3 text-xs text-emerald-900/80 dark:text-emerald-100/80">
                        <summary className="cursor-pointer font-medium">Advanced details</summary>
                        <p className="mt-2 break-all">Folder ID: {driveForm.folderId}</p>
                        <p className="mt-1">
                          {typeof driveForm.mediaCount === 'number'
                            ? `Estimated images: ${driveForm.mediaCount}`
                            : 'Image count preview is unavailable before import in this version.'}
                        </p>
                      </details>
                    </div>
                  ) : null}

                  <form className="mt-4 space-y-3" onSubmit={handleDriveImport}>
                    {driveForm.folderId ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {Array.isArray(driveForm.selectedFileIds) && driveForm.selectedFileIds.length > 0
                          ? `${driveForm.selectedFileIds.length} selected media item(s) will be imported.`
                          : 'No media selected means the whole selected folder will be imported.'}
                      </p>
                    ) : null}
                    <button className={buttonStyles} disabled={importDisabled}>
                      {importingDrive ? 'Importing...' : 'Import Folder'}
                    </button>
                  </form>

                  {importingDrive && importProgress ? (
                    <GalleryBatchProgressCard
                      progress={importProgress}
                      heading="Google Drive import in progress"
                      currentItemFallback="Importing Google Drive folder"
                      currentItemTitle={importProgress.currentFileName || 'Importing Google Drive folder'}
                      itemUnit="item"
                      uploadedLabel="Imported"
                      skippedLabel="Skipped"
                      failedLabel="Failed"
                      className="mt-4"
                    />
                  ) : null}

                  {importSummary ? (
                    <div className="mt-4 space-y-3">
                      <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/40">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Last import summary</p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          Google Drive imports use the same result breakdown as direct uploads, including duplicate tracking.
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
                </div>
              </div>
            </GalleryPanelCard>

            <GalleryPanelCard title="Duplicate handling" description="Google Drive imports skip duplicates automatically before new records are created.">
   
            </GalleryPanelCard>
          </div>
        ) : (
          <GalleryPanelCard title="Select an album" description="Choose a destination album before importing media.">
            <p className="text-sm text-slate-500 dark:text-slate-400">Import tools stay hidden until a destination album is selected.</p>
          </GalleryPanelCard>
        )}
      </div>

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
  );
}
