'use client';

import { useEffect, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import GalleryBatchResultSummary from './GalleryBatchResultSummary';
import GalleryDriveFolderPicker from './GalleryDriveFolderPicker';
import DriveImportWorkflow from './DriveImportWorkflow';
import { getDriveImportActiveStep, getDriveImportWillLabel } from './DriveImportStepStrip';

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

  const browseDisabled =
    connectionBusy ||
    driveConnection.loading ||
    !driveConnection.featureEnabled ||
    !driveConnection.oauthConfigured ||
    !driveConnection.connected;

  const connectionLabel = !driveConnection.featureEnabled
    ? 'Disabled'
    : !driveConnection.oauthConfigured
      ? 'Setup required'
      : driveConnection.connected
        ? 'Connected'
        : 'Not connected';

  const folderPathPreview = Array.isArray(driveForm.breadcrumbs)
    ? driveForm.breadcrumbs.map((entry) => entry?.name).filter(Boolean).join(' / ')
    : '';
  const effectiveImportTotal = typeof driveForm.mediaCount === 'number' ? Math.max(0, driveForm.mediaCount) : null;
  const isConnected =
    driveConnection.connected && driveConnection.featureEnabled && driveConnection.oauthConfigured;
  const activeStep = getDriveImportActiveStep({
    connected: isConnected,
    importing: importingDrive,
  });
  const willImportLabel = getDriveImportWillLabel(driveForm.selectedFileIds);
  const albumLabel = selectedAlbum?.name ? `Import to ${selectedAlbum.name}` : 'Import to album';

  const onSelectFolder = (folder) => {
    setDriveForm((previous) => ({
      ...previous,
      folderId: folder.id,
      folderName: folder.name,
      breadcrumbs: Array.isArray(folder.breadcrumbs) ? folder.breadcrumbs : [],
      mediaCount: typeof folder.mediaCount === 'number' ? folder.mediaCount : null,
      selectedFileIds: Array.isArray(folder.selectedFileIds) ? folder.selectedFileIds : [],
      mediaTypeFilter: folder.mediaTypeFilter || previous.mediaTypeFilter || 'all',
    }));
  };

  const summaryBlock = importSummary ? (
    <div className="space-y-3">
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
  ) : null;

  const picker = (
    <GalleryDriveFolderPicker
      open={pickerOpen}
      onClose={() => setPickerOpen(false)}
      selectedFolderId={driveForm.folderId}
      selectedFileIds={driveForm.selectedFileIds}
      selectedMediaTypeFilter={driveForm.mediaTypeFilter}
      onSelectFolder={onSelectFolder}
    />
  );

  return (
    <div className="space-y-4">
      <DriveImportWorkflow
        activeStep={activeStep}
        connected={isConnected}
        connectionBusy={connectionBusy || driveConnection.loading}
        connectionLabel={connectionLabel}
        featureEnabled={driveConnection.featureEnabled}
        oauthConfigured={driveConnection.oauthConfigured}
        driveForm={driveForm}
        folderPathPreview={folderPathPreview}
        willImportLabel={willImportLabel}
        albumLabel={albumLabel}
        browseDisabled={browseDisabled}
        importDisabled={importDisabled}
        importingDrive={importingDrive}
        onConnect={handleConnectGoogleDrive}
        onDisconnect={handleDisconnectGoogleDrive}
        onBrowse={() => setPickerOpen(true)}
        onClear={clearDriveSelection}
        onImport={handleDriveImport}
        summary={summaryBlock}
      />
      {picker}
    </div>
  );
}
