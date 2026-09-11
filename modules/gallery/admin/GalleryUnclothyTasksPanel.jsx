'use client';

import { useEffect, useMemo, useState } from 'react';
import { Clock3, Image as ImageIcon, Loader2, TriangleAlert, X } from 'lucide-react';
import { getUnclothyGenerationModeLabel } from '@/lib/unclothy-settings';

function clampPercent(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function phaseLabel(phase) {
  if (!phase) return 'Queued';
  if (phase === 'creating') return 'Creating';
  if (phase === 'processing') return 'Processing';
  if (phase === 'ingesting') return 'Saving';
  if (phase === 'done') return 'Done';
  if (phase === 'error') return 'Error';
  if (phase === 'canceled') return 'Canceled';
  return 'Queued';
}

function getAlbumLabel(task) {
  return task?.albumName || (task?.albumId ? `Album ${task.albumId}` : 'Album');
}

function getSourceLabel(task) {
  return task?.sourcePhotoLabel || (task?.sourcePhotoId ? `Image ${task.sourcePhotoId}` : 'Image');
}

function shortenLabel(value, maxLength = 18) {
  const label = String(value || '').trim();
  if (!label) return '';
  if (label.length <= maxLength) return label;
  return `${label.slice(0, maxLength).trim()}...`;
}

function humanizeModeLabel(value) {
  const label = String(value || '').trim();
  if (!label) return '';

  const knownLabels = {
    bikini: 'Swimsuit',
    bondage: 'Bondage',
    latex: 'Latex',
    lingerie: 'Underwear',
    naked: 'Naked',
    swimsuit: 'Swimsuit',
    underwear: 'Underwear',
  };
  const normalized = label.toLowerCase();
  if (knownLabels[normalized]) return knownLabels[normalized];

  return label
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getShortSourceLabel(task) {
  return shortenLabel(getSourceLabel(task));
}

function formatGeneratedAt(value) {
  const timestamp = typeof value === 'number' ? value : null;
  if (!timestamp) return 'Generated recently';
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(timestamp));
  } catch {
    return 'Generated recently';
  }
}

function formatDuration(durationMs) {
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs)) return 'Duration unavailable';
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function getTaskModeLabel(task) {
  return humanizeModeLabel(
    getUnclothyGenerationModeLabel(task?.settingsSent) || getUnclothyGenerationModeLabel(task?.settingsSnapshot),
  );
}

function getModeFirstLabel(task) {
  const generationMode = getTaskModeLabel(task);
  const sourceLabel = getShortSourceLabel(task);
  if (generationMode && sourceLabel) return `${generationMode} - ${sourceLabel}`;
  return generationMode || sourceLabel || 'Generation';
}

function RunningTaskCard({ task, onOpenTask, onCancelActive }) {
  const percent = clampPercent(task?.percent);
  const status = task.statusText || phaseLabel(task.phase);
  const provider = task.providerStatus ? ` (${task.providerStatus})` : '';

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/40">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">{phaseLabel(task.phase)}</p>
          <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
            {getModeFirstLabel(task)}
          </p>
        </div>
        <span className="text-sm font-semibold tabular-nums text-slate-700 dark:text-slate-200">{percent}%</span>
      </div>

      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div className="h-full rounded-full bg-sky-500 transition-[width] duration-500" style={{ width: `${percent}%` }} />
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
        <span className="truncate">{`${status}${provider}`}</span>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            onClick={() =>
              onOpenTask?.({
                albumId: task.albumId,
                sourcePhotoId: task.sourcePhotoId,
                suppressNotFoundError: true,
              })
            }
          >
            <ImageIcon className="h-3.5 w-3.5" />
            Open
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            onClick={() => onCancelActive?.(task)}
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function QueuedTaskRow({ task, index, onOpenTask, onCancelQueued }) {
  const generationMode = getTaskModeLabel(task);
  const sourceLabel = getShortSourceLabel(task);

  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-slate-900 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-50">
      <button
        type="button"
        onClick={() =>
          onOpenTask?.({
            albumId: task.albumId,
            sourcePhotoId: task.sourcePhotoId,
            suppressNotFoundError: true,
          })
        }
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-100">
          <Clock3 className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">
            Queued #{index + 1} - {generationMode || 'Generation'}
          </span>
          <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-300">
            {getAlbumLabel(task)}
            {sourceLabel ? ` - ${sourceLabel}` : ''}
          </span>
        </span>
      </button>
      <button
        type="button"
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
        onClick={() => onCancelQueued?.(task)}
        aria-label={`Cancel queued task for ${getAlbumLabel(task)}`}
        title="Cancel task"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function HistoryRow({ task, onOpenTask }) {
  const sublabel = getModeFirstLabel(task);
  const openPayload = {
    albumId: task.albumId,
    sourcePhotoId: task.createdPhotoId || task.sourcePhotoId,
    suppressNotFoundError: false,
  };

  return (
    <button
      type="button"
      className="flex w-full items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-900/60"
      onClick={() => onOpenTask?.(openPayload)}
    >
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-100">
        <ImageIcon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-50">{getAlbumLabel(task)}</span>
        <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-300">{sublabel}</span>
      </span>
      <span className="shrink-0 text-right text-xs text-slate-500 dark:text-slate-300">
        <span className="block">{formatGeneratedAt(task.completedAt)}</span>
        <span className="mt-0.5 block tabular-nums">{formatDuration(task.durationMs)}</span>
      </span>
    </button>
  );
}

function SegmentedTab({ active, label, count, onClick }) {
  const activeStyles = active
    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-50'
    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-50';

  return (
    <button
      type="button"
      className={`inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-2xl px-3 text-sm font-semibold transition ${activeStyles}`}
      onClick={onClick}
      aria-pressed={active}
    >
      <span className="truncate">{label}</span>
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-700 dark:bg-slate-800 dark:text-slate-200">
        {count}
      </span>
    </button>
  );
}

export default function GalleryUnclothyTasksPanel({
  active,
  activeTasks,
  failedTasks,
  completedTasks,
  queue,
  onOpenTask,
  onCancelActive,
  onRetryActive,
  onDismissActive,
  onCancelQueued,
  onClearQueue,
  hideWhenEmpty = false,
}) {
  const queued = Array.isArray(queue) ? queue : [];
  const completedRaw = Array.isArray(completedTasks) ? completedTasks : [];
  const completed = useMemo(() => {
    const retentionMs = 7 * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - retentionMs;
    return completedRaw.filter((task) => {
      const ts =
        typeof task?.completedAt === 'number'
          ? task.completedAt
          : typeof task?.createdAt === 'number'
            ? task.createdAt
            : null;
      return ts ? ts >= cutoff : true;
    });
  }, [completedRaw]);
  const runningAll = Array.isArray(activeTasks) && activeTasks.length > 0 ? activeTasks : active?.status === 'running' ? [active] : [];
  const running = runningAll.slice(0, 3);
  const failed = Array.isArray(failedTasks) ? failedTasks : active?.phase === 'error' ? [active] : [];
  const hasAny = running.length > 0 || queued.length > 0 || failed.length > 0 || completed.length > 0;

  const taskCount = runningAll.length + failed.length + queued.length;
  const historyCount = completed.length;
  const hasTaskItems = taskCount > 0;
  const [tab, setTab] = useState(() => (!hasTaskItems && historyCount > 0 ? 'history' : 'tasks'));
  const [historyPage, setHistoryPage] = useState(1);
  const historyPageSize = 6;
  const historyTotalPages = Math.max(1, Math.ceil(historyCount / historyPageSize));
  const historyStartIndex = historyCount === 0 ? 0 : (historyPage - 1) * historyPageSize + 1;
  const historyEndIndex = Math.min(historyCount, historyPage * historyPageSize);
  const pagedCompleted = completed.slice((historyPage - 1) * historyPageSize, historyPage * historyPageSize);

  useEffect(() => {
    if (tab === 'tasks' && !hasTaskItems && historyCount > 0) {
      setTab('history');
    }
  }, [hasTaskItems, historyCount, tab]);

  useEffect(() => {
    setHistoryPage(1);
  }, [tab]);

  useEffect(() => {
    setHistoryPage((current) => Math.min(Math.max(1, current), historyTotalPages));
  }, [historyTotalPages]);

  if (!hasAny) {
    if (hideWhenEmpty) {
      return null;
    }
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
        No generation tasks running.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-1 shadow-sm dark:border-slate-800 dark:bg-slate-950/40">
        <div className="flex items-center gap-1">
          <SegmentedTab active={tab === 'tasks'} label="Tasks" count={taskCount} onClick={() => setTab('tasks')} />
          <SegmentedTab active={tab === 'history'} label="History" count={historyCount} onClick={() => setTab('history')} />
        </div>
      </div>

      {tab === 'tasks' ? (
        <>
          {running.length > 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">Currently running</p>
                  <p className="mt-1 text-sm font-semibold text-slate-950 dark:text-slate-50">
                    {runningAll.length} active{runningAll.length > 3 ? ` (showing 3, +${runningAll.length - 3} more)` : ''}
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {running.map((task) => (
                  <RunningTaskCard
                    key={task.id || task.queueTaskId}
                    task={task}
                    onOpenTask={onOpenTask}
                    onCancelActive={onCancelActive}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {failed.length > 0 ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 shadow-sm dark:border-rose-900/50 dark:bg-rose-950/30">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-rose-700 dark:text-rose-200">Failed</p>
              <div className="mt-3 space-y-3">
                {failed.map((task) => (
                  <div key={task.id || task.queueTaskId} className="space-y-2">
                    <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-100">
                      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                      <span className="leading-6">{task.errorMessage || task.statusText || 'Task failed.'}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                        onClick={() => onDismissActive?.(task)}
                      >
                        Dismiss
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                        onClick={() => onRetryActive?.(task)}
                      >
                        Retry
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {queued.length > 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">Pending queue</p>
                  <p className="mt-1 text-sm font-semibold text-slate-950 dark:text-slate-50">{queued.length} task(s)</p>
                </div>
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  onClick={() => onClearQueue?.()}
                >
                  Clear
                </button>
              </div>

              <div className="mt-4 space-y-2">
                {queued.map((task, index) => (
                  <QueuedTaskRow
                    key={task.queueTaskId || `${task.albumId}:${task.sourcePhotoId}:${task.createdAt || index}`}
                    task={task}
                    index={index}
                    onOpenTask={onOpenTask}
                    onCancelQueued={onCancelQueued}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {!hasTaskItems ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              No tasks right now.
            </div>
          ) : null}
        </>
      ) : completed.length > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">Recently generated</p>
              <p className="mt-1 text-sm font-semibold text-slate-950 dark:text-slate-50">{completed.length} saved result(s)</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Showing <span className="tabular-nums">{historyStartIndex}–{historyEndIndex}</span> of{' '}
                <span className="tabular-nums">{historyCount}</span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setHistoryPage((current) => Math.max(1, current - 1))}
                disabled={historyPage <= 1}
                className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 disabled:opacity-50 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Prev
              </button>
              <span className="inline-flex items-center rounded-xl bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                <span className="tabular-nums">{historyPage}</span>
                <span className="px-1 text-slate-400 dark:text-slate-500">/</span>
                <span className="tabular-nums">{historyTotalPages}</span>
              </span>
              <button
                type="button"
                onClick={() => setHistoryPage((current) => Math.min(historyTotalPages, current + 1))}
                disabled={historyPage >= historyTotalPages}
                className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 disabled:opacity-50 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Next
              </button>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {pagedCompleted.map((task) => (
              <HistoryRow key={task.id || task.queueTaskId} task={task} onOpenTask={onOpenTask} />
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          No history yet.
        </div>
      )}
    </div>
  );
}
