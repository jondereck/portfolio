'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import ConfirmModal from '@/components/ConfirmModal';
import SortableMediaGrid from '@/app/admin/gallery/components/SortableMediaGrid';
import GalleryArrangeMobileControls from '@/modules/gallery/admin/GalleryArrangeMobileControls';
import GalleryMediaViewer from './GalleryMediaViewer';
import GalleryCreateAlbumModal from './GalleryCreateAlbumModal';
import MediaPreview from '@/app/admin/gallery/components/MediaPreview';
import {
  GalleryEmptyState,
  fetchJson,
  GalleryPageHeader,
  GalleryPanelCard,
  buttonStyles,
  ghostButtonStyles,
} from './galleryAdminShared';
import {
  GalleryAlbumMovePicker,
  GalleryAlbumSwitchSheet,
  GalleryAlbumsSidebar,
  GalleryCmsHeader,
  GalleryCmsShell,
  GallerySelectionActionsPopup,
} from './cms';

export default function GalleryArrangePanel({ controller, embedded = false }) {
  const sidebarCollapsedStorageKey = 'gallery:sidebarCollapsed:v1';
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
    saveOrder,
    handleDragStateChange,
    loadPhotos,
    getPhotoSortTime,
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
  const [isDesktop, setIsDesktop] = useState(false);
  const [blurUnclothyGenerated, setBlurUnclothyGenerated] = useState(true);
  const [manualSidebarCollapsed, setManualSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(sidebarCollapsedStorageKey) === 'true';
  });

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
    window.localStorage.setItem(sidebarCollapsedStorageKey, manualSidebarCollapsed ? 'true' : 'false');
  }, [manualSidebarCollapsed, sidebarCollapsedStorageKey]);

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

      {!embedded ? (
        <GalleryPageHeader
          eyebrow="Sorting Workspace"
          title="Arrange"
          description="A dedicated ordering workspace for the selected album with selection, reordering, and save controls only."
        />
      ) : null}

      <GalleryCmsShell
        embedded={embedded}
        sidebarCollapsed={manualSidebarCollapsed}
        header={
          <GalleryCmsHeader
            albumName={selectedAlbum?.name || 'Arrange'}
            albumCountLabel={albumCountLabel}
            showSearch={false}
            showUploadButton={false}
            desktopActions={
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
              setSelectedAlbumId(albumId);
              setAlbumSwitchOpen(false);
            }}
            onCreateAlbumClick={() => setCreateAlbumOpen(true)}
            mobileAlbumName={selectedAlbum?.name}
            mobileAlbumCountLabel={albumCountLabel}
            onMobileOpenFilter={undefined}
            onMobileOpenImport={undefined}
            onMobileFocusSearch={undefined}
            onMobileOpenSwitch={() => setAlbumSwitchOpen(true)}
            showMobileChips={false}
            blurUnclothyGenerated={blurUnclothyGenerated}
            collapsed={manualSidebarCollapsed}
            onToggleCollapsed={() => setManualSidebarCollapsed((current) => !current)}
          />
        }
        mobileTabs={null}
        main={
          <main className="min-w-0 bg-white dark:bg-slate-900">
            <section className="px-4 py-4 sm:px-5 lg:px-6 lg:py-5">
              {selectedAlbum ? (
                <GalleryPanelCard
                  title={`Arrange ${selectedAlbum.name}`}
                  description=""
                  className={`relative overflow-visible ${showSelectionBar ? 'pb-32 lg:pb-28' : 'pb-24 lg:pb-0'}`}
                >
                  {!isDragging ? (
                    <div className="hidden rounded-xl border border-slate-200 bg-white/95 p-3 dark:border-slate-700 dark:bg-slate-900/95 md:block">
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className={ghostButtonStyles}
                          onClick={async () => {
                            if (sortMode !== 'custom') {
                              setSortMode('custom');
                            }
                            await loadPhotos(selectedAlbumId, 'custom');
                          }}
                        >
                          Manual order
                        </button>
                        <button
                          type="button"
                          className={ghostButtonStyles}
                          onClick={() => reorderChange([...arrangePhotos].sort((a, b) => getPhotoSortTime(b) - getPhotoSortTime(a)))}
                        >
                          Sort by newest
                        </button>
                        <button
                          type="button"
                          className={ghostButtonStyles}
                          onClick={() => reorderChange([...arrangePhotos].sort((a, b) => getPhotoSortTime(a) - getPhotoSortTime(b)))}
                        >
                          Sort by oldest
                        </button>
                        <button type="button" className={ghostButtonStyles} onClick={() => reorderChange([...arrangePhotos].reverse())}>
                          Reverse order
                        </button>
                        <button type="button" className={ghostButtonStyles} onClick={() => moveSelection('top')}>
                          Move to top
                        </button>
                        <button type="button" className={ghostButtonStyles} onClick={() => moveSelection('bottom')}>
                          Move to bottom
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {!showSelectionBar && !isDragging ? (
                    <div className="md:hidden">
                      <GalleryArrangeMobileControls
                        orderDirty={orderDirty}
                        orderSaving={orderSaving}
                        onSaveOrder={saveOrder}
                        onManualOrder={async () => {
                          if (sortMode !== 'custom') {
                            setSortMode('custom');
                          }
                          await loadPhotos(selectedAlbumId, 'custom');
                        }}
                        onSortNewest={() => reorderChange([...arrangePhotos].sort((a, b) => getPhotoSortTime(b) - getPhotoSortTime(a)))}
                        onSortOldest={() => reorderChange([...arrangePhotos].sort((a, b) => getPhotoSortTime(a) - getPhotoSortTime(b)))}
                        onReverseOrder={() => reorderChange([...arrangePhotos].reverse())}
                        onMoveTop={() => moveSelection('top')}
                        onMoveBottom={() => moveSelection('bottom')}
                        onUndo={undoOrder}
                      />
                    </div>
                  ) : null}

                  {loadingPhotos ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">Loading media...</p>
                  ) : arrangePhotos.length === 0 ? (
                    <GalleryEmptyState
                      title="No media to arrange"
                      description="Use the Media page first, then return here to manually sequence the album."
                    />
                  ) : (
                    <SortableMediaGrid
                      items={arrangePhotos}
                      selectedIds={selectedPhotoIds}
                      coverPhotoId={selectedAlbum.coverPhotoId}
                      blurUnclothyGenerated={blurUnclothyGenerated}
                      onItemsChange={reorderChange}
                      onToggleSelect={togglePhotoSelect}
                      onSelectRange={(photoId, options) => selectPhotoRange(photoId, arrangePhotos.map((photo) => photo.id), options)}
                      onSetCover={setCoverPhoto}
                      onPreview={setPreviewPhoto}
                      onDragStateChange={handleDragStateChange}
                    />
                  )}

                  {showSelectionBar ? (
                    <GallerySelectionActionsPopup
                      open={showSelectionBar}
                      selectedCount={selectedCount}
                      disabled={movingPhotos || confirmingDelete}
                      targetAlbumName={moveTargetAlbumName}
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
                </GalleryPanelCard>
              ) : (
                <GalleryEmptyState title="No album selected" description="Choose an album from the left rail to open the arrange workspace." />
              )}
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

      <GalleryAlbumSwitchSheet
        open={albumSwitchOpen && !isDesktop}
        onClose={() => setAlbumSwitchOpen(false)}
        albums={albums}
        selectedAlbumId={selectedAlbumId}
        onConfirm={(albumId) => {
          setSelectedAlbumId(albumId);
          setAlbumSwitchOpen(false);
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
