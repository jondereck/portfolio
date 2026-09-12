from pathlib import Path

path = Path(r'C:\Users\jonde\portfolio\app\admin\gallery\components\SortableMediaGrid.jsx')
text = path.read_text(encoding='utf-8')
start = text.index('const SortableMediaCard = memo(function SortableMediaCard({')
end = text.index('function areItemOrdersEqual(left, right) {')

new_card = r'''const SortableMediaCard = memo(function SortableMediaCard({
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

'''

path.write_text(text[:start] + new_card + text[end:], encoding='utf-8')
print('ok')
