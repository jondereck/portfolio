'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import GalleryMediaCard from './GalleryMediaCard';

function isVideoMime(mimeType) {
  return typeof mimeType === 'string' && mimeType.toLowerCase().startsWith('video/');
}

const LONG_PRESS_MS = 500;
const MOVE_CANCEL_THRESHOLD_PX = 8;

const MOBILE_GRID_COL_CLASS = {
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
};

const SM_GRID_COL_CLASS = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-4',
  5: 'sm:grid-cols-5',
  6: 'sm:grid-cols-6',
  7: 'sm:grid-cols-7',
  8: 'sm:grid-cols-8',
};

const LG_GRID_COL_CLASS = {
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
  5: 'lg:grid-cols-5',
  6: 'lg:grid-cols-6',
  7: 'lg:grid-cols-7',
  8: 'lg:grid-cols-8',
};

const XL_GRID_COL_CLASS = {
  2: 'xl:grid-cols-2',
  3: 'xl:grid-cols-3',
  4: 'xl:grid-cols-4',
  5: 'xl:grid-cols-5',
  6: 'xl:grid-cols-6',
  7: 'xl:grid-cols-7',
  8: 'xl:grid-cols-8',
};

function photoIdFromPoint(clientX, clientY) {
  if (typeof document === 'undefined') return null;
  const el = document.elementFromPoint(clientX, clientY);
  const node = el instanceof Element ? el.closest('[data-photo-id]') : null;
  const nextPhotoId = Number(node?.getAttribute('data-photo-id'));
  return Number.isFinite(nextPhotoId) && nextPhotoId > 0 ? nextPhotoId : null;
}

export default function GalleryMediaGrid({
  photos,
  albumName,
  selectedPhotoIds,
  togglePhotoSelect,
  selectPhotoRange,
  onOpenPreview,
  inspectorOpen = false,
  blurUnclothyGenerated = true,
  emptyState,
  gridColumns = 4,
}) {
  const orderedIds = useMemo(() => (Array.isArray(photos) ? photos.map((photo) => photo.id) : []), [photos]);
  const selectedCount = Array.isArray(selectedPhotoIds) ? selectedPhotoIds.length : 0;
  const normalizedGridColumns = Math.max(2, Math.min(8, Number(gridColumns) || 4));
  const mobileGridColumns = Math.max(2, Math.min(4, normalizedGridColumns));
  const smallGridColumns = normalizedGridColumns;
  const largeGridColumns = inspectorOpen
    ? Math.max(2, Math.min(4, normalizedGridColumns))
    : normalizedGridColumns;
  const extraLargeGridColumns = inspectorOpen
    ? Math.max(2, Math.min(6, normalizedGridColumns))
    : normalizedGridColumns;
  const gridClassName = [
    MOBILE_GRID_COL_CLASS[mobileGridColumns] || 'grid-cols-2',
    SM_GRID_COL_CLASS[smallGridColumns] || 'sm:grid-cols-4',
    LG_GRID_COL_CLASS[largeGridColumns] || 'lg:grid-cols-4',
    XL_GRID_COL_CLASS[extraLargeGridColumns] || 'xl:grid-cols-4',
  ].join(' ');
  const selectionMode = selectedCount > 0;
  const [touchSelecting, setTouchSelecting] = useState(false);
  const gridRef = useRef(null);
  const touchSelectStateRef = useRef({
    mode: 'idle',
    pointerId: null,
    timerId: null,
    startX: 0,
    startY: 0,
    anchorPhotoId: null,
    lastPhotoId: null,
    orderedIds: [],
  });
  const suppressClickRef = useRef(false);
  const suppressClickTimerRef = useRef(null);

  const releasePointerCapture = (pointerId) => {
    const node = gridRef.current;
    if (!node || pointerId == null) return;
    try {
      if (typeof node.hasPointerCapture === 'function' && node.hasPointerCapture(pointerId)) {
        node.releasePointerCapture(pointerId);
      }
    } catch {
      // ignore
    }
  };

  const resetTouchSelect = () => {
    const state = touchSelectStateRef.current;
    if (state.timerId) {
      clearTimeout(state.timerId);
    }
    releasePointerCapture(state.pointerId);
    touchSelectStateRef.current = {
      mode: 'idle',
      pointerId: null,
      timerId: null,
      startX: 0,
      startY: 0,
      anchorPhotoId: null,
      lastPhotoId: null,
      orderedIds: [],
    };
    setTouchSelecting(false);
  };

  const suppressNextClick = () => {
    suppressClickRef.current = true;
    if (suppressClickTimerRef.current) {
      clearTimeout(suppressClickTimerRef.current);
    }
    suppressClickTimerRef.current = setTimeout(() => {
      suppressClickRef.current = false;
      suppressClickTimerRef.current = null;
    }, 500);
  };

  useEffect(() => {
    const endGesture = (event) => {
      const state = touchSelectStateRef.current;
      if (state.mode === 'idle' && !state.timerId) return;
      if (event.pointerId != null && state.pointerId != null && event.pointerId !== state.pointerId) return;
      resetTouchSelect();
    };

    window.addEventListener('pointerup', endGesture);
    window.addEventListener('pointercancel', endGesture);
    return () => {
      window.removeEventListener('pointerup', endGesture);
      window.removeEventListener('pointercancel', endGesture);
      if (suppressClickTimerRef.current) {
        clearTimeout(suppressClickTimerRef.current);
      }
    };
  }, []);

  if (!Array.isArray(photos) || photos.length === 0) {
    return <div className="px-4 pb-6 sm:px-5 lg:px-6">{emptyState}</div>;
  }

  return (
    <div
      ref={gridRef}
      className={`grid ${gridClassName} gap-3 px-4 pb-6 sm:px-5 lg:px-6 ${selectedCount > 0 ? 'pb-32 lg:pb-28' : ''} select-none`}
      style={{
        touchAction: touchSelecting ? 'none' : 'pan-y',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
      }}
      onContextMenu={(event) => {
        event.preventDefault();
      }}
      onPointerMove={(event) => {
        if (event.pointerType !== 'touch') return;

        if (touchSelectStateRef.current.mode === 'pending' && touchSelectStateRef.current.pointerId === event.pointerId) {
          const dx = Math.abs(event.clientX - touchSelectStateRef.current.startX);
          const dy = Math.abs(event.clientY - touchSelectStateRef.current.startY);
          if (dx > MOVE_CANCEL_THRESHOLD_PX || dy > MOVE_CANCEL_THRESHOLD_PX) {
            resetTouchSelect();
          }
          return;
        }

        if (touchSelectStateRef.current.mode !== 'active') return;

        const nextPhotoId = photoIdFromPoint(event.clientX, event.clientY);
        if (!nextPhotoId || nextPhotoId === touchSelectStateRef.current.lastPhotoId) return;
        touchSelectStateRef.current.lastPhotoId = nextPhotoId;
        event.preventDefault();
        selectPhotoRange?.(nextPhotoId, touchSelectStateRef.current.orderedIds);
      }}
      onPointerUp={resetTouchSelect}
      onPointerCancel={resetTouchSelect}
    >
      {photos.map((photo) => {
        const selected = Array.isArray(selectedPhotoIds) && selectedPhotoIds.includes(photo.id);
        const statusLabel = isVideoMime(photo.mimeType) ? 'Video' : 'Ready';

        return (
          <div
            key={photo.id}
            data-photo-id={photo.id}
            className="select-none"
            style={{ WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
            onClickCapture={(event) => {
              if (!suppressClickRef.current) return;
              event.preventDefault();
              event.stopPropagation();
              suppressClickRef.current = false;
              if (suppressClickTimerRef.current) {
                clearTimeout(suppressClickTimerRef.current);
                suppressClickTimerRef.current = null;
              }
            }}
            onPointerDown={(event) => {
              if (event.pointerType !== 'touch') return;
              const target = event.target;
              if (
                target instanceof Element &&
                target.closest('input,label,a,video,[data-gallery-select-toggle],[data-gallery-media-control]')
              ) {
                return;
              }

              if (touchSelectStateRef.current.timerId) {
                clearTimeout(touchSelectStateRef.current.timerId);
              }

              const pointerId = event.pointerId;
              const anchorPhotoId = photo.id;
              const nextOrderedIds = orderedIds;

              const timerId = setTimeout(() => {
                if (touchSelectStateRef.current.mode !== 'pending' || touchSelectStateRef.current.pointerId !== pointerId) {
                  return;
                }

                touchSelectStateRef.current.mode = 'active';
                touchSelectStateRef.current.timerId = null;
                touchSelectStateRef.current.lastPhotoId = anchorPhotoId;
                touchSelectStateRef.current.orderedIds = nextOrderedIds;
                suppressNextClick();
                setTouchSelecting(true);

                try {
                  gridRef.current?.setPointerCapture?.(pointerId);
                } catch {
                  // ignore
                }

                selectPhotoRange?.(anchorPhotoId, nextOrderedIds, { resetAnchor: true });
              }, LONG_PRESS_MS);

              touchSelectStateRef.current = {
                mode: 'pending',
                pointerId,
                timerId,
                startX: event.clientX,
                startY: event.clientY,
                anchorPhotoId,
                lastPhotoId: null,
                orderedIds: nextOrderedIds,
              };
            }}
          >
            <GalleryMediaCard
              photo={photo}
              albumName={albumName}
              selected={selected}
              selectionMode={selectionMode}
              statusLabel={statusLabel}
              blurUnclothyGenerated={blurUnclothyGenerated}
              onOpenPreview={() => onOpenPreview?.(photo)}
              onToggleSelect={(event) => {
                togglePhotoSelect?.(photo.id, { shiftKey: Boolean(event?.shiftKey) });
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
