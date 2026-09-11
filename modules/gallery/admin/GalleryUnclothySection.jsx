'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import MediaPreview from '@/app/admin/gallery/components/MediaPreview';
import { useUnclothyTasksStore } from '@/store/unclothyTasks';
import { fetchJson, ghostButtonStyles } from './galleryAdminShared';
import {
  buildUnclothyProviderSettingsPayload,
  getUnclothyOptionsForUiKey,
  isAutomaticUnclothyAgeOption,
  normalizeUnclothyUiSettings,
  unclothyDefaultUiSettings,
} from '@/lib/unclothy-settings';

function isVideoMime(mimeType) {
  return typeof mimeType === 'string' && mimeType.toLowerCase().startsWith('video/');
}

function inferImageFromUrl(url) {
  if (typeof url !== 'string' || !url.trim()) return false;
  const normalized = url.trim();

  if (/\/image\/upload\//i.test(normalized)) return true;
  if (/\/video\/upload\//i.test(normalized)) return false;

  const withoutQuery = normalized.split('?')[0];
  return /\.(png|jpe?g|webp|gif)$/i.test(withoutQuery);
}

function isProbablyImage(photo) {
  if (!photo) return false;
  if (typeof photo.mimeType === 'string' && photo.mimeType.toLowerCase().startsWith('image/')) return true;
  if (photo.sourceType === 'gdrive' && photo.sourceId) return true;
  return inferImageFromUrl(photo.imageUrl);
}

function humanizeEnumOption(key, option) {
  const raw = String(option ?? '').trim();
  if (!raw) return '';
  const normalized = raw.toLowerCase();

  if (key === 'generationMode') {
    if (normalized === 'bikini') return 'Swimsuit';
    if (normalized === 'lingerie') return 'Underwire';
  }

  if (key === 'bodyType') {
    if (normalized === 'average') return 'Fit';
    if (normalized === 'athletic') return 'Muscular';
  }

  if (key === 'age') {
    if (isAutomaticUnclothyAgeOption(normalized)) return 'Automatic';
    return raw;
  }

  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export default function GalleryUnclothySection({
  controller,
  selectedAlbum,
  photo: photoProp = null,
  album: albumProp = null,
  showPreview = true,
  onEnqueued,
}) {
  const resolvedAlbum = albumProp || selectedAlbum || controller?.selectedAlbum || null;
  const selectedAlbumId = resolvedAlbum?.id ?? controller?.selectedAlbumId ?? null;

  const selectedPhotoIds = Array.isArray(controller?.selectedPhotoIds) ? controller.selectedPhotoIds : [];
  const selectedPhotoId = photoProp?.id ?? (selectedPhotoIds.length === 1 ? selectedPhotoIds[0] : null);

  const selectedPhoto = useMemo(() => {
    if (photoProp) return photoProp;
    if (!selectedPhotoId) return null;
    return Array.isArray(controller?.photos) ? controller.photos.find((photo) => photo.id === selectedPhotoId) : null;
  }, [controller?.photos, photoProp, selectedPhotoId]);

  const [status, setStatus] = useState({
    loading: true,
    enabled: false,
    configured: false,
    credits: null,
    canViewProviderCredits: false,
    quota: null,
    settingsEnums: {},
    warnings: [],
  });
  const [settings, setSettings] = useState(unclothyDefaultUiSettings);
  const [autoRefreshedAt, setAutoRefreshedAt] = useState(null);

  const queue = useUnclothyTasksStore((state) => state.queue);
  const active = useUnclothyTasksStore((state) => state.active);
  const activeTasks = useUnclothyTasksStore((state) => state.activeTasks);
  const failedTasks = useUnclothyTasksStore((state) => state.failedTasks);
  const enqueue = useUnclothyTasksStore((state) => state.enqueue);
  const clearQueue = useUnclothyTasksStore((state) => state.clearQueue);
  const cancelTask = useUnclothyTasksStore((state) => state.cancelTask);
  const retryTask = useUnclothyTasksStore((state) => state.retryTask);
  const startRunner = useUnclothyTasksStore((state) => state.startRunner);
  const lastCompletedAt = useUnclothyTasksStore((state) => state.lastCompletedAt);
  const lastCompletedAlbumId = useUnclothyTasksStore((state) => state.lastCompletedAlbumId);
  const lastCompletedAtRef = useRef(lastCompletedAt);

  const loadStatus = useCallback(async () => {
    setStatus((current) => ({ ...current, loading: true }));
    try {
      const data = await fetchJson('/api/admin/integrations/unclothy', { method: 'GET' });
      const result = data?.result && typeof data.result === 'object' ? data.result : data;
      setStatus({
        loading: false,
        enabled: result.enabled === true,
        configured: result.configured === true,
        credits: typeof result.credits === 'number' ? result.credits : null,
        canViewProviderCredits: result.canViewProviderCredits === true,
        quota: result.quota && typeof result.quota === 'object' ? result.quota : null,
        settingsEnums: result.settingsEnums && typeof result.settingsEnums === 'object' ? result.settingsEnums : {},
        warnings: Array.isArray(result.warnings) ? result.warnings.map(String).filter(Boolean) : [],
      });
    } catch (error) {
      toast.error(error?.message || 'Unable to load Unclothy status.');
      setStatus({ loading: false, enabled: false, configured: false, credits: null, canViewProviderCredits: false, quota: null, settingsEnums: {}, warnings: [] });
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (!selectedAlbumId) {
      return;
    }
    if (!lastCompletedAt || lastCompletedAt === lastCompletedAtRef.current) {
      return;
    }
    lastCompletedAtRef.current = lastCompletedAt;
    if (lastCompletedAlbumId !== selectedAlbumId) {
      return;
    }

    if (typeof controller?.loadPhotos === 'function') {
      void controller.loadPhotos(selectedAlbumId, controller?.sortMode);
    }
    if (typeof controller?.loadAlbums === 'function') {
      void controller.loadAlbums();
    }
    setAutoRefreshedAt(Date.now());
    void loadStatus();
  }, [controller, lastCompletedAlbumId, lastCompletedAt, loadStatus, selectedAlbumId]);

  const settingsEnums = useMemo(() => status.settingsEnums && typeof status.settingsEnums === 'object' ? status.settingsEnums : {}, [status.settingsEnums]);

  const getOptions = useCallback(
    (key) => {
      return getUnclothyOptionsForUiKey(key, settingsEnums);
    },
    [settingsEnums],
  );

  const normalizeSettings = useCallback(
    (candidate) => {
      return normalizeUnclothyUiSettings(candidate, settingsEnums);
    },
    [settingsEnums],
  );

  useEffect(() => {
    if (!selectedAlbumId) {
      return;
    }

    setSettings(unclothyDefaultUiSettings);
    const controllerAbort = new AbortController();
    fetchJson(`/api/admin/integrations/unclothy/album-defaults?albumId=${encodeURIComponent(selectedAlbumId)}`, {
      method: 'GET',
      signal: controllerAbort.signal,
    })
      .then((data) => {
        const result = data?.result && typeof data.result === 'object' ? data.result : data;
        if (!result?.settings) {
          return;
        }
        setSettings(normalizeSettings(result.settings));
      })
      .catch(() => {
        // ignore
      });

    return () => controllerAbort.abort();
  }, [normalizeSettings, selectedAlbumId]);

  useEffect(() => {
    setSettings((previous) => normalizeSettings(previous));
  }, [normalizeSettings]);

  const selectionProblem = useMemo(() => {
    if (!selectedAlbumId) return 'Select an album first.';
    if (!selectedPhotoId) return 'Select exactly 1 image from the album grid.';
    if (!selectedPhoto) return 'Selected item is not available yet. Try again.';
    if (isVideoMime(selectedPhoto.mimeType)) {
      return `Selected media must be an image (not video). (${selectedPhoto.mimeType})`;
    }
    if (!isProbablyImage(selectedPhoto)) {
      return `Selected media must be an image. (${selectedPhoto.mimeType || 'unknown type'})`;
    }
    return null;
  }, [selectedAlbumId, selectedPhoto, selectedPhotoId]);

  const quotaProblem = useMemo(() => {
    const quota = status.quota;
    if (!quota || quota.unlimited === true) return null;
    if (typeof quota.remainingThisMonth === 'number' && quota.remainingThisMonth <= 0) {
      return 'Monthly generation limit reached. Ask a super admin to add more credits.';
    }
    return null;
  }, [status.quota]);

  const canEnqueue = status.enabled && status.configured && !selectionProblem && !quotaProblem;

  const selectedRunningTask = useMemo(() => {
    if (!selectedAlbumId || !selectedPhotoId) return null;
    const candidates = [
      ...(Array.isArray(activeTasks) ? activeTasks : []),
      ...(Array.isArray(failedTasks) ? failedTasks : []),
    ];
    return candidates.find((task) => task?.albumId === selectedAlbumId && task?.sourcePhotoId === selectedPhotoId) ?? null;
  }, [activeTasks, failedTasks, selectedAlbumId, selectedPhotoId]);

  const displayTask = selectedRunningTask || active;
  const percent = typeof displayTask?.percent === 'number' ? Math.max(0, Math.min(100, displayTask.percent)) : 0;
  const phaseLabel = displayTask?.phase
    ? displayTask.phase === 'creating'
      ? 'Creating'
      : displayTask.phase === 'processing'
        ? 'Processing'
        : displayTask.phase === 'ingesting'
          ? 'Saving'
          : displayTask.phase === 'done'
            ? 'Done'
            : displayTask.phase === 'error'
              ? 'Error'
              : 'Queued'
    : null;

  const isActiveForSelection =
    Boolean(selectedRunningTask) ||
    (Boolean(active?.albumId) &&
      Boolean(active?.sourcePhotoId) &&
      active.albumId === selectedAlbumId &&
      active.sourcePhotoId === selectedPhotoId);

  const isSelectionQueued = useMemo(() => {
    if (!selectedAlbumId || !selectedPhotoId) return false;
    return Array.isArray(queue) && queue.some((task) => task?.albumId === selectedAlbumId && task?.sourcePhotoId === selectedPhotoId);
  }, [queue, selectedAlbumId, selectedPhotoId]);

  const disableInputs = Boolean(displayTask && displayTask.phase === 'ingesting' && isActiveForSelection);

  const basicFields = useMemo(() => ['generationMode', 'bodyType'], []);
  const advancedFields = useMemo(() => ['age', 'breastsSize', 'assSize', 'pussy'], []);

  const quickInfoStatusLabel = isActiveForSelection
    ? phaseLabel || 'Queued'
    : isSelectionQueued
      ? 'Queued'
    : displayTask
        ? phaseLabel || 'Queued'
        : quotaProblem
          ? 'Quota reached'
        : !status.enabled
          ? 'Disabled'
          : !status.configured
            ? 'Needs setup'
            : 'Ready';

  const quickInfoBadgeTone = displayTask?.phase === 'error'
    ? 'error'
    : displayTask?.phase === 'done'
      ? 'done'
      : displayTask
        ? 'active'
        : isSelectionQueued
          ? 'active'
          : quotaProblem
            ? 'warn'
            : !status.enabled || !status.configured
              ? 'warn'
              : 'ready';

  const activeSlotLimit = status.quota?.unlimited
    ? status.quota?.globalConcurrentGenerationLimit ?? 5
    : status.quota?.concurrentGenerationLimit ?? 1;

  const quickInfoBadgeClassName =
    quickInfoBadgeTone === 'error'
      ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-200'
      : quickInfoBadgeTone === 'done'
        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200'
        : quickInfoBadgeTone === 'warn'
          ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-200'
          : quickInfoBadgeTone === 'ready'
            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200'
            : 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-200';

  const quickInfoDotClassName =
    quickInfoBadgeTone === 'error'
      ? 'bg-rose-500'
      : quickInfoBadgeTone === 'done'
        ? 'bg-emerald-500'
        : quickInfoBadgeTone === 'warn'
          ? 'bg-amber-500'
          : quickInfoBadgeTone === 'ready'
            ? 'bg-emerald-500'
            : 'bg-sky-500';

  const quickInfoStep =
    displayTask?.phase === 'creating'
      ? 1
      : displayTask?.phase === 'processing'
        ? 2
        : displayTask?.phase === 'ingesting'
          ? 3
          : displayTask?.phase === 'done'
            ? 4
            : null;
  const quickInfoTotalSteps = 4;
  const quickInfoStepDetail =
    displayTask?.phase === 'creating'
      ? 'Creating request'
      : displayTask?.phase === 'processing'
        ? 'Preparing media'
        : displayTask?.phase === 'ingesting'
          ? 'Saving result'
          : displayTask?.phase === 'done'
            ? 'Complete'
            : displayTask?.phase === 'error'
              ? 'Failed'
              : 'Queued';

  const quickInfoEta =
    displayTask?.phase === 'processing'
      ? 'Usually takes less than a minute'
      : displayTask?.phase === 'creating' || displayTask?.phase === 'ingesting'
        ? 'Usually takes a few seconds'
        : 'Ready to generate';

  const settingsPayload = useMemo(() => {
    return buildUnclothyProviderSettingsPayload(settings, settingsEnums);
  }, [settings, settingsEnums]);

  const handleEnqueue = async () => {
    if (!canEnqueue) {
      toast.error(selectionProblem || quotaProblem || 'Complete all required fields first.');
      return;
    }

    try {
      void fetchJson('/api/admin/integrations/unclothy/album-defaults', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          albumId: selectedAlbumId,
          settings,
        }),
      });
    } catch {
      // ignore
    }

    try {
      const result = await enqueue({
        albumId: selectedAlbumId,
        sourcePhotoId: selectedPhotoId,
        settingsSnapshot: {
          ...settingsPayload,
        },
      });
      startRunner();
      if (result?.added) {
        onEnqueued?.();
        toast.success('Generation task queued.');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to queue generation task.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold tracking-tight text-slate-950 dark:text-slate-50">Generate</p>
          <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
            Queue a generation job for the selected image. It keeps running while you navigate.
          </p>
        </div>

        <button
          type="button"
          className={ghostButtonStyles}
          onClick={() => {
            if (displayTask?.phase === 'error') {
              cancelTask?.(displayTask.id || displayTask.queueTaskId);
            }
            loadStatus();
          }}
          disabled={status.loading}
        >
          {status.loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {showPreview && selectedPhoto ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
          <div className="aspect-square overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950">
            <MediaPreview
              url={selectedPhoto.imageUrl}
              mimeType={selectedPhoto.mimeType}
              sourceType={selectedPhoto.sourceType}
              sourceId={selectedPhoto.sourceId}
              alt={selectedPhoto.caption || `Media ${selectedPhoto.id}`}
              className="h-full w-full object-contain"
              controls={false}
            />
          </div>
          <p className="mt-3 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
            {selectedPhoto.caption || `media ${selectedPhoto.id}`}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{resolvedAlbum?.name}</p>
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">Quick info</p>
            <h3 className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-50">
              {displayTask ? 'Processing status' : 'Integration status'}
            </h3>
          </div>
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${quickInfoBadgeClassName}`}>
            <span className={`h-2 w-2 rounded-full ${quickInfoDotClassName}`} />
            {quickInfoStatusLabel}
          </span>
        </div>

        {selectionProblem || quotaProblem ? (
          <p className="mt-3 text-sm text-amber-700 dark:text-amber-200">{selectionProblem || quotaProblem}</p>
        ) : null}

        {displayTask ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/30">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">{displayTask.statusText || 'Working\u2026'}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {quickInfoStep
                    ? `Step ${quickInfoStep} of ${quickInfoTotalSteps} \u2022 ${quickInfoStepDetail}`
                    : quickInfoStepDetail}
                  {displayTask.providerStatus ? <span className="ml-1.5">({displayTask.providerStatus})</span> : null}
                </p>
              </div>
              <span className="text-sm font-semibold tabular-nums text-slate-700 dark:text-slate-200">{percent}%</span>
            </div>

            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-sky-500 transition-[width] duration-500"
                style={{ width: `${percent}%` }}
              />
            </div>

            <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
              <span>{quickInfoEta}</span>
              <span>{isActiveForSelection ? 'Active' : 'Background'}</span>
            </div>
          </div>
        ) : queue.length > 0 ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-950/30 dark:text-slate-200">
            {queue.length} task(s) queued.
          </div>
        ) : null}

        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/30">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Status</p>
            <p className="mt-1 font-semibold text-slate-900 dark:text-slate-50">{quickInfoStatusLabel}</p>
          </div>
          {status.canViewProviderCredits ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/30">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Provider</p>
              <p className="mt-1 flex items-baseline gap-1 font-semibold text-slate-900 dark:text-slate-50 whitespace-nowrap">
                <span className="tabular-nums">{status.credits ?? '\u2014'}</span>
                {typeof status.credits === 'number' ? (
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">credits</span>
                ) : null}
              </p>
            </div>
          ) : null}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/30">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Monthly</p>
            <p className="mt-1 flex items-baseline gap-1 font-semibold text-slate-900 dark:text-slate-50 whitespace-nowrap">
              {status.quota?.unlimited ? (
                'Unlimited'
              ) : (
                <>
                  <span className="tabular-nums">{status.quota?.remainingThisMonth ?? 0}</span>
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    /{status.quota?.monthlyGenerationLimit ?? 0} left
                  </span>
                </>
              )}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/30 sm:col-span-3">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Active slots</p>
            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-50">
              {status.quota?.activeReserved ?? 0}/{activeSlotLimit} reserved for this account
            </p>
          </div>
        </div>

        {displayTask && displayTask.phase !== 'error' && displayTask.phase !== 'done' ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={ghostButtonStyles} onClick={() => cancelTask?.(displayTask.id || displayTask.queueTaskId)}>
              Cancel
            </button>
          </div>
        ) : null}

        {displayTask?.phase === 'error' ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={ghostButtonStyles} onClick={() => cancelTask?.(displayTask.id || displayTask.queueTaskId)}>
              Dismiss
            </button>
            <button
              type="button"
              className={ghostButtonStyles}
              disabled={disableInputs}
              onClick={() => {
                retryTask?.(displayTask.id || displayTask.queueTaskId);
              }}
            >
              Retry
            </button>
            <p className="w-full text-xs leading-5 text-slate-500 dark:text-slate-400">
              Failed and canceled jobs do not consume the monthly account quota.
            </p>
          </div>
        ) : null}

        {status.warnings.length > 0 ? (
          <div className="mt-3 space-y-1 text-xs text-amber-700 dark:text-amber-200">
            {status.warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        ) : null}

        {autoRefreshedAt ? (
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Album refreshed after background save.</p>
        ) : null}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">Basic settings</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Show the two most-used fields first.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            Primary
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          {basicFields.map((key) => {
            const options = getOptions(key);
            const value = settings[key] ?? '';
            const label = key === 'generationMode' ? 'Generation mode' : key === 'bodyType' ? 'Body type' : key;

            return (
              <label key={key} className="block text-sm font-medium text-slate-900 dark:text-slate-50">
                <span className="mb-1.5 block truncate whitespace-nowrap">{label}</span>
                <select
                  className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950/30 dark:text-slate-50"
                  value={String(value)}
                  onChange={(event) => setSettings((previous) => ({ ...previous, [key]: event.target.value }))}
                  disabled={disableInputs}
                >
                  {options.map((option) => (
                    <option key={option} value={option}>
                      {humanizeEnumOption(key, option)}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">Advanced settings</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {advancedFields.map((key) => {
            const options = getOptions(key);
            const value = settings[key] ?? '';
            const label =
              key === 'age'
                ? 'Age'
                : key === 'breastsSize'
                ? 'Chest size'
                : key === 'assSize'
                  ? 'Hip size'
                  : key === 'pussy'
                    ? 'Hair detail'
                    : key;

            return (
              <label key={key} className="block text-sm font-medium text-slate-900 dark:text-slate-50">
                <span className="mb-1.5 block">{label}</span>
                <select
                  className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950/30 dark:text-slate-50"
                  value={String(value)}
                  onChange={(event) => setSettings((previous) => ({ ...previous, [key]: event.target.value }))}
                  disabled={disableInputs}
                >
                  {options.map((option) => (
                    <option key={option} value={option}>
                      {humanizeEnumOption(key, option)}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-50 dark:text-slate-900"
        disabled={!canEnqueue || disableInputs}
        onClick={handleEnqueue}
      >
        {queue.length > 0 || displayTask ? 'Add to queue' : 'Generate'}
      </button>


    </div>
  );
}
