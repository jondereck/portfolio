'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { stopRunner, useUnclothyTasksStore } from '@/store/unclothyTasks';

export default function UnclothyTaskNotifier() {
  const hydrate = useUnclothyTasksStore((state) => state.hydrateFromLocalStorage);
  const startRunner = useUnclothyTasksStore((state) => state.startRunner);
  const active = useUnclothyTasksStore((state) => state.active);
  const activeTasks = useUnclothyTasksStore((state) => state.activeTasks);
  const failedTasks = useUnclothyTasksStore((state) => state.failedTasks);
  const queue = useUnclothyTasksStore((state) => state.queue);
  const previousPhaseRef = useRef(null);
  const previousTaskIdRef = useRef(null);

  useEffect(() => {
    hydrate();
    // One bootstrap check; store keeps polling only while queued/running tasks exist.
    startRunner();
    return () => {
      stopRunner();
    };
  }, [hydrate, startRunner]);

  useEffect(() => {
    const watchedTask = active || activeTasks?.[0] || failedTasks?.[0] || null;
    const phase = watchedTask?.phase ?? null;
    const taskId = watchedTask?.taskId ?? watchedTask?.providerTaskId ?? watchedTask?.id ?? null;
    const previousPhase = previousPhaseRef.current;
    const previousTaskId = previousTaskIdRef.current;

    if (phase === previousPhase && taskId === previousTaskId) {
      return;
    }

    previousPhaseRef.current = phase;
    previousTaskIdRef.current = taskId;

    if (phase === 'creating') {
      toast.message('Unclothy: creating task…');
    } else if (phase === 'processing') {
      toast.message('Unclothy: processing…', { description: taskId ? `Task: ${taskId}` : undefined });
    } else if (phase === 'ingesting') {
      toast.message('Unclothy: saving result…');
    } else if (phase === 'done') {
      toast.success('Unclothy: saved to album.');
    } else if (phase === 'error') {
      toast.error('Unclothy failed', { description: watchedTask?.errorMessage || 'Task failed.' });
    } else if (!phase && queue.length > 0) {
      toast.message('Unclothy: queued', { description: `${queue.length} task(s) waiting.` });
    }
  }, [active, activeTasks, failedTasks, queue.length]);

  return null;
}
