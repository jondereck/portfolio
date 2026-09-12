'use client';

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  closestCenter,
  defaultDropAnimationSideEffects,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import GalleryMediaCard from '@/modules/gallery/admin/cms/GalleryMediaCard';

const TOUCH_MULTI_SELECT_DISTANCE = 14;

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

const SortableMediaCard = memo(function SortableMediaCard({
  photo,
  isSelected,
  selectionMode,
  isDragging,
  isDropTarget,
  dragActive,
  onToggleSelect,
  onSelectRange,
  touchSelectStateRef,
  suppressNextClickRef,
  onPreview,
  blurUnclothyGenerated,
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
  } = useSortable({
    id: photo.id,
    transition: {
      duration: 180,
      easing: 'cubic-bezier(0.2, 0, 0, 1)',
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-photo-id={photo.id}
      className={`group relative select-none will-change-transform ${
        isDragging ? 'z-20 opacity-30' : ''
      } ${isDropTarget ? 'z-10 scale-[1.01]' : ''}`}
      onPointerDown={(event) => {
        if (event.pointerType !== 'touch' || isDragging) return;
        const target = event.target;
        if (
          target instanceof Element &&
          target.closest(
            'button,input,label,a,video,audio,[data-drag-handle],[data-gallery-select-toggle],[data-gallery-media-control]',
          )
        ) {
          return;
        }
        event.currentTarget.setPointerCapture?.(event.pointerId);
        touchSelectStateRef.current = {
          active: true,
          activated: false,
          pointerId: event.pointerId,
          originPhotoId: photo.id,
          lastPhotoId: photo.id,
          startX: event.clientX,
          startY: event.clientY,
        };
      }}
      onPointerMove={(event) => {
        const touchState = touchSelectStateRef.current;
        if (
          event.pointerType !== 'touch' ||
          !touchState.active ||
          touchState.pointerId !== event.pointerId
        ) {
          return;
        }

        if (!touchState.activated) {
          const distanceX = event.clientX - touchState.startX;
          const distanceY = event.clientY - touchState.startY;
          if (Math.hypot(distanceX, distanceY) < TOUCH_MULTI_SELECT_DISTANCE) {
            return;
          }

          touchState.activated = true;
          suppressNextClickRef.current = true;
          onSelectRange?.(touchState.originPhotoId, { resetAnchor: true });
        }

        event.preventDefault();

        const hoveredElement = document.elementFromPoint(event.clientX, event.clientY);
        const nextPhotoId = hoveredElement?.closest?.('[data-photo-id]')?.getAttribute('data-photo-id');
        if (!nextPhotoId || nextPhotoId === touchSelectStateRef.current.lastPhotoId) return;
        touchSelectStateRef.current.lastPhotoId = nextPhotoId;
        onSelectRange?.(Number(nextPhotoId));
      }}
      onPointerUp={(event) => {
        if (touchSelectStateRef.current.pointerId === event.pointerId) {
          event.currentTarget.releasePointerCapture?.(event.pointerId);
          const shouldSuppressClick = touchSelectStateRef.current.activated;
          touchSelectStateRef.current = {
            active: false,
            activated: false,
            pointerId: null,
            originPhotoId: null,
            lastPhotoId: null,
            startX: 0,
            startY: 0,
          };
          suppressNextClickRef.current = shouldSuppressClick;
        }
      }}
      onPointerCancel={(event) => {
        if (touchSelectStateRef.current.pointerId === event.pointerId) {
          event.currentTarget.releasePointerCapture?.(event.pointerId);
        }
        touchSelectStateRef.current = {
          active: false,
          activated: false,
          pointerId: null,
          originPhotoId: null,
          lastPhotoId: null,
          startX: 0,
          startY: 0,
        };
        suppressNextClickRef.current = false;
      }}
    >
      {isDropTarget ? (
        <span
          className="pointer-events-none absolute inset-0 z-20 rounded-xl ring-2 ring-blue-400 dark:ring-blue-500"
          aria-hidden
        />
      ) : null}

      <div
        className={dragActive && !isDragging ? 'rounded-xl border border-dashed border-slate-300 dark:border-slate-600' : ''}
        onClickCapture={(event) => {
          if (!suppressNextClickRef.current) return;
          event.preventDefault();
          event.stopPropagation();
          suppressNextClickRef.current = false;
        }}
      >
        <GalleryMediaCard
          photo={photo}
          selected={isSelected}
          selectionMode={selectionMode}
          blurUnclothyGenerated={blurUnclothyGenerated}
          onOpenPreview={() => {
            if (isDragging) return;
            onPreview?.(photo);
          }}
          onToggleSelect={(event) => {
            if (isDragging) return;
            onToggleSelect?.(photo.id, { shiftKey: Boolean(event?.shiftKey) });
          }}
        />
      </div>

      <button
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        data-drag-handle
        className={`absolute bottom-2 right-2 z-30 inline-flex h-8 w-8 items-center justify-center rounded-full border shadow-sm transition touch-none select-none ${
          isDropTarget || dragActive
            ? 'border-blue-300 bg-white text-blue-700 opacity-100 dark:border-blue-700 dark:bg-slate-950 dark:text-blue-200'
            : 'border-slate-200 bg-white/95 text-slate-600 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 dark:border-slate-700 dark:bg-slate-950/90 dark:text-slate-200'
        }`}
        onClick={(event) => event.stopPropagation()}
        style={{ touchAction: 'none' }}
        aria-label={`Drag to reorder ${photo.caption || `media ${photo.id}`}`}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}, (prevProps, nextProps) => (
  prevProps.photo === nextProps.photo &&
  prevProps.isSelected === nextProps.isSelected &&
  prevProps.selectionMode === nextProps.selectionMode &&
  prevProps.isDragging === nextProps.isDragging &&
  prevProps.isDropTarget === nextProps.isDropTarget &&
  prevProps.dragActive === nextProps.dragActive &&
  prevProps.blurUnclothyGenerated === nextProps.blurUnclothyGenerated &&
  prevProps.onToggleSelect === nextProps.onToggleSelect &&
  prevProps.onPreview === nextProps.onPreview
));

const OverlayCard = memo(function OverlayCard({ photo, draggingCount, blurUnclothyGenerated }) {
  if (!photo) return null;
  return (
    <div className="relative w-[180px] scale-[1.03] sm:w-[200px]">
      {draggingCount > 1 ? (
        <span className="absolute -right-1 -top-1 z-10 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-blue-600 px-1.5 text-[11px] font-semibold text-white shadow">
          {draggingCount}
        </span>
      ) : null}
      <GalleryMediaCard photo={photo} selected blurUnclothyGenerated={blurUnclothyGenerated} />
    </div>
  );
});

function areItemOrdersEqual(left, right) {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index]?.id !== right[index]?.id) return false;
  }
  return true;
}

function moveSingleItem(items, activeId, overId) {
  if (!overId || activeId === overId) return items;
  const oldIndex = items.findIndex((item) => item.id === activeId);
  const newIndex = items.findIndex((item) => item.id === overId);
  if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return items;
  return arrayMove(items, oldIndex, newIndex);
}

function moveSelectedBlock(items, draggedIds, overId) {
  if (!overId || draggedIds.length === 0) return items;

  const draggedSet = new Set(draggedIds);
  if (draggedSet.has(overId)) return items;

  const movingItems = items.filter((item) => draggedSet.has(item.id));
  if (movingItems.length === 0) return items;

  const remainingItems = items.filter((item) => !draggedSet.has(item.id));
  const insertIndex = remainingItems.findIndex((item) => item.id === overId);
  if (insertIndex === -1) return items;

  const nextItems = [...remainingItems];
  nextItems.splice(insertIndex, 0, ...movingItems);
  return nextItems;
}

function getPointFromEvent(event) {
  if (!event) return null;

  if ('touches' in event) {
    const touch = event.touches?.[0] ?? event.changedTouches?.[0];
    if (touch) {
      return { x: touch.clientX, y: touch.clientY };
    }
  }

  if (typeof event.clientX === 'number' && typeof event.clientY === 'number') {
    return { x: event.clientX, y: event.clientY };
  }

  return null;
}

export default function SortableMediaGrid({
  items,
  selectedIds,
  onItemsChange,
  onToggleSelect,
  onSelectRange,
  onPreview,
  onDragStateChange,
  blurUnclothyGenerated = true,
  gridColumns = 4,
}) {
  const [activeId, setActiveId] = useState(null);
  const [draggedIds, setDraggedIds] = useState([]);
  const [overId, setOverId] = useState(null);
  const [previewItems, setPreviewItems] = useState(items);
  const previewItemsRef = useRef(items);
  const draggedIdsRef = useRef([]);
  const touchSelectStateRef = useRef({
    active: false,
    activated: false,
    pointerId: null,
    originPhotoId: null,
    lastPhotoId: null,
    startX: 0,
    startY: 0,
  });
  const suppressNextClickRef = useRef(false);
  const pointerPositionRef = useRef(null);
  const pointerVelocityRef = useRef({ x: 0, y: 0 });
  const lastPointerSampleRef = useRef({ x: 0, y: 0, time: 0 });
  const autoScrollFrameRef = useRef(null);
  const previewCommitFrameRef = useRef(null);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const draggedSet = useMemo(() => new Set(draggedIds), [draggedIds]);
  const dragActive = activeId !== null;
  const selectionMode = selectedSet.size > 0;
  const visibleItems = dragActive ? previewItems : items;
  const sortableIds = useMemo(() => visibleItems.map((item) => item.id), [visibleItems]);
  const normalizedGridColumns = Math.max(2, Math.min(8, Number(gridColumns) || 4));
  const mobileGridColumns = Math.max(2, Math.min(4, normalizedGridColumns));
  const gridClassName = [
    MOBILE_GRID_COL_CLASS[mobileGridColumns] || 'grid-cols-2',
    SM_GRID_COL_CLASS[normalizedGridColumns] || 'sm:grid-cols-4',
    LG_GRID_COL_CLASS[normalizedGridColumns] || 'lg:grid-cols-4',
    XL_GRID_COL_CLASS[normalizedGridColumns] || 'xl:grid-cols-4',
  ].join(' ');

  useEffect(() => {
    if (!dragActive) {
      previewItemsRef.current = items;
      setPreviewItems(items);
    }
  }, [items, dragActive]);

  useEffect(
    () => () => {
      if (previewCommitFrameRef.current !== null) {
        window.cancelAnimationFrame(previewCommitFrameRef.current);
        previewCommitFrameRef.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    if (!dragActive || typeof window === 'undefined') {
      return undefined;
    }

    const samplePointer = (clientX, clientY) => {
      const previous = lastPointerSampleRef.current;
      const now = performance.now();
      const elapsed = previous.time > 0 ? Math.max(now - previous.time, 16) : 16;
      const deltaX = clientX - previous.x;
      const deltaY = clientY - previous.y;

      pointerPositionRef.current = { x: clientX, y: clientY };
      pointerVelocityRef.current = {
        x: previous.time > 0 ? (deltaX / elapsed) * 16 : 0,
        y: previous.time > 0 ? (deltaY / elapsed) * 16 : 0,
      };
      lastPointerSampleRef.current = { x: clientX, y: clientY, time: now };
    };

    const handlePointerMove = (event) => {
      samplePointer(event.clientX, event.clientY);
    };

    const handleTouchMove = (event) => {
      const point = getPointFromEvent(event);
      if (point) {
        samplePointer(point.x, point.y);
      }
    };

    const tick = () => {
      const point = pointerPositionRef.current;
      if (point) {
        const viewportHeight = window.innerHeight || 0;
        const edgeZone = Math.max(96, Math.min(180, Math.round(viewportHeight * 0.18)));
        const topDistance = point.y;
        const bottomDistance = viewportHeight - point.y;
        let direction = 0;
        let proximity = 0;

        if (topDistance < edgeZone) {
          direction = -1;
          proximity = 1 - topDistance / edgeZone;
        } else if (bottomDistance < edgeZone) {
          direction = 1;
          proximity = 1 - bottomDistance / edgeZone;
        }

        if (direction !== 0) {
          const velocityBoost = Math.min(1, Math.abs(pointerVelocityRef.current.y) / 22);
          const curvedProximity = proximity * proximity;
          const speed = Math.min(56, 4 + curvedProximity * 40 + velocityBoost * 12);
          window.scrollBy(0, direction * speed);
        }
      }

      autoScrollFrameRef.current = window.requestAnimationFrame(tick);
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    autoScrollFrameRef.current = window.requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('touchmove', handleTouchMove);
      if (autoScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(autoScrollFrameRef.current);
        autoScrollFrameRef.current = null;
      }
      pointerPositionRef.current = null;
      pointerVelocityRef.current = { x: 0, y: 0 };
      lastPointerSampleRef.current = { x: 0, y: 0, time: 0 };
    };
  }, [dragActive]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 260, tolerance: 8 },
    }),
  );

  const activePhoto = useMemo(
    () => visibleItems.find((photo) => photo.id === activeId) ?? items.find((photo) => photo.id === activeId) ?? null,
    [visibleItems, items, activeId],
  );

  const handleDragStart = ({ active, activatorEvent }) => {
    const activePhotoId = active.id;
    const dragIds = selectedSet.has(activePhotoId)
      ? items.filter((item) => selectedSet.has(item.id)).map((item) => item.id)
      : [activePhotoId];
    draggedIdsRef.current = dragIds;

    const startPoint = getPointFromEvent(activatorEvent);
    if (startPoint) {
      pointerPositionRef.current = startPoint;
      lastPointerSampleRef.current = { x: startPoint.x, y: startPoint.y, time: performance.now() };
      pointerVelocityRef.current = { x: 0, y: 0 };
    }

    setDraggedIds(dragIds);
    setActiveId(active.id);
    setOverId(active.id);
    previewItemsRef.current = items;
    setPreviewItems(items);
    onDragStateChange?.({ isDragging: true, draggingCount: dragIds.length });
  };

  const handleDragOver = ({ active, over }) => {
    const nextOverId = over?.id ?? null;
    if (!nextOverId) return;

    setOverId(nextOverId);

    const previous = previewItemsRef.current;
    const nextItems = draggedIdsRef.current.length > 1
      ? moveSelectedBlock(previous, draggedIdsRef.current, nextOverId)
      : moveSingleItem(previous, active.id, nextOverId);

    if (areItemOrdersEqual(previous, nextItems)) {
      return;
    }

    previewItemsRef.current = nextItems;

    if (previewCommitFrameRef.current !== null) {
      window.cancelAnimationFrame(previewCommitFrameRef.current);
    }

    previewCommitFrameRef.current = window.requestAnimationFrame(() => {
      previewCommitFrameRef.current = null;
      setPreviewItems(nextItems);
    });
  };

  const handleDragEnd = ({ over }) => {
    const nextOverId = over?.id ?? null;

    if (nextOverId && !areItemOrdersEqual(previewItems, items)) {
      onItemsChange(previewItems);
    }

    setActiveId(null);
    setDraggedIds([]);
    draggedIdsRef.current = [];
    setOverId(null);
    previewItemsRef.current = items;
    setPreviewItems(items);
    pointerPositionRef.current = null;
    pointerVelocityRef.current = { x: 0, y: 0 };
    onDragStateChange?.({ isDragging: false, draggingCount: 0 });
  };

  const handleDragCancel = () => {
    setActiveId(null);
    setDraggedIds([]);
    draggedIdsRef.current = [];
    setOverId(null);
    previewItemsRef.current = items;
    setPreviewItems(items);
    pointerPositionRef.current = null;
    pointerVelocityRef.current = { x: 0, y: 0 };
    onDragStateChange?.({ isDragging: false, draggingCount: 0 });
  };

  const dropAnimation = {
    duration: 190,
    easing: 'cubic-bezier(0.2, 0, 0, 1)',
    sideEffects: defaultDropAnimationSideEffects({
      styles: {
        active: {
          opacity: '0.45',
        },
      },
    }),
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      autoScroll={false}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext items={sortableIds} strategy={rectSortingStrategy}>
        <div
          className={`relative grid gap-3 overscroll-y-contain px-4 pb-6 sm:px-5 lg:px-6 ${gridClassName} ${
            selectedSet.size > 0 ? 'pb-32 lg:pb-28' : ''
          } ${dragActive ? 'rounded-xl bg-[linear-gradient(to_right,rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.08)_1px,transparent_1px)] bg-[size:20px_20px]' : ''}`}
        >
          {visibleItems.map((photo) => (
            <SortableMediaCard
              key={photo.id}
              photo={photo}
              isSelected={selectedSet.has(photo.id)}
              selectionMode={selectionMode}
              isDragging={draggedSet.has(photo.id)}
              isDropTarget={overId === photo.id && !draggedSet.has(photo.id)}
              dragActive={dragActive}
              onToggleSelect={onToggleSelect}
              onSelectRange={onSelectRange}
              touchSelectStateRef={touchSelectStateRef}
              suppressNextClickRef={suppressNextClickRef}
              onPreview={onPreview}
              blurUnclothyGenerated={blurUnclothyGenerated}
            />
          ))}
        </div>
      </SortableContext>

      <DragOverlay dropAnimation={dropAnimation} zIndex={70}>
        <OverlayCard
          photo={activePhoto}
          draggingCount={draggedIds.length}
          blurUnclothyGenerated={blurUnclothyGenerated}
        />
      </DragOverlay>
    </DndContext>
  );
}
