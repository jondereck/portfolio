'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Images, Info, Trash2, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import ConfirmModal from '@/components/ConfirmModal';
import GalleryCreateAlbumModal from './GalleryCreateAlbumModal';
import GalleryDriveImportSection from './GalleryDriveImportSection';
import GalleryMediaViewer from './GalleryMediaViewer';
import GalleryUnclothyTasksPanel from './GalleryUnclothyTasksPanel';
import GalleryUploadDropzone from './GalleryUploadDropzone';
import GalleryBatchProgressModal from './GalleryBatchProgressModal';
import { fetchJson, GalleryEmptyState } from './galleryAdminShared';
import {
  GalleryAlbumMovePicker,
  GalleryAlbumsSidebar,
  GalleryAlbumSwitchSheet,
  GalleryCmsHeader,
  GalleryCmsModal,
  readGallerySidebarCollapsed,
  writeGallerySidebarCollapsed,
  GalleryCmsShell,
  GalleryInspectorPanel,
  GalleryMediaGrid,
  GalleryMediaGridSkeleton,
  GalleryMediaFilterModal,
  GalleryMediaToolbar,
  GalleryMobileTabs,
  GallerySelectionActionsPopup,
} from './cms';
import MediaPreview from '@/app/admin/gallery/components/MediaPreview';
import { useUnclothyTasksStore } from '@/store/unclothyTasks';
import { isPhotoAudio, shouldBlurPhoto } from '@/lib/gallery-media';

function isVideoMime(mimeType) {
  return typeof mimeType === 'string' && mimeType.toLowerCase().startsWith('video/');
}

function isAudioPhoto(photo) {
  return Boolean(photo) && isPhotoAudio(photo, photo?.imageUrl);
}

function getPhotoSearchText(photo) {
  return [photo?.caption, photo?.originalFilename, photo?.sourceId]
    .map((value) => (typeof value === 'string' ? value.toLowerCase() : ''))
    .filter(Boolean)
    .join(' ');
}

function normalizePhotoId(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }
  return value;
}

const GALLERY_MEDIA_FILTERS = ['all', 'images', 'videos', 'audio', 'nsfw'];
const GALLERY_MEDIA_SORTS = ['custom', 'dateDesc', 'dateAsc'];

function clampGalleryGridColumns(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 4;
  return Math.max(2, Math.min(8, Math.round(parsed)));
}

function readGalleryScroll() {
  if (typeof window === 'undefined') return { windowY: 0, mainTop: 0 };
  const main = document.querySelector('[data-gallery-scroll-main]');
  return {
    windowY: window.scrollY || window.pageYOffset || 0,
    mainTop: main?.scrollTop ?? 0,
  };
}

function applyGalleryScroll(snapshot) {
  if (!snapshot || typeof window === 'undefined') return;
  const apply = () => {
    window.scrollTo({ top: snapshot.windowY, left: 0, behavior: 'auto' });
    const main = document.querySelector('[data-gallery-scroll-main]');
    if (main) main.scrollTop = snapshot.mainTop;
  };
  apply();
  requestAnimationFrame(apply);
  window.setTimeout(apply, 50);
  window.setTimeout(apply, 180);
}

function createPendingPreviewTask(albumId, photoId, options = {}) {
  return {
    albumId,
    photoId,
    suppressNotFoundError: Boolean(options.suppressNotFoundError),
    waitForFreshLoad: Boolean(options.waitForFreshLoad),
    sawLoading: Boolean(options.sawLoading),
  };
}

export default function GalleryMediaPanel({ controller, embedded = false }) {
  const mediaGridColumnsStorageKey = 'gallery:mediaGridColumns:v1';
  const {
    albums,
    selectedAlbum,
    selectedAlbumId,
    photos,
    loadingAlbums,
    loadingPhotos,
    sortMode,
    setSortMode,
    uploadingFiles,
    uploadProgress,
    uploadSummary,
    importingDrive,
    importProgress,
    cancelDriveImport,
    cancelUpload,
    savingAlbum,
    uploadFiles,
    createAlbumRecord,
    loadAlbums,
    updatePhotoInState,
    deleteSelectedPhotos,
    moveSelectedPhotos,
    moveTargetAlbumId,
    setMoveTargetAlbumId,
    movingPhotos,
    selectedPhotoIds,
    togglePhotoSelect,
    selectPhotoRange,
    clearPhotoSelection,
    setSelectedAlbumId,
  } = controller;

  const selectedCount = selectedPhotoIds.length;
  const [previewPhoto, setPreviewPhoto] = useState(null);
  const [previewOpenGenerate, setPreviewOpenGenerate] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [savingBulkBlurMode, setSavingBulkBlurMode] = useState(false);
  const [createAlbumOpen, setCreateAlbumOpen] = useState(false);
  const [createMoveAlbumOpen, setCreateMoveAlbumOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [albumSwitchOpen, setAlbumSwitchOpen] = useState(false);
  const [movePickerOpen, setMovePickerOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('media');
  const [searchValue, setSearchValue] = useState('');
  const [activeChip, setActiveChip] = useState('all');
  const [isDesktop, setIsDesktop] = useState(false);
  const [detailsOpenDesktop, setDetailsOpenDesktop] = useState(false);
  const [pendingPreviewTask, setPendingPreviewTask] = useState(null);
  const [blurUnclothyGenerated, setBlurUnclothyGenerated] = useState(true);
  const [mediaPage, setMediaPage] = useState(1);
  const [mediaPageSize, setMediaPageSize] = useState(48);
  const [mediaGridColumns, setMediaGridColumns] = useState(4);
  const [manualSidebarCollapsed, setManualSidebarCollapsed] = useState(true);
  const mediaScrollRef = useRef({ windowY: 0, mainTop: 0 });
  const persistPreferencesTimerRef = useRef(null);
  const pendingPreferencesRef = useRef({});
  const previousTabRef = useRef('media');
  const settingsHydratedRef = useRef(false);

  const unclothyQueue = useUnclothyTasksStore((state) => state.queue);
  const unclothyActive = useUnclothyTasksStore((state) => state.active);
  const unclothyActiveTasks = useUnclothyTasksStore((state) => state.activeTasks);
  const unclothyFailedTasks = useUnclothyTasksStore((state) => state.failedTasks);
  const unclothyCompletedTasks = useUnclothyTasksStore((state) => state.completedTasks);
  const startUnclothyRunner = useUnclothyTasksStore((state) => state.startRunner);
  const clearUnclothyQueue = useUnclothyTasksStore((state) => state.clearQueue);
  const cancelUnclothyTask = useUnclothyTasksStore((state) => state.cancelTask);
  const retryUnclothyTask = useUnclothyTasksStore((state) => state.retryTask);
  const dismissUnclothyTask = useUnclothyTasksStore((state) => state.cancelTask);

  const hasTasks =
    Boolean(unclothyActive) ||
    (Array.isArray(unclothyActiveTasks) && unclothyActiveTasks.length > 0) ||
    (Array.isArray(unclothyFailedTasks) && unclothyFailedTasks.length > 0) ||
    (Array.isArray(unclothyQueue) && unclothyQueue.length > 0) ||
    (Array.isArray(unclothyCompletedTasks) && unclothyCompletedTasks.length > 0);

  const resetMediaViewToDefault = useCallback(() => {
    setActiveChip('manual');
    if (typeof setSortMode === 'function' && sortMode !== 'custom') {
      setSortMode('custom');
    }
  }, [setSortMode, sortMode]);

  const captureMediaScroll = useCallback(() => {
    mediaScrollRef.current = readGalleryScroll();
  }, []);

  const restoreMediaScroll = useCallback(() => {
    applyGalleryScroll(mediaScrollRef.current);
  }, []);

  const persistGalleryMediaPreferences = useCallback((nextFilter, nextSort, nextGridColumns) => {
    if (typeof window === 'undefined') return;

    if (GALLERY_MEDIA_FILTERS.includes(nextFilter)) {
      pendingPreferencesRef.current.galleryLastMediaFilter = nextFilter;
    }
    if (GALLERY_MEDIA_SORTS.includes(nextSort)) {
      pendingPreferencesRef.current.galleryLastMediaSort = nextSort;
    }
    if (nextGridColumns !== undefined && nextGridColumns !== null && Number.isFinite(Number(nextGridColumns))) {
      pendingPreferencesRef.current.galleryLastMediaGridColumns = clampGalleryGridColumns(nextGridColumns);
    }

    if (Object.keys(pendingPreferencesRef.current).length === 0) return;

    if (persistPreferencesTimerRef.current) {
      window.clearTimeout(persistPreferencesTimerRef.current);
    }

    persistPreferencesTimerRef.current = window.setTimeout(() => {
      const payload = pendingPreferencesRef.current;
      pendingPreferencesRef.current = {};
      if (Object.keys(payload).length === 0) return;

      void fetch('/api/gallery/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {});
    }, 400);
  }, []);

  const handleGridColumnsChange = useCallback((nextValue) => {
    const next = clampGalleryGridColumns(nextValue);
    setMediaGridColumns(next);
    persistGalleryMediaPreferences(undefined, undefined, next);
  }, [persistGalleryMediaPreferences]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mediaQuery = window.matchMedia('(min-width: 1024px)');
    const update = () => setIsDesktop(Boolean(mediaQuery.matches));
    update();
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', update);
      return () => mediaQuery.removeEventListener('change', update);
    }
    mediaQuery.addListener(update);
    return () => mediaQuery.removeListener(update);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const storedGridColumns = Number(window.localStorage.getItem(mediaGridColumnsStorageKey));
    if (Number.isFinite(storedGridColumns)) {
      setMediaGridColumns(Math.max(2, Math.min(8, storedGridColumns)));
    }

    const storedSidebarCollapsed = readGallerySidebarCollapsed(null);
    if (storedSidebarCollapsed !== null) {
      setManualSidebarCollapsed(storedSidebarCollapsed);
    }
  }, [mediaGridColumnsStorageKey]);

  useEffect(() => {
    startUnclothyRunner?.();
  }, [startUnclothyRunner]);

  useEffect(() => {
    writeGallerySidebarCollapsed(manualSidebarCollapsed);
  }, [manualSidebarCollapsed]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(mediaGridColumnsStorageKey, String(mediaGridColumns));
  }, [mediaGridColumns, mediaGridColumnsStorageKey]);

  const loadGallerySettings = useCallback(async () => {
    try {
      const payload = await fetchJson('/api/gallery/settings', { method: 'GET' });
      setBlurUnclothyGenerated(payload?.blurUnclothyGenerated !== false);

      if (settingsHydratedRef.current) return;
      settingsHydratedRef.current = true;

      const nextFilter = payload?.galleryLastMediaFilter;
      const nextSort = payload?.galleryLastMediaSort;
      const nextGridColumns = Number(payload?.galleryLastMediaGridColumns);

      if (Number.isFinite(nextGridColumns)) {
        setMediaGridColumns(clampGalleryGridColumns(nextGridColumns));
      }

      if (GALLERY_MEDIA_SORTS.includes(nextSort) && typeof setSortMode === 'function') {
        setSortMode(nextSort);
      }

      if (GALLERY_MEDIA_FILTERS.includes(nextFilter) && nextFilter !== 'all') {
        setActiveChip(nextFilter);
      } else if (nextSort === 'custom') {
        setActiveChip('manual');
      } else if (nextSort === 'dateDesc') {
        setActiveChip('recent');
      } else {
        setActiveChip('all');
      }
    } catch {
      setBlurUnclothyGenerated(true);
    }
  }, [setSortMode]);

  useEffect(() => {
    void loadGallerySettings();

    const onUpdated = () => {
      void loadGallerySettings();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('gallery:settings-updated', onUpdated);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('gallery:settings-updated', onUpdated);
      }
    };
  }, [loadGallerySettings]);

  useEffect(() => {
    return () => {
      if (persistPreferencesTimerRef.current && typeof window !== 'undefined') {
        window.clearTimeout(persistPreferencesTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const main = document.querySelector('[data-gallery-scroll-main]');
    const onScroll = () => {
      if (activeTab !== 'media') return;
      captureMediaScroll();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    main?.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      main?.removeEventListener('scroll', onScroll);
    };
  }, [activeTab, captureMediaScroll]);

  useEffect(() => {
    if (previousTabRef.current !== 'media' && activeTab === 'media') {
      restoreMediaScroll();
    }
    previousTabRef.current = activeTab;
  }, [activeTab, restoreMediaScroll]);

  useEffect(() => {
    if (loadingPhotos || activeTab !== 'media') return;
    restoreMediaScroll();
  }, [activeTab, loadingPhotos, restoreMediaScroll]);

  const dialogLocksScroll = confirmDeleteOpen || filterOpen || Boolean(previewPhoto);
  useEffect(() => {
    if (dialogLocksScroll) {
      captureMediaScroll();
      return undefined;
    }
    if (activeTab !== 'media') return undefined;
    restoreMediaScroll();
    return undefined;
  }, [activeTab, captureMediaScroll, dialogLocksScroll, restoreMediaScroll]);

  const chips = useMemo(() => {
    const list = Array.isArray(photos) ? photos : [];
    let images = 0;
    let videos = 0;
    let audio = 0;
    let nsfw = 0;
    for (const photo of list) {
      const video = isVideoMime(photo?.mimeType);
      const isAud = isAudioPhoto(photo);
      if (video) {
        videos += 1;
      } else if (isAud) {
        audio += 1;
      } else {
        images += 1;
      }
      if (!video && shouldBlurPhoto(photo, { blurEnabled: true })) {
        nsfw += 1;
      }
    }

    // Only show type/flag chips that actually have media; All/Recent/Manual stay.
    const next = [{ id: 'all', label: 'All' }];
    if (images > 0) next.push({ id: 'images', label: 'Images' });
    if (videos > 0) next.push({ id: 'videos', label: 'Videos' });
    if (audio > 0) next.push({ id: 'audio', label: 'Audio' });
    if (nsfw > 0) next.push({ id: 'nsfw', label: 'NSFW' });
    next.push({ id: 'recent', label: 'Recent' });
    next.push({ id: 'manual', label: 'Manual' });
    if (selectedCount > 0) next.push({ id: 'selected', label: `Selected (${selectedCount})` });
    return next;
  }, [photos, selectedCount]);

  useEffect(() => {
    // If the active chip got hidden (e.g. no media of that type left), fall back to All.
    if (loadingPhotos) return;
    if (!chips.some((chip) => chip.id === activeChip)) {
      setActiveChip('all');
    }
  }, [chips, activeChip, loadingPhotos]);

  const handleOpenPreview = useCallback(
    (photo) => {
      captureMediaScroll();
      setPreviewPhoto(photo);
      // Preview should not auto-open generation. Users explicitly open it from the Generate button.
      setPreviewOpenGenerate(false);
    },
    [captureMediaScroll],
  );

  const selectedPhoto =
    selectedPhotoIds.length === 1 ? photos.find((photo) => photo.id === selectedPhotoIds[0]) ?? null : null;
  const effectiveSidebarCollapsed = manualSidebarCollapsed || Boolean(selectedPhoto);
  const firstSelectedPhoto = useMemo(() => {
    const firstId = selectedPhotoIds[0];
    if (!firstId) return null;
    return photos.find((photo) => photo.id === firstId) ?? null;
  }, [photos, selectedPhotoIds]);

  const detailsBadge =
    (Array.isArray(unclothyActiveTasks) ? unclothyActiveTasks.length : unclothyActive ? 1 : 0) +
    (Array.isArray(unclothyFailedTasks) ? unclothyFailedTasks.length : 0) +
    (Array.isArray(unclothyQueue) ? unclothyQueue.length : 0);
  const hasPendingTaskDetails = detailsBadge > 0;
  const mobileTabs = useMemo(
    () => [
      { id: 'media', label: 'Media', icon: Images },
      { id: 'upload', label: 'Upload', icon: Upload },
      { id: 'details', label: 'Details', icon: Info, badge: detailsBadge },
    ],
    [detailsBadge],
  );

  const albumCountLabel = useMemo(() => {
    if (!selectedAlbum) return null;
    const count =
      typeof selectedAlbum?._count?.photos === 'number'
        ? selectedAlbum._count.photos
        : typeof selectedAlbum.photoCount === 'number'
          ? selectedAlbum.photoCount
          : typeof selectedAlbum.mediaCount === 'number'
            ? selectedAlbum.mediaCount
            : typeof selectedAlbum.count === 'number'
              ? selectedAlbum.count
              : null;
    return typeof count === 'number' ? `${count} items` : null;
  }, [selectedAlbum]);

  const moveTargetAlbumName = useMemo(() => {
    if (!moveTargetAlbumId) return null;
    const match = Array.isArray(albums) ? albums.find((album) => album.id === moveTargetAlbumId) : null;
    return match?.name ?? null;
  }, [albums, moveTargetAlbumId]);

  const filteredPhotos = useMemo(() => {
    const list = Array.isArray(photos) ? photos : [];
    const query = searchValue.trim().toLowerCase();

    let next = list;

    if (activeChip === 'images') {
      next = next.filter((photo) => !isVideoMime(photo.mimeType) && !isAudioPhoto(photo));
    } else if (activeChip === 'videos') {
      next = next.filter((photo) => isVideoMime(photo.mimeType));
    } else if (activeChip === 'audio') {
      next = next.filter((photo) => isAudioPhoto(photo));
    } else if (activeChip === 'nsfw') {
      next = next.filter((photo) => !isVideoMime(photo.mimeType) && shouldBlurPhoto(photo, { blurEnabled: true }));
    } else if (activeChip === 'selected') {
      const selectedSet = new Set(selectedPhotoIds);
      next = next.filter((photo) => selectedSet.has(photo.id));
    }

    if (query) {
      next = next.filter((photo) => getPhotoSearchText(photo).includes(query));
    }

    return next;
  }, [activeChip, photos, searchValue, selectedPhotoIds]);

  const handleChipChange = (chipId) => {
    setActiveChip(chipId);

    if (chipId === 'manual') {
      if (typeof setSortMode === 'function' && sortMode !== 'custom') {
        setSortMode('custom');
      }
      persistGalleryMediaPreferences('all', 'custom');
      return;
    }

    if (chipId === 'recent') {
      if (typeof setSortMode === 'function' && sortMode !== 'dateDesc') {
        setSortMode('dateDesc');
      }
      persistGalleryMediaPreferences('all', 'dateDesc');
      return;
    }

    if (chipId === 'selected') {
      return;
    }

    persistGalleryMediaPreferences(chipId, sortMode);
  };

  useEffect(() => {
    // Reset paging when changing the album/search/filter context.
    setMediaPage(1);
  }, [activeChip, searchValue, selectedAlbumId]);

  const mediaTotal = filteredPhotos.length;
  const mediaTotalPages = Math.max(1, Math.ceil(mediaTotal / mediaPageSize));

  useEffect(() => {
    // Clamp to available pages if the total shrinks.
    setMediaPage((current) => Math.min(Math.max(1, current), mediaTotalPages));
  }, [mediaTotalPages]);

  const mediaStartIndex = mediaTotal === 0 ? 0 : (mediaPage - 1) * mediaPageSize + 1;
  const mediaEndIndex = Math.min(mediaTotal, mediaPage * mediaPageSize);
  const pagedPhotos = filteredPhotos.slice((mediaPage - 1) * mediaPageSize, mediaPage * mediaPageSize);

  useEffect(() => {
    // Selecting media no longer auto-opens details (open it manually via the Details button).
    // When nothing is selected and no generation task is pending, collapse it.
    if (!isDesktop) return;
    if (!selectedPhoto && !hasPendingTaskDetails) {
      setDetailsOpenDesktop(false);
    }
  }, [hasPendingTaskDetails, isDesktop, selectedPhoto]);

  useEffect(() => {
    // Surface running/queued generation details in desktop view as soon as they appear.
    if (!isDesktop || !hasPendingTaskDetails) return;
    setDetailsOpenDesktop(true);
  }, [hasPendingTaskDetails, isDesktop]);

  const handleOpenUpload = () => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(min-width: 1024px)')?.matches) {
      setUploadOpen(true);
      return;
    }
    setActiveTab('upload');
  };

  const handleOpenImport = () => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(min-width: 1024px)')?.matches) {
      setImportOpen(true);
      return;
    }
    setActiveTab('upload');
  };

  const handleOpenFilter = () => {
    captureMediaScroll();
    setFilterOpen(true);
  };

  const handleBulkBlurModeChange = async (blurOverride) => {
    const photoIds = [...selectedPhotoIds];
    if (!selectedAlbumId || photoIds.length === 0) return;

    setSavingBulkBlurMode(true);
    try {
      const payload = await fetchJson(`/api/gallery/albums/${selectedAlbumId}/photos`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoIds, blurOverride }),
      });
      const updatedPhotos = Array.isArray(payload?.photos) ? payload.photos : [];
      updatedPhotos.forEach((photo) => updatePhotoInState(photo));
      toast.success(`Updated blur mode for ${updatedPhotos.length || photoIds.length} media item${photoIds.length === 1 ? '' : 's'}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update blur mode.');
    } finally {
      setSavingBulkBlurMode(false);
    }
  };

  const openTask = (task) => {
    const albumId = task?.albumId ?? null;
    const photoId = normalizePhotoId(task?.sourcePhotoId ?? null);
    const suppressNotFoundError = task?.suppressNotFoundError === true;

    if (!albumId || !photoId) {
      toast.error('Task is missing an album or image reference.');
      return;
    }

    const isDifferentAlbum = albumId !== selectedAlbumId;
    setPendingPreviewTask(
      createPendingPreviewTask(albumId, photoId, {
        suppressNotFoundError,
        waitForFreshLoad: isDifferentAlbum,
      }),
    );

    if (isDifferentAlbum) {
      resetMediaViewToDefault();
      setSelectedAlbumId(albumId);
      return;
    }

    const found = photos.find((photo) => normalizePhotoId(photo.id) === photoId) ?? null;
    if (found) {
      setPreviewPhoto(found);
      setPreviewOpenGenerate(false);
      setPendingPreviewTask(null);
      return;
    }

    if (!suppressNotFoundError) {
      toast.error('Media not found in the current album.');
    }
    setPendingPreviewTask(null);
  };

  useEffect(() => {
    if (!pendingPreviewTask) return;
    if (!pendingPreviewTask.albumId || !pendingPreviewTask.photoId) return;
    if (pendingPreviewTask.albumId !== selectedAlbumId) return;
    if (pendingPreviewTask.waitForFreshLoad) {
      if (loadingPhotos) {
        if (!pendingPreviewTask.sawLoading) {
          setPendingPreviewTask((current) => {
            if (!current || !current.waitForFreshLoad || current.sawLoading) return current;
            return { ...current, sawLoading: true };
          });
        }
        return;
      }

      if (!pendingPreviewTask.sawLoading) {
        return;
      }
    } else if (loadingPhotos) {
      return;
    }

    const found = photos.find((photo) => normalizePhotoId(photo.id) === normalizePhotoId(pendingPreviewTask.photoId)) ?? null;
    if (found) {
      setPreviewPhoto(found);
      setPreviewOpenGenerate(false);
      setPendingPreviewTask(null);
      return;
    }

    if (!pendingPreviewTask.suppressNotFoundError) {
      toast.error('Media not found for that task.');
    }
    setPendingPreviewTask(null);
  }, [loadingPhotos, pendingPreviewTask, photos, selectedAlbumId]);

  return (
    <div className={embedded ? '' : 'space-y-4'}>
      <ConfirmModal
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title={`Delete ${selectedCount} selected media item${selectedCount === 1 ? '' : 's'}?`}
        description="This action cannot be undone."
        confirmLabel={selectedCount === 1 ? 'Delete item' : `Delete ${selectedCount} items`}
        cancelLabel="Keep item"
        acknowledgementLabel="I understand this will permanently remove the selected item from the album."
        acknowledgementRequired={false}
        acknowledgementDefaultChecked
        loading={confirmingDelete}
        destructive
        onConfirm={async () => {
          captureMediaScroll();
          try {
            setConfirmingDelete(true);
            await deleteSelectedPhotos({ skipConfirm: true });
            setConfirmDeleteOpen(false);
            restoreMediaScroll();
          } finally {
            setConfirmingDelete(false);
          }
        }}
      >
        {selectedCount === 1 && firstSelectedPhoto ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
              Selected item
            </p>
            <div className="mt-2 flex items-center gap-3">
              <div className="h-12 w-12 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800">
                <MediaPreview
                  url={firstSelectedPhoto.imageUrl}
                  mimeType={firstSelectedPhoto.mimeType}
                  sourceType={firstSelectedPhoto.sourceType}
                  sourceId={firstSelectedPhoto.sourceId}
                  alt={firstSelectedPhoto.caption || firstSelectedPhoto.originalFilename || `media_${firstSelectedPhoto.id}`}
                  className="h-full w-full object-cover"
                  controls={false}
                />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-50">
                  {firstSelectedPhoto.originalFilename || firstSelectedPhoto.caption || `media_${firstSelectedPhoto.id}`}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{selectedAlbum?.name}</p>
              </div>
            </div>
          </div>
        ) : null}
      </ConfirmModal>

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
          resetMediaViewToDefault();
          setSelectedAlbumId(created.id);
          return created;
        }}
      />

      <GalleryCreateAlbumModal
        open={createMoveAlbumOpen}
        onOpenChange={setCreateMoveAlbumOpen}
        loading={savingAlbum}
        title="Create album for move"
        description="Create a destination album without leaving the current media workflow. The new album will be selected as the move target."
        confirmLabel="Create album"
        onCreate={async (albumData) => {
          const created = await createAlbumRecord(albumData);
          if (!created) {
            return null;
          }

          await loadAlbums();
          setMoveTargetAlbumId(created.id);
          return created;
        }}
      />

      <GalleryCmsShell
        embedded={embedded}
        sidebarCollapsed={effectiveSidebarCollapsed}
        header={
          <GalleryCmsHeader
            albumName={selectedAlbum?.name || 'Media'}
            albumCountLabel={albumCountLabel}
            searchValue={searchValue}
            onSearchChange={setSearchValue}
            onOpenFilter={handleOpenFilter}
            onToggleDetails={selectedPhoto || hasTasks ? () => setDetailsOpenDesktop((current) => !current) : undefined}
            detailsOpen={detailsOpenDesktop}
            detailsBadge={detailsBadge}
            onOpenImport={handleOpenImport}
            onOpenUpload={handleOpenUpload}
          />
        }
        sidebar={
          <GalleryAlbumsSidebar
            albums={albums}
            selectedAlbumId={selectedAlbumId}
            loadingAlbums={loadingAlbums}
            onSelectAlbum={(albumId) => {
              setSelectedAlbumId(albumId);
              setAlbumSwitchOpen(false);
              setActiveTab('media');
            }}
            onCreateAlbumClick={() => setCreateAlbumOpen(true)}
            mobileAlbumName={selectedAlbum?.name}
            mobileAlbumCountLabel={albumCountLabel}
            onMobileOpenFilter={handleOpenFilter}
            onMobileOpenSwitch={() => setAlbumSwitchOpen(true)}
            onMobileOpenImport={() => setActiveTab('upload')}
            onMobileFocusSearch={() => {
              setActiveTab('media');
              setTimeout(() => {
                if (typeof document === 'undefined') return;
                document.getElementById('gallery-media-search')?.focus();
              }, 40);
            }}
            blurUnclothyGenerated={blurUnclothyGenerated}
            collapsed={effectiveSidebarCollapsed}
            toggleDisabled={Boolean(selectedPhoto)}
            onToggleCollapsed={() => {
              if (selectedPhoto) return;
              setManualSidebarCollapsed((current) => !current);
            }}
          />
        }
        mobileTabs={<GalleryMobileTabs activeTab={activeTab} onChange={setActiveTab} tabs={mobileTabs} />}
        main={
          <main className="min-w-0 bg-white dark:bg-slate-900">
            <section className={`${activeTab !== 'media' ? 'hidden lg:block' : ''}`}>
                <GalleryMediaToolbar
                  searchValue={searchValue}
                  onSearchChange={setSearchValue}
                  activeChip={activeChip}
                  chips={chips}
                  onChipChange={handleChipChange}
                  onOpenFilter={handleOpenFilter}
                  gridColumns={mediaGridColumns}
                  onGridColumnsChange={handleGridColumnsChange}
                />

              {loadingPhotos ? (
                <GalleryMediaGridSkeleton
                  gridColumns={mediaGridColumns}
                  inspectorOpen={detailsOpenDesktop}
                />
              ) : !selectedAlbum ? (
                <div className="px-4 pb-6 sm:px-5 lg:px-6">
                  <GalleryEmptyState
                    title="No album selected"
                    description="Pick an album from the left rail to open its intake workspace."
                  />
                </div>
              ) : (
                <div>
                  <GalleryMediaGrid
                    photos={pagedPhotos}
                    albumName={selectedAlbum?.name}
                    selectedPhotoIds={selectedPhotoIds}
                    togglePhotoSelect={togglePhotoSelect}
                    selectPhotoRange={selectPhotoRange}
                    onOpenPreview={handleOpenPreview}
                    inspectorOpen={detailsOpenDesktop}
                    blurUnclothyGenerated={blurUnclothyGenerated}
                    gridColumns={mediaGridColumns}
                    emptyState={
                      photos.length === 0 ? (
                        <GalleryEmptyState
                          title="No media yet"
                          description="Upload files or import Google Drive items to populate this album."
                        />
                      ) : (
                        <GalleryEmptyState title="No matches" description="Try clearing search or switching filters." />
                      )
                    }
                  />

                  <div className="mt-4 flex flex-col items-center gap-3 px-4 pb-2 text-center sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:text-left lg:px-6">
                    <div className="text-sm text-slate-600 dark:text-slate-300">
                      <span className="font-medium text-slate-900 dark:text-slate-50">Showing</span>{' '}
                      <span className="tabular-nums">
                        {mediaStartIndex}–{mediaEndIndex}
                      </span>{' '}
                      <span>of</span> <span className="tabular-nums font-medium">{mediaTotal}</span>
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-end">
                      <label className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                        <span className="hidden sm:inline">Per page</span>
                        <select
                          value={mediaPageSize}
                          onChange={(event) => {
                            const nextSize = Number(event.target.value);
                            setMediaPageSize(Number.isFinite(nextSize) && nextSize > 0 ? nextSize : 48);
                            setMediaPage(1);
                          }}
                          className="h-10 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-50"
                        >
                          <option value={24}>24</option>
                          <option value={48}>48</option>
                          <option value={72}>72</option>
                        </select>
                      </label>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setMediaPage((current) => Math.max(1, current - 1))}
                          disabled={mediaPage <= 1}
                          className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-50"
                        >
                          Prev
                        </button>
                        <span className="text-sm text-slate-600 dark:text-slate-300">
                          <span className="tabular-nums font-medium text-slate-900 dark:text-slate-50">{mediaPage}</span> /{' '}
                          <span className="tabular-nums">{mediaTotalPages}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setMediaPage((current) => Math.min(mediaTotalPages, current + 1))}
                          disabled={mediaPage >= mediaTotalPages}
                          className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-50"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </section>

            {activeTab === 'upload' ? (
              <section className="space-y-4 px-4 py-4 sm:px-5 lg:hidden">
                <GalleryUploadDropzone
                  uploading={uploadingFiles}
                  uploadSummary={uploadSummary}
                  onUploadFiles={uploadFiles}
                  title="Upload media"
                  description="Drag files or choose files from your device."
                  helpText="Batch uploads go straight into the selected album."
                  uploadLabel="Choose files"
                  buttonTone="primary"
                />

                <GalleryDriveImportSection controller={controller} selectedAlbum={selectedAlbum} variant="compact" />
              </section>
            ) : null}

            {activeTab === 'details' ? (
              <section className="space-y-4 px-4 py-4 sm:px-5 lg:hidden">
                {selectedPhoto ? (
                  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <div className="mb-4 flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
                          Details
                        </p>
                        <p className="mt-1 truncate text-sm font-semibold text-slate-900 dark:text-slate-50">
                          {selectedPhoto.caption || selectedPhoto.originalFilename || `media_${selectedPhoto.id}`}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {!isVideoMime(selectedPhoto?.mimeType) ? (
                          <button
                            type="button"
                            onClick={() => {
                              setPreviewPhoto(selectedPhoto);
                              setPreviewOpenGenerate(true);
                            }}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-50"
                          >
                            Generate
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => {
                            setPreviewPhoto(selectedPhoto);
                            setPreviewOpenGenerate(false);
                          }}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-50"
                        >
                          Preview
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            clearPhotoSelection();
                          }}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-50"
                        >
                          Close
                        </button>
                      </div>
                    </div>

                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40">
                      <div className="aspect-[4/5]">
                          <MediaPreview
                            url={selectedPhoto.imageUrl}
                            mimeType={selectedPhoto.mimeType}
                            sourceType={selectedPhoto.sourceType}
                            sourceId={selectedPhoto.sourceId}
                            alt={selectedPhoto.caption || `media_${selectedPhoto.id}`}
                            className={`h-full w-full object-contain ${
                              shouldBlurPhoto(selectedPhoto, { blurEnabled: blurUnclothyGenerated }) ? 'blur-md' : ''
                            }`}
                            controls={false}
                          />
                      </div>
                      <div className="border-t border-slate-200 p-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                        {selectedAlbum?.name}
                      </div>
                    </div>

                    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
                        Quick info
                      </p>
                      <div className="mt-3 space-y-2 text-sm text-slate-700 dark:text-slate-200">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-slate-500 dark:text-slate-400">Type</span>
                          <span className="truncate font-medium text-slate-900 dark:text-slate-50">
                            {selectedPhoto.mimeType || '—'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-slate-500 dark:text-slate-400">Source</span>
                          <span className="truncate font-medium text-slate-900 dark:text-slate-50">
                            {selectedPhoto.sourceType || '—'}
                          </span>
                        </div>
                      </div>
                    </div>

                  </div>
                ) : null}

                <GalleryUnclothyTasksPanel
                  active={unclothyActive}
                  activeTasks={unclothyActiveTasks}
                  failedTasks={unclothyFailedTasks}
                  completedTasks={unclothyCompletedTasks}
                  queue={unclothyQueue}
                  onOpenTask={openTask}
                  onCancelActive={(task) => cancelUnclothyTask?.(task?.id || task?.queueTaskId)}
                  onRetryActive={(task) => retryUnclothyTask?.(task?.id || task?.queueTaskId)}
                  onDismissActive={(task) => dismissUnclothyTask?.(task?.id || task?.queueTaskId)}
                  onCancelQueued={(task) => cancelUnclothyTask?.(task?.id || task?.queueTaskId)}
                  onClearQueue={clearUnclothyQueue}
                  hideWhenEmpty={Boolean(selectedPhoto)}
                />
              </section>
            ) : null}
          </main>
        }
        inspector={
          isDesktop && detailsOpenDesktop ? (
            selectedPhoto || hasTasks ? (
              <GalleryInspectorPanel
                photo={selectedPhoto}
                album={selectedAlbum}
                onClose={() => {
                  clearPhotoSelection();
                  if (!selectedPhoto) {
                    setDetailsOpenDesktop(false);
                  }
                }}
                blurUnclothyGenerated={blurUnclothyGenerated}
                onPhotoUpdated={updatePhotoInState}
              >
                {hasTasks ? (
                  <GalleryUnclothyTasksPanel
                    active={unclothyActive}
                    activeTasks={unclothyActiveTasks}
                    failedTasks={unclothyFailedTasks}
                    completedTasks={unclothyCompletedTasks}
                    queue={unclothyQueue}
                    onOpenTask={openTask}
                    onCancelActive={(task) => cancelUnclothyTask?.(task?.id || task?.queueTaskId)}
                    onRetryActive={(task) => retryUnclothyTask?.(task?.id || task?.queueTaskId)}
                    onDismissActive={(task) => dismissUnclothyTask?.(task?.id || task?.queueTaskId)}
                    onCancelQueued={(task) => cancelUnclothyTask?.(task?.id || task?.queueTaskId)}
                    onClearQueue={clearUnclothyQueue}
                    hideWhenEmpty={false}
                  />
                ) : null}
              </GalleryInspectorPanel>
            ) : null
          ) : null
        }
        mobileFooterActions={
          null
        }
      />

      <GallerySelectionActionsPopup
        open={selectedCount > 0 && (isDesktop || activeTab !== 'details')}
        selectedCount={selectedCount}
        disabled={confirmingDelete || movingPhotos || savingBulkBlurMode}
        targetAlbumName={moveTargetAlbumName}
        onPickAlbum={() => setMovePickerOpen(true)}
        onMove={() => {
          if (!moveTargetAlbumId || moveTargetAlbumId === selectedAlbumId) return;
          void moveSelectedPhotos();
        }}
        onCreateAlbum={() => setCreateMoveAlbumOpen(true)}
        onBlurModeChange={(blurOverride) => {
          void handleBulkBlurModeChange(blurOverride);
        }}
        savingBlurMode={savingBulkBlurMode}
        onDelete={() => setConfirmDeleteOpen(true)}
        onClear={clearPhotoSelection}
      />

      <GalleryCmsModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title="Upload media"
        description={selectedAlbum ? `Uploads go directly into ${selectedAlbum.name}.` : 'Select an album to upload media.'}
      >
        <GalleryUploadDropzone
          uploading={uploadingFiles}
          uploadSummary={uploadSummary}
          onUploadFiles={uploadFiles}
          title="Upload media"
          description="Drag files or choose files from your device."
          helpText="Batch uploads go straight into the selected album."
          uploadLabel="Choose files"
        />
      </GalleryCmsModal>

      <GalleryMediaFilterModal
        open={filterOpen}
        sortMode={sortMode}
        mediaFilter={['all', 'images', 'videos', 'audio', 'nsfw', 'selected'].includes(activeChip) ? activeChip : 'all'}
        onClose={() => setFilterOpen(false)}
        onApplySort={(nextSort) => {
          if (typeof setSortMode === 'function') {
            setSortMode(nextSort);
          }

          setActiveChip((current) => {
            if (current !== 'recent' && current !== 'manual') {
              persistGalleryMediaPreferences(current, nextSort);
              return current;
            }
            if (nextSort === 'custom') {
              persistGalleryMediaPreferences('all', nextSort);
              return 'manual';
            }
            if (nextSort === 'dateDesc') {
              persistGalleryMediaPreferences('all', nextSort);
              return 'recent';
            }
            persistGalleryMediaPreferences('all', nextSort);
            return 'all';
          });
        }}
        onApplyFilter={(nextFilter) => {
          if (!nextFilter) return;
          setActiveChip(nextFilter);
          persistGalleryMediaPreferences(nextFilter, sortMode);
        }}
        filterOptions={[
          { id: 'all', title: 'All media', description: 'Show every media item in this album.' },
          { id: 'images', title: 'Images', description: 'Show photos and still image files only.' },
          { id: 'videos', title: 'Videos', description: 'Show video media only.' },
          { id: 'audio', title: 'Audio', description: 'Show audio files (MP3, WAV, and similar) only.' },
          { id: 'nsfw', title: 'NSFW images', description: 'Show images flagged by the scanner or manual blur mode.' },
          { id: 'selected', title: 'Selected', description: 'Show only the media items currently selected.' },
        ]}
      />

      <GalleryCmsModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import from Google Drive"
        description={selectedAlbum ? `Import directly into ${selectedAlbum.name} from one selected Drive folder.` : 'Select an album to import media.'}
      >
        <GalleryDriveImportSection controller={controller} selectedAlbum={selectedAlbum} />
      </GalleryCmsModal>

      <GalleryCmsModal
        open={albumSwitchOpen && isDesktop}
        onClose={() => setAlbumSwitchOpen(false)}
        title="Switch album"
        description="Choose the active album for uploads, imports, and media selection."
      >
        {/* Desktop fallback (mobile uses bottom sheet) */}
        <div className="hidden space-y-2 lg:block">
          {Array.isArray(albums) && albums.length > 0 ? (
            albums.map((album) => (
              <button
                key={album.id}
                type="button"
                className={`w-full rounded-2xl border px-4 py-3 text-left text-sm font-medium transition ${
                  album.id === selectedAlbumId
                    ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-50 dark:bg-slate-50 dark:text-slate-900'
                    : 'border-slate-200 bg-white text-slate-900 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-50'
                }`}
                onClick={() => {
                  setSelectedAlbumId(album.id);
                  setAlbumSwitchOpen(false);
                }}
              >
                {album.name}
              </button>
            ))
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300">
              No albums available yet.
            </div>
          )}

          <button
            type="button"
            className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-2xl bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm dark:bg-slate-50 dark:text-slate-900"
            onClick={() => {
              setAlbumSwitchOpen(false);
              setCreateAlbumOpen(true);
            }}
          >
            Create new album
          </button>
        </div>
      </GalleryCmsModal>

      <GalleryAlbumMovePicker
        open={movePickerOpen}
        onClose={() => setMovePickerOpen(false)}
        albums={albums}
        excludedAlbumId={selectedAlbumId}
        selectedAlbumId={moveTargetAlbumId}
        onConfirm={(albumId) => {
          setMoveTargetAlbumId(albumId);
          setMovePickerOpen(false);
        }}
        onCreateNew={() => {
          setMovePickerOpen(false);
          setCreateMoveAlbumOpen(true);
        }}
      />

      <GalleryAlbumSwitchSheet
        open={albumSwitchOpen && !isDesktop}
        onClose={() => setAlbumSwitchOpen(false)}
        albums={albums}
        selectedAlbumId={selectedAlbumId}
        onConfirm={(albumId) => {
          setSelectedAlbumId(albumId);
          setAlbumSwitchOpen(false);
          setActiveTab('media');
        }}
        onCreateNew={() => setCreateAlbumOpen(true)}
      />

      <GalleryMediaViewer
        open={Boolean(previewPhoto)}
        photo={previewPhoto}
        onClose={() => {
          setPreviewPhoto(null);
          setPreviewOpenGenerate(false);
          restoreMediaScroll();
        }}
        controller={controller}
        album={selectedAlbum}
        mediaItems={photos}
        onNavigate={(nextPhoto) => {
          setPreviewPhoto(nextPhoto);
          setPreviewOpenGenerate(false);
        }}
        openGenerate={previewOpenGenerate}
        onGenerateOpened={() => setPreviewOpenGenerate(false)}
        blurUnclothyGenerated={blurUnclothyGenerated}
      />

      <GalleryBatchProgressModal
        open={Boolean((uploadingFiles && uploadProgress) || (importingDrive && importProgress))}
        progress={uploadingFiles && uploadProgress ? uploadProgress : importProgress}
        heading={uploadingFiles && uploadProgress ? 'Upload in progress' : 'Google Drive import in progress'}
        currentItemFallback={
          uploadingFiles && uploadProgress ? 'Uploading file' : 'Importing Google Drive folder'
        }
        currentItemTitle={
          uploadingFiles && uploadProgress
            ? uploadProgress?.currentFileName || 'Uploading file'
            : importProgress?.currentFileName || 'Importing Google Drive folder'
        }
        itemUnit={uploadingFiles && uploadProgress ? 'file' : 'item'}
        uploadedLabel={uploadingFiles && uploadProgress ? 'Uploaded' : 'Imported'}
        skippedLabel="Skipped"
        failedLabel="Failed"
        onCancel={uploadingFiles && uploadProgress ? cancelUpload : cancelDriveImport}
      />
    </div>
  );
}
