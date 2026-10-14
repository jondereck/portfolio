'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, DragOverlay, PointerSensor, closestCenter, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import { handleRequest } from '@/lib/handleRequest';
import { normalizeFormError } from '@/lib/form-client';
import { notifyRealtimeUpdate, revalidatePublicData } from '@/lib/realtime';
import DeleteDialog from '@/components/DeleteDialog';

const sectionTitleStyles = 'text-sm font-semibold text-slate-900 dark:text-slate-100';
const sectionHintStyles = 'text-xs text-slate-500 dark:text-slate-400';
const panelStyles = 'rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900';

const buildBuckets = (items) => {
  const featured = [];
  const regular = [];
  (Array.isArray(items) ? items : []).forEach((item) => {
    if (item?.isFeatured) featured.push(item);
    else regular.push(item);
  });
  return { featured, regular };
};

const shallowEqualIdList = (a, b) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

function SortableRow({ item, onEdit, onDelete, deletingId }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    transition: { duration: 180, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 border-b border-slate-100 px-3 py-2.5 last:border-b-0 dark:border-slate-800 ${
        isDragging ? 'opacity-50' : 'opacity-100'
      }`}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        aria-label="Drag to reorder"
        title="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{item.title}</span>
          {item.category ? (
            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-200">
              {item.category}
            </span>
          ) : null}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span
            className={`w-fit rounded-full px-2 py-0.5 text-[11px] ${
              item.isPublished
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
            }`}
          >
            {item.isPublished ? 'Published' : 'Draft'}
          </span>
          {item.issuer ? <span className="truncate text-[11px] text-slate-500 dark:text-slate-400">{item.issuer}</span> : null}
          <span className="text-[11px] text-slate-400">#{item.id}</span>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          className="h-8 rounded-md px-2 text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
          onClick={() => onEdit(item.id)}
        >
          Edit
        </button>
        <DeleteDialog
          label={`certificate #${item.id}`}
          onConfirm={() => onDelete(item.id)}
          pending={deletingId === item.id}
        />
      </div>
    </div>
  );
}

function OverlayRow({ item }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-white px-3 py-2.5 shadow-lg dark:border-slate-700 dark:bg-slate-900">
      <div className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 dark:text-slate-300">
        <GripVertical className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{item?.title ?? 'Certificate'}</span>
          {item?.category ? (
            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-200">
              {item.category}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DroppablePanel({ id, children }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={isOver ? 'bg-slate-50/60 dark:bg-slate-950/20' : ''}>
      {children}
    </div>
  );
}

export default function PortfolioCertificatesArrangeTable({
  items,
  loading,
  saving: formSaving,
  deletingId,
  onEdit,
  onDelete,
  onRefresh,
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [localFeatured, setLocalFeatured] = useState([]);
  const [localRegular, setLocalRegular] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [orderSaving, setOrderSaving] = useState(false);
  const baselineRef = useRef({ featuredIds: [], regularIds: [] });

  const itemMap = useMemo(() => new Map((Array.isArray(items) ? items : []).map((item) => [item.id, item])), [items]);

  useEffect(() => {
    const buckets = buildBuckets(items);
    setLocalFeatured(buckets.featured);
    setLocalRegular(buckets.regular);
    baselineRef.current = {
      featuredIds: buckets.featured.map((item) => item.id),
      regularIds: buckets.regular.map((item) => item.id),
    };
  }, [items]);

  const featuredIds = useMemo(() => localFeatured.map((item) => item.id), [localFeatured]);
  const regularIds = useMemo(() => localRegular.map((item) => item.id), [localRegular]);

  const orderDirty = useMemo(() => {
    const base = baselineRef.current;
    return !shallowEqualIdList(base.featuredIds, featuredIds) || !shallowEqualIdList(base.regularIds, regularIds);
  }, [featuredIds, regularIds]);

  const activeItem = activeId ? itemMap.get(activeId) : null;

  const findContainer = useCallback(
    (id) => {
      if (id === 'featured' || featuredIds.includes(id)) return 'featured';
      if (id === 'regular' || regularIds.includes(id)) return 'regular';
      return null;
    },
    [featuredIds, regularIds],
  );

  const moveItem = useCallback(
    ({ active, over }) => {
      if (!over) return;
      const activeContainer = findContainer(active.id);
      const overContainer = findContainer(over.id);
      if (!activeContainer || !overContainer) return;

      const isSameContainer = activeContainer === overContainer;
      const getList = (container) => (container === 'featured' ? localFeatured : localRegular);
      const setList = (container, next) => (container === 'featured' ? setLocalFeatured(next) : setLocalRegular(next));

      if (isSameContainer) {
        const list = getList(activeContainer);
        const oldIndex = list.findIndex((item) => item.id === active.id);
        const newIndex = list.findIndex((item) => item.id === over.id);
        if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;
        setList(activeContainer, arrayMove(list, oldIndex, newIndex));
        return;
      }

      const fromList = getList(activeContainer);
      const toList = getList(overContainer);
      const movingIndex = fromList.findIndex((item) => item.id === active.id);
      if (movingIndex === -1) return;
      const moving = fromList[movingIndex];
      const nextFrom = fromList.filter((item) => item.id !== active.id);

      let insertIndex = toList.findIndex((item) => item.id === over.id);
      if (over.id === overContainer || insertIndex === -1) {
        insertIndex = toList.length;
      }
      const nextTo = [...toList.slice(0, insertIndex), moving, ...toList.slice(insertIndex)];

      setList(activeContainer, nextFrom);
      setList(overContainer, nextTo);
    },
    [findContainer, localFeatured, localRegular],
  );

  const onSaveOrder = useCallback(async () => {
    setOrderSaving(true);
    try {
      await handleRequest(() =>
        fetch('/api/certificates/reorder', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ featuredIds, regularIds }),
        }),
      );
      await onRefresh?.();
      await revalidatePublicData();
      notifyRealtimeUpdate();
      toast.success('Certificate order saved.');
    } catch (requestError) {
      const normalized = normalizeFormError(requestError, 'Unable to save order');
      toast.error('Unable to save order', { description: normalized.formError });
    } finally {
      setOrderSaving(false);
    }
  }, [featuredIds, regularIds, onRefresh]);

  if (loading) {
    return <p className="text-sm text-slate-500">Loading certificates…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className={sectionTitleStyles}>Arrange Certificates</p>
          <p className={sectionHintStyles}>Drag within a list to reorder, or drag across lists to toggle Featured.</p>
        </div>
        <button
          type="button"
          className="h-8 rounded-md bg-slate-900 px-3 text-sm text-white disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900"
          disabled={!orderDirty || orderSaving || formSaving}
          onClick={onSaveOrder}
        >
          {orderSaving ? 'Saving…' : 'Save order'}
        </button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={(event) => setActiveId(event.active?.id ?? null)}
        onDragOver={(event) => moveItem({ active: event.active, over: event.over })}
        onDragEnd={() => setActiveId(null)}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div className={panelStyles}>
            <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <p className={sectionTitleStyles}>Featured</p>
              <p className={sectionHintStyles}>Always shown at the top on the public portfolio.</p>
            </div>
            <DroppablePanel id="featured">
              <SortableContext items={featuredIds} strategy={verticalListSortingStrategy}>
                {localFeatured.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-slate-500">No featured certificates.</div>
                ) : (
                  localFeatured.map((item) => (
                    <SortableRow
                      key={item.id}
                      item={item}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      deletingId={deletingId}
                    />
                  ))
                )}
              </SortableContext>
            </DroppablePanel>
          </div>

          <div className={panelStyles}>
            <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <p className={sectionTitleStyles}>Regular</p>
              <p className={sectionHintStyles}>Paginated on the public portfolio.</p>
            </div>
            <DroppablePanel id="regular">
              <SortableContext items={regularIds} strategy={verticalListSortingStrategy}>
                {localRegular.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-slate-500">No regular certificates.</div>
                ) : (
                  localRegular.map((item) => (
                    <SortableRow
                      key={item.id}
                      item={item}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      deletingId={deletingId}
                    />
                  ))
                )}
              </SortableContext>
            </DroppablePanel>
          </div>
        </div>

        <DragOverlay>{activeItem ? <OverlayRow item={activeItem} /> : null}</DragOverlay>
      </DndContext>
    </div>
  );
}
