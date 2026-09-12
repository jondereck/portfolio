'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ConfirmModal from '@/components/ConfirmModal';
import SortableMediaGrid from '@/app/admin/gallery/components/SortableMediaGrid';
import GalleryArrangeMobileControls from '@/modules/gallery/admin/GalleryArrangeMobileControls';
import GalleryDriveImportSection from './GalleryDriveImportSection';
import GalleryMediaViewer from './GalleryMediaViewer';
import GalleryCreateAlbumModal from './GalleryCreateAlbumModal';
import GalleryUploadDropzone from './GalleryUploadDropzone';
import MediaPreview from '@/app/admin/gallery/components/MediaPreview';
import { isPhotoAudio, shouldBlurPhoto } from '@/lib/gallery-media';
import { GalleryEmptyState, fetchJson } from './galleryAdminShared';
import {
  GalleryAlbumMovePicker,
  GalleryAlbumSwitchSheet,
  GalleryAlbumsSidebar,
  GalleryCmsHeader,
  GalleryCmsModal,
  GalleryCmsShell,
  GalleryMediaFilterModal,
  GalleryMediaGridSkeleton,
  GalleryMediaToolbar,
  GallerySelectionActionsPopup,
  readGallerySidebarCollapsed,
  writeGallerySidebarCollapsed,
} from './cms';

function isVideoMime(mimeType) {
  return typeof mimeType === 'string' && mimeType.toLowerCase().startsWith('video/');
}

function isAudioPhoto(photo) {
  return Boolean(photo) && isPhotoAudio(photo, photo?.imageUrl);
}

function getPhotoSearchText(photo) {
  return [photo?.caption, photo?.originalFilename, photo?.sourceId]
    .map((value) => (typeof value === 'string' ? value.toLowerCase() : ''))
    .join(' ');
}

function clampGalleryGridColumns(value) {
  return Math.max(2, Math.min(8, Number(value) || 4));
}

export default function GalleryArrangePanel({ controller, embedded = false }) {
  const mediaGridColumnsStorageKey = 'gallery:mediaGridColumns:v1';
  const {
    albums,
    selectedAlbum,
    selectedAlbumId,
    arrangePhotos,
    loadingAlbums,
    loadingPhotos,
    sortMode,
    setSortMode,
    orderDirty,
    orderSaving,
    arrangeDragState,
    selectedPhotoIds,
    deleteSelectedPhotos,
    clearPhotoSelection,
    moveSelectedPhotos,
    moveTargetAlbumId,
    setMoveTargetAlbumId,
    movingPhotos,
    savingAlbum,
    setSelectedAlbumId,
    setCoverPhoto,
    createAlbumRecord,
    loadAlbums,
    reorderChange,
    togglePhotoSelect,
    selectPhotoRange,
    moveSelection,
    undoOrder,
    discardUnsavedOrder,
    saveOrder,
    handleDragStateChange,
    loadPhotos,
    getPhotoSortTime,
    uploadFiles,
    uploadingFiles,
    uploadSummary,
  } = controller;

  const isDragging = Boolean(arrangeDragState.isDragging);
  const selectedCount = selectedPhotoIds.length;
  const showSelectionBar = selectedCount > 0 && !isDragging;
  const [previewPhoto, setPreviewPhoto] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [createAlbumOpen, setCreateAlbumOpen] = useState(false);
  const [albumSwitchOpen, setAlbumSwitchOpen] = useState(false);
  const [movePickerOpen, setMovePickerOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [activeChip, setActiveChip] = useState('manual');
  const [mediaGridColumns, setMediaGridColumns] = useState(4);
  const [isDesktop, setIsDesktop] = useState(false);
  const [blurUnclothyGenerated, setBlurUnclothyGenerated] = useState(true);
  const [manualSidebarCollapsed, setManualSidebarCollapsed] = useState(true);
  const [leavePromptOpen, setLeavePromptOpen] = useState(false);
  const [leaveSaving, setLeaveSaving] = useState(false);
  const pendingLeaveActionRef = useRef(null);

  const requestLeave = useCallback(
    (action) => {
      if (typeof action !== 'function') return;

      if (!orderDirty) {
        action();
        return;
      }

      pendingLeaveActionRef.current = action;
      setLeavePromptOpen(true);
    },
    [orderDirty],
  );

  const clearPendingLeave = useCallback(() => {
    pendingLeaveActionRef.current = null;
    setLeavePromptOpen(false);
    setLeaveSaving(false);
  }, []);

  const runPendingLeave = useCallback(() => {
    const action = pendingLeaveActionRef.current;
    pendingLeaveActionRef.current = null;
    setLeavePromptOpen(false);
    setLeaveSaving(false);
    action?.();
  }, []);

  const handleSaveAndLeave = useCallback(async () => {
    setLeaveSaving(true);
    const saved = await saveOrder();
    if (!saved) {
      setLeaveSaving(false);
      return;
    }
    runPendingLeave();
  }, [runPendingLeave, saveOrder]);

  const handleDiscardAndLeave = useCallback(async () => {
    setLeaveSaving(true);
    await discardUnsavedOrder();
    runPendingLeave();
  }, [discardUnsavedOrder, runPendingLeave]);

  useEffect(() => {
    if (!orderDirty) return undefined;

    const onBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [orderDirty]);

  useEffect(() => {
    if (typeof controller?.registerArrangeLeaveGuard !== 'function') return undefined;

    controller.registerArrangeLeaveGuard(requestLeave);
    return () => controller.registerArrangeLeaveGuard(null);
  }, [controller, requestLeave]);

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

    const storedSidebarCollapsed = readGallerySidebarCollapsed(null);
    if (storedSidebarCollapsed !== null) {
      setManualSidebarCollapsed(storedSidebarCollapsed);
    }

    const storedGridColumns = Number(window.localStorage.getItem(mediaGridColumnsStorageKey));
    if (Number.isFinite(storedGridColumns)) {
      setMediaGridColumns(clampGalleryGridColumns(storedGridColumns));
    }
  }, [mediaGridColumnsStorageKey]);

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
    } catch {
      setBlurUnclothyGenerated(true);
    }
  }, []);

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

  const chips = useMemo(() => {
    const list = Array.isArray(arrangePhotos) ? arrangePhotos : [];
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

    const next = [{ id: 'all', label: 'All' }];
    if (images > 0) next.push({ id: 'images', label: 'Images' });
    if (videos > 0) next.push({ id: 'videos', label: 'Videos' });
    if (audio > 0) next.push({ id: 'audio', label: 'Audio' });
    if (nsfw > 0) next.push({ id: 'nsfw', label: 'NSFW' });
    next.push({ id: 'recent', label: 'Recent' });
    next.push({ id: 'manual', label: 'Manual' });
    if (selectedCount > 0) next.push({ id: 'selected', label: `Selected (${selectedCount})` });
    return next;
  }, [arrangePhotos, selectedCount]);

  useEffect(() => {
    if (loadingPhotos) return;
    if (!chips.some((chip) => chip.id === activeChip)) {
      setActiveChip('all');
    }
  }, [chips, activeChip, loadingPhotos]);

  const handleChipChange = useCallback(
    (chipId) => {
      setActiveChip(chipId);

      if (chipId === 'manual') {
        if (typeof setSortMode === 'function' && sortMode !== 'custom') {
          setSortMode('custom');
        }
        void loadPhotos(selectedAlbumId, 'custom');
        return;
      }

      if (chipId === 'recent') {
        if (typeof setSortMode === 'function' && sortMode !== 'dateDesc') {
          setSortMode('dateDesc');
        }
        void loadPhotos(selectedAlbumId, 'dateDesc');
      }
    },
    [loadPhotos, selectedAlbumId, setSortMode, sortMode],
  );

  const handleGridColumnsChange = useCallback((nextValue) => {
    setMediaGridColumns(clampGalleryGridColumns(nextValue));
  }, []);

  const filteredPhotos = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    let next = Array.isArray(arrangePhotos) ? arrangePhotos : [];

    if (activeChip === 'images') {
      next = next.filter((photo) => !isVideoMime(photo?.mimeType) && !isAudioPhoto(photo));
    } else if (activeChip === 'videos') {
      next = next.filter((photo) => isVideoMime(photo?.mimeType));
    } else if (activeChip === 'audio') {
      next = next.filter((photo) => isAudioPhoto(photo));
    } else if (activeChip === 'nsfw') {
      next = next.filter((photo) => !isVideoMime(photo?.mimeType) && shouldBlurPhoto(photo, { blurEnabled: true }));
    } else if (activeChip === 'selected') {
      const selected = new Set(selectedPhotoIds);
      next = next.filter((photo) => selected.has(photo.id));
    }

    if (query) {
      next = next.filter((photo) => getPhotoSearchText(photo).includes(query));
    }

    return next;
  }, [activeChip, arrangePhotos, searchValue, selectedPhotoIds]);

  const firstSelectedPhoto = useMemo(() => {
    const firstId = selectedPhotoIds[0];
    if (!firstId) return null;
    return arrangePhotos.find((photo) => photo.id === firstId) ?? null;
  }, [arrangePhotos, selectedPhotoIds]);

  const albumCountLabel = useMemo(() => {
    if (!selectedAlbum) return null;
    const count = typeof selectedAlbum?._count?.photos === 'number' ? selectedAlbum._count.photos : null;
    return typeof count === 'number' ? `${count} items` : null;
  }, [selectedAlbum]);

  const moveTargetAlbumName = useMemo(() => {
    if (!moveTargetAlbumId) return null;
    const match = Array.isArray(albums) ? albums.find((album) => album.id === moveTargetAlbumId) : null;
    return match?.name ?? null;
  }, [albums, moveTargetAlbumId]);

  const handleOpenFilter = useCallback(() => setFilterOpen(true), []);
  const handleOpenImport = useCallback(() => setImportOpen(true), []);
  const handleOpenUpload = useCallback(() => setUploadOpen(true), []);

  const handleItemsChange = useCallback(
    (nextItems) => {
      if (!Array.isArray(nextItems)) return;

      if (nextItems.length === arrangePhotos.length) {
        reorderChange(nextItems);
        return;
      }

      const filteredIdSet = new Set(nextItems.map((photo) => photo.id));
      let cursor = 0;
      const merged = arrangePhotos.map((photo) => {
        if (!filteredIdSet.has(photo.id)) return photo;
        const nextPhoto = nextItems[cursor];
        cursor += 1;
        return nextPhoto ?? photo;
      });
      reorderChange(merged);
    },
    [arrangePhotos, reorderChange],
  );

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
        acknowledgementDefaultChecked
        loading={confirmingDelete}
        destructive
        onConfirm={async () => {
          try {
            setConfirmingDelete(true);
            await deleteSelectedPhotos({ skipConfirm: true });
            setConfirmDeleteOpen(false);
          } finally {
            setConfirmingDelete(false);
          }
        }}
      >
        {selectedCount === 1 && firstSelectedPhoto ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/30">
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

      <ConfirmModal
        open={leavePromptOpen}
        onOpenChange={(open) => {
          if (!open) clearPendingLeave();
        }}
        title="Save arrangement?"
        description="You have unsaved order changes. Save before leaving, or discard them."
        confirmLabel="Save"
        cancelLabel="Don't save"
        loading={leaveSaving || orderSaving}
        onConfirm={() => {
          void handleSaveAndLeave();
        }}
        onCancel={() => {
          void handleDiscardAndLeave();
        }}
      />

      <GalleryCreateAlbumModal
        open={createAlbumOpen}
        onOpenChange={setCreateAlbumOpen}
        loading={savingAlbum}
        title="Create album for move"
        description="Create a destination album without leaving the arrange flow. The new album will be selected as the move target."
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
        sidebarCollapsed={manualSidebarCollapsed}
        header={
          <GalleryCmsHeader
            albumName={selectedAlbum?.name || 'Media'}
            albumCountLabel={albumCountLabel}
            searchValue={searchValue}
            onSearchChange={setSearchValue}
            onOpenFilter={handleOpenFilter}
            onOpenImport={handleOpenImport}
            onOpenUpload={handleOpenUpload}
            extraDesktopActions={
              <>
                <button
                  type="button"
                  className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-50"
                  onClick={undoOrder}
                  disabled={orderSaving}
                >
                  Undo
                </button>
                <button
                  type="button"
                  className="inline-flex h-11 items-center gap-2 rounded-2xl bg-slate-900 px-4 text-sm font-medium text-white shadow-sm disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900"
                  onClick={saveOrder}
                  disabled={!orderDirty || orderSaving}
                >
                  {orderSaving ? 'Saving…' : 'Save order'}
                </button>
              </>
            }
          />
        }
        sidebar={
          <GalleryAlbumsSidebar
            albums={albums}
            selectedAlbumId={selectedAlbumId}
            loadingAlbums={loadingAlbums}
            onSelectAlbum={(albumId) => {
              if (albumId === selectedAlbumId) {
                setAlbumSwitchOpen(false);
                return;
              }
              requestLeave(() => {
                setSelectedAlbumId(albumId);
                setAlbumSwitchOpen(false);
              });
            }}
            onCreateAlbumClick={() => setCreateAlbumOpen(true)}
            mobileAlbumName={selectedAlbum?.name}
            mobileAlbumCountLabel={albumCountLabel}
            onMobileOpenFilter={handleOpenFilter}
            onMobileOpenImport={handleOpenImport}
            onMobileFocusSearch={() => {
              setTimeout(() => {
                if (typeof document === 'undefined') return;
                document.getElementById('gallery-media-search')?.focus();
              }, 40);
            }}
            onMobileOpenSwitch={() => setAlbumSwitchOpen(true)}
            blurUnclothyGenerated={blurUnclothyGenerated}
            collapsed={manualSidebarCollapsed}
            onToggleCollapsed={() => setManualSidebarCollapsed((current) => !current)}
          />
        }
        mobileTabs={null}
        main={
          <main className={`min-w-0 bg-white dark:bg-slate-900 ${showSelectionBar ? 'pb-44 lg:pb-28' : 'pb-40 lg:pb-0'}`}>
            <section>
              {!isDragging ? (
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
              ) : null}

              {!showSelectionBar && !isDragging ? (
                <div className="md:hidden">
                  <GalleryArrangeMobileControls
                    orderDirty={orderDirty}
                    orderSaving={orderSaving}
                    onSaveOrder={saveOrder}
                    onManualOrder={async () => {
                      handleChipChange('manual');
                    }}
                    onSortNewest={() =>
                      reorderChange([...arrangePhotos].sort((a, b) => getPhotoSortTime(b) - getPhotoSortTime(a)))
                    }
                    onSortOldest={() =>
                      reorderChange([...arrangePhotos].sort((a, b) => getPhotoSortTime(a) - getPhotoSortTime(b)))
                    }
                    onReverseOrder={() => reorderChange([...arrangePhotos].reverse())}
                    onMoveTop={() => moveSelection('top')}
                    onMoveBottom={() => moveSelection('bottom')}
                    onUndo={undoOrder}
                  />
                </div>
              ) : null}

              {loadingPhotos ? (
                <GalleryMediaGridSkeleton gridColumns={mediaGridColumns} />
              ) : !selectedAlbum ? (
                <div className="px-4 pb-6 sm:px-5 lg:px-6">
                  <GalleryEmptyState
                    title="No album selected"
                    description="Pick an album from the left rail to open its intake workspace."
                  />
                </div>
              ) : filteredPhotos.length === 0 ? (
                <div className="px-4 pb-6 sm:px-5 lg:px-6">
                  <GalleryEmptyState
                    title={arrangePhotos.length === 0 ? 'No media to arrange' : 'No matches'}
                    description={
                      arrangePhotos.length === 0
                        ? 'Upload files or import Google Drive items to populate this album.'
                        : 'Try clearing search or switching filters.'
                    }
                  />
                </div>
              ) : (
                <div>
                  <SortableMediaGrid
                    items={filteredPhotos}
                    selectedIds={selectedPhotoIds}
                    blurUnclothyGenerated={blurUnclothyGenerated}
                    gridColumns={mediaGridColumns}
                    onItemsChange={handleItemsChange}
                    onToggleSelect={togglePhotoSelect}
                    onSelectRange={(photoId, options) =>
                      selectPhotoRange(
                        photoId,
                        filteredPhotos.map((photo) => photo.id),
                        options,
                      )
                    }
                    onPreview={setPreviewPhoto}
                    onDragStateChange={handleDragStateChange}
                  />
                </div>
              )}

              {showSelectionBar ? (
                <GallerySelectionActionsPopup
                  open={showSelectionBar}
                  selectedCount={selectedCount}
                  disabled={movingPhotos || confirmingDelete}
                  targetAlbumName={moveTargetAlbumName}
                  canSetCover={
                    selectedCount === 1 && Boolean(firstSelectedPhoto) && !isAudioPhoto(firstSelectedPhoto)
                  }
                  onSetCover={() => {
                    if (selectedCount !== 1 || !firstSelectedPhoto) return;
                    void setCoverPhoto(firstSelectedPhoto.id);
                  }}
                  onPickAlbum={() => setMovePickerOpen(true)}
                  onMove={() => {
                    if (!moveTargetAlbumId || moveTargetAlbumId === selectedAlbumId) return;
                    void moveSelectedPhotos();
                  }}
                  onCreateAlbum={() => setCreateAlbumOpen(true)}
                  onDelete={() => setConfirmDeleteOpen(true)}
                  onClear={clearPhotoSelection}
                />
              ) : null}
            </section>

            <GalleryMediaViewer
              open={Boolean(previewPhoto)}
              photo={previewPhoto}
              onClose={() => setPreviewPhoto(null)}
              controller={controller}
              album={selectedAlbum}
              mediaItems={arrangePhotos}
              onNavigate={setPreviewPhoto}
              blurUnclothyGenerated={blurUnclothyGenerated}
            />
          </main>
        }
        inspector={null}
        mobileFooterActions={null}
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
              return current;
            }
            if (nextSort === 'custom') return 'manual';
            if (nextSort === 'dateDesc') return 'recent';
            return 'all';
          });

          void loadPhotos(selectedAlbumId, nextSort);
        }}
        onApplyFilter={(nextFilter) => {
          if (!nextFilter) return;
          setActiveChip(nextFilter);
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
        description={
          selectedAlbum
            ? `Import directly into ${selectedAlbum.name} from one selected Drive folder.`
            : 'Select an album to import media.'
        }
      >
        <GalleryDriveImportSection controller={controller} selectedAlbum={selectedAlbum} />
      </GalleryCmsModal>

      <GalleryAlbumSwitchSheet
        open={albumSwitchOpen && !isDesktop}
        onClose={() => setAlbumSwitchOpen(false)}
        albums={albums}
        selectedAlbumId={selectedAlbumId}
        onConfirm={(albumId) => {
          if (albumId === selectedAlbumId) {
            setAlbumSwitchOpen(false);
            return;
          }
          requestLeave(() => {
            setSelectedAlbumId(albumId);
            setAlbumSwitchOpen(false);
          });
        }}
        onCreateNew={() => setCreateAlbumOpen(true)}
      />

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
          setCreateAlbumOpen(true);
        }}
      />
    </div>
  );
}
