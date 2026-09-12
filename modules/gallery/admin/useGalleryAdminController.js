'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  areIdListsEqual,
  getPhotoSortTime,
} from '@/app/admin/gallery/utils';
import { createEmptyAlbumForm, fetchJson, normalizeAlbumForm } from './galleryAdminShared';
import {
  createEmptyUploadSummary,
  getUploadSummaryToast,
  uploadAlbumFiles,
} from './galleryUploadBatch';
import {
  chunkArray,
  DRIVE_IMPORT_CHUNK_SIZE,
  importDriveChunk,
  resolveDriveImportFileIds,
} from './galleryDriveImportBatch';
import {
  readCachedAlbumPhotos,
  warmAlbumMediaCache,
  writeCachedAlbumPhotos,
} from './galleryPhotosCache';

const galleryAdminSelectedAlbumStorageKey = 'galleryAdminSelectedAlbumId';

const readStoredAlbumId = () => {
  if (typeof window === 'undefined') return null;

  const storedValue = window.localStorage.getItem(galleryAdminSelectedAlbumStorageKey);
  const parsedValue = Number.parseInt(storedValue ?? '', 10);
  return Number.isFinite(parsedValue) ? parsedValue : null;
};

const persistSelectedAlbumId = (albumId) => {
  if (typeof window === 'undefined') return;

  if (albumId) {
    window.localStorage.setItem(galleryAdminSelectedAlbumStorageKey, String(albumId));
    return;
  }

  window.localStorage.removeItem(galleryAdminSelectedAlbumStorageKey);
};

export function useGalleryAdminController() {
  const [albums, setAlbums] = useState([]);
  const [selectedAlbumId, setSelectedAlbumId] = useState(null);
  const [selectionStorageReady, setSelectionStorageReady] = useState(false);
  const [photos, setPhotos] = useState([]);
  const previousPhotoIdsRef = useRef([]);
  const preserveSelectionOnNextPhotoSyncRef = useRef(false);
  const photosRef = useRef([]);
  const loadedAlbumIdRef = useRef(null);
  const arrangeLeaveGuardRef = useRef(null);
  photosRef.current = photos;

  const [loadingAlbums, setLoadingAlbums] = useState(true);
  const [loadingPhotos, setLoadingPhotos] = useState(false);

  const [sortMode, setSortMode] = useState('custom');

  const [albumForm, setAlbumForm] = useState(() => createEmptyAlbumForm());
  const [savingAlbum, setSavingAlbum] = useState(false);

  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [uploadSummary, setUploadSummary] = useState(null);

  const [detailsForm, setDetailsForm] = useState({
    name: '',
    slug: '',
    description: '',
    isPublished: true,
    shareLinkEnabled: false,
    profileLinks: [],
  });
  const [detailsDirty, setDetailsDirty] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);

  const [arrangePhotos, setArrangePhotos] = useState([]);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState([]);
  const [selectionAnchorId, setSelectionAnchorId] = useState(null);
  const [orderDirty, setOrderDirty] = useState(false);
  const [orderSaving, setOrderSaving] = useState(false);
  const [movingPhotos, setMovingPhotos] = useState(false);
  const [orderHistory, setOrderHistory] = useState([]);
  const [dragSnapshotTaken, setDragSnapshotTaken] = useState(false);
  const [arrangeDragState, setArrangeDragState] = useState({ isDragging: false, draggingCount: 0 });
  const [moveTargetAlbumId, setMoveTargetAlbumId] = useState(null);

  const [driveForm, setDriveForm] = useState({
    folderId: '',
    folderName: '',
    breadcrumbs: [],
    mediaCount: null,
    selectedFileIds: [],
    mediaTypeFilter: 'all',
  });
  const [importingDrive, setImportingDrive] = useState(false);
  const [importProgress, setImportProgress] = useState(null);
  const [importSummary, setImportSummary] = useState(null);
  const driveImportAbortControllerRef = useRef(null);
  const uploadAbortControllerRef = useRef(null);

  const selectedAlbum = useMemo(
    () => albums.find((album) => album.id === selectedAlbumId) ?? null,
    [albums, selectedAlbumId],
  );

  const saveState = useMemo(() => {
    if (savingAlbum || uploadingFiles || importingDrive || savingDetails || orderSaving || movingPhotos) {
      return {
        label: 'Saving...',
        tone: 'text-amber-700 bg-amber-100 dark:bg-amber-950/30 dark:text-amber-300',
      };
    }

    if (detailsDirty || orderDirty) {
      return {
        label: 'Unsaved changes',
        tone: 'text-orange-700 bg-orange-100 dark:bg-orange-950/30 dark:text-orange-300',
      };
    }

    return {
      label: 'All changes saved',
      tone: 'text-emerald-700 bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300',
    };
  }, [detailsDirty, importingDrive, movingPhotos, orderDirty, orderSaving, savingAlbum, savingDetails, uploadingFiles]);

  const loadAlbums = async () => {
    setLoadingAlbums(true);
    try {
      const data = await fetchJson('/api/gallery/albums');
      const nextAlbums = Array.isArray(data) ? data : [];
      setAlbums(nextAlbums);
      setSelectedAlbumId((previousId) => {
        const storedAlbumId = readStoredAlbumId();

        if (previousId && nextAlbums.some((album) => album.id === previousId)) {
          return previousId;
        }

        if (storedAlbumId && nextAlbums.some((album) => album.id === storedAlbumId)) {
          return storedAlbumId;
        }

        const latestActivityAlbum = [...nextAlbums].sort((left, right) => {
          const leftTime = new Date(left?.activityAt ?? left?.updatedAt ?? left?.createdAt ?? 0).getTime();
          const rightTime = new Date(right?.activityAt ?? right?.updatedAt ?? right?.createdAt ?? 0).getTime();
          return rightTime - leftTime;
        })[0];

        return latestActivityAlbum?.id ?? null;
      });
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoadingAlbums(false);
    }
  };

  const loadPhotos = async (albumId, nextSort = sortMode) => {
    if (!albumId) {
      setPhotos([]);
      return;
    }

    const sortKey = nextSort || 'custom';
    const isSameAlbumRefresh = loadedAlbumIdRef.current === albumId && photosRef.current.length > 0;

    // Instant paint from device cache, then revalidate in the background.
    if (!isSameAlbumRefresh) {
      const cachedPhotos = await readCachedAlbumPhotos(albumId, sortKey);
      if (Array.isArray(cachedPhotos) && cachedPhotos.length > 0) {
        setPhotos(cachedPhotos);
        loadedAlbumIdRef.current = albumId;
        setLoadingPhotos(false);
        void warmAlbumMediaCache(cachedPhotos);
      } else {
        setLoadingPhotos(true);
      }
    }

    try {
      const data = await fetchJson(`/api/gallery/albums/${albumId}/photos?sort=${sortKey}`);
      const nextPhotos = Array.isArray(data?.photos) ? data.photos : [];
      setPhotos(nextPhotos);
      loadedAlbumIdRef.current = albumId;
      void writeCachedAlbumPhotos(albumId, sortKey, nextPhotos);
      void warmAlbumMediaCache(nextPhotos);
    } catch (error) {
      if (photosRef.current.length === 0 || loadedAlbumIdRef.current !== albumId) {
        toast.error(error.message);
      }
    } finally {
      setLoadingPhotos(false);
    }
  };

  useEffect(() => {
    void (async () => {
      await loadAlbums();
      setSelectionStorageReady(true);
    })();
  }, []);

  useEffect(() => {
    if (!selectionStorageReady) return;
    persistSelectedAlbumId(selectedAlbumId);
  }, [selectedAlbumId, selectionStorageReady]);

  useEffect(() => {
    if (loadingAlbums) {
      return;
    }

    if (selectedAlbumId) {
      if (!albums.some((album) => album.id === selectedAlbumId)) {
        setPhotos([]);
        return;
      }

      loadPhotos(selectedAlbumId, sortMode);
      return;
    }

    setPhotos([]);
  }, [albums, loadingAlbums, selectedAlbumId, sortMode]);

  useEffect(() => {
    setUploadProgress(null);
    setUploadSummary(null);
    setImportProgress(null);
    setImportSummary(null);
  }, [selectedAlbumId]);

  useEffect(() => {
    const availableTargets = albums.filter((album) => album.id !== selectedAlbumId);
    setMoveTargetAlbumId((currentTargetId) => {
      if (currentTargetId && availableTargets.some((album) => album.id === currentTargetId)) {
        return currentTargetId;
      }

      return availableTargets[0]?.id ?? null;
    });
  }, [albums, selectedAlbumId]);

  useEffect(() => {
    if (!selectedAlbum) {
      setDetailsForm({
        name: '',
        slug: '',
        description: '',
        isPublished: true,
        shareLinkEnabled: false,
        profileLinks: [],
      });
      setDetailsDirty(false);
      return;
    }

    setDetailsForm({
      name: selectedAlbum.name ?? '',
      slug: selectedAlbum.slug ?? '',
      description: selectedAlbum.description ?? '',
      isPublished: Boolean(selectedAlbum.isPublished),
      shareLinkEnabled: Boolean(selectedAlbum.shareLinkEnabled),
      profileLinks: Array.isArray(selectedAlbum.profileLinks) ? selectedAlbum.profileLinks : [],
    });
    setDetailsDirty(false);
  }, [selectedAlbum]);

  useEffect(() => {
    const previousIds = Array.isArray(previousPhotoIdsRef.current) ? previousPhotoIdsRef.current : [];
    const nextIds = Array.isArray(photos) ? photos.map((photo) => photo?.id).filter(Boolean) : [];
    const idsUnchanged = areIdListsEqual(nextIds, previousIds);

    previousPhotoIdsRef.current = nextIds;
    setArrangePhotos(photos);

    if (!idsUnchanged) {
      if (preserveSelectionOnNextPhotoSyncRef.current) {
        preserveSelectionOnNextPhotoSyncRef.current = false;
        setOrderDirty(false);
        setOrderHistory([]);
        setDragSnapshotTaken(false);
        setArrangeDragState({ isDragging: false, draggingCount: 0 });
        return;
      }

      setSelectedPhotoIds([]);
      setSelectionAnchorId(null);
      setOrderDirty(false);
      setOrderHistory([]);
      setDragSnapshotTaken(false);
      setArrangeDragState({ isDragging: false, draggingCount: 0 });
    }
  }, [photos]);

  const updatePhotoInState = (updatedPhoto) => {
    if (!updatedPhoto || !updatedPhoto.id) return;

    setPhotos((current) =>
      current.map((photo) => (photo.id === updatedPhoto.id ? { ...photo, ...updatedPhoto } : photo)),
    );
  };

  const updateSelectedAlbumPhotoCount = (delta) => {
    if (!selectedAlbumId || !Number.isFinite(delta) || delta === 0) return;

    setAlbums((current) =>
      current.map((album) => {
        if (album.id !== selectedAlbumId) {
          return album;
        }

        const currentCount = typeof album?._count?.photos === 'number' ? album._count.photos : null;
        if (currentCount === null) {
          return album;
        }

        return {
          ...album,
          _count: {
            ...album._count,
            photos: Math.max(0, currentCount + delta),
          },
          activityAt: new Date().toISOString(),
        };
      }),
    );
  };

  const addPhotoToState = (photo) => {
    if (!photo || !photo.id) return;

    setPhotos((current) => {
      if (current.some((item) => item.id === photo.id)) {
        return current.map((item) => (item.id === photo.id ? { ...item, ...photo } : item));
      }

      return [photo, ...current];
    });
    updateSelectedAlbumPhotoCount(1);
  };

  const removePhotosFromState = (photoIds) => {
    const ids = new Set((Array.isArray(photoIds) ? photoIds : [photoIds]).filter(Boolean));
    if (ids.size === 0) return;

    preserveSelectionOnNextPhotoSyncRef.current = true;
    setPhotos((current) => current.filter((photo) => !ids.has(photo.id)));
    setSelectedPhotoIds((current) => current.filter((photoId) => !ids.has(photoId)));
    setSelectionAnchorId((current) => (ids.has(current) ? null : current));
    updateSelectedAlbumPhotoCount(-ids.size);
  };

  const selectedAlbumMediaCount = selectedAlbum?._count?.photos ?? photos.length;

  const markOrderDirtyFromItems = (items) => {
    const nextIds = items.map((item) => item.id);
    const baseIds = photos.map((item) => item.id);
    setOrderDirty(!areIdListsEqual(nextIds, baseIds));
  };

  const pushOrderHistory = (snapshot) => {
    setOrderHistory((previous) => [snapshot, ...previous].slice(0, 30));
  };

  const createAlbumRecord = async (albumData) => {
    setSavingAlbum(true);

    try {
      const created = await fetchJson('/api/gallery/albums', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(normalizeAlbumForm(albumData)),
      });

      toast.success('Album created');
      return created;
    } catch (error) {
      toast.error(error.message);
      return null;
    } finally {
      setSavingAlbum(false);
    }
  };

  const createAlbum = async (event) => {
    event.preventDefault();

    const created = await createAlbumRecord(albumForm);
    if (!created) {
      return;
    }

    setAlbumForm(createEmptyAlbumForm());
    await loadAlbums();
    selectAlbum(created.id);
  };

  const deleteAlbum = async (albumId = selectedAlbumId, options = {}) => {
    if (!albumId) return;
    const { skipConfirm = false } = options;

    if (!skipConfirm) {
      const confirmed = window.confirm('Delete this album and all photos? This cannot be undone.');
      if (!confirmed) return;
    }

    try {
      await fetchJson(`/api/gallery/albums/${albumId}`, { method: 'DELETE' });
      toast.success('Album deleted');
      if (albumId === selectedAlbumId) {
        selectAlbum(null);
        setPhotos([]);
      }
      await loadAlbums();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const saveAlbumDetails = async (event) => {
    event.preventDefault();
    if (!selectedAlbumId) return;

    const normalizeProfileLinks = (links) => {
      if (!Array.isArray(links)) return [];

      return links
        .map((entry) => ({
          platform: String(entry?.platform ?? '').trim() || 'other',
          url: String(entry?.url ?? '').trim(),
        }))
        .filter((entry) => entry.url.length > 0);
    };

    const isValidHttpUrl = (value) => {
      if (typeof value !== 'string') return false;
      const trimmed = value.trim();
      if (!/^https?:\/\//i.test(trimmed)) return false;

      try {
        // eslint-disable-next-line no-new
        new URL(trimmed);
        return true;
      } catch {
        return false;
      }
    };

    const normalizedProfileLinks = normalizeProfileLinks(detailsForm.profileLinks);
    if (normalizedProfileLinks.some((entry) => !isValidHttpUrl(entry.url))) {
      toast.error('Each profile link must be a valid http/https URL (or remove the row).');
      return;
    }

    if (normalizedProfileLinks.length > 12) {
      toast.error('Only 12 profile links are allowed per album.');
      return;
    }

    setSavingDetails(true);
    try {
      const payload = {
        ...detailsForm,
        profileLinks: normalizedProfileLinks,
      };
      const updated = await fetchJson(`/api/gallery/albums/${selectedAlbumId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      setAlbums((previous) =>
        previous.map((album) => (album.id === selectedAlbumId ? { ...album, ...updated } : album)),
      );
      setDetailsDirty(false);
      toast.success('Album details saved');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSavingDetails(false);
    }
  };

  const uploadFiles = async (files) => {
    const nextFiles = Array.from(files || []);
    if (!selectedAlbumId || nextFiles.length === 0) return;

    setUploadingFiles(true);
    setUploadSummary(createEmptyUploadSummary());
    uploadAbortControllerRef.current = new AbortController();

    try {
      const summary = await uploadAlbumFiles({
        albumId: selectedAlbumId,
        files: nextFiles,
        onProgressChange: setUploadProgress,
        signal: uploadAbortControllerRef.current.signal,
      });

      setUploadSummary(summary);

      const summaryMessage = getUploadSummaryToast(summary);
      if (summary.failedCount > 0 && summary.uploadedCount === 0) {
        toast.error(summaryMessage);
      } else if (summary.failedCount > 0 || summary.skippedCount > 0) {
        toast.message(summaryMessage);
      } else {
        toast.success(summaryMessage);
      }

      if (summary.uploadedCount > 0) {
        await Promise.all([loadPhotos(selectedAlbumId, sortMode), loadAlbums()]);
      } else {
        await loadAlbums();
      }
    } catch (error) {
      if (error?.name === 'AbortError') {
        toast.message('Upload cancelled.');
        setUploadProgress(null);
        setUploadSummary(createEmptyUploadSummary());
      } else {
        toast.error(error.message);
      }
    } finally {
      uploadAbortControllerRef.current = null;
      setUploadingFiles(false);
    }
  };

  const bulkUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    await uploadFiles(files);
    event.target.value = '';
  };

  const deletePhoto = async (photoId) => {
    if (!selectedAlbumId) return;

    try {
      await fetchJson(`/api/gallery/albums/${selectedAlbumId}/photos/${photoId}`, { method: 'DELETE' });
      removePhotosFromState([photoId]);
      toast.success('Media removed');
    } catch (error) {
      toast.error(error.message);
    }
  };

  const deleteSelectedPhotos = async (options = {}) => {
    const photoIds = [...selectedPhotoIds];
    if (!selectedAlbumId || photoIds.length === 0) return;
    const { skipConfirm = false } = options;

    if (!skipConfirm) {
      const confirmed = window.confirm(
        `Delete ${photoIds.length} selected media item${photoIds.length === 1 ? '' : 's'}? This cannot be undone.`,
      );
      if (!confirmed) return;
    }

    try {
      for (const photoId of photoIds) {
        await fetchJson(`/api/gallery/albums/${selectedAlbumId}/photos/${photoId}`, { method: 'DELETE' });
      }

      removePhotosFromState(photoIds);
      toast.success(`${photoIds.length} media item${photoIds.length === 1 ? '' : 's'} deleted`);
    } catch (error) {
      toast.error(error.message);
    }
  };

  const moveSelectedPhotos = async (targetAlbumId = moveTargetAlbumId) => {
    if (!selectedAlbumId || !targetAlbumId || selectedPhotoIds.length === 0) {
      return;
    }

    if (targetAlbumId === selectedAlbumId) {
      toast.error('Choose a different target album.');
      return;
    }

    const orderedSelectedPhotos = arrangePhotos.filter((photo) => selectedPhotoIds.includes(photo.id));
    if (orderedSelectedPhotos.length === 0) {
      toast.error('Select at least one media item first.');
      return;
    }

    setMovingPhotos(true);

    try {
      const result = await fetchJson(`/api/gallery/albums/${selectedAlbumId}/photos/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetAlbumId,
          photoIds: orderedSelectedPhotos.map((photo) => photo.id),
        }),
      });

      const targetAlbumName = albums.find((album) => album.id === targetAlbumId)?.name ?? 'the target album';
      const summaryMessage = (() => {
        const movedCount = Number(result?.movedCount) || 0;
        const skippedCount = Number(result?.skippedCount) || 0;
        const failedCount = Number(result?.failedCount) || 0;
        const parts = [];

        if (movedCount > 0) {
          parts.push(`${movedCount} moved to ${targetAlbumName}`);
        }

        if (skippedCount > 0) {
          parts.push(`${skippedCount} duplicate${skippedCount === 1 ? '' : 's'} skipped`);
        }

        if (failedCount > 0) {
          parts.push(`${failedCount} failed`);
        }

        return parts.length > 0 ? parts.join(' · ') : `No media were moved to ${targetAlbumName}.`;
      })();

      clearPhotoSelection();
      if ((Number(result?.failedCount) || 0) > 0 && (Number(result?.movedCount) || 0) === 0) {
        toast.error(summaryMessage);
      } else if ((Number(result?.failedCount) || 0) > 0 || (Number(result?.skippedCount) || 0) > 0) {
        toast.message(summaryMessage);
      } else {
        toast.success(summaryMessage);
      }

      await Promise.all([loadPhotos(selectedAlbumId, sortMode), loadAlbums()]);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setMovingPhotos(false);
    }
  };

  const setCoverPhoto = async (photoId) => {
    if (!selectedAlbumId) return;

    try {
      const updated = await fetchJson(`/api/gallery/albums/${selectedAlbumId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coverPhotoId: photoId }),
      });

      setAlbums((previous) =>
        previous.map((album) => (album.id === selectedAlbumId ? { ...album, ...updated } : album)),
      );
      toast.success('Cover photo updated');
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleDriveImport = async (event) => {
    event.preventDefault();

    if (!selectedAlbumId) {
      toast.error('Select an album first.');
      return;
    }

    if (!driveForm.folderId?.trim()) {
      toast.error('Select a Google Drive folder first.');
      return;
    }

    setImportingDrive(true);
    const expectedTotal = typeof driveForm.mediaCount === 'number' ? Math.max(0, driveForm.mediaCount) : 0;
    const selectedCount = Array.isArray(driveForm.selectedFileIds) ? driveForm.selectedFileIds.length : 0;
    const resolvedExpectedTotal = selectedCount > 0 ? selectedCount : expectedTotal;
    const importTargetName =
      driveForm.folderName?.trim() || driveForm.folderId?.trim() || 'Google Drive folder';
    setImportProgress({
      percent: 2,
      currentFileName: 'Preparing Drive import…',
      currentFileIndex: 0,
      totalFiles: resolvedExpectedTotal,
      uploadedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      lastResult: null,
    });
    setImportSummary(null);
    driveImportAbortControllerRef.current = new AbortController();
    const signal = driveImportAbortControllerRef.current.signal;

    try {
      const fileIds = await resolveDriveImportFileIds({
        albumId: selectedAlbumId,
        folderId: driveForm.folderId,
        selectedFileIds: selectedCount > 0 ? driveForm.selectedFileIds : [],
        mediaTypeFilter: driveForm.mediaTypeFilter || 'all',
        signal,
      });

      if (fileIds.length === 0) {
        throw new Error('No media found in the selected Google Drive folder.');
      }

      const chunks = chunkArray(fileIds, DRIVE_IMPORT_CHUNK_SIZE);
      const overallTotal = fileIds.length;
      let checkedOffset = 0;
      let importedTotal = 0;
      let skippedTotal = 0;
      const skippedItems = [];

      setImportProgress({
        percent: 3,
        currentFileName: importTargetName,
        currentFileIndex: 0,
        totalFiles: overallTotal,
        uploadedCount: 0,
        skippedCount: 0,
        failedCount: 0,
        lastResult: null,
      });

      for (const chunkIds of chunks) {
        if (signal.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }

        const chunkResult = await importDriveChunk({
          albumId: selectedAlbumId,
          folderId: driveForm.folderId,
          selectedFileIds: chunkIds,
          mediaTypeFilter: driveForm.mediaTypeFilter || 'all',
          signal,
          onProgress: (progressPayload = {}) => {
            const chunkChecked = Number(progressPayload.checkedCount) || 0;
            const chunkImported = Number(progressPayload.importedCount) || 0;
            const chunkDuplicates = Number(progressPayload.duplicateCount) || 0;
            const checkedCount = checkedOffset + chunkChecked;
            const percent = Math.min(99, Math.round((checkedCount / Math.max(overallTotal, 1)) * 100));

            setImportProgress({
              percent,
              currentFileName: progressPayload.currentFileName || importTargetName,
              currentFileIndex: checkedCount,
              totalFiles: overallTotal,
              uploadedCount: importedTotal + chunkImported,
              skippedCount: skippedTotal + chunkDuplicates,
              failedCount: 0,
              lastResult: null,
            });
          },
        });

        const chunkImported = Number(chunkResult.importedCount) || 0;
        const chunkSkipped = Number(chunkResult.skippedCount) || 0;
        const chunkSkippedItems = Array.isArray(chunkResult.skipped) ? chunkResult.skipped : [];
        importedTotal += chunkImported;
        skippedTotal += chunkSkipped;
        skippedItems.push(...chunkSkippedItems);
        checkedOffset += chunkIds.length;
      }

      const totalItems = Math.max(importedTotal + skippedTotal, overallTotal);

      setImportProgress({
        percent: 100,
        currentFileName: importTargetName,
        currentFileIndex: totalItems,
        totalFiles: totalItems,
        uploadedCount: importedTotal,
        skippedCount: skippedTotal,
        failedCount: 0,
        lastResult:
          skippedItems.length > 0
            ? {
                fileName:
                  skippedItems[skippedItems.length - 1]?.caption ||
                  skippedItems[skippedItems.length - 1]?.sourceId ||
                  'Drive item',
                reason: skippedItems[skippedItems.length - 1]?.reason || 'Already imported into this album.',
              }
            : null,
      });

      setImportSummary({
        totalFiles: totalItems,
        uploadedCount: importedTotal,
        skippedCount: skippedTotal,
        failedCount: 0,
        results: skippedItems.map((item, index) => ({
          fileName: item.caption || item.sourceId || `Drive item ${index + 1}`,
          status: 'duplicate-skipped',
          reason: item.reason || 'Already imported into this album.',
        })),
      });
      toast.success(
        skippedTotal > 0
          ? `Imported ${importedTotal} item(s) and skipped ${skippedTotal} duplicate(s)`
          : `Imported ${importedTotal} photo(s) from Google Drive`,
      );

      await loadPhotos(selectedAlbumId, sortMode);
      await loadAlbums();
    } catch (error) {
      if (error?.name === 'AbortError') {
        toast.message('Google Drive import cancelled.');
      } else {
        toast.error(error.message);
      }
      setImportProgress(null);
    } finally {
      driveImportAbortControllerRef.current = null;
      setImportingDrive(false);
      window.setTimeout(() => {
        setImportProgress((current) => (current?.percent === 100 ? null : current));
      }, 1200);
    }
  };

  const cancelDriveImport = () => {
    if (!importingDrive) {
      return;
    }

    driveImportAbortControllerRef.current?.abort();
    setImportingDrive(false);
    setImportProgress(null);
  };

  const cancelUpload = () => {
    if (!uploadingFiles) {
      return;
    }

    uploadAbortControllerRef.current?.abort();
    setUploadingFiles(false);
    setUploadProgress(null);
  };

  const reorderChange = (nextItems) => {
    setArrangePhotos(nextItems);
    markOrderDirtyFromItems(nextItems);
  };

  const arrangeAction = (nextItems) => {
    if (areIdListsEqual(nextItems.map((item) => item.id), arrangePhotos.map((item) => item.id))) {
      return;
    }

    pushOrderHistory(arrangePhotos);
    setArrangePhotos(nextItems);
    markOrderDirtyFromItems(nextItems);
  };

  const togglePhotoSelect = (photoId, options = {}) => {
    const shiftKey = Boolean(options.shiftKey);
    const orderedIds = arrangePhotos.map((photo) => photo.id);

    setSelectedPhotoIds((previous) => {
      if (shiftKey && selectionAnchorId && orderedIds.includes(selectionAnchorId) && orderedIds.includes(photoId)) {
        const start = orderedIds.indexOf(selectionAnchorId);
        const end = orderedIds.indexOf(photoId);
        const [minIndex, maxIndex] = start < end ? [start, end] : [end, start];
        const rangeIds = orderedIds.slice(minIndex, maxIndex + 1);
        return Array.from(new Set([...previous, ...rangeIds]));
      }

      if (previous.includes(photoId)) {
        return previous.filter((id) => id !== photoId);
      }
      return [...previous, photoId];
    });

    setSelectionAnchorId(photoId);
  };

  const selectPhotoRange = (
    photoId,
    orderedIds = arrangePhotos.map((photo) => photo.id),
    options = {},
  ) => {
    if (!photoId || !Array.isArray(orderedIds) || orderedIds.length === 0) {
      return;
    }

    const { resetAnchor = false } = options;

    setSelectedPhotoIds((previous) => {
      const anchorId =
        !resetAnchor && selectionAnchorId && orderedIds.includes(selectionAnchorId)
          ? selectionAnchorId
          : photoId;
      const start = orderedIds.indexOf(anchorId);
      const end = orderedIds.indexOf(photoId);

      if (start === -1 || end === -1) {
        return previous.includes(photoId) ? previous : [...previous, photoId];
      }

      const [minIndex, maxIndex] = start < end ? [start, end] : [end, start];
      const rangeIds = orderedIds.slice(minIndex, maxIndex + 1);
      return Array.from(new Set([...previous, ...rangeIds]));
    });

    setSelectionAnchorId(
      resetAnchor || !selectionAnchorId || !orderedIds.includes(selectionAnchorId)
        ? photoId
        : selectionAnchorId,
    );
  };

  const clearPhotoSelection = () => {
    setSelectedPhotoIds([]);
    setSelectionAnchorId(null);
  };

  const moveSelection = (direction) => {
    if (selectedPhotoIds.length === 0) {
      toast.error('Select at least one media item first.');
      return;
    }

    const selectedSet = new Set(selectedPhotoIds);
    const selected = arrangePhotos.filter((photo) => selectedSet.has(photo.id));
    const rest = arrangePhotos.filter((photo) => !selectedSet.has(photo.id));

    const next = direction === 'top' ? [...selected, ...rest] : [...rest, ...selected];
    arrangeAction(next);
  };

  const undoOrder = () => {
    if (orderHistory.length === 0) {
      toast.error('Nothing to undo yet.');
      return;
    }

    const [last, ...rest] = orderHistory;
    setOrderHistory(rest);
    setArrangePhotos(last);
    markOrderDirtyFromItems(last);
  };

  const discardUnsavedOrder = async () => {
    if (!selectedAlbumId) {
      setOrderDirty(false);
      setOrderHistory([]);
      setDragSnapshotTaken(false);
      return;
    }

    await loadPhotos(selectedAlbumId, 'custom');
    setOrderDirty(false);
    setOrderHistory([]);
    setDragSnapshotTaken(false);
  };

  const saveOrder = async () => {
    if (!selectedAlbumId) return false;
    if (!orderDirty) {
      toast.message('Order is already saved.');
      return true;
    }

    setOrderSaving(true);
    try {
      await fetchJson(`/api/gallery/albums/${selectedAlbumId}/photos/reorder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoIds: arrangePhotos.map((photo) => photo.id) }),
      });

      toast.success('Order saved');
      setPhotos(arrangePhotos);
      setSortMode('custom');
      setOrderDirty(false);
      setOrderHistory([]);
      void writeCachedAlbumPhotos(selectedAlbumId, 'custom', arrangePhotos);
      return true;
    } catch (error) {
      toast.error(error.message);
      await loadPhotos(selectedAlbumId, 'custom');
      return false;
    } finally {
      setOrderSaving(false);
    }
  };

  const handleDragStateChange = (dragState) => {
    const isDragging = Boolean(dragState?.isDragging);
    const draggingCount = Number(dragState?.draggingCount) || 0;

    setArrangeDragState({ isDragging, draggingCount });

    if (isDragging && !dragSnapshotTaken) {
      pushOrderHistory(arrangePhotos);
      setDragSnapshotTaken(true);
    }

    if (!isDragging) {
      setDragSnapshotTaken(false);
    }
  };

  const selectAlbum = (albumId) => {
    persistSelectedAlbumId(albumId);
    setSelectedAlbumId(albumId);
  };

  const registerArrangeLeaveGuard = (guard) => {
    arrangeLeaveGuardRef.current = typeof guard === 'function' ? guard : null;
  };

  const requestArrangeLeave = (action) => {
    if (typeof action !== 'function') return;

    if (orderDirty && typeof arrangeLeaveGuardRef.current === 'function') {
      arrangeLeaveGuardRef.current(action);
      return;
    }

    action();
  };

  const activeAlbumMediaLabel = selectedAlbum
    ? `${selectedAlbumMediaCount} media item${selectedAlbumMediaCount === 1 ? '' : 's'}`
    : 'No album selected';

  return {
    albums,
    selectedAlbumId,
    selectedAlbum,
    photos,
    loadingAlbums,
    loadingPhotos,
    sortMode,
    setSortMode,
    albumForm,
    setAlbumForm,
    savingAlbum,
    uploadingFiles,
    uploadProgress,
    uploadSummary,
    detailsForm,
    setDetailsForm,
    detailsDirty,
    setDetailsDirty,
    savingDetails,
    arrangePhotos,
    selectedPhotoIds,
    setSelectedPhotoIds,
    orderDirty,
    orderSaving,
    movingPhotos,
    arrangeDragState,
    moveTargetAlbumId,
    setMoveTargetAlbumId,
    driveForm,
    setDriveForm,
    importingDrive,
    importProgress,
    importSummary,
    saveState,
    selectedAlbumMediaCount,
    activeAlbumMediaLabel,
    setSelectedAlbumId: selectAlbum,
    loadAlbums,
    loadPhotos,
    updatePhotoInState,
    addPhotoToState,
    removePhotosFromState,
    createAlbumRecord,
    createAlbum,
    deleteAlbum,
    saveAlbumDetails,
    uploadFiles,
    bulkUpload,
    deletePhoto,
    deleteSelectedPhotos,
    moveSelectedPhotos,
    setCoverPhoto,
    handleDriveImport,
    cancelDriveImport,
    cancelUpload,
    reorderChange,
    arrangeAction,
    togglePhotoSelect,
    clearPhotoSelection,
    moveSelection,
    selectPhotoRange,
    undoOrder,
    discardUnsavedOrder,
    saveOrder,
    registerArrangeLeaveGuard,
    requestArrangeLeave,
    handleDragStateChange,
    getPhotoSortTime,
  };
}
