'use client';

/* eslint-disable @next/next/no-img-element */

import { Dialog, Transition } from '@headlessui/react';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Pause,
  Play,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import MediaPreview from '@/app/admin/gallery/components/MediaPreview';
import GalleryUnclothySection from './GalleryUnclothySection';
import { isPhotoVideo, shouldBlurPhoto } from '@/lib/gallery-media';
import { fetchJson } from './galleryAdminShared';
import { useUnclothyTasksStore } from '@/store/unclothyTasks';

const SAMSUNG_STATUS_STEPS = ['Queued', 'Processing', 'Generating', 'Finalizing'];
const DEFAULT_VIDEO_STATE = {
  currentTime: 0,
  duration: 0,
  paused: true,
  muted: false,
  volume: 1,
};

function isVideoMime(mimeType) {
  return typeof mimeType === 'string' && mimeType.toLowerCase().startsWith('video/');
}

function createSnapshotFilename(photo) {
  const base = photo?.caption || photo?.originalFilename || `media-${photo?.id || 'video'}`;
  const safeBase = String(base)
    .trim()
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'video-snapshot';
  return `${safeBase}-snapshot-${Date.now()}.png`;
}

function normalizeAlbumId(value) {
  const id = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const rounded = Math.floor(seconds);
  const minutes = Math.floor(rounded / 60);
  const remainingSeconds = rounded % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

function getVideoDuration(video, fallback = 0) {
  if (!video) return fallback;
  if (Number.isFinite(video.duration) && video.duration > 0) return video.duration;
  try {
    if (video.seekable?.length) {
      const seekableEnd = video.seekable.end(video.seekable.length - 1);
      if (Number.isFinite(seekableEnd) && seekableEnd > 0) return seekableEnd;
    }
  } catch {
    // Some browsers throw while media ranges are still initializing.
  }
  return Number.isFinite(fallback) ? fallback : 0;
}

function readVideoState(video, fallback = DEFAULT_VIDEO_STATE) {
  if (!video) return fallback;
  const duration = getVideoDuration(video, fallback.duration || 0);
  const currentTime = video.ended ? 0 : Number.isFinite(video.currentTime) ? video.currentTime : fallback.currentTime || 0;
  return {
    currentTime,
    duration,
    paused: video.ended ? true : video.paused,
    muted: video.muted,
    volume: Number.isFinite(video.volume) ? video.volume : fallback.volume || 1,
  };
}

export default function GalleryMediaViewer({
  open,
  photo,
  onClose,
  controller,
  album,
  mediaItems = [],
  onNavigate,
  openGenerate = false,
  onGenerateOpened,
  blurUnclothyGenerated = true,
}) {
  const title = photo?.caption || 'Untitled media';
  const isVideoMedia = Boolean(photo) && (isVideoMime(photo?.mimeType) || isPhotoVideo(photo));
  const canGenerate = Boolean(photo) && !isVideoMedia && Boolean(controller) && Boolean(album);
  const canSnapshot = Boolean(photo) && isVideoMedia;
  const mediaAlbumId =
    normalizeAlbumId(photo?.albumId) ??
    normalizeAlbumId(album?.id) ??
    normalizeAlbumId(controller?.selectedAlbumId);
  const snapshotAlbumId = mediaAlbumId;
  const [generateOpen, setGenerateOpen] = useState(false);
  const [snapshot, setSnapshot] = useState(null);
  const [capturingSnapshot, setCapturingSnapshot] = useState(false);
  const [uploadingSnapshot, setUploadingSnapshot] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [unclothyAvailable, setUnclothyAvailable] = useState(false);
  const generateSheetRef = useRef(null);
  const previewStageRef = useRef(null);
  const mediaSwipeRef = useRef({ active: false, id: null, x: 0, y: 0 });
  const lastTapRef = useRef({ time: 0, x: 0, y: 0 });
  const videoRef = useRef(null);
  const snapshotPlaybackRef = useRef(null);
  const videoPlaybackRef = useRef(new Map());
  const activeVideoPhotoIdRef = useRef(null);
  const pendingSeekTimeRef = useRef(null);
  const pendingMetadataSeekHandlerRef = useRef(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const [videoState, setVideoState] = useState(DEFAULT_VIDEO_STATE);
  const [enhancingSnapshot, setEnhancingSnapshot] = useState(false);
  const shouldBlurPreview = Boolean(photo) && shouldBlurPhoto(photo, { blurEnabled: blurUnclothyGenerated });
  const normalizedMediaItems = useMemo(
    () => (Array.isArray(mediaItems) ? mediaItems.filter(Boolean) : []),
    [mediaItems],
  );
  const activeMediaIndex = useMemo(
    () => normalizedMediaItems.findIndex((item) => item?.id === photo?.id),
    [normalizedMediaItems, photo?.id],
  );
  const canNavigatePrevious = activeMediaIndex > 0;
  const canNavigateNext = activeMediaIndex >= 0 && activeMediaIndex < normalizedMediaItems.length - 1;
  const queue = useUnclothyTasksStore((state) => state.queue);
  const activeTasks = useUnclothyTasksStore((state) => state.activeTasks);
  const selectedAlbumId = album?.id ?? null;
  const selectedPhotoId = photo?.id ?? null;
  const isRunningForThisPhoto =
    Boolean(selectedAlbumId) &&
    Boolean(selectedPhotoId) &&
    Array.isArray(activeTasks) &&
    activeTasks.some((task) => task?.albumId === selectedAlbumId && task?.sourcePhotoId === selectedPhotoId);
  const isQueuedForThisPhoto =
    Boolean(selectedAlbumId) &&
    Boolean(selectedPhotoId) &&
    Array.isArray(queue) &&
    queue.some((task) => task?.albumId === selectedAlbumId && task?.sourcePhotoId === selectedPhotoId);
  const generatingState = isRunningForThisPhoto ? 'running' : isQueuedForThisPhoto ? 'queued' : null;
  const isGeneratingPreview = Boolean(generatingState);
  const [statusIndex, setStatusIndex] = useState(0);
  const canOpenGenerate = canGenerate && unclothyAvailable;
  const snapshotBusy = uploadingSnapshot || enhancingSnapshot;
  const [isPreviewFullscreen, setIsPreviewFullscreen] = useState(false);

  const clearSwipeGesture = () => {
    mediaSwipeRef.current = { active: false, id: null, x: 0, y: 0 };
  };

  const enterPreviewFullscreen = async () => {
    if (!photo || isVideoMedia || snapshot?.url) return;
    const stage = previewStageRef.current;

    if (stage?.requestFullscreen) {
      try {
        await stage.requestFullscreen();
        setIsPreviewFullscreen(true);
      } catch {
        setIsPreviewFullscreen(true);
      }
      return;
    }

    setIsPreviewFullscreen(true);
  };

  const exitPreviewFullscreen = async () => {
    if (typeof document !== 'undefined' && document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        setIsPreviewFullscreen(false);
      }
      return;
    }

    setIsPreviewFullscreen(false);
  };

  const togglePreviewFullscreen = () => {
    if (!photo || isVideoMedia || snapshot?.url) return;
    if (isPreviewFullscreen) {
      void exitPreviewFullscreen();
      return;
    }

    void enterPreviewFullscreen();
  };

  const navigateMedia = (direction) => {
    if (!onNavigate || activeMediaIndex < 0) return;

    const nextIndex = direction === 'next' ? activeMediaIndex + 1 : activeMediaIndex - 1;
    const nextPhoto = normalizedMediaItems[nextIndex];
    if (!nextPhoto) return;

    setGenerateOpen(false);
    clearSwipeGesture();
    clearSnapshot();
    onNavigate(nextPhoto);
  };

  const handleMediaPointerDown = (event) => {
    if (!photo || isVideoMedia || snapshot?.url) return;
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
    if (event.target instanceof Element && event.target.closest('button,input,label,a,video')) return;

    mediaSwipeRef.current = {
      active: true,
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };

    try {
      event.currentTarget?.setPointerCapture?.(event.pointerId);
    } catch {
      // Some mobile browsers can reject pointer capture during gesture negotiation.
    }
  };

  const handleMediaPointerEnd = (event) => {
    if (!mediaSwipeRef.current.active) return;
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
    if (mediaSwipeRef.current.id !== event.pointerId) return;

    const start = mediaSwipeRef.current;
    clearSwipeGesture();

    try {
      event.currentTarget?.releasePointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture may already be released after browser gestures.
    }

    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;

    if (Math.abs(deltaX) < 12 && Math.abs(deltaY) < 12) {
      const now = Date.now();
      const lastTap = lastTapRef.current;
      const isDoubleTap =
        now - lastTap.time < 280 &&
        Math.abs(event.clientX - lastTap.x) < 18 &&
        Math.abs(event.clientY - lastTap.y) < 18;

      if (isDoubleTap) {
        lastTapRef.current = { time: 0, x: 0, y: 0 };
        togglePreviewFullscreen();
        return;
      }

      lastTapRef.current = { time: now, x: event.clientX, y: event.clientY };
      return;
    }

    if (Math.abs(deltaX) < 45 || Math.abs(deltaX) < Math.abs(deltaY)) return;

    navigateMedia(deltaX < 0 ? 'next' : 'prev');
  };

  const saveVideoPlaybackForId = (photoId, video, overrides = {}) => {
    if (!photoId || !video) return;
    const pendingSeekTime = pendingSeekTimeRef.current;
    const nextState = {
      ...readVideoState(video),
      ...overrides,
    };
    if (
      Number.isFinite(pendingSeekTime) &&
      photoId === activeVideoPhotoIdRef.current &&
      !Object.prototype.hasOwnProperty.call(overrides, 'currentTime')
    ) {
      nextState.currentTime = pendingSeekTime;
    }
    videoPlaybackRef.current.set(photoId, nextState);
  };

  const saveActiveVideoPlayback = () => {
    saveVideoPlaybackForId(activeVideoPhotoIdRef.current, videoRef.current);
  };

  const clearPendingMetadataSeekHandler = () => {
    const video = videoRef.current;
    const handler = pendingMetadataSeekHandlerRef.current;
    if (video && handler) {
      video.removeEventListener('loadedmetadata', handler);
    }
    pendingMetadataSeekHandlerRef.current = null;
  };

  const clampVideoTime = (video, nextTime, fallbackDuration = videoState.duration) => {
    const duration = getVideoDuration(video, fallbackDuration);
    return {
      duration,
      currentTime: Math.max(0, Math.min(nextTime, duration || nextTime)),
    };
  };

  const syncVideoState = (overrides = {}) => {
    const pendingSeekTime = pendingSeekTimeRef.current;
    const nextState = {
      ...readVideoState(videoRef.current, videoState),
      ...overrides,
    };
    if (Number.isFinite(pendingSeekTime) && !Object.prototype.hasOwnProperty.call(overrides, 'currentTime')) {
      nextState.currentTime = pendingSeekTime;
    }
    setVideoState(nextState);
    saveVideoPlaybackForId(activeVideoPhotoIdRef.current, videoRef.current, nextState);
  };

  const applyVideoSeek = (nextTime) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(nextTime)) return;

    const { currentTime, duration } = clampVideoTime(video, nextTime);
    pendingSeekTimeRef.current = currentTime;
    syncVideoState({ currentTime, duration });

    if (video.readyState < 1) {
      clearPendingMetadataSeekHandler();
      const handleLoadedMetadata = () => {
        pendingMetadataSeekHandlerRef.current = null;
        applyVideoSeek(currentTime);
      };
      pendingMetadataSeekHandlerRef.current = handleLoadedMetadata;
      video.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true });
      return;
    }

    try {
      video.currentTime = currentTime;
    } catch {
      syncVideoState({ currentTime, duration });
    }
  };

  const restoreSessionVideoPlayback = () => {
    const video = videoRef.current;
    const photoId = photo?.id;
    if (!video || !photoId) return;

    const saved = videoPlaybackRef.current.get(photoId);
    if (!saved) {
      syncVideoState();
      return;
    }

    try {
      video.muted = Boolean(saved.muted);
      video.volume = Number.isFinite(saved.volume) ? Math.max(0, Math.min(1, saved.volume)) : 1;
      const duration = getVideoDuration(video, saved.duration || saved.currentTime || 0);
      if (Number.isFinite(saved.currentTime)) {
        applyVideoSeek(Math.max(0, Math.min(saved.currentTime, duration || saved.currentTime)));
      }
      setVideoState({
        ...DEFAULT_VIDEO_STATE,
        ...saved,
        duration,
        currentTime: Math.max(0, Math.min(saved.currentTime || 0, duration || saved.currentTime || 0)),
      });
      if (!saved.paused && saved.currentTime > 0) {
        void video.play().catch(() => {
          setVideoState((current) => ({ ...current, paused: true }));
          saveVideoPlaybackForId(photoId, video, { paused: true });
        });
      }
    } catch {
      syncVideoState();
    }
  };

  const handleToggleVideoPlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused || video.ended) {
      void video.play().catch(() => {
        toast.error('Unable to play this video.');
      });
      return;
    }
    video.pause();
  };

  const handleVideoSeek = (event) => {
    const video = videoRef.current;
    if (!video) return;
    const nextTime = Number(event.target.value);
    if (!Number.isFinite(nextTime)) return;
    applyVideoSeek(nextTime);
  };

  const handleVideoSkip = (seconds) => {
    const video = videoRef.current;
    if (!video) return;
    const baseTime = Number.isFinite(pendingSeekTimeRef.current) ? pendingSeekTimeRef.current : video.currentTime || 0;
    applyVideoSeek(baseTime + seconds);
  };

  const handleVideoVolumeChange = (event) => {
    const video = videoRef.current;
    if (!video) return;
    const nextVolume = Math.max(0, Math.min(1, Number(event.target.value)));
    video.volume = Number.isFinite(nextVolume) ? nextVolume : 1;
    video.muted = video.volume === 0;
    syncVideoState({ volume: video.volume, muted: video.muted });
  };

  const handleToggleVideoMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    if (!video.muted && video.volume === 0) {
      video.volume = 0.75;
    }
    syncVideoState({ muted: video.muted, volume: video.volume });
  };

  useEffect(() => {
    if (photo?.id && isVideoMedia) {
      clearPendingMetadataSeekHandler();
      pendingSeekTimeRef.current = null;
      activeVideoPhotoIdRef.current = photo.id;
      setVideoState({
        ...DEFAULT_VIDEO_STATE,
        ...(videoPlaybackRef.current.get(photo.id) || {}),
      });
      return;
    }

    setVideoState(DEFAULT_VIDEO_STATE);
  }, [isVideoMedia, photo?.id]);

  useEffect(() => {
    if (!open) {
      saveActiveVideoPlayback();
      void exitPreviewFullscreen();
      setGenerateOpen(false);
      setUnclothyAvailable(false);
      setPreviewLoading(false);
      setSnapshot((current) => {
        if (current?.url) {
          URL.revokeObjectURL(current.url);
        }
        return null;
      });
      clearPendingMetadataSeekHandler();
      pendingSeekTimeRef.current = null;
      snapshotPlaybackRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (!open || !canGenerate) {
      setUnclothyAvailable(false);
      setGenerateOpen(false);
      return;
    }

    const controller = new AbortController();

    fetchJson('/api/admin/integrations/unclothy', {
      method: 'GET',
      signal: controller.signal,
    })
      .then((data) => {
        const result = data?.result && typeof data.result === 'object' ? data.result : data;
        const available = result?.enabled === true && result?.configured === true;
        setUnclothyAvailable(available);
        if (!available) {
          setGenerateOpen(false);
        }
      })
      .catch((error) => {
        if (error?.name === 'AbortError') return;
        setUnclothyAvailable(false);
        setGenerateOpen(false);
      });

    return () => controller.abort();
  }, [canGenerate, open]);

  useEffect(() => {
    clearSwipeGesture();
    lastTapRef.current = { time: 0, x: 0, y: 0 };
    void exitPreviewFullscreen();
    setGenerateOpen(false);
    setPreviewLoading(Boolean(photo));
    setSnapshot((current) => {
      if (current?.url) {
        URL.revokeObjectURL(current.url);
      }
      return null;
    });
    snapshotPlaybackRef.current = null;
  }, [photo?.id]);

  useEffect(
    () => () => {
      if (snapshot?.url) {
        URL.revokeObjectURL(snapshot.url);
      }
    },
    [snapshot?.url],
  );

  useEffect(() => {
    if (!isGeneratingPreview) {
      setStatusIndex(0);
      return;
    }

    const interval = setInterval(() => {
      setStatusIndex((prev) => (prev + 1) % SAMSUNG_STATUS_STEPS.length);
    }, 1600);

    return () => clearInterval(interval);
  }, [isGeneratingPreview]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    const handleFullscreenChange = () => {
      setIsPreviewFullscreen(document.fullscreenElement === previewStageRef.current);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (!open || !isPreviewFullscreen) return undefined;
    if (typeof window === 'undefined') return undefined;

    const handleKeyDown = (event) => {
      const target = event.target;
      if (
        target instanceof Element &&
        (target.closest('input,textarea,select,button,a') || target.getAttribute('contenteditable') === 'true')
      ) {
        return;
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        navigateMedia('next');
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        navigateMedia('prev');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPreviewFullscreen, open, activeMediaIndex, normalizedMediaItems, onNavigate]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(min-width: 1024px)');
    const handleChange = () => setIsDesktop(mql.matches);
    handleChange();
    try {
      mql.addEventListener('change', handleChange);
      return () => mql.removeEventListener('change', handleChange);
    } catch {
      // Safari fallback
      mql.addListener(handleChange);
      return () => mql.removeListener(handleChange);
    }
  }, []);

  useEffect(() => {
    if (!generateOpen) return;
    const el = generateSheetRef.current;
    if (!el) return;
    // Always reset to the top so the header is visible on open.
    requestAnimationFrame(() => {
      try {
        el.scrollTop = 0;
      } catch {
        // ignore
      }
    });
  }, [generateOpen, photo?.id]);

  useEffect(() => {
    if (!open) return;
    if (!openGenerate) return;
    if (!canOpenGenerate) return;
    setGenerateOpen(true);
    onGenerateOpened?.();
  }, [canOpenGenerate, onGenerateOpened, open, openGenerate]);

  const restoreVideoPlayback = () => {
    const video = videoRef.current;
    const saved = snapshotPlaybackRef.current;
    if (!video || !saved || saved.photoId !== photo?.id) {
      return;
    }

    try {
      video.playbackRate = saved.playbackRate || 1;
      if (Number.isFinite(saved.currentTime)) {
        const duration = Number.isFinite(video.duration) ? video.duration : saved.currentTime;
        applyVideoSeek(Math.max(0, Math.min(saved.currentTime, duration)));
      }

      if (!saved.paused) {
        void video.play().catch(() => {
          // Browser autoplay policy can block resume; keeping the restored time is enough.
        });
      }
      syncVideoState({
        currentTime: saved.currentTime,
        paused: saved.paused,
        volume: Number.isFinite(video.volume) ? video.volume : 1,
        muted: video.muted,
      });
    } catch {
      // Keep snapshot actions non-blocking if the media element is no longer seekable.
    }
  };

  const clearSnapshot = ({ restorePlayback = true } = {}) => {
    if (restorePlayback) {
      restoreVideoPlayback();
    }

    setSnapshot((current) => {
      if (current?.url) {
        URL.revokeObjectURL(current.url);
      }
      return null;
    });
    snapshotPlaybackRef.current = null;
  };

  const handleCaptureSnapshot = async () => {
    const video = videoRef.current;
    if (!video) {
      toast.error('Video is not ready yet.');
      return;
    }

    if (!video.videoWidth || !video.videoHeight || video.readyState < 2) {
      toast.error('Play or scrub the video first, then take a snapshot.');
      return;
    }

    setCapturingSnapshot(true);
    try {
      snapshotPlaybackRef.current = {
        photoId: photo?.id,
        currentTime: video.currentTime,
        paused: video.paused,
        playbackRate: video.playbackRate,
      };

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Snapshot is not supported in this browser.');
      }

      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve, reject) => {
        try {
          canvas.toBlob((nextBlob) => {
            if (nextBlob) {
              resolve(nextBlob);
              return;
            }
            reject(new Error('Unable to capture this video frame.'));
          }, 'image/png');
        } catch (error) {
          reject(error);
        }
      });

      setSnapshot((current) => {
        if (current?.url) {
          URL.revokeObjectURL(current.url);
        }
        return {
          blob,
          url: URL.createObjectURL(blob),
          filename: createSnapshotFilename(photo),
        };
      });

      video.pause();
    } catch (error) {
      snapshotPlaybackRef.current = null;
      const message =
        error instanceof Error && error.name === 'SecurityError'
          ? 'This video source blocks browser snapshots. Try an uploaded video from this site.'
          : error instanceof Error
            ? error.message
            : 'Unable to capture this video frame.';
      toast.error(message);
    } finally {
      setCapturingSnapshot(false);
    }
  };

  const handleDownloadSnapshot = () => {
    if (!snapshot?.url) return;
    const link = document.createElement('a');
    link.href = snapshot.url;
    link.download = snapshot.filename || 'video-snapshot.png';
    document.body.appendChild(link);
    link.click();
    link.remove();
    toast.success('Snapshot downloaded locally.');
    clearSnapshot();
  };

  const handleUploadSnapshot = async () => {
    if (!snapshot?.blob || !snapshotAlbumId) {
      toast.error('Select an album before uploading the snapshot.');
      return;
    }

    setUploadingSnapshot(true);
    try {
      const file = new File([snapshot.blob], snapshot.filename || 'video-snapshot.png', { type: 'image/png' });
      const formData = new FormData();
      formData.append('imageFile', file);
      formData.append('caption', `${title} snapshot`);
      formData.append('sourceType', 'upload');

      const created = await fetchJson(`/api/gallery/albums/${snapshotAlbumId}/photos`, {
        method: 'POST',
        body: formData,
      });

      if (typeof controller?.addPhotoToState === 'function') {
        controller.addPhotoToState(created);
      }
      toast.success('Snapshot uploaded to album.');
      clearSnapshot();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to upload snapshot.');
    } finally {
      setUploadingSnapshot(false);
    }
  };

  const handleEnhanceSnapshot = async () => {
    if (!snapshot?.blob || !snapshotAlbumId || !photo?.id) {
      toast.error('Take a snapshot before enhancing it.');
      return;
    }

    setEnhancingSnapshot(true);
    try {
      const file = new File([snapshot.blob], snapshot.filename || 'video-snapshot.png', { type: 'image/png' });
      const formData = new FormData();
      formData.append('imageFile', file);
      formData.append('caption', `${title} enhanced snapshot`);

      const created = await fetchJson(`/api/gallery/albums/${snapshotAlbumId}/photos/${photo.id}/snapshot-enhance`, {
        method: 'POST',
        body: formData,
      });

      if (typeof controller?.addPhotoToState === 'function') {
        controller.addPhotoToState(created);
      }
      toast.success(
        created?.enhancementProvider === 'local'
          ? 'Enhanced locally and uploaded to album.'
          : 'Enhanced snapshot uploaded to album.',
      );
      clearSnapshot();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to enhance snapshot.');
    } finally {
      setEnhancingSnapshot(false);
    }
  };

  return (
    <>
      <Transition show={open} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto p-2 pb-[calc(0.5rem_+_env(safe-area-inset-bottom))] sm:p-6">
          <div className="flex min-h-full items-start justify-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 scale-95 translate-y-2"
              enterTo="opacity-100 scale-100 translate-y-0"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 scale-100 translate-y-0"
              leaveTo="opacity-0 scale-95 translate-y-2"
            >
              <Dialog.Panel className="flex h-[calc(100dvh_-_1rem_-_env(safe-area-inset-bottom))] max-h-[calc(100dvh_-_1rem_-_env(safe-area-inset-bottom))] w-full max-w-[min(96vw,1180px)] flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950 sm:h-auto sm:max-h-[92dvh] sm:rounded-[26px]">
                <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800 sm:flex-row sm:items-center sm:gap-4 sm:px-6 sm:py-4">
                  <div className="min-w-0 sm:flex-1 sm:min-w-0">
                    <Dialog.Title className="truncate text-base font-semibold text-slate-950 dark:text-slate-50 sm:text-lg">
                      {title}
                    </Dialog.Title>
                  </div>
                  <div className="hidden flex-none shrink-0 flex-wrap items-center gap-2 sm:flex">
                    {canSnapshot ? (
                      <button
                        type="button"
                        className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
                        onClick={handleCaptureSnapshot}
                        disabled={capturingSnapshot}
                      >
                        {capturingSnapshot ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
                        <span className="ml-2">Snapshot</span>
                      </button>
                    ) : null}
                    {canOpenGenerate ? (
                      <button
                        type="button"
                        className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
                        onClick={() => setGenerateOpen(true)}
                      >
                        <Sparkles className="size-4" />
                        <span className="ml-2">Generate</span>
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
                      onClick={onClose}
                    >
                      <X className="size-4" />
                      <span className="ml-2">Close</span>
                    </button>
                  </div>
                </div>

                <div className="grid flex-1 min-h-0 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_420px]">
                  <section
                    ref={previewStageRef}
                    className={`relative min-h-0 bg-slate-100 p-2 dark:bg-slate-950 sm:p-4 ${
                      isPreviewFullscreen
                        ? 'fixed inset-0 z-[70] flex h-[100dvh] w-[100dvw] items-center justify-center bg-black p-0 dark:bg-black'
                        : ''
                    }`}
                  >
                    <div
                      className={`relative flex h-full min-h-0 items-center justify-center overflow-hidden border border-slate-200 bg-[radial-gradient(circle_at_top,#f8fbff,#eef4fb_48%,#e2e8f0_100%)] dark:border-slate-800 dark:bg-[radial-gradient(circle_at_top,#0b1220,#0b1220_30%,#020617_100%)] ${
                        isPreviewFullscreen ? 'w-full rounded-none border-0 bg-black dark:bg-black' : 'rounded-[22px] sm:rounded-[24px]'
                      }`}
                      style={{ touchAction: photo && !isVideoMedia && !snapshot?.url ? 'pan-y' : 'auto' }}
                      onPointerDown={handleMediaPointerDown}
                      onPointerUp={handleMediaPointerEnd}
                      onPointerCancel={clearSwipeGesture}
                      onDoubleClick={togglePreviewFullscreen}
                    >
                      <div className="absolute left-4 top-4 z-20 rounded-full border border-slate-300 bg-white/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-700 backdrop-blur dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-200">
                        Preview
                      </div>
                      {isPreviewFullscreen ? (
                        <button
                          type="button"
                          onClick={exitPreviewFullscreen}
                          className="absolute right-4 top-4 z-40 inline-flex min-h-10 items-center justify-center rounded-full border border-white/15 bg-white/10 px-3 py-2 text-sm font-medium text-white backdrop-blur transition hover:bg-white/20"
                        >
                          Exit full screen
                        </button>
                      ) : null}

                      <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-80">
                        <div className="absolute -left-10 top-12 h-44 w-44 rounded-full bg-sky-200/25 blur-3xl dark:bg-sky-400/10" />
                        <div className="absolute -right-12 top-24 h-48 w-48 rounded-full bg-cyan-200/20 blur-3xl dark:bg-cyan-400/10" />
                        <div className="absolute bottom-0 left-1/2 h-36 w-44 -translate-x-1/2 rounded-full bg-blue-200/20 blur-3xl dark:bg-blue-500/10" />
                      </div>

                      <div
                        className={`relative z-10 flex h-full min-h-0 w-full items-center justify-center ${
                          isPreviewFullscreen ? 'px-0 py-0' : 'px-2 py-2 sm:px-6 sm:pt-6 sm:pb-20'
                        }`}
                      >
                        {(() => {
                          const previewCard = (
                            <div
                              className={`relative flex h-full max-h-full w-full max-w-full overflow-hidden border border-white/70 bg-white/90 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl transition-all duration-500 dark:border-slate-700/70 dark:bg-slate-950/75 ${
                                isPreviewFullscreen
                                  ? 'rounded-none border-0 bg-black p-0 shadow-none backdrop-blur-0 dark:bg-black'
                                  : 'rounded-[24px] p-2 sm:inline-flex sm:h-auto sm:w-auto sm:rounded-[28px] sm:p-3'
                              } ${
                                isGeneratingPreview ? 'animate-samsung-breathe animate-samsung-glow' : ''
                              }`}
                            >
                              <div
                                className={`relative flex h-full w-full items-center justify-center overflow-hidden border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-950 ${
                                  isPreviewFullscreen
                                    ? 'rounded-none border-0 bg-black dark:bg-black sm:h-full sm:w-full'
                                    : 'rounded-[24px] sm:block sm:h-auto sm:w-auto'
                                }`}
                              >
                                {photo ? (
                                  <MediaPreview
                                    url={photo.imageUrl}
                                    mimeType={photo.mimeType}
                                    sourceType={photo.sourceType}
                                    sourceId={photo.sourceId}
                                    alt={title}
                                    mediaRef={canSnapshot ? videoRef : undefined}
                                    className={`mx-auto block h-full w-full object-contain ${
                                      isPreviewFullscreen
                                        ? 'max-h-[100dvh] max-w-[100dvw]'
                                        : 'max-h-[calc(100dvh_-_8.75rem_-_env(safe-area-inset-bottom))] sm:h-auto sm:max-h-[62dvh] sm:max-w-full lg:max-h-[66dvh]'
                                    } ${
                                      shouldBlurPreview ? 'blur-md' : ''
                                    }`}
                                    onLoadStart={() => setPreviewLoading(true)}
                                    onLoadedData={() => setPreviewLoading(false)}
                                    onCanPlay={() => setPreviewLoading(false)}
                                    onError={() => setPreviewLoading(false)}
                                    controls={false}
                                    videoProps={
                                      canSnapshot
                                        ? {
                                            onLoadedMetadata: () => {
                                              setPreviewLoading(false);
                                              restoreSessionVideoPlayback();
                                            },
                                            onPlay: () => syncVideoState({ paused: false }),
                                            onPause: () => syncVideoState({ paused: true }),
                                            onTimeUpdate: () => syncVideoState(),
                                            onDurationChange: () => syncVideoState(),
                                            onProgress: () => syncVideoState(),
                                            onSeeking: () => syncVideoState(),
                                            onSeeked: () => {
                                              const pendingSeekTime = pendingSeekTimeRef.current;
                                              if (
                                                !Number.isFinite(pendingSeekTime) ||
                                                Math.abs((videoRef.current?.currentTime || 0) - pendingSeekTime) < 0.35
                                              ) {
                                                pendingSeekTimeRef.current = null;
                                              }
                                              syncVideoState();
                                            },
                                            onCanPlay: () => {
                                              setPreviewLoading(false);
                                              if (Number.isFinite(pendingSeekTimeRef.current)) {
                                                applyVideoSeek(pendingSeekTimeRef.current);
                                              }
                                            },
                                            onVolumeChange: () => syncVideoState(),
                                            onEnded: () => {
                                              const endedState = {
                                                currentTime: 0,
                                                duration: getVideoDuration(videoRef.current, videoState.duration),
                                                paused: true,
                                                muted: Boolean(videoRef.current?.muted),
                                                volume: Number.isFinite(videoRef.current?.volume) ? videoRef.current.volume : videoState.volume,
                                              };
                                              if (photo?.id) {
                                                videoPlaybackRef.current.set(photo.id, endedState);
                                              }
                                              setVideoState(endedState);
                                            },
                                          }
                                        : undefined
                                    }
                                  />
                                ) : (
                                  <div className="h-full min-h-[420px] w-full max-w-full rounded-[24px] bg-[radial-gradient(circle_at_top,#cbd5e1,#94a3b8_40%,#334155_100%)] dark:bg-[radial-gradient(circle_at_top,#0f172a,#1f2937_45%,#020617_100%)] sm:h-[560px] sm:w-[380px]" />
                                )}

                                {normalizedMediaItems.length > 1 && !snapshot?.url ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => navigateMedia('prev')}
                                      disabled={!canNavigatePrevious}
                                      className="absolute left-3 top-1/2 z-30 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200/80 bg-white/85 text-slate-700 shadow-lg transition hover:bg-white disabled:pointer-events-none disabled:opacity-35 dark:border-slate-700 dark:bg-slate-950/75 dark:text-slate-200"
                                      aria-label="Previous media"
                                      title="Previous"
                                    >
                                      <ChevronLeft className="size-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => navigateMedia('next')}
                                      disabled={!canNavigateNext}
                                      className="absolute right-3 top-1/2 z-30 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200/80 bg-white/85 text-slate-700 shadow-lg transition hover:bg-white disabled:pointer-events-none disabled:opacity-35 dark:border-slate-700 dark:bg-slate-950/75 dark:text-slate-200"
                                      aria-label="Next media"
                                      title="Next"
                                    >
                                      <ChevronRight className="size-4" />
                                    </button>
                                  </>
                                ) : null}

                                <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.42),transparent_65%)] dark:bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.20),transparent_65%)]" />
                                <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-32 bg-[linear-gradient(to_top,rgba(17,24,39,0.16),transparent)] dark:bg-[linear-gradient(to_top,rgba(2,6,23,0.55),transparent)]" />
                                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.10),rgba(255,255,255,0.02)_35%,rgba(15,23,42,0.08))] dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01)_35%,rgba(2,6,23,0.35))]" />

                                {canSnapshot && previewLoading && !snapshot?.url ? (
                                  <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-slate-950/35 backdrop-blur-[2px]">
                                    <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-slate-950/80 px-3 py-2 text-xs font-semibold text-white shadow-xl">
                                      <Loader2 className="size-3.5 animate-spin" />
                                      Loading video
                                    </div>
                                  </div>
                                ) : null}

                                {canSnapshot && !snapshot?.url ? (
                                  <div className="absolute inset-x-2 bottom-2 z-30 rounded-[20px] border border-white/20 bg-slate-950/78 p-2 text-white shadow-2xl backdrop-blur-xl sm:inset-x-4 sm:bottom-4 sm:rounded-[24px] sm:p-3">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <div className="flex min-w-0 flex-1 items-center gap-2">
                                        <button
                                          type="button"
                                          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-slate-950 transition hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                                          onClick={handleToggleVideoPlay}
                                          aria-label={videoState.paused ? 'Play video' : 'Pause video'}
                                        >
                                          {videoState.paused ? <Play className="ml-0.5 size-4" /> : <Pause className="size-4" />}
                                        </button>
                                        <button
                                          type="button"
                                          className="inline-flex h-10 min-w-10 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10 px-2 text-xs font-bold text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                                          onClick={() => handleVideoSkip(-10)}
                                          aria-label="Back 10 seconds"
                                        >
                                          -10
                                        </button>
                                        <button
                                          type="button"
                                          className="inline-flex h-10 min-w-10 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10 px-2 text-xs font-bold text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                                          onClick={() => handleVideoSkip(10)}
                                          aria-label="Forward 10 seconds"
                                        >
                                          +10
                                        </button>
                                      </div>

                                      <input
                                        type="range"
                                        min="0"
                                        max="1"
                                        step="0.05"
                                        value={videoState.muted ? 0 : videoState.volume}
                                        onChange={handleVideoVolumeChange}
                                        onInput={handleVideoVolumeChange}
                                        className="hidden h-1.5 w-20 accent-white sm:block"
                                        aria-label="Video volume"
                                      />
                                      <button
                                        type="button"
                                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                                        onClick={handleToggleVideoMute}
                                        aria-label={videoState.muted || videoState.volume === 0 ? 'Unmute video' : 'Mute video'}
                                      >
                                        {videoState.muted || videoState.volume === 0 ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
                                      </button>
                                    </div>
                                    <div className="mt-2 flex items-center gap-2">
                                      <span className="w-12 text-center text-[11px] font-semibold tabular-nums text-white/85 sm:w-14 sm:text-xs">
                                        {formatTime(videoState.currentTime)}
                                      </span>
                                      <input
                                        style={{ touchAction: 'none' }}
                                        type="range"
                                        min="0"
                                        max={Math.max(0, videoState.duration || 0)}
                                        step="0.05"
                                        value={Math.min(videoState.currentTime || 0, videoState.duration || videoState.currentTime || 0)}
                                        onChange={handleVideoSeek}
                                        onInput={handleVideoSeek}
                                        className="h-1.5 min-w-0 flex-1 accent-white"
                                        aria-label="Seek video"
                                        disabled={!videoState.duration}
                                      />
                                      <span className="hidden w-14 text-center text-xs font-semibold tabular-nums text-white/70 sm:block">
                                        {formatTime(videoState.duration)}
                                      </span>
                                    </div>
                                  </div>
                                ) : null}

                                {snapshot?.url ? (
                                  <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/70 p-2 backdrop-blur-sm sm:p-4">
                                    <div className="w-full max-w-sm overflow-hidden rounded-[20px] border border-white/15 bg-white shadow-2xl dark:bg-slate-950 sm:rounded-[22px]">
                                      <div className="border-b border-slate-100 px-3 py-2.5 dark:border-slate-800 sm:px-4 sm:py-3">
                                        <div className="flex items-start justify-between gap-3">
                                          <div className="min-w-0">
                                            <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">Use this snapshot?</p>
                                            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                                              Upload it to this album or download it locally.
                                            </p>
                                          </div>
                                          <button
                                            type="button"
                                            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:focus-visible:ring-slate-100 dark:focus-visible:ring-offset-slate-950"
                                            disabled={snapshotBusy}
                                            onClick={() => clearSnapshot()}
                                            aria-label="Close snapshot dialog"
                                            title="Close"
                                          >
                                            <X className="size-4" />
                                          </button>
                                        </div>
                                      </div>

                                      <div className="bg-slate-100 dark:bg-slate-900">
                                        <img src={snapshot.url} alt="Captured video snapshot" className="max-h-[58dvh] w-full object-contain sm:max-h-72" />
                                      </div>

                                      <div className="grid grid-cols-2 gap-2 border-t border-slate-100 p-2 dark:border-slate-800 sm:grid-cols-3 sm:p-3">
                                        <button
                                          type="button"
                                          className="hidden h-11 min-w-0 items-center justify-center rounded-xl border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:focus-visible:ring-slate-100 dark:focus-visible:ring-offset-slate-950 sm:inline-flex sm:px-3 sm:text-sm"
                                          disabled={snapshotBusy}
                                          onClick={handleDownloadSnapshot}
                                          aria-label="Download snapshot"
                                          title="Download"
                                        >
                                          <Download className="size-5 shrink-0" />
                                          <span className="sr-only">Download snapshot</span>
                                        </button>
                                        <button
                                          type="button"
                                          className="inline-flex h-11 min-w-0 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 px-2 text-xs font-semibold text-sky-800 transition hover:bg-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:border-sky-900/70 dark:bg-sky-950/40 dark:text-sky-100 dark:focus-visible:ring-sky-300 dark:focus-visible:ring-offset-slate-950 sm:px-3 sm:text-sm"
                                          disabled={snapshotBusy}
                                          onClick={handleEnhanceSnapshot}
                                          aria-label="Enhance snapshot with AI"
                                          title="Enhance with AI"
                                        >
                                          {enhancingSnapshot ? <Loader2 className="size-5 shrink-0 animate-spin" /> : <Sparkles className="size-5 shrink-0" />}
                                          <span className="sr-only">Enhance with AI</span>
                                        </button>
                                        <button
                                          type="button"
                                          className="inline-flex h-11 min-w-0 items-center justify-center rounded-xl bg-slate-900 px-2 text-xs font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-50 dark:text-slate-900 dark:hover:bg-slate-200 dark:focus-visible:ring-slate-100 dark:focus-visible:ring-offset-slate-950 sm:px-3 sm:text-sm"
                                          disabled={snapshotBusy}
                                          onClick={handleUploadSnapshot}
                                          aria-label="Upload snapshot to album"
                                          title="Upload to album"
                                        >
                                          {uploadingSnapshot ? <Loader2 className="size-5 shrink-0 animate-spin" /> : <Camera className="size-5 shrink-0" />}
                                          <span className="sr-only">Upload to album</span>
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                ) : null}

                                {isGeneratingPreview ? (
                                  <>
                                    <div className="pointer-events-none absolute inset-y-0 left-[-35%] w-[35%] skew-x-[-18deg] bg-gradient-to-r from-transparent via-white/28 to-transparent animate-samsung-sweep" />

                                    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-3">
                                      <div className="rounded-[18px] border border-white/60 bg-white/45 px-3 py-3 shadow-[0_8px_24px_rgba(15,23,42,0.08)] backdrop-blur-2xl backdrop-saturate-150 supports-[backdrop-filter:blur(0)]:bg-white/35 dark:border-white/10 dark:bg-slate-950/35 supports-[backdrop-filter:blur(0)]:dark:bg-slate-950/30">
                                        <div className="flex items-center justify-between gap-3">
                                          <div className="min-w-0">
                                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-300/70">
                                              AI Process
                                            </p>
                                            <p className="mt-1 text-sm font-semibold text-slate-900 animate-samsung-fade-up dark:text-slate-50">
                                              {SAMSUNG_STATUS_STEPS[statusIndex]}
                                            </p>
                                          </div>

                                          <div className="flex items-center gap-2 rounded-full bg-white/55 px-3 py-1.5 backdrop-blur-xl backdrop-saturate-150 supports-[backdrop-filter:blur(0)]:bg-white/35 dark:bg-white/10">
                                            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-samsung-orb" />
                                            <span className="text-xs font-medium text-slate-700 dark:text-slate-100">
                                              {generatingState === 'queued' ? 'Queued' : 'Generating'}
                                            </span>
                                          </div>
                                        </div>

                                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200/80 dark:bg-white/10">
                                          <div className="h-full w-[58%] rounded-full bg-[linear-gradient(90deg,#60a5fa,#38bdf8,#22c55e)] animate-samsung-progress" />
                                        </div>
                                      </div>
                                    </div>
                                  </>
                                ) : null}
                              </div>
                            </div>
                          );

                          return previewCard;
                        })()}
                      </div>

                      {shouldBlurPreview ? (
                        <div className="pointer-events-none absolute left-4 top-4 z-30 translate-y-10 rounded-full border border-white/25 bg-black/55 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white">
                          NSFW
                        </div>
                      ) : null}

                      <div className="absolute bottom-5 left-5 right-5 z-20 hidden flex-wrap items-center justify-between gap-3 sm:flex">
                        <p className="text-xs text-slate-600 dark:text-slate-300/80">
                          {canSnapshot ? 'Take a snapshot while the video is playing or paused.' : 'Click Generate to open the settings panel.'}
                        </p>
                      </div>

                      {generateOpen && isDesktop ? (
                        <button
                          type="button"
                          className="absolute inset-0 z-10 hidden cursor-default lg:block"
                          aria-label="Close generate panel"
                          onClick={() => setGenerateOpen(false)}
                        />
                      ) : null}
                    </div>
                  </section>

                  <aside
                    className={`hidden min-h-0 border-l border-slate-200 bg-slate-50 transition-all duration-300 dark:border-slate-800 dark:bg-slate-950/40 lg:block ${
                      generateOpen
                        ? 'translate-x-0 opacity-100'
                        : 'pointer-events-none translate-x-6 opacity-0'
                    }`}
                    aria-hidden={!generateOpen}
                  >
                    <div ref={generateSheetRef} className="flex h-full min-h-0 flex-col overflow-y-auto overscroll-contain">
                      <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-5 dark:border-slate-800">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500 dark:text-slate-400">
                            Generate
                          </p>
                          <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-50">Task settings</h2>
                          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">
                            Opened from the preview modal. This stays docked on the right instead of covering the image.
                          </p>
                        </div>

                        <button
                          type="button"
                          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                          aria-label="Close generate panel"
                          onClick={() => setGenerateOpen(false)}
                        >
                          <X className="size-4" />
                        </button>
                      </div>

                      <div className="min-h-0 px-5 py-5">
                        <GalleryUnclothySection
                          controller={controller}
                          selectedAlbum={album}
                          photo={photo}
                          album={album}
                          showPreview={false}
                          onEnqueued={() => {
                            setGenerateOpen(false);
                          }}
                        />
                      </div>
                    </div>
                  </aside>
                </div>

                <div className="border-t border-slate-200 bg-white px-2 py-1.5 pb-[calc(0.375rem_+_env(safe-area-inset-bottom))] dark:border-slate-800 dark:bg-slate-950 sm:hidden">
                  {canOpenGenerate || canSnapshot ? (
                    <div className="flex items-center gap-2">
                      {canSnapshot ? (
                        <button
                          type="button"
                          className="inline-flex h-11 min-w-[44px] flex-1 items-center justify-center rounded-xl border border-slate-300 text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 dark:focus-visible:ring-slate-100 dark:focus-visible:ring-offset-slate-950"
                          onClick={handleCaptureSnapshot}
                          disabled={capturingSnapshot}
                          aria-label="Take snapshot"
                          title="Snapshot"
                        >
                          {capturingSnapshot ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
                          <span className="sr-only">Snapshot</span>
                        </button>
                      ) : null}
                      {canOpenGenerate ? (
                        <button
                          type="button"
                          className="inline-flex h-11 min-w-[44px] flex-1 items-center justify-center rounded-xl border border-slate-300 text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 dark:focus-visible:ring-slate-100 dark:focus-visible:ring-offset-slate-950"
                          onClick={() => setGenerateOpen(true)}
                          aria-label="Open generation settings"
                          title="Generate"
                        >
                          <Sparkles className="size-4" />
                          <span className="sr-only">Generate</span>
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="inline-flex h-11 min-w-[44px] flex-1 items-center justify-center rounded-xl border border-slate-300 text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 dark:focus-visible:ring-slate-100 dark:focus-visible:ring-offset-slate-950"
                        onClick={onClose}
                        aria-label="Close preview"
                        title="Close"
                      >
                        <X className="size-4" />
                        <span className="sr-only">Close</span>
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 dark:focus-visible:ring-slate-100 dark:focus-visible:ring-offset-slate-950"
                      onClick={onClose}
                      aria-label="Close preview"
                      title="Close"
                    >
                      <X className="size-4" />
                      <span className="sr-only">Close Preview</span>
                    </button>
                  )}
                </div>

                {generateOpen && !isDesktop ? (
                  <>
                    <button
                      type="button"
                      className="fixed inset-0 z-[60] bg-slate-950/40 backdrop-blur-sm lg:hidden"
                      aria-label="Close generate panel"
                      onClick={() => setGenerateOpen(false)}
                    />
                    <div
                      ref={generateSheetRef}
                      className="fixed inset-x-0 bottom-0 z-[60] max-h-[92dvh] overflow-y-auto overscroll-contain rounded-t-[28px] border border-slate-200 bg-white px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-[calc(1.25rem+env(safe-area-inset-top))] shadow-2xl dark:border-slate-800 dark:bg-slate-950 sm:px-5 lg:hidden"
                      style={{ WebkitOverflowScrolling: 'touch' }}
                      role="region"
                      aria-label="Generate settings"
                    >
                      <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-slate-200 dark:bg-slate-700 sm:hidden" />
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                            Generate
                          </p>
                          <p className="mt-1 text-sm font-semibold text-slate-950 dark:text-slate-50">Task settings</p>
                        </div>
                        <button
                          type="button"
                          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                          aria-label="Close generate panel"
                          onClick={() => setGenerateOpen(false)}
                        >
                          <X className="size-4" />
                        </button>
                      </div>

                      <div className="mt-4">
                        <GalleryUnclothySection
                          controller={controller}
                          selectedAlbum={album}
                          photo={photo}
                          album={album}
                          showPreview={false}
                          onEnqueued={() => {
                            setGenerateOpen(false);
                          }}
                        />
                      </div>
                    </div>
                  </>
                ) : null}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
        </Dialog>
      </Transition>
    </>
  );
}
