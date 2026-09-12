'use client';

import { useSyncExternalStore } from 'react';

const listeners = new Set();
const pollIntervalMs = 3500;
const localWorkerTickIntervalMs = 7000;

let hydrated = false;
let polling = false;
let pollTimer = null;
let refreshInFlight = false;
let workerTickInFlight = false;
let lastWorkerTickAt = 0;
let knownCompletedTaskIds = new Set();
let snapshot = null;

let state = {
  tasks: [],
  queue: [],
  activeTasks: [],
  failedTasks: [],
  completedTasks: [],
  active: null,
  lastCompletedAt: null,
  lastCompletedAlbumId: null,
  loading: false,
  error: null,
};

const emitChange = () => {
  listeners.forEach((listener) => listener());
};

function buildSnapshot() {
  return {
    ...state,
    hydrateFromLocalStorage,
    enqueue,
    clearQueue,
    cancelActive,
    cancelTask,
    retryActive,
    retryTask,
    stopTrackingActive,
    startRunner,
    stopRunner,
    refreshTasks,
  };
}

function normalizeTask(task) {
  if (!task || typeof task !== 'object') return null;
  return {
    ...task,
    id: typeof task.id === 'string' ? task.id : task.queueTaskId,
    queueTaskId: typeof task.queueTaskId === 'string' ? task.queueTaskId : task.id,
    settingsSnapshot: task.settingsSnapshot && typeof task.settingsSnapshot === 'object' ? task.settingsSnapshot : {},
  };
}

function deriveTaskState(tasks) {
  const normalized = Array.isArray(tasks) ? tasks.map(normalizeTask).filter(Boolean) : [];
  const queue = normalized.filter((task) => task.status === 'queued' || task.phase === 'queued');
  const activeTasks = normalized.filter((task) => task.status === 'running');
  const failedTasks = normalized.filter((task) => task.status === 'failed' || task.phase === 'error');
  const completedTasks = normalized.filter((task) => task.status === 'completed' || task.phase === 'done');

  for (const task of completedTasks) {
    if (!task.id || knownCompletedTaskIds.has(task.id)) {
      continue;
    }
    knownCompletedTaskIds.add(task.id);
    state.lastCompletedAt = task.completedAt || Date.now();
    state.lastCompletedAlbumId = typeof task.albumId === 'number' ? task.albumId : null;
  }

  return {
    tasks: normalized,
    queue,
    activeTasks,
    failedTasks,
    completedTasks,
    active: activeTasks[0] || failedTasks[0] || null,
  };
}

const setState = (patch) => {
  state = { ...state, ...patch };
  snapshot = buildSnapshot();
  emitChange();
};

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const getSnapshot = () => snapshot ?? (snapshot = buildSnapshot());

export const useUnclothyTasksStore = (selector = (value) => value) =>
  useSyncExternalStore(subscribe, () => selector(getSnapshot()), () => selector(getSnapshot()));

useUnclothyTasksStore.getState = getSnapshot;

async function parseResponse(response, fallbackMessage) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || fallbackMessage);
  }
  return payload;
}

function getResult(payload) {
  return payload?.result && typeof payload.result === 'object' ? payload.result : payload;
}

export function hydrateFromLocalStorage() {
  hydrated = true;
}

function hasRunnableTasks() {
  return state.queue.length > 0 || state.activeTasks.length > 0;
}

async function tickLocalWorkerIfNeeded() {
  if (!hasRunnableTasks()) return;
  if (workerTickInFlight) return;

  const now = Date.now();
  if (now - lastWorkerTickAt < localWorkerTickIntervalMs) {
    return;
  }

  workerTickInFlight = true;
  lastWorkerTickAt = now;
  try {
    await fetch('/api/admin/integrations/unclothy/worker', {
      method: 'POST',
      cache: 'no-store',
    });
  } catch {
    // Ignore local fallback errors; status polling still updates UI.
  } finally {
    workerTickInFlight = false;
  }
}

export async function refreshTasks() {
  if (refreshInFlight) return;
  refreshInFlight = true;
  setState({ loading: true, error: null });
  try {
    const response = await fetch('/api/admin/integrations/unclothy/tasks', { method: 'GET', cache: 'no-store' });
    if (response.status === 401 || response.status === 403) {
      stopRunner();
      setState({ loading: false, error: null });
      return;
    }
    const payload = await parseResponse(response, 'Unable to load Unclothy tasks.');
    const result = getResult(payload);
    const derived = deriveTaskState(Array.isArray(result?.tasks) ? result.tasks : []);
    setState({ ...derived, loading: false, error: null });
  } catch (error) {
    setState({ loading: false, error: error instanceof Error ? error.message : 'Unable to load Unclothy tasks.' });
  } finally {
    refreshInFlight = false;
  }
}

export async function enqueue({ albumId, sourcePhotoId, settingsSnapshot }) {
  if (!albumId || !sourcePhotoId) return { added: false };
  hydrateFromLocalStorage();

  const response = await fetch('/api/admin/integrations/unclothy/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      albumId,
      sourcePhotoId,
      confirmedAdultConsent: true,
      settings: settingsSnapshot ?? {},
    }),
  });
  await parseResponse(response, 'Unable to queue Unclothy task.');
  await refreshTasks();
  startRunner();
  return { added: true };
}

export async function cancelTask(taskId) {
  if (!taskId) return;
  const response = await fetch(`/api/admin/integrations/unclothy/tasks/${encodeURIComponent(taskId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'cancel' }),
  });
  await parseResponse(response, 'Unable to cancel Unclothy task.');
  await refreshTasks();
}

export async function retryTask(taskId) {
  if (!taskId) return;
  const response = await fetch(`/api/admin/integrations/unclothy/tasks/${encodeURIComponent(taskId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'retry' }),
  });
  await parseResponse(response, 'Unable to retry Unclothy task.');
  await refreshTasks();
  startRunner();
}

export async function clearQueue() {
  const queued = [...state.queue];
  await Promise.all(queued.map((task) => cancelTask(task.id || task.queueTaskId).catch(() => null)));
  await refreshTasks();
}

export function stopTrackingActive() {
  const failed = state.failedTasks[0];
  if (failed?.id) {
    void cancelTask(failed.id);
  }
}

export function cancelActive() {
  const active = state.active;
  if (active?.id) {
    void cancelTask(active.id);
  }
}

export function retryActive() {
  const failed = state.failedTasks[0] || (state.active?.status === 'failed' ? state.active : null);
  if (failed?.id) {
    void retryTask(failed.id);
  }
}

async function runPollCycle() {
  await refreshTasks();
  if (!polling || !hasRunnableTasks()) return;
  await tickLocalWorkerIfNeeded();
  await refreshTasks();
}

function ensurePollTimer() {
  if (pollTimer || typeof window === 'undefined') return;
  pollTimer = window.setInterval(() => {
    void (async () => {
      await runPollCycle();
      syncPollingWithTasks();
    })();
  }, pollIntervalMs);
}

function syncPollingWithTasks() {
  if (hasRunnableTasks()) {
    ensurePollTimer();
    return;
  }
  if (pollTimer) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
  polling = false;
}

export function startRunner() {
  hydrateFromLocalStorage();
  if (typeof window === 'undefined') return;
  // Already actively polling runnable work.
  if (polling && pollTimer) return;
  polling = true;
  void (async () => {
    await runPollCycle();
    if (!polling) return;
    syncPollingWithTasks();
  })();
}

export function stopRunner() {
  if (pollTimer) {
    window.clearInterval(pollTimer);
  }
  pollTimer = null;
  polling = false;
  workerTickInFlight = false;
}
