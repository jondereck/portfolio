"use client";
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { downloadAlbumZipWithProgress } from "@/lib/gallery-album-zip-client";
import GalleryBatchProgressModal from "@/modules/gallery/admin/GalleryBatchProgressModal";
import {
  getPlayableMediaUrl,
  getVideoPosterUrl,
  isPhotoAudio,
  isPhotoVideo,
  shouldBlurPhoto,
} from "@/lib/gallery-media";
import { MEDIA_PROTECT_ELEMENT_PROPS, MEDIA_PROTECT_IMAGE_PROPS } from "@/lib/media-protect";
import GalleryMediaFilterModal from "@/modules/gallery/admin/cms/GalleryMediaFilterModal";
import GalleryMediaGridSkeleton from "@/modules/gallery/admin/cms/GalleryMediaGridSkeleton";
import {
  readCachedAlbumPhotos,
  warmAlbumMediaCache,
  writeCachedAlbumPhotos,
} from "@/modules/gallery/admin/galleryPhotosCache";
import {
  VIEWER_MODES,
  clearLocalViewerSession,
  isResumableSession,
  readLocalViewerSession,
  writeLocalViewerSession,
} from "@/lib/gallery/viewer-session";
import {
  ArrowRight,
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CloudUpload,
  Download,
  Folder,
  Grid3x3,
  History,
  LayoutGrid,
  MonitorPlay,
  Music2,
  Pause,
  Play,
  Repeat2,
  SlidersHorizontal,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import {
  FaFacebookF,
  FaGlobe,
  FaInstagram,
  FaLink,
  FaLinkedinIn,
  FaTwitter,
  FaYoutube,
} from "react-icons/fa";
import { SiTiktok } from "react-icons/si";
import { useLoadingStore } from "@/store/loading";

const fetchJson = async (url) => {
  const response = await fetch(url, { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || "Request failed");
  }
  return data;
};

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
};

const VideoPoster = ({ src, alt, className, fallbackClassName }) => {
  const posterSrc = getVideoPosterUrl(src);

  if (!posterSrc) {
    return <div className={fallbackClassName || className} role="img" aria-label={alt || "Video"} {...MEDIA_PROTECT_IMAGE_PROPS} />;
  }

  return (
    <img
      src={posterSrc}
      alt={alt}
      className={className}
      {...MEDIA_PROTECT_IMAGE_PROPS}
    />
  );
};

const densityGridMap = {
  large:  "grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
  medium: "grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4",
  small:  "grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5",
};

const densityToSkeletonColumns = {
  large: 3,
  medium: 4,
  small: 5,
};
const timerPresetMs = [2000, 5000, 10000, 15000, 20000, 30000];
const TIMER_OFF_MS = 0;
const splitPanelSettingsDefaults = {
  filter: "photos",
  isPlaying: false,
  delayMs: TIMER_OFF_MS,
  loop: false,
  isMuted: false,
};
const splitPanelRightDefaults = {
  ...splitPanelSettingsDefaults,
  filter: "videos",
  isPlaying: false,
  index: 0,
};
const getSplitPanelFilter = (panelId) =>
  panelId === "left" ? "photos" : "videos";

const mediaMatchesFilter = (item, filter) => {
  if (!item) return false;
  if (filter === "photos") return !isPhotoVideo(item) && !isPhotoAudio(item);
  if (filter === "videos") return isPhotoVideo(item) && !isPhotoAudio(item);
  return true;
};

const findNextIndexByType = (startIndex, photos, matcher, options = {}) => {
  const { wrap = true } = options;
  if (!Array.isArray(photos) || photos.length === 0) return -1;
  const size = photos.length;
  let attempts = wrap ? size : Math.max(0, size - startIndex - 1);
  let cursor = startIndex;

  while (attempts > 0) {
    cursor += 1;
    if (cursor >= size) {
      if (!wrap) return -1;
      cursor = 0;
    }
    if (matcher(photos[cursor], cursor)) {
      return cursor;
    }
    attempts -= 1;
  }

  return -1;
};

const findPrevIndexByType = (startIndex, photos, matcher, options = {}) => {
  const { wrap = true } = options;
  if (!Array.isArray(photos) || photos.length === 0) return -1;
  const size = photos.length;
  let attempts = wrap ? size : Math.max(0, startIndex);
  let cursor = startIndex;

  while (attempts > 0) {
    cursor -= 1;
    if (cursor < 0) {
      if (!wrap) return -1;
      cursor = size - 1;
    }
    if (matcher(photos[cursor], cursor)) {
      return cursor;
    }
    attempts -= 1;
  }

  return -1;
};

const viewerModeStorageKey = "galleryViewerMode";
const splitMobileSwapStorageKey = "gallerySplitMobileSwapped";
const authLastVisitedPathStorageKey = "auth:lastVisitedPath";
const splitPanelTransitionMs = 260;
const gdrivePreloadConcurrency = 2;
const gdriveLookaheadConcurrency = 3;
const slideshowLookaheadCount = 4;
const slideshowLookbehindCount = 1;
const videoPrefetchCount = 3;

const createDefaultSplitZoomState = () => ({
  left: { scale: 1, x: 0, y: 0 },
  right: { scale: 1, x: 0, y: 0 },
});

const createDefaultSplitPinchState = () => ({
  left: { distance: 0, scale: 1, centerX: 0, centerY: 0, offsetX: 0, offsetY: 0 },
  right: { distance: 0, scale: 1, centerX: 0, centerY: 0, offsetX: 0, offsetY: 0 },
});

const buildGalleryMediaUrl = (albumId, photoId, shareToken = "") => {
  if (!albumId || !photoId) return "";

  const params = new URLSearchParams();
  if (shareToken) {
    params.set("share", shareToken);
  }

  const query = params.toString();
  return `/api/gallery/albums/${albumId}/photos/${photoId}/media${
    query ? `?${query}` : ""
  }`;
};

const isPermanentGalleryMediaStatus = (status) =>
  status === 404 || status === 410 || status === 403;

const stripMediaRetryParam = (src) => {
  if (!src || typeof window === "undefined") return src || "";
  try {
    const url = new URL(src, window.location.origin);
    url.searchParams.delete("_retry");
    return url.toString();
  } catch {
    return src;
  }
};

/** Lightweight probe so we do not retry deleted Drive files (JSON 404 ≠ video). */
const probeGalleryMediaUrl = async (src, { signal } = {}) => {
  if (!src || typeof window === "undefined") {
    return { ok: false, status: 0 };
  }
  try {
    const response = await fetch(stripMediaRetryParam(src), {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: { Range: "bytes=0-0" },
      signal,
    });
    try {
      response.body?.cancel?.();
    } catch {
      // ignore cancel failures
    }
    return {
      ok: response.ok || response.status === 206,
      status: response.status,
    };
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    return { ok: false, status: 0 };
  }
};

/**
 * Drive streams can flake once; deleted files stay 404 forever.
 * Format errors on our /media proxy are almost always JSON 404 bodies — treat
 * those as permanent without a second round-trip that wastes another ~4s.
 */
const handleGalleryVideoElementError = async ({
  player,
  playableSrc = "",
  autoPlay = false,
  onGiveUp,
}) => {
  if (!player) return;
  const retryCount = Number(player.dataset.retryCount || "0");
  const src = playableSrc || player.currentSrc || player.src || "";
  const isGalleryMediaProxy =
    typeof src === "string" &&
    src.includes("/api/gallery/") &&
    src.includes("/media");
  const mediaCode = player.error?.code;

  if (retryCount === 0 && isGalleryMediaProxy && mediaCode === 4) {
    player.dataset.permanentFailure = "1";
    onGiveUp?.({ permanent: true, status: 404 });
    return;
  }

  if (retryCount === 0 && src && isGalleryMediaProxy) {
    const probe = await probeGalleryMediaUrl(src);
    if (isPermanentGalleryMediaStatus(probe.status)) {
      player.dataset.permanentFailure = "1";
      onGiveUp?.({ permanent: true, status: probe.status });
      return;
    }
  }

  if (player.dataset.permanentFailure === "1") {
    onGiveUp?.({
      permanent: true,
      status: Number(player.dataset.failureStatus || "404"),
    });
    return;
  }

  if (retryCount < 2 && player.src) {
    player.dataset.retryCount = String(retryCount + 1);
    window.setTimeout(() => {
      try {
        const url = new URL(
          player.currentSrc || player.src,
          window.location.origin,
        );
        url.searchParams.set("_retry", String(retryCount + 1));
        player.src = url.toString();
        player.load();
        if (autoPlay) {
          player.play().catch(() => {});
        }
      } catch {
        try {
          player.load();
        } catch {
          // next error paints the UI
        }
      }
    }, 400 * (retryCount + 1));
    return;
  }

  onGiveUp?.({ permanent: false, status: 0 });
};

const normalizeGalleryPhoto = (photo, albumId, shareToken = "") => {
  if (!photo || photo.sourceType !== "gdrive" || !photo.sourceId) {
    return photo;
  }

  return {
    ...photo,
    imageUrl: buildGalleryMediaUrl(albumId, photo.id, shareToken),
  };
};

const normalizeGalleryAlbum = (album, shareToken = "") => {
  if (!album) return album;

  return {
    ...album,
    coverPhoto: album.coverPhoto
      ? normalizeGalleryPhoto(album.coverPhoto, album.id, shareToken)
      : album.coverPhoto,
  };
};

const platformLabelMap = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube: "YouTube",
  x: "X",
  linkedin: "LinkedIn",
  website: "Website",
  other: "Link",
};

const platformIconMap = {
  instagram: FaInstagram,
  facebook: FaFacebookF,
  tiktok: SiTiktok,
  youtube: FaYoutube,
  x: FaTwitter,
  linkedin: FaLinkedinIn,
  website: FaGlobe,
  other: FaLink,
};

const isValidHttpUrl = (value) => {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return false;

  try {
    // eslint-disable-next-line no-new
    new URL(trimmed);
    return true;
  } catch {
    return false;
  }
};

const WatermarkOverlay = ({ text, variant = "viewer" }) => {
  const label = typeof text === "string" && text.trim() ? text.trim() : "Private";
  const count = variant === "thumb" ? 18 : 30;
  const textClassName =
    variant === "thumb"
      ? "text-[11px] sm:text-xs"
      : "text-xs sm:text-sm md:text-base";

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 select-none overflow-hidden"
    >
      <div className="absolute inset-[-55%] rotate-[-24deg] opacity-35">
        <div className="grid grid-cols-3 gap-10 sm:grid-cols-4 sm:gap-14">
          {Array.from({ length: count }).map((_, index) => (
            // eslint-disable-next-line react/no-array-index-key
            <div key={index} className="flex items-center justify-center">
              <span
                className={`whitespace-nowrap font-semibold uppercase tracking-[0.22em] text-white/70 drop-shadow ${textClassName}`}
              >
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent" />
    </div>
  );
};

const SplitPanelMediaSurface = ({
  panelId,
  hideUI,
  label,
  item,
  media,
  assignVideoRef,
  muted = false,
  controls = true,
  autoPlay = false,
  onEnded,
  onMediaSuccess,
  onMediaError,
  hasError,
  isLoading = false,
  onRetry,
  onForegroundVideoReady,
  className = "",
  zoomState = { scale: 1, x: 0, y: 0 },
  showWatermark = false,
  watermarkText = "",
  surfaceRef,
  onPinchStart,
  onPinchMove,
  onPinchEnd,
  isActive = false,
  onActivate,
  onDoubleClickZoom,
  onZoomPan,
}) => {
  const [layers, setLayers] = useState(() =>
    item && media?.key
      ? [
          {
            layerKey: `${panelId}:${media.key}`,
            item,
            media,
            phase: "center",
          },
        ]
      : [],
  );
  const panGestureRef = useRef(null);
  const rootRef = useRef(null);
  const startedCenterVideoKeyRef = useRef(null);
  const setRootRef = useCallback(
    (node) => {
      rootRef.current = node;
      if (typeof surfaceRef === "function") {
        surfaceRef(node);
      } else if (surfaceRef && typeof surfaceRef === "object") {
        surfaceRef.current = node;
      }
    },
    [surfaceRef],
  );

  useEffect(() => {
    if (!item || !media?.key) {
      setLayers([]);
      return;
    }

    setLayers((current) => {
      const activeLayer = current[current.length - 1];
      if (
        activeLayer?.media?.key === media.key &&
        activeLayer?.item?.id === item.id
      ) {
        return current;
      }

      const nextLayer = {
        layerKey: `${panelId}:${media.key}`,
        item,
        media,
        // Stay hidden until media loads so the previous frame stays visible.
        phase: current.length === 0 ? "center" : "loading",
      };

      if (current.length === 0) {
        return [nextLayer];
      }

      // Keep the previous center layer until the new one reports ready.
      return [
        ...current
          .filter((layer) => layer.phase === "center" || layer.phase === "exit")
          .slice(-1),
        nextLayer,
      ];
    });
  }, [item, media, panelId]);

  const promoteLayer = useCallback((layerKey) => {
    setLayers((current) => {
      const target = current.find((layer) => layer.layerKey === layerKey);
      if (!target || target.phase === "center") {
        return current;
      }
      return current.map((layer) => {
        if (layer.layerKey === layerKey) {
          return { ...layer, phase: "center" };
        }
        if (layer.phase === "center") {
          return { ...layer, phase: "exit" };
        }
        return layer;
      });
    });
  }, []);

  // Only the center video may play with audio — pause/mute every other layer
  // so transitions don't double-play or leave the next clip silent.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const centerLayer = layers.find((entry) => entry.phase === "center");
    const centerKey = centerLayer?.layerKey || null;

    const videos = root.querySelectorAll("video[data-layer-key]");
    videos.forEach((video) => {
      const layerKey = video.getAttribute("data-layer-key");
      const isCenter = Boolean(centerKey && layerKey === centerKey);
      if (!isCenter) {
        video.muted = true;
        if (!video.paused) {
          video.pause();
        }
      }
    });

    if (!centerKey || !autoPlay) return undefined;

    const centerVideo = Array.from(
      root.querySelectorAll("video[data-layer-key]"),
    ).find((video) => video.getAttribute("data-layer-key") === centerKey);
    if (!centerVideo) return undefined;

    if (startedCenterVideoKeyRef.current !== centerKey) {
      startedCenterVideoKeyRef.current = centerKey;
      const wantSound = !muted;
      // Start muted so autoplay is allowed, then unmute once playing.
      centerVideo.muted = true;
      centerVideo
        .play()
        .then(() => {
          if (wantSound && startedCenterVideoKeyRef.current === centerKey) {
            centerVideo.muted = false;
          }
        })
        .catch(() => {});
      return undefined;
    }

    centerVideo.muted = Boolean(muted);
    return undefined;
  }, [autoPlay, layers, muted]);

  useEffect(() => {
    const hasExitingLayer = layers.some((layer) => layer.phase === "exit");
    if (!hasExitingLayer) return undefined;

    const timeout = window.setTimeout(() => {
      setLayers((current) => current.filter((layer) => layer.phase !== "exit"));
    }, splitPanelTransitionMs);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [layers]);

  return (
    <div
      ref={setRootRef}
      className={`relative min-h-0 h-full overflow-hidden transition-shadow ${className} ${
        hideUI
          ? "rounded-none border bg-black"
          : "rounded-lg border bg-black/70"
      } ${
        isActive
          ? "border-emerald-300/70 shadow-[inset_0_0_0_2px_rgba(52,211,153,0.55)]"
          : hideUI
            ? "border-transparent"
            : "border-white/10"
      } ${
        zoomState?.scale > 1
          ? "cursor-grab active:cursor-grabbing"
          : ""
      }`}
      data-split-panel={panelId}
      onPointerDown={(event) => {
        onActivate?.(panelId);
        if (
          !onZoomPan ||
          !zoomState ||
          zoomState.scale <= 1 ||
          !event.isPrimary
        ) {
          return;
        }
        panGestureRef.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          originX: zoomState.x || 0,
          originY: zoomState.y || 0,
        };
        event.currentTarget.setPointerCapture?.(event.pointerId);
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerMove={(event) => {
        const gesture = panGestureRef.current;
        if (!gesture || gesture.pointerId !== event.pointerId) return;
        if (!onZoomPan || !zoomState || zoomState.scale <= 1) return;
        onZoomPan(
          panelId,
          gesture.originX + (event.clientX - gesture.startX),
          gesture.originY + (event.clientY - gesture.startY),
        );
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerUp={(event) => {
        if (panGestureRef.current?.pointerId === event.pointerId) {
          event.currentTarget.releasePointerCapture?.(event.pointerId);
          panGestureRef.current = null;
        }
      }}
      onPointerCancel={(event) => {
        if (panGestureRef.current?.pointerId === event.pointerId) {
          event.currentTarget.releasePointerCapture?.(event.pointerId);
          panGestureRef.current = null;
        }
      }}
      onDoubleClick={
        onDoubleClickZoom
          ? (event) => onDoubleClickZoom(panelId, event)
          : undefined
      }
      onTouchStart={onPinchStart}
      onTouchMove={onPinchMove}
      onTouchEnd={onPinchEnd}
      onTouchCancel={onPinchEnd}
      style={{ touchAction: zoomState?.scale > 1 ? "none" : "pinch-zoom" }}
    >
      {!hideUI ? (
        <span className="absolute left-2 top-2 z-20 rounded-full border border-white/20 bg-black/50 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-white">
          {label}
        </span>
      ) : null}

      <div className="absolute inset-0">
        {hasError
          ? null
          : layers.map((layer, index) => {
          const isForeground = index === layers.length - 1;
          const isVisible = layer.phase === "center";
          const layerItem = layer.item;
          const layerMedia = layer.media;
          const layerIsVideo = layerMedia.isVideo;
          const imageSrc =
            layerMedia.playableSrc || layerItem?.imageUrl || "";
          const transitionClass =
            layer.phase === "center"
              ? "opacity-100 translate-y-0"
              : layer.phase === "loading"
                ? "opacity-0"
                : "opacity-0 -translate-y-2";

          return (
            <div
              key={layer.layerKey}
              data-layer-phase={layer.phase}
              aria-hidden={!isForeground}
              className={`absolute inset-0 flex items-center justify-center transition-[opacity,transform] duration-[260ms] ease-out ${
                isForeground ? "z-10" : "z-0 pointer-events-none"
              } ${transitionClass}`}
            >
              <div
                className="relative h-full w-full"
                style={{
                  transform:
                    zoomState?.scale > 1
                      ? `translate3d(${zoomState.x}px, ${zoomState.y}px, 0) scale(${zoomState.scale})`
                      : "none",
                  transformOrigin: "center",
                  transition: "transform 120ms ease-out",
                }}
              >
                {layerIsVideo ? (
                  <video
                    key={layer.layerKey}
                    data-layer-key={layer.layerKey}
                    ref={layer.phase === "center" ? assignVideoRef : undefined}
                    src={
                      layerMedia.playableSrc ||
                      layerMedia.sources?.[0] ||
                      layerItem?.imageUrl ||
                      undefined
                    }
                    controls={
                      Boolean(controls) &&
                      layer.phase === "center" &&
                      !hideUI &&
                      // In split mode, native controls only on the active panel.
                      (typeof onActivate === "function" ? isActive : true)
                    }
                    className="h-full w-full object-contain"
                    style={{ touchAction: hideUI ? "none" : "manipulation" }}
                    // Playback is synced in an effect — avoid native autoplay
                    // racing a still-audible previous layer.
                    autoPlay={false}
                    muted={Boolean(muted) || layer.phase !== "center"}
                    playsInline
                    preload="auto"
                    poster={
                      getVideoPosterUrl(layerItem?.imageUrl) || undefined
                    }
                    {...MEDIA_PROTECT_ELEMENT_PROPS}
                    onLoadedMetadata={() => {
                      if (layer.phase === "loading" || layer.phase === "center") {
                        promoteLayer(layer.layerKey);
                      }
                      onMediaSuccess(layerItem);
                    }}
                    onLoadedData={() => {
                      if (layer.phase === "loading" || layer.phase === "center") {
                        promoteLayer(layer.layerKey);
                      }
                      onMediaSuccess(layerItem);
                    }}
                    onCanPlay={() => {
                      if (layer.phase === "loading" || layer.phase === "center") {
                        promoteLayer(layer.layerKey);
                      }
                      onMediaSuccess(layerItem);
                    }}
                    onEnded={
                      layer.phase === "center"
                        ? (event) => {
                            event.currentTarget.pause();
                            onEnded?.(event);
                          }
                        : undefined
                    }
                    onError={(event) => {
                      // Background/exiting layers often abort mid-load — ignore.
                      if (layer.phase !== "center" && layer.phase !== "loading") {
                        return;
                      }
                      const player = event.currentTarget;
                      void handleGalleryVideoElementError({
                        player,
                        playableSrc: layerMedia.playableSrc,
                        autoPlay: Boolean(autoPlay),
                        onGiveUp: ({ permanent, status }) => {
                          setLayers([]);
                          onMediaError(
                            layerItem,
                            "onError",
                            player,
                            layerMedia.playableSrc,
                            { permanent, status },
                          );
                        },
                      });
                    }}
                  />
                ) : (
                  <img
                    src={imageSrc}
                    alt={layerItem?.caption || `Photo ${layerItem?.id}`}
                    className="h-full w-full object-contain"
                    decoding="async"
                    {...MEDIA_PROTECT_IMAGE_PROPS}
                    onLoad={() => {
                      promoteLayer(layer.layerKey);
                      onMediaSuccess(layerItem);
                    }}
                    onError={(event) => {
                      const mediaElement = event.currentTarget;
                      const src = layerMedia.playableSrc || imageSrc;
                      void (async () => {
                        let permanent = false;
                        let status = 0;
                        if (src) {
                          const probe = await probeGalleryMediaUrl(src);
                          permanent = isPermanentGalleryMediaStatus(probe.status);
                          status = probe.status;
                        }
                        setLayers([]);
                        onMediaError(
                          layerItem,
                          "onError",
                          mediaElement,
                          src,
                          { permanent, status },
                        );
                      })();
                    }}
                  />
                )}
                {showWatermark && isForeground && isVisible ? (
                  <WatermarkOverlay text={watermarkText} variant="viewer" />
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {isLoading &&
      !hasError &&
      (layers.length === 0 ||
        layers.some((layer) => layer.phase === "loading")) ? (
        <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center bg-black/35">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/25 border-t-emerald-300" />
        </div>
      ) : null}

      {hasError ? (
        <div className="absolute inset-0 z-30 grid place-items-center gap-3 bg-black p-4 text-center text-sm text-rose-200">
          <p>
            {hasError === "missing"
              ? "This Google Drive file is missing or was deleted."
              : hasError === "denied"
                ? "Google Drive access was denied for this file."
                : "Unable to load this media."}
          </p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-full border border-white/30 bg-white/10 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white transition hover:bg-white/20"
            >
              Retry
            </button>
          ) : (
            <p className="text-xs text-rose-100/80">
              Try next/previous or close and reopen.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
};

const GRID_SIZES = ["large", "medium", "small"];

function GridSizeSwiper({ density, onDensityChange }) {
  const currentIndex = Math.max(0, GRID_SIZES.indexOf(density));
  const pct = GRID_SIZES.length <= 1 ? 0 : (currentIndex / (GRID_SIZES.length - 1)) * 100;

  return (
    <div className="flex items-center gap-3">
      <LayoutGrid className="h-3.5 w-3.5 shrink-0 text-slate-300" strokeWidth={2} aria-hidden />
      <input
        type="range"
        min={0}
        max={2}
        step={1}
        value={currentIndex}
        onChange={(e) => onDensityChange(GRID_SIZES[Number(e.target.value)])}
        aria-label="Grid size"
        className="h-1.5 w-full min-w-0 flex-1 cursor-pointer appearance-none rounded-full outline-none [&::-webkit-slider-thumb]:h-[18px] [&::-webkit-slider-thumb]:w-[18px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md [&::-moz-range-thumb]:h-[18px] [&::-moz-range-thumb]:w-[18px] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white"
        style={{
          background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${pct}%, #3f4b5f ${pct}%, #3f4b5f 100%)`,
        }}
      />
      <Grid3x3 className="h-4 w-4 shrink-0 text-slate-300" strokeWidth={2} aria-hidden />
      <span className="w-4 shrink-0 text-right text-[15px] font-semibold tabular-nums leading-none text-white">
        {currentIndex + 1}
      </span>
    </div>
  );
}

export default function AlbumDetailPage({ params }) {
  const getInitialDensity = () => {
    if (typeof window === "undefined") {
      return "medium";
    }

    const savedDensity = window.localStorage.getItem("galleryDensity");
    return savedDensity && densityGridMap[savedDensity] ? savedDensity : "medium";
  };

  const startGlobalLoading = useLoadingStore((state) => state.startLoading);
  const stopGlobalLoading = useLoadingStore((state) => state.stopLoading);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [slug, setSlug] = useState("");
  const [album, setAlbum] = useState(null);
  const [accessMode, setAccessMode] = useState(() =>
    searchParams?.get("share") ? "shared" : "public",
  );
  const [photos, setPhotos] = useState([]);
  const [sort, setSort] = useState("custom");
  const [mediaFilter, setMediaFilter] = useState("all");
  const [density, setDensity] = useState(getInitialDensity);
  const [filterOpen, setFilterOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [delayMs, setDelayMs] = useState(TIMER_OFF_MS);
  const [customDelaySeconds, setCustomDelaySeconds] = useState("12");
  const [hideUI, setHideUI] = useState(false);
  const getInitialViewerMode = () => {
    if (typeof window === "undefined") {
      return "focus";
    }

    const savedMode = window.localStorage.getItem(viewerModeStorageKey);
    return ["focus", "slideshow", "split"].includes(savedMode) ? savedMode : "focus";
  };
  const [viewerMode, setViewerMode] = useState(getInitialViewerMode);
  const getInitialSplitMobileSwapped = () => {
    if (typeof window === "undefined") {
      return false;
    }
    return (
      window.localStorage.getItem(splitMobileSwapStorageKey) === "true"
    );
  };
  const [isSplitMobileSwapped, setIsSplitMobileSwapped] = useState(
    getInitialSplitMobileSwapped,
  );
  const [fullscreenControlsHidden, setFullscreenControlsHidden] =
    useState(false);
  const [splitPanels, setSplitPanels] = useState({
    left: { ...splitPanelSettingsDefaults },
    right: { ...splitPanelRightDefaults },
  });
  const [activeSplitPanel, setActiveSplitPanel] = useState("left");
  const [viewerUserId, setViewerUserId] = useState(null);
  const [resumePrompt, setResumePrompt] = useState(null);
  const [savedViewerSession, setSavedViewerSession] = useState(null);
  const resumeHandledRef = useRef(false);
  const viewerSessionRef = useRef({
    userId: null,
    albumId: null,
    payload: null,
  });
  const persistTimerRef = useRef(null);
  const activeSplitPanelRef = useRef("left");
  const moveSplitPanelRef = useRef(null);
  const navigationEpochRef = useRef(0);
  const [mediaLoadingByPanel, setMediaLoadingByPanel] = useState({});
  const [mediaErrors, setMediaErrors] = useState({});
  const [unavailableMediaIds, setUnavailableMediaIds] = useState({});
  const unavailableMediaIdsRef = useRef({});
  const brokenSkipCountRef = useRef(0);
  const [mediaReloadTokens, setMediaReloadTokens] = useState({});

  const markMediaUnavailable = useCallback((photoId, reason = "missing") => {
    if (!photoId) return;
    setUnavailableMediaIds((current) => {
      if (current[photoId] === reason) return current;
      const next = { ...current, [photoId]: reason };
      unavailableMediaIdsRef.current = next;
      return next;
    });
  }, []);

  const clearMediaUnavailable = useCallback((photoId) => {
    if (!photoId) return;
    setUnavailableMediaIds((current) => {
      if (!current[photoId]) return current;
      const next = { ...current };
      delete next[photoId];
      unavailableMediaIdsRef.current = next;
      return next;
    });
  }, []);
  const [loading, setLoading] = useState(true);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [error, setError] = useState("");
  const [galleryPage, setGalleryPage] = useState(1);
  const [galleryPageSize, setGalleryPageSize] = useState(24);
  const [blurUnclothyGenerated, setBlurUnclothyGenerated] = useState(true);
  const [isAlbumDownloadPending, setIsAlbumDownloadPending] = useState(false);
  const [albumDownloadProgress, setAlbumDownloadProgress] = useState(null);
  const albumDownloadAbortRef = useRef(null);
  const [audioPlayerOpen, setAudioPlayerOpen] = useState(false);
  const [currentAudioTrackIndex, setCurrentAudioTrackIndex] = useState(0);
  const [audioIsPlaying, setAudioIsPlaying] = useState(false);
  const [audioLoop, setAudioLoop] = useState(false);
  const audioRef = useRef(null);
  const audioIsPlayingRef = useRef(false);
  const activeVideoRef = useRef(null);
  const splitLeftVideoRef = useRef(null);
  const splitRightVideoRef = useRef(null);
  const splitSurfaceRefs = useRef({ left: null, right: null });
  const touchStartRef = useRef({ x: 0, y: 0, id: null, active: false });
  const mouseSwipeRef = useRef({ x: 0, y: 0, active: false, pointerId: null });
  const zoomSurfaceRef = useRef(null);
  const zoomGestureRef = useRef({
    pointerId: null,
    startX: 0,
    startY: 0,
    startOffsetX: 0,
    startOffsetY: 0,
    pinchDistance: 0,
    pinchScale: 1,
    pinchCenterX: 0,
    pinchCenterY: 0,
    pinchOffsetX: 0,
    pinchOffsetY: 0,
  });
  const [imageZoom, setImageZoom] = useState({ scale: 1, x: 0, y: 0 });
  const imageZoomRef = useRef(imageZoom);
  const [splitZoom, setSplitZoom] = useState(createDefaultSplitZoomState);
  const splitPinchRef = useRef(createDefaultSplitPinchState());
  const [preloadedMediaUrls, setPreloadedMediaUrls] = useState({});
  const preloadedMediaUrlsRef = useRef({});
  const preloadableGdrivePhotosRef = useRef([]);
  const shareToken = searchParams?.get("share") || "";
  const showWatermark = accessMode === "public";
  const watermarkText = useMemo(() => {
    const host = typeof window !== "undefined" ? window.location.host : "";
    return `${album?.name || slug || "Album"}${host ? ` • ${host}` : ""}`;
  }, [album?.name, slug]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!pathname || !pathname.startsWith("/gallery")) return;
    const query = searchParams?.toString();
    const fullPath = query ? `${pathname}?${query}` : pathname;
    window.localStorage.setItem(authLastVisitedPathStorageKey, fullPath);
  }, [pathname, searchParams]);

  useEffect(() => {
    let mounted = true;
    fetchJson("/api/gallery/settings")
      .then((payload) => {
        if (!mounted) return;
        setBlurUnclothyGenerated(payload?.blurUnclothyGenerated !== false);
      })
      .catch(() => {
        if (!mounted) return;
        setBlurUnclothyGenerated(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    Promise.resolve(params)
      .then((resolved) => {
        if (mounted) {
          setSlug(resolved?.slug || "");
        }
      })
      .catch(() => {
        if (mounted) {
          setSlug("");
        }
      });
    return () => {
      mounted = false;
    };
  }, [params]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("galleryDensity", density);
  }, [density]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(viewerModeStorageKey, viewerMode);
  }, [viewerMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      splitMobileSwapStorageKey,
      String(isSplitMobileSwapped),
    );
  }, [isSplitMobileSwapped]);

  useEffect(() => {
    if (!slug) {
      setError("Album slug is missing.");
      setLoading(false);
      setLoadingPhotos(false);
      return;
    }

    let finished = false;
    const finalize = () => {
      if (finished) {
        return;
      }

      finished = true;
      stopGlobalLoading();
    };

    setLoading(true);
    setLoadingPhotos(true);
    setError("");
    startGlobalLoading("Loading the album viewer");

    const cacheScope = shareToken ? `share:${shareToken}` : "public";

    const run = async () => {
      try {
        const albumData = await fetchJson(
          shareToken
            ? `/api/gallery/albums/by-share-token/${shareToken}`
            : `/api/gallery/albums/by-slug/${slug}`,
        );
        const normalizedAlbum = normalizeGalleryAlbum(albumData, shareToken);
        setAlbum(normalizedAlbum);
        setAccessMode(
          albumData?.accessMode || (shareToken ? "shared" : "public"),
        );
        setLoading(false);

        const cachedPhotos = await readCachedAlbumPhotos(
          albumData.id,
          sort,
          cacheScope,
        );
        if (Array.isArray(cachedPhotos) && cachedPhotos.length > 0) {
          const normalizedCached = cachedPhotos.map((photo) =>
            normalizeGalleryPhoto(photo, albumData.id, shareToken),
          );
          setPhotos(normalizedCached);
          setLoadingPhotos(false);
          void warmAlbumMediaCache(normalizedCached, {
            scope: "gallery",
            shareToken,
          });
        }

        const photosUrl = new URL(
          `/api/gallery/albums/${albumData.id}/photos`,
          window.location.origin,
        );
        photosUrl.searchParams.set("sort", sort);
        if (shareToken) {
          photosUrl.searchParams.set("share", shareToken);
        }

        const photoData = await fetchJson(
          `${photosUrl.pathname}${photosUrl.search}`,
        );
        setAccessMode(
          photoData?.accessMode ||
            albumData?.accessMode ||
            (shareToken ? "shared" : "public"),
        );
        const nextPhotos = Array.isArray(photoData.photos)
          ? photoData.photos.map((photo) =>
              normalizeGalleryPhoto(photo, albumData.id, shareToken),
            )
          : [];
        setPhotos(nextPhotos);
        void writeCachedAlbumPhotos(albumData.id, sort, nextPhotos, cacheScope);
        void warmAlbumMediaCache(nextPhotos, { scope: "gallery", shareToken });
      } catch (err) {
        setError(err.message);
        setLoading(false);
      } finally {
        setLoadingPhotos(false);
        finalize();
      }
    };

    run();
    return () => {
      finalize();
    };
  }, [shareToken, slug, sort, startGlobalLoading, stopGlobalLoading]);

  const filteredPhotos = photos.filter((item) => {
    if (isPhotoAudio(item)) return false;
    if (mediaFilter === "photos") return !isPhotoVideo(item);
    if (mediaFilter === "videos") return isPhotoVideo(item);
    if (mediaFilter === "nsfw") return !isPhotoVideo(item) && shouldBlurPhoto(item, { blurEnabled: true });
    return true;
  });
  const activeFilterLabel =
    {
      all: "All media",
      photos: "Photos",
      videos: "Videos",
      nsfw: "NSFW images",
    }[mediaFilter] || "All media";
  const activeSortLabel =
    {
      custom: "Manual",
      dateAsc: "Oldest first",
      dateDesc: "Newest first",
    }[sort] || "Manual";
  const filteredPhotoCount = filteredPhotos.length;
  const galleryTotalPages = Math.max(1, Math.ceil(filteredPhotoCount / galleryPageSize));
  const galleryStartIndex =
    filteredPhotoCount === 0 ? 0 : (galleryPage - 1) * galleryPageSize + 1;
  const galleryEndIndex = Math.min(filteredPhotoCount, galleryPage * galleryPageSize);
  const pagedGalleryPhotos = useMemo(
    () =>
      filteredPhotos.slice(
        (galleryPage - 1) * galleryPageSize,
        galleryPage * galleryPageSize,
      ),
    [filteredPhotos, galleryPage, galleryPageSize],
  );

  useEffect(() => {
    setGalleryPage(1);
  }, [mediaFilter, sort, galleryPageSize, slug, shareToken]);

  useEffect(() => {
    setGalleryPage((current) => Math.min(current, galleryTotalPages));
  }, [galleryTotalPages]);

  useEffect(() => {
    if (pagedGalleryPhotos.length === 0) return;
    void warmAlbumMediaCache(pagedGalleryPhotos, { scope: "gallery", shareToken });
  }, [pagedGalleryPhotos, shareToken]);

  const audioTracks = useMemo(() => photos.filter((item) => isPhotoAudio(item)), [photos]);
  const currentAudioTrack = audioTracks[currentAudioTrackIndex] ?? null;

  // Keep audioIsPlayingRef in sync so track-change effect can read it without stale closure
  useEffect(() => { audioIsPlayingRef.current = audioIsPlaying; }, [audioIsPlaying]);

  // When the current track index changes, reload the audio element and resume if it was playing
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (audioIsPlayingRef.current) {
      el.load();
      el.play().catch(() => {});
    }
  // currentAudioTrackIndex is the only intended dep; audioIsPlayingRef is a ref, not state
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAudioTrackIndex]);

  const handleAudioTogglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  };

  const handleAudioPrev = () => {
    if (audioTracks.length <= 1) return;
    setCurrentAudioTrackIndex((i) => (i - 1 + audioTracks.length) % audioTracks.length);
  };

  const handleAudioNext = useCallback(() => {
    if (audioTracks.length === 0) return;
    setCurrentAudioTrackIndex((i) => (i + 1) % audioTracks.length);
  }, [audioTracks.length]);

  const cancelAlbumDownload = useCallback(() => {
    albumDownloadAbortRef.current?.abort();
    albumDownloadAbortRef.current = null;
    setIsAlbumDownloadPending(false);
    setAlbumDownloadProgress(null);
    toast.message("Album download cancelled.");
  }, []);

  const handleDownloadAlbumZip = useCallback(async () => {
    if (accessMode === "public") {
      toast.error("Downloads are disabled for public viewers.");
      return;
    }
    if (!album?.id || isAlbumDownloadPending) {
      return;
    }

    albumDownloadAbortRef.current?.abort();
    const controller = new AbortController();
    albumDownloadAbortRef.current = controller;
    setIsAlbumDownloadPending(true);
    setAlbumDownloadProgress({
      percent: 0,
      currentFileName: "Preparing album…",
      currentFileIndex: 0,
      totalFiles: 0,
      uploadedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      lastResult: null,
    });

    try {
      const result = await downloadAlbumZipWithProgress({
        albumId: album.id,
        shareToken,
        fallbackFilename: `${album.slug || "album"}.zip`,
        signal: controller.signal,
        onProgressChange: setAlbumDownloadProgress,
      });

      if (result.failedCount > 0 || result.skippedCount > 0) {
        toast.success(
          `Downloaded ${result.filename} (${result.includedCount} packed${
            result.skippedCount ? `, ${result.skippedCount} skipped` : ""
          }${result.failedCount ? `, ${result.failedCount} failed` : ""}).`,
        );
      } else {
        toast.success(`Downloaded ${result.filename}.`);
      }
    } catch (downloadError) {
      if (
        controller.signal.aborted ||
        (downloadError instanceof DOMException && downloadError.name === "AbortError")
      ) {
        return;
      }
      toast.error(
        downloadError instanceof Error
          ? downloadError.message
          : "Album download failed.",
      );
    } finally {
      if (albumDownloadAbortRef.current === controller) {
        albumDownloadAbortRef.current = null;
      }
      setIsAlbumDownloadPending(false);
      setAlbumDownloadProgress(null);
    }
  }, [accessMode, album, isAlbumDownloadPending, shareToken]);

  const invalidatePendingNavigation = useCallback(() => {
    navigationEpochRef.current += 1;
  }, []);

  const goToNext = useCallback(() => {
    invalidatePendingNavigation();
    setActiveIndex((current) => {
      if (filteredPhotoCount === 0) return 0;
      return (current + 1) % filteredPhotoCount;
    });
  }, [filteredPhotoCount, invalidatePendingNavigation]);

  const goToPrev = useCallback(() => {
    invalidatePendingNavigation();
    setActiveIndex((current) => {
      if (filteredPhotoCount === 0) return 0;
      return (current - 1 + filteredPhotoCount) % filteredPhotoCount;
    });
  }, [filteredPhotoCount, invalidatePendingNavigation]);

  const exitBrowserFullscreen = useCallback(async () => {
    if (typeof document === "undefined") return;
    if (!document.fullscreenElement) return;
    try {
      await document.exitFullscreen();
    } catch {
      // ignore fullscreen exit failures (e.g., browser restrictions)
    }
  }, []);

  const handleHideUI = useCallback(async () => {
    setHideUI(true);
    if (typeof document === "undefined") return;
    if (document.fullscreenElement) return;
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      // ignore fullscreen enter failures and keep hide-ui mode enabled
    }
  }, []);

  const handleShowUI = useCallback(async () => {
    setHideUI(false);
    await exitBrowserFullscreen();
  }, [exitBrowserFullscreen]);

  const flushViewerSession = useCallback((options = {}) => {
    const { keepalive = false } = options;
    const { userId, albumId, payload } = viewerSessionRef.current;
    if (!albumId || !payload) return;

    writeLocalViewerSession(albumId, {
      ...payload,
      updatedAt: new Date().toISOString(),
    }, userId);

    if (persistTimerRef.current) {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }

    if (!userId) return;

    fetch(`/api/gallery/albums/${albumId}/viewer-session`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: Boolean(keepalive),
    }).catch(() => {});
  }, []);

  const closeViewer = useCallback(() => {
    flushViewerSession({ keepalive: true });
    const latest = viewerSessionRef.current.payload;
    if (latest) {
      setSavedViewerSession({
        ...latest,
        updatedAt: new Date().toISOString(),
      });
    }
    invalidatePendingNavigation();
    setViewerOpen(false);
    setIsPlaying(false);
    setMediaLoadingByPanel({});
    setHideUI(false);
    void exitBrowserFullscreen();
  }, [exitBrowserFullscreen, flushViewerSession, invalidatePendingNavigation]);

  const openViewerAt = useCallback(
    (index, options = {}) => {
      const {
        mode = "focus",
        delayMs: resumeDelayMs,
        isPlaying: resumeIsPlaying,
        splitRightIndex = null,
        activePanel = "left",
      } = options;
      invalidatePendingNavigation();
      setActiveIndex(index);
      setViewerMode(mode);
      setViewerOpen(true);
      if (Number.isFinite(resumeDelayMs)) {
        setDelayMs(resumeDelayMs > 0 ? resumeDelayMs : TIMER_OFF_MS);
      }
      if (typeof resumeIsPlaying === "boolean") {
        const effectiveDelay = Number.isFinite(resumeDelayMs)
          ? resumeDelayMs
          : TIMER_OFF_MS;
        setIsPlaying(Boolean(resumeIsPlaying) && effectiveDelay > 0);
      } else {
        setIsPlaying(false);
      }
      setSplitPanels({
        left: { ...splitPanelSettingsDefaults },
        right: {
          ...splitPanelRightDefaults,
          ...(Number.isFinite(splitRightIndex)
            ? { index: splitRightIndex }
            : {}),
        },
      });
      setActiveSplitPanel(activePanel === "right" ? "right" : "left");
      setMediaLoadingByPanel({ primary: true });
      setMediaErrors({});
      setMediaReloadTokens({});
      brokenSkipCountRef.current = 0;
      setHideUI(false);
    },
    [invalidatePendingNavigation],
  );

  const handleSplitPanelActivate = useCallback((panelId) => {
    setActiveSplitPanel((current) => (current === panelId ? current : panelId));
  }, []);

  const updateActiveSplitPanel = useCallback(
    (patch) => {
      setSplitPanels((current) => ({
        ...current,
        [activeSplitPanel]: {
          ...current[activeSplitPanel],
          ...patch,
        },
      }));
    },
    [activeSplitPanel],
  );

  const applySplitPanelTimer = useCallback((panelId, nextDelayMs) => {
    const delay = Number(nextDelayMs);
    const enabled = Number.isFinite(delay) && delay > 0;
    setSplitPanels((current) => ({
      ...current,
      [panelId]: {
        ...current[panelId],
        delayMs: enabled ? delay : TIMER_OFF_MS,
        isPlaying: enabled,
      },
    }));
  }, []);

  const applySlideshowTimer = useCallback((nextDelayMs) => {
    const delay = Number(nextDelayMs);
    const enabled = Number.isFinite(delay) && delay > 0;
    setDelayMs(enabled ? delay : TIMER_OFF_MS);
    setIsPlaying(enabled);
  }, []);

  const clampPhotoIndex = useCallback(
    (value) => {
      if (!Number.isFinite(value)) return 0;
      if (filteredPhotoCount <= 0) return 0;
      return Math.min(Math.max(0, Math.trunc(value)), filteredPhotoCount - 1);
    },
    [filteredPhotoCount],
  );

  const resumeFromSession = useCallback(
    (session) => {
      if (!session) return;
      const mode = VIEWER_MODES.includes(session.viewerMode)
        ? session.viewerMode
        : "focus";
      const baseIndex = clampPhotoIndex(
        mode === "split"
          ? session.splitLeftIndex ?? session.photoIndex
          : session.photoIndex,
      );
      const rightIndex =
        mode === "split" && Number.isFinite(session.splitRightIndex)
          ? clampPhotoIndex(session.splitRightIndex)
          : null;
      openViewerAt(baseIndex, {
        mode,
        delayMs: Number.isFinite(session.delayMs) ? session.delayMs : TIMER_OFF_MS,
        isPlaying:
          Number.isFinite(session.delayMs) &&
          session.delayMs > 0 &&
          (Boolean(session.isPlaying) || mode === "slideshow"),
        splitRightIndex: rightIndex,
      });
      resumeHandledRef.current = true;
      setResumePrompt(null);
      setSavedViewerSession(session);
    },
    [clampPhotoIndex, openViewerAt],
  );

  const startFreshSession = useCallback(() => {
    resumeHandledRef.current = true;
    setResumePrompt(null);
    setSavedViewerSession(null);
    if (album?.id) {
      clearLocalViewerSession(album.id, viewerUserId);
      fetch(`/api/gallery/albums/${album.id}/viewer-session`, {
        method: "DELETE",
      }).catch(() => {});
    }
  }, [album?.id, viewerUserId]);

  const dismissResumePrompt = useCallback(() => {
    resumeHandledRef.current = true;
    setResumePrompt(null);
  }, []);

  const resolveLatestViewerSession = useCallback(() => {
    if (isResumableSession(savedViewerSession)) {
      return savedViewerSession;
    }
    if (album?.id) {
      const local = readLocalViewerSession(album.id, viewerUserId)?.session;
      if (isResumableSession(local)) return local;
    }
    if (isResumableSession(resumePrompt?.session)) {
      return resumePrompt.session;
    }
    return null;
  }, [album?.id, resumePrompt?.session, savedViewerSession, viewerUserId]);

  /** Slideshow entry: restore last per-album view when one exists; otherwise start fresh. */
  const openSlideshowOrResume = useCallback(() => {
    const session = resolveLatestViewerSession();
    if (session) {
      resumeFromSession(session);
      return;
    }
    openViewerAt(0, { mode: "slideshow" });
  }, [openViewerAt, resolveLatestViewerSession, resumeFromSession]);

  const startFreshSlideshow = useCallback(() => {
    startFreshSession();
    openViewerAt(0, { mode: "slideshow" });
  }, [openViewerAt, startFreshSession]);

  // Load the saved viewer session for this album and prompt to resume once.
  useEffect(() => {
    resumeHandledRef.current = false;
    setResumePrompt(null);
    setSavedViewerSession(null);
    if (!album?.id) return undefined;

    let active = true;
    (async () => {
      let remote = null;
      let userId = null;
      try {
        const res = await fetch(
          `/api/gallery/albums/${album.id}/viewer-session`,
          { cache: "no-store" },
        );
        if (res.ok) {
          const data = await res.json();
          userId = data?.userId ?? null;
          remote = data?.session ?? null;
        }
      } catch {
        // ignore fetch failures; fall back to local cache
      }
      if (!active) return;

      const localMatch = readLocalViewerSession(album.id, userId);
      if (!userId && localMatch?.userId) {
        userId = localMatch.userId;
      }
      if (userId) setViewerUserId(userId);

      const local = localMatch?.session ?? null;

      let chosen = remote;
      if (
        local &&
        (!remote ||
          (local.updatedAt &&
            remote.updatedAt &&
            local.updatedAt > remote.updatedAt) ||
          (!remote.updatedAt && local.updatedAt))
      ) {
        chosen = local;
      }

      if (!active) return;
      if (chosen) {
        setSavedViewerSession(chosen);
      }
      if (!resumeHandledRef.current && isResumableSession(chosen)) {
        setResumePrompt({ session: chosen });
      }
    })();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [album?.id]);

  // Persist viewer session: immediate localStorage + debounced server PUT.
  useEffect(() => {
    if (!viewerOpen || !album?.id) return undefined;

    const payload = {
      photoIndex: activeIndex,
      viewerMode,
      delayMs,
      isPlaying,
      splitLeftIndex: viewerMode === "split" ? activeIndex : null,
      splitRightIndex:
        viewerMode === "split" ? splitPanels.right?.index ?? null : null,
    };

    viewerSessionRef.current = {
      userId: viewerUserId,
      albumId: album.id,
      payload,
    };

    const stamped = { ...payload, updatedAt: new Date().toISOString() };
    setSavedViewerSession(stamped);
    writeLocalViewerSession(album.id, stamped, viewerUserId);

    if (!viewerUserId) return undefined;

    if (persistTimerRef.current) {
      window.clearTimeout(persistTimerRef.current);
    }
    persistTimerRef.current = window.setTimeout(() => {
      persistTimerRef.current = null;
      fetch(`/api/gallery/albums/${album.id}/viewer-session`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => {});
    }, 800);

    return () => {
      if (persistTimerRef.current) {
        window.clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
    };
  }, [
    viewerOpen,
    viewerUserId,
    album?.id,
    activeIndex,
    viewerMode,
    delayMs,
    isPlaying,
    splitPanels,
  ]);

  // Flush the latest session if the tab is hidden/unloaded while viewing.
  useEffect(() => {
    const onPageHide = () => {
      flushViewerSession({ keepalive: true });
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [flushViewerSession]);

  // Opening a photo from the grid before answering suppresses the prompt for
  // this visit (without deleting the saved session).
  useEffect(() => {
    if (viewerOpen && resumePrompt) {
      resumeHandledRef.current = true;
      setResumePrompt(null);
    }
  }, [viewerOpen, resumePrompt]);

  useEffect(() => {
    if (!viewerOpen) {
      return;
    }
    if (filteredPhotoCount === 0) {
      closeViewer();
      return;
    }
    if (activeIndex >= filteredPhotoCount) {
      setActiveIndex(0);
    }
  }, [viewerOpen, filteredPhotoCount, activeIndex, closeViewer]);

  useEffect(() => {
    if (!viewerOpen) {
      return;
    }

    const isTypingTarget = (target) => {
      if (!target || typeof target.tagName !== "string") return false;
      const tag = target.tagName.toLowerCase();
      return (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        target.isContentEditable === true
      );
    };

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (hideUI) {
          void handleShowUI();
          return;
        }
        closeViewer();
        return;
      }
      if (isTypingTarget(event.target)) {
        return;
      }
      if (event.key === "f" || event.key === "F") {
        event.preventDefault();
        void handleHideUI();
        return;
      }
      if (event.key === "h" || event.key === "H") {
        if (hideUI && (viewerMode === "slideshow" || viewerMode === "split")) {
          event.preventDefault();
          setFullscreenControlsHidden((current) => !current);
        }
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const direction = event.key === "ArrowLeft" ? "prev" : "next";
        if (viewerMode === "split") {
          const panelId = activeSplitPanelRef.current;
          moveSplitPanelRef.current?.(panelId, direction);
          return;
        }
        if (direction === "prev") {
          goToPrev();
        } else {
          goToNext();
        }
        return;
      }
      if (event.key === " " || event.code === "Space") {
        event.preventDefault();
        if (viewerMode === "split") {
          const panelId = activeSplitPanelRef.current;
          setSplitPanels((current) => ({
            ...current,
            [panelId]: {
              ...current[panelId],
              isPlaying: !current[panelId].isPlaying,
            },
          }));
          return;
        }
        setIsPlaying((current) => !current);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    viewerOpen,
    hideUI,
    viewerMode,
    closeViewer,
    goToPrev,
    goToNext,
    handleShowUI,
    handleHideUI,
  ]);

  useEffect(() => {
    if (typeof document === "undefined" || !viewerOpen) return undefined;
    const onFullscreenChange = () => {
      if (!document.fullscreenElement && hideUI) {
        setHideUI(false);
      }
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [viewerOpen, hideUI]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    if (!viewerOpen) return undefined;

    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;

    // Prevent background scroll while the viewer modal is open (especially during wheel zoom).
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [viewerOpen]);

  useEffect(() => {
    imageZoomRef.current = imageZoom;
  }, [imageZoom]);

  useEffect(() => {
    preloadedMediaUrlsRef.current = preloadedMediaUrls;
  }, [preloadedMediaUrls]);

  const resolveMediaUrl = useCallback(
    (item) => {
      if (!item) return "";
      return preloadedMediaUrls[item.id] || item.imageUrl || "";
    },
    [preloadedMediaUrls],
  );
  const preloadableGdrivePhotos = useMemo(
    () =>
      photos.filter(
        (photo) =>
          photo?.sourceType === "gdrive" &&
          typeof photo.imageUrl === "string" &&
          photo.imageUrl.length > 0,
      ),
    [photos],
  );
  const preloadableGdriveKey = useMemo(
    () =>
      preloadableGdrivePhotos
        .map((photo) => `${photo.id}:${photo.imageUrl}`)
        .sort()
        .join("|"),
    [preloadableGdrivePhotos],
  );

  useEffect(() => {
    preloadableGdrivePhotosRef.current = preloadableGdrivePhotos;
  }, [preloadableGdrivePhotos]);

  const revokePreloadedMediaUrls = useCallback((entries) => {
    Object.values(entries || {}).forEach((value) => {
      if (typeof value === "string" && value.startsWith("blob:")) {
        URL.revokeObjectURL(value);
      }
    });
  }, []);

  const preloadInFlightRef = useRef(new Set());
  const warmedStreamIdsRef = useRef(new Set());
  const preloadQueueRef = useRef([]);
  const preloadWorkersActiveRef = useRef(false);

  const rememberBlobUrl = useCallback((photoId, objectUrl) => {
    setPreloadedMediaUrls((current) => {
      if (current[photoId]) {
        URL.revokeObjectURL(objectUrl);
        return current;
      }
      const next = { ...current, [photoId]: objectUrl };
      preloadedMediaUrlsRef.current = next;
      return next;
    });
  }, []);

  const enqueueGdrivePreload = useCallback((photos, { priority = false } = {}) => {
    if (!Array.isArray(photos) || photos.length === 0) return;
    let queue = preloadQueueRef.current;
    const nextBatch = [];
    const batchIds = new Set();

    photos.forEach((photo) => {
      if (!photo?.id || !photo.imageUrl) return;
      if (photo.sourceType !== "gdrive") return;
      if (unavailableMediaIdsRef.current[photo.id]) return;
      if (preloadedMediaUrlsRef.current[photo.id]) return;
      if (
        (isPhotoVideo(photo) || isPhotoAudio(photo)) &&
        warmedStreamIdsRef.current.has(photo.id)
      ) {
        return;
      }
      if (preloadInFlightRef.current.has(photo.id)) return;
      if (batchIds.has(photo.id)) return;
      batchIds.add(photo.id);
      nextBatch.push(photo);
    });

    if (nextBatch.length === 0) return;

    if (priority) {
      // Promote lookahead items to the front even if they were already queued.
      queue = queue.filter((photo) => !batchIds.has(photo.id));
      preloadQueueRef.current = [...nextBatch, ...queue];
      return;
    }

    const queuedIds = new Set(queue.map((photo) => photo.id));
    const append = nextBatch.filter((photo) => !queuedIds.has(photo.id));
    if (append.length === 0) return;
    preloadQueueRef.current = [...queue, ...append];
  }, []);

  const warmGdrivePhoto = useCallback(
    async (photo, signal) => {
      if (!photo?.id || !photo.imageUrl) return;
      if (unavailableMediaIdsRef.current[photo.id]) return;
      if (preloadedMediaUrlsRef.current[photo.id]) return;
      if (
        (isPhotoVideo(photo) || isPhotoAudio(photo)) &&
        warmedStreamIdsRef.current.has(photo.id)
      ) {
        return;
      }
      if (preloadInFlightRef.current.has(photo.id)) return;

      preloadInFlightRef.current.add(photo.id);
      try {
        if (isPhotoVideo(photo) || isPhotoAudio(photo)) {
          // Do not full-download videos here — that competes with the visible
          // player for Drive bandwidth. Progressive buffering is handled by the
          // hidden <video preload="auto"> pool instead.
          if (!signal.aborted) {
            warmedStreamIdsRef.current.add(photo.id);
          }
          return;
        }

        const response = await fetch(photo.imageUrl, {
          credentials: "same-origin",
          cache: "default",
          signal,
        });
        if (!response.ok) {
          if (isPermanentGalleryMediaStatus(response.status)) {
            markMediaUnavailable(
              photo.id,
              response.status === 403 ? "denied" : "missing",
            );
          }
          throw new Error(`Failed to preload media ${photo.id} (${response.status}).`);
        }

        const blob = await response.blob();
        if (signal.aborted) return;

        const objectUrl = URL.createObjectURL(blob);
        rememberBlobUrl(photo.id, objectUrl);

        try {
          const img = new Image();
          img.decoding = "async";
          img.src = objectUrl;
          if (typeof img.decode === "function") {
            await img.decode();
          }
        } catch {
          // decode is best-effort; blob URL is still usable
        }
      } catch (preloadError) {
        if (signal.aborted || preloadError?.name === "AbortError") return;
        console.warn("[GalleryViewer] Failed to preload imported media", {
          photoId: photo.id,
          message: preloadError?.message || String(preloadError),
        });
      } finally {
        preloadInFlightRef.current.delete(photo.id);
      }
    },
    [markMediaUnavailable, rememberBlobUrl],
  );

  // Background + priority queue workers for Google Drive media.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const previousUrls = preloadedMediaUrlsRef.current;
    if (Object.keys(previousUrls).length > 0) {
      revokePreloadedMediaUrls(previousUrls);
      preloadedMediaUrlsRef.current = {};
      setPreloadedMediaUrls({});
    }
    preloadQueueRef.current = [];
    preloadInFlightRef.current = new Set();
    warmedStreamIdsRef.current = new Set();

    if (!album?.id) {
      return undefined;
    }

    const preloadablePhotos = preloadableGdrivePhotosRef.current;
    if (preloadablePhotos.length === 0) {
      return undefined;
    }

    const abortController = new AbortController();
    let disposed = false;
    preloadWorkersActiveRef.current = true;
    // Do not enqueue the whole album up front — that floods Google Drive and
    // starves the slides the user is actually viewing. Lookahead effect feeds
    // the queue while the viewer is open.

    const workers = Array.from(
      {
        length: Math.min(
          Math.max(gdrivePreloadConcurrency, gdriveLookaheadConcurrency),
          Math.max(preloadablePhotos.length, 1),
        ),
      },
      async () => {
        while (!disposed && !abortController.signal.aborted) {
          const photo = preloadQueueRef.current.shift();
          if (!photo) {
            await new Promise((resolve) => window.setTimeout(resolve, 120));
            continue;
          }
          await warmGdrivePhoto(photo, abortController.signal);
        }
      },
    );

    void Promise.all(workers);

    return () => {
      disposed = true;
      preloadWorkersActiveRef.current = false;
      abortController.abort();
      preloadQueueRef.current = [];
      revokePreloadedMediaUrls(preloadedMediaUrlsRef.current);
      preloadedMediaUrlsRef.current = {};
      warmedStreamIdsRef.current = new Set();
      preloadInFlightRef.current = new Set();
    };
  }, [
    album?.id,
    preloadableGdriveKey,
    revokePreloadedMediaUrls,
    warmGdrivePhoto,
  ]);

  // Slideshow / viewer lookahead: always warm the next (and nearby) slides first.
  useEffect(() => {
    if (!viewerOpen || !album?.id || filteredPhotoCount === 0) {
      return undefined;
    }

    const pick = (index) => {
      const photo = filteredPhotos[index];
      return photo?.sourceType === "gdrive" ? photo : null;
    };

    const priorityPhotos = [];
    const pushIndex = (index) => {
      if (!filteredPhotoCount) return;
      const normalized =
        ((index % filteredPhotoCount) + filteredPhotoCount) % filteredPhotoCount;
      const photo = pick(normalized);
      if (photo) priorityPhotos.push(photo);
    };

    if (viewerMode === "split") {
      const rightIndex = Number.isFinite(splitPanels.right?.index)
        ? splitPanels.right.index
        : 0;
      for (let step = 0; step <= slideshowLookaheadCount; step += 1) {
        pushIndex(activeIndex + step);
        pushIndex(rightIndex + step);
      }
      for (let step = 1; step <= slideshowLookbehindCount; step += 1) {
        pushIndex(activeIndex - step);
        pushIndex(rightIndex - step);
      }
    } else {
      for (let step = 0; step <= slideshowLookaheadCount; step += 1) {
        pushIndex(activeIndex + step);
      }
      for (let step = 1; step <= slideshowLookbehindCount; step += 1) {
        pushIndex(activeIndex - step);
      }
    }

    // Videos first in the queue — Drive video start latency is the worst case.
    const videoFirst = [
      ...priorityPhotos.filter((photo) => isPhotoVideo(photo)),
      ...priorityPhotos.filter((photo) => !isPhotoVideo(photo)),
    ];
    enqueueGdrivePreload(videoFirst, { priority: true });
    return undefined;
  }, [
    viewerOpen,
    viewerMode,
    activeIndex,
    splitPanels.right?.index,
    filteredPhotos,
    filteredPhotoCount,
    album?.id,
    enqueueGdrivePreload,
  ]);

  // Hidden decode/buffer aids for the immediate next slide(s) while viewing.
  const slideshowPrefetchItems = useMemo(() => {
    if (!viewerOpen || filteredPhotoCount === 0) return [];
    const items = [];
    const seen = new Set();
    const add = (index) => {
      const normalized =
        ((index % filteredPhotoCount) + filteredPhotoCount) % filteredPhotoCount;
      const photo = filteredPhotos[normalized];
      if (!photo || seen.has(photo.id)) return;
      seen.add(photo.id);
      items.push(photo);
    };

    // Prefer upcoming videos first — those are the slow Drive hits.
    const addUpcomingVideos = (startIndex, count) => {
      let found = 0;
      for (let step = 1; step <= filteredPhotoCount && found < count; step += 1) {
        const normalized =
          ((startIndex + step) % filteredPhotoCount + filteredPhotoCount) %
          filteredPhotoCount;
        const photo = filteredPhotos[normalized];
        if (!photo || !isPhotoVideo(photo) || seen.has(photo.id)) continue;
        seen.add(photo.id);
        items.push(photo);
        found += 1;
      }
    };

    if (viewerMode === "split") {
      const rightIndex = Number.isFinite(splitPanels.right?.index)
        ? splitPanels.right.index
        : 0;
      addUpcomingVideos(rightIndex, videoPrefetchCount);
      addUpcomingVideos(activeIndex, 2);
      add(activeIndex + 1);
      add(rightIndex + 1);
      add(activeIndex + 2);
      add(rightIndex + 2);
    } else {
      addUpcomingVideos(activeIndex, videoPrefetchCount);
      add(activeIndex + 1);
      add(activeIndex + 2);
      add(activeIndex + 3);
    }
    return items.slice(0, 5);
  }, [
    viewerOpen,
    viewerMode,
    activeIndex,
    splitPanels.right?.index,
    filteredPhotos,
    filteredPhotoCount,
  ]);

  const videoPrefetchItems = useMemo(
    () =>
      slideshowPrefetchItems
        .filter((item) => isPhotoVideo(item) && !preloadedMediaUrls[item.id])
        .slice(0, 2),
    [slideshowPrefetchItems, preloadedMediaUrls],
  );

  const activeItem = viewerOpen ? filteredPhotos[activeIndex] : null;
  const activeItemIsVideo = activeItem ? isPhotoVideo(activeItem) : false;
  const activeResolvedSrc = activeItem ? resolveMediaUrl(activeItem) : "";
  const activePlayableSrc = activeItemIsVideo
    ? getPlayableMediaUrl(activeResolvedSrc)
    : activeResolvedSrc;
  const activeMediaKey = activeItem
    ? `primary:${activeItem.id}:${
        activeItemIsVideo
          ? `video:${mediaReloadTokens[`primary:${activeItem.id}`] || 0}`
          : activePlayableSrc
      }`
    : "";
  const isPresetDelay =
    delayMs === TIMER_OFF_MS || timerPresetMs.includes(delayMs);
  const clampZoomOffset = useCallback((value, axis, scale) => {
    const container = zoomSurfaceRef.current;
    const size =
      axis === "x" ? container?.clientWidth || 0 : container?.clientHeight || 0;
    if (!size || scale <= 1) return 0;
    const maxOffset = ((scale - 1) * size) / 2;
    return Math.max(-maxOffset, Math.min(maxOffset, value));
  }, []);
  const clampSplitZoomOffset = useCallback((panelId, value, axis, scale) => {
    const surface = splitSurfaceRefs.current[panelId];
    const size =
      axis === "x" ? surface?.clientWidth || 0 : surface?.clientHeight || 0;
    if (!size || scale <= 1) return 0;
    const maxOffset = ((scale - 1) * size) / 2;
    return Math.max(-maxOffset, Math.min(maxOffset, value));
  }, []);
  const resetImageZoom = useCallback(() => {
    zoomGestureRef.current = {
      pointerId: null,
      startX: 0,
      startY: 0,
      startOffsetX: 0,
      startOffsetY: 0,
      pinchDistance: 0,
      pinchScale: 1,
      pinchCenterX: 0,
      pinchCenterY: 0,
      pinchOffsetX: 0,
      pinchOffsetY: 0,
    };
    setImageZoom({ scale: 1, x: 0, y: 0 });
  }, []);
  const updateImageZoom = useCallback((nextScale, nextX, nextY) => {
    const clampedScale = Math.max(1, Math.min(4, nextScale));
    if (clampedScale <= 1) {
      setImageZoom({ scale: 1, x: 0, y: 0 });
      return;
    }
    setImageZoom({
      scale: clampedScale,
      x: clampZoomOffset(nextX, "x", clampedScale),
      y: clampZoomOffset(nextY, "y", clampedScale),
    });
  }, [clampZoomOffset]);
  const updateSplitZoom = useCallback(
    (panelId, nextScale, nextX, nextY) => {
      const clampedScale = Math.max(1, Math.min(3, nextScale));
      setSplitZoom((current) => ({
        ...current,
        [panelId]:
          clampedScale <= 1
            ? { scale: 1, x: 0, y: 0 }
            : {
                scale: clampedScale,
                x: clampSplitZoomOffset(panelId, nextX, "x", clampedScale),
                y: clampSplitZoomOffset(panelId, nextY, "y", clampedScale),
              },
      }));
    },
    [clampSplitZoomOffset],
  );

  useEffect(() => {
    if (!viewerOpen) return undefined;
    if (activeItemIsVideo) return undefined;
    if (viewerMode === "split") return undefined;

    const surface = zoomSurfaceRef.current;
    if (!surface) return undefined;

    const onWheel = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const current = imageZoomRef.current;
      const zoomDelta = event.deltaY < 0 ? 0.22 : -0.22;
      updateImageZoom(current.scale + zoomDelta, current.x, current.y);
    };

    surface.addEventListener("wheel", onWheel, { passive: false });
    return () => surface.removeEventListener("wheel", onWheel);
  }, [viewerOpen, activeItemIsVideo, viewerMode, updateImageZoom]);

  const DOUBLE_TAP_SCALE = 2;
  const lastTapRef = useRef({
    time: 0,
    x: 0,
    y: 0,
    panelId: null,
    count: 0,
  });
  const pendingVideoZoomTapRef = useRef(null);
  // Remember chrome state before zoom-in so zoom-out can restore it.
  const controlsHiddenBeforeZoomRef = useRef(null);
  const prevSplitItemIdsRef = useRef({ left: null, right: null });

  const hideControlsForZoom = useCallback(() => {
    if (!hideUI) return;
    if (controlsHiddenBeforeZoomRef.current === null) {
      controlsHiddenBeforeZoomRef.current = fullscreenControlsHidden;
    }
    setFullscreenControlsHidden(true);
  }, [fullscreenControlsHidden, hideUI]);

  const restoreControlsAfterZoomOut = useCallback(() => {
    if (controlsHiddenBeforeZoomRef.current === null) return;
    setFullscreenControlsHidden(Boolean(controlsHiddenBeforeZoomRef.current));
    controlsHiddenBeforeZoomRef.current = null;
  }, []);

  const togglePanelVideoPlayback = useCallback((panelId) => {
    const player =
      panelId === "primary"
        ? activeVideoRef.current
        : panelId === "left"
          ? splitLeftVideoRef.current
          : panelId === "right"
            ? splitRightVideoRef.current
            : null;
    if (!player) return;
    if (player.paused) {
      player.play().catch(() => {});
      return;
    }
    player.pause();
  }, []);

  const toggleImageDoubleZoom = useCallback(
    (clientX, clientY) => {
      const current = imageZoomRef.current;
      if (current.scale > 1) {
        resetImageZoom();
        restoreControlsAfterZoomOut();
        return;
      }
      const surface = zoomSurfaceRef.current;
      let nextX = 0;
      let nextY = 0;
      if (surface && Number.isFinite(clientX) && Number.isFinite(clientY)) {
        const rect = surface.getBoundingClientRect();
        const offsetX = clientX - (rect.left + rect.width / 2);
        const offsetY = clientY - (rect.top + rect.height / 2);
        nextX = -DOUBLE_TAP_SCALE * offsetX;
        nextY = -DOUBLE_TAP_SCALE * offsetY;
      }
      updateImageZoom(DOUBLE_TAP_SCALE, nextX, nextY);
      hideControlsForZoom();
    },
    [
      hideControlsForZoom,
      resetImageZoom,
      restoreControlsAfterZoomOut,
      updateImageZoom,
    ],
  );

  const handleImageDoubleClickZoom = useCallback(
    (event) => {
      if (activeItemIsVideo) return;
      toggleImageDoubleZoom(event?.clientX, event?.clientY);
    },
    [activeItemIsVideo, toggleImageDoubleZoom],
  );

  const toggleSplitDoubleZoom = useCallback(
    (panelId, clientX, clientY) => {
      const current = splitZoom[panelId] || { scale: 1, x: 0, y: 0 };
      if (current.scale > 1) {
        updateSplitZoom(panelId, 1, 0, 0);
        const otherId = panelId === "left" ? "right" : "left";
        const otherStillZoomed = (splitZoom[otherId]?.scale || 1) > 1;
        if (!otherStillZoomed) {
          restoreControlsAfterZoomOut();
        }
        return;
      }
      const surface = splitSurfaceRefs.current[panelId];
      let nextX = 0;
      let nextY = 0;
      if (surface && Number.isFinite(clientX) && Number.isFinite(clientY)) {
        const rect = surface.getBoundingClientRect();
        const offsetX = clientX - (rect.left + rect.width / 2);
        const offsetY = clientY - (rect.top + rect.height / 2);
        nextX = -DOUBLE_TAP_SCALE * offsetX;
        nextY = -DOUBLE_TAP_SCALE * offsetY;
      }
      updateSplitZoom(panelId, DOUBLE_TAP_SCALE, nextX, nextY);
      hideControlsForZoom();
    },
    [
      hideControlsForZoom,
      restoreControlsAfterZoomOut,
      splitZoom,
      updateSplitZoom,
    ],
  );

  const handleSplitDoubleClickZoom = useCallback(
    (panelId, event) => {
      toggleSplitDoubleZoom(panelId, event?.clientX, event?.clientY);
    },
    [toggleSplitDoubleZoom],
  );

  // Manual double/triple-tap detector for touch devices.
  // Images: double-tap zooms immediately.
  // Videos: double-tap zooms (short delay); triple-tap cancels zoom and pauses/plays.
  const registerTap = useCallback(
    (panelId, clientX, clientY, { isVideo = false } = {}) => {
      const now = Date.now();
      const last = lastTapRef.current;
      const sameSpot =
        last.panelId === panelId &&
        now - last.time < 340 &&
        Math.abs(clientX - last.x) < 36 &&
        Math.abs(clientY - last.y) < 36;
      const count = sameSpot ? (last.count || 1) + 1 : 1;

      const clearPendingVideoZoom = () => {
        if (pendingVideoZoomTapRef.current) {
          window.clearTimeout(pendingVideoZoomTapRef.current);
          pendingVideoZoomTapRef.current = null;
        }
      };

      const fireZoom = () => {
        if (panelId === "primary") {
          toggleImageDoubleZoom(clientX, clientY);
        } else {
          toggleSplitDoubleZoom(panelId, clientX, clientY);
        }
      };

      if (isVideo) {
        if (count >= 3) {
          clearPendingVideoZoom();
          lastTapRef.current = {
            time: 0,
            x: 0,
            y: 0,
            panelId: null,
            count: 0,
          };
          togglePanelVideoPlayback(panelId);
          return true;
        }

        if (count === 2) {
          clearPendingVideoZoom();
          lastTapRef.current = {
            time: now,
            x: clientX,
            y: clientY,
            panelId,
            count: 2,
          };
          pendingVideoZoomTapRef.current = window.setTimeout(() => {
            pendingVideoZoomTapRef.current = null;
            lastTapRef.current = {
              time: 0,
              x: 0,
              y: 0,
              panelId: null,
              count: 0,
            };
            fireZoom();
          }, 280);
          return true;
        }

        clearPendingVideoZoom();
        lastTapRef.current = {
          time: now,
          x: clientX,
          y: clientY,
          panelId,
          count: 1,
        };
        return false;
      }

      clearPendingVideoZoom();
      if (count >= 2) {
        lastTapRef.current = {
          time: 0,
          x: 0,
          y: 0,
          panelId: null,
          count: 0,
        };
        fireZoom();
        return true;
      }

      lastTapRef.current = {
        time: now,
        x: clientX,
        y: clientY,
        panelId,
        count: 1,
      };
      return false;
    },
    [toggleImageDoubleZoom, togglePanelVideoPlayback, toggleSplitDoubleZoom],
  );

  // Wheel zoom on the active split panel (desktop parity with single-image zoom).
  useEffect(() => {
    if (!viewerOpen || viewerMode !== "split") return undefined;
    const surface = splitSurfaceRefs.current[activeSplitPanel];
    if (!surface) return undefined;

    const onWheel = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const current = splitZoom[activeSplitPanel] || { scale: 1, x: 0, y: 0 };
      const zoomDelta = event.deltaY < 0 ? 0.22 : -0.22;
      updateSplitZoom(
        activeSplitPanel,
        current.scale + zoomDelta,
        current.x,
        current.y,
      );
    };

    surface.addEventListener("wheel", onWheel, { passive: false });
    return () => surface.removeEventListener("wheel", onWheel);
  }, [viewerOpen, viewerMode, activeSplitPanel, splitZoom, updateSplitZoom]);

  const getPanelMediaKey = useCallback((panelId, item) => {
    if (!item) return `${panelId}:none`;
    return `${panelId}:${item.id}`;
  }, []);

  const setPanelLoading = useCallback((panelId, isLoading) => {
    setMediaLoadingByPanel((current) => {
      const next = { ...current };
      if (isLoading) {
        next[panelId] = true;
      } else {
        delete next[panelId];
      }
      return next;
    });
  }, []);

  const clearPanelMediaError = useCallback(
    (panelId, item) => {
      if (!item) return;
      const key = getPanelMediaKey(panelId, item);
      setMediaErrors((current) => {
        if (!current[key]) return current;
        const next = { ...current };
        delete next[key];
        return next;
      });
    },
    [getPanelMediaKey],
  );

  const skipBrokenPanelMedia = useCallback((panelId) => {
    if (panelId === "left" || panelId === "right") {
      moveSplitPanelRef.current?.(panelId, "next");
      return;
    }
    invalidatePendingNavigation();
    setActiveIndex((current) => {
      if (filteredPhotoCount === 0) return 0;
      const maxSkips = Math.min(filteredPhotoCount, 12);
      let next = current;
      for (let i = 0; i < maxSkips; i += 1) {
        next = (next + 1) % filteredPhotoCount;
        const candidate = filteredPhotos[next];
        if (!candidate?.id) continue;
        if (!unavailableMediaIdsRef.current[candidate.id]) {
          return next;
        }
      }
      return (current + 1) % filteredPhotoCount;
    });
  }, [filteredPhotoCount, filteredPhotos, invalidatePendingNavigation]);

  const markPanelMediaError = useCallback(
    (
      panelId,
      item,
      eventName,
      mediaElement,
      finalVideoSrc = "",
      options = {},
    ) => {
      if (!item) return;
      const mediaError = mediaElement?.error
        ? {
            code: mediaElement.error.code,
            message: mediaElement.error.message || "",
            networkState: mediaElement.networkState,
            readyState: mediaElement.readyState,
          }
        : null;
      // 1 = MEDIA_ERR_ABORTED (navigation / layer swap)
      if (mediaError?.code === 1) {
        return;
      }
      const src =
        finalVideoSrc ||
        mediaElement?.currentSrc ||
        mediaElement?.src ||
        "";
      if (!src) {
        return;
      }
      const permanent = Boolean(options.permanent);
      const status = Number(options.status || 0);
      if (permanent && item.id) {
        markMediaUnavailable(
          item.id,
          status === 403 ? "denied" : "missing",
        );
      }
      const key = getPanelMediaKey(panelId, item);
      setMediaErrors((current) => ({
        ...current,
        [key]: permanent
          ? status === 403
            ? "denied"
            : "missing"
          : true,
      }));
      setPanelLoading(panelId, false);
      console.warn("[GalleryViewer] Media failed to load", {
        panelId,
        eventName,
        mediaId: item.id,
        finalVideoSrc: src,
        mediaError,
        permanent,
        status: status || undefined,
      });

      // Deleted Drive files never recover — skip ahead so resume/slideshow keep moving.
      if (permanent) {
        brokenSkipCountRef.current += 1;
        if (brokenSkipCountRef.current <= Math.max(filteredPhotoCount, 1)) {
          window.setTimeout(() => {
            skipBrokenPanelMedia(panelId);
          }, 280);
        }
      } else {
        brokenSkipCountRef.current = 0;
      }
    },
    [
      filteredPhotoCount,
      getPanelMediaKey,
      markMediaUnavailable,
      setPanelLoading,
      skipBrokenPanelMedia,
    ],
  );

  const markPanelMediaSuccess = useCallback(
    (panelId, item) => {
      brokenSkipCountRef.current = 0;
      if (item?.id) {
        clearMediaUnavailable(item.id);
      }
      clearPanelMediaError(panelId, item);
      setPanelLoading(panelId, false);
    },
    [clearMediaUnavailable, clearPanelMediaError, setPanelLoading],
  );

  const buildSplitCandidates = useCallback(
    (filter) => {
      if (!Array.isArray(filteredPhotos) || filteredPhotos.length === 0)
        return [];
      const matched = filteredPhotos
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => mediaMatchesFilter(item, filter))
        .map(({ index }) => index);
      if (matched.length > 0) return matched;
      return filteredPhotos
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => mediaMatchesFilter(item, filter))
        .map(({ index }) => index);
    },
    [filteredPhotos],
  );

  const handleViewerModeChange = useCallback(
    (nextMode) => {
      setViewerMode(nextMode);
      if (nextMode === "slideshow" && delayMs > 0 && !isPlaying) {
        setIsPlaying(true);
      }
      if (nextMode === "slideshow" && delayMs <= 0) {
        setIsPlaying(false);
      }
      if (nextMode === "split") {
        setSplitPanels((current) => {
          const left = {
            ...current.left,
            filter: getSplitPanelFilter("left"),
          };
          const rightCandidates = buildSplitCandidates(
            getSplitPanelFilter("right"),
          );
          const rightIndex = rightCandidates.includes(current.right.index)
            ? current.right.index
            : (rightCandidates[0] ?? activeIndex);
          return {
            left,
            right: {
              ...current.right,
              filter: getSplitPanelFilter("right"),
              index: rightIndex,
            },
          };
        });
      }
    },
    [activeIndex, buildSplitCandidates, delayMs, isPlaying],
  );

  const splitResolved = useMemo(() => {
    if (!viewerOpen || viewerMode !== "split" || filteredPhotos.length === 0) {
      return null;
    }

    const leftState = {
      ...(splitPanels.left || splitPanelSettingsDefaults),
      filter: getSplitPanelFilter("left"),
    };
    const rightState = {
      ...(splitPanels.right || splitPanelRightDefaults),
      filter: getSplitPanelFilter("right"),
    };

    const leftCandidates = buildSplitCandidates(leftState.filter);
    const leftIndex = leftCandidates.includes(activeIndex)
      ? activeIndex
      : (leftCandidates[0] ?? activeIndex ?? 0);

    const rightCandidates = buildSplitCandidates(rightState.filter);
    const rightIndex = rightCandidates.includes(rightState.index)
      ? rightState.index
      : (rightCandidates[0] ?? 0);

    const leftItem = filteredPhotos[leftIndex] || null;
    const rightItem = filteredPhotos[rightIndex] || null;

    return {
      left: {
        ...leftState,
        index: leftIndex,
        candidates: leftCandidates,
        item: leftItem,
      },
      right: {
        ...rightState,
        index: rightIndex,
        candidates: rightCandidates,
        item: rightItem,
      },
    };
  }, [
    viewerOpen,
    viewerMode,
    filteredPhotos,
    splitPanels,
    buildSplitCandidates,
    activeIndex,
  ]);

  const leftSplitPanel = splitResolved?.left || null;
  const rightSplitPanel = splitResolved?.right || null;
  const activeSplitSettings =
    (activeSplitPanel === "left" ? leftSplitPanel : rightSplitPanel) ||
    splitPanelSettingsDefaults;
  const leftSplitItem = leftSplitPanel?.item || null;
  const rightSplitItem = rightSplitPanel?.item || null;
  const leftSplitIsVideo = leftSplitItem ? isPhotoVideo(leftSplitItem) : false;
  const rightSplitIsVideo = rightSplitItem ? isPhotoVideo(rightSplitItem) : false;
  // Mobile stacked layout: Top/Bottom map through swap onto left/right IDs.
  const topSplitPanelId = isSplitMobileSwapped ? "right" : "left";
  const bottomSplitPanelId = isSplitMobileSwapped ? "left" : "right";
  const showSplitMode =
    viewerMode === "split" && !!leftSplitItem && !!rightSplitItem;

  const handleFullscreenVideoContextMenu = useCallback(
    (event) => {
      if (!viewerOpen || !hideUI) return;
      event.preventDefault();
      event.stopPropagation();

      if (showSplitMode) {
        const panelEl = event.target?.closest?.("[data-split-panel]");
        const panelId =
          panelEl?.getAttribute("data-split-panel") ||
          activeSplitPanelRef.current ||
          "right";
        const isVideo =
          panelId === "left" ? leftSplitIsVideo : rightSplitIsVideo;
        handleSplitPanelActivate(panelId);
        if (isVideo) {
          togglePanelVideoPlayback(panelId);
          return;
        }
        // Image panel: right-click pauses/resumes the auto-advance timer.
        setSplitPanels((current) => {
          const panel = current[panelId];
          if (!(panel?.delayMs > 0)) return current;
          return {
            ...current,
            [panelId]: {
              ...panel,
              isPlaying: !panel.isPlaying,
            },
          };
        });
        return;
      }

      if (activeItemIsVideo) {
        togglePanelVideoPlayback("primary");
        return;
      }

      // Slideshow/focus image: toggle timer when seconds are set.
      if (delayMs > 0) {
        setIsPlaying((current) => !current);
      }
    },
    [
      activeItemIsVideo,
      delayMs,
      handleSplitPanelActivate,
      hideUI,
      leftSplitIsVideo,
      rightSplitIsVideo,
      showSplitMode,
      togglePanelVideoPlayback,
      viewerOpen,
    ],
  );

  const retryPanelMedia = useCallback(
    (panelId, item) => {
      if (!item) return;
      clearMediaUnavailable(item.id);
      brokenSkipCountRef.current = 0;
      const key = getPanelMediaKey(panelId, item);
      setMediaErrors((current) => {
        if (!current[key]) return current;
        const next = { ...current };
        delete next[key];
        return next;
      });
      setMediaReloadTokens((current) => ({
        ...current,
        [key]: (current[key] || 0) + 1,
      }));
      setPanelLoading(panelId, true);
    },
    [clearMediaUnavailable, getPanelMediaKey, setPanelLoading],
  );

  const getMediaSources = useCallback(
    (item, panelId = "primary") => {
      if (!item) return { isVideo: false, playableSrc: "", sources: [], key: "" };
      const resolvedSrc = resolveMediaUrl(item);
      const isVideo = isPhotoVideo(item);
      const playableSrc = isVideo
        ? getPlayableMediaUrl(resolvedSrc)
        : resolvedSrc;
      const sources = isVideo
        ? Array.from(new Set([resolvedSrc, playableSrc].filter(Boolean)))
        : [];
      const reloadToken =
        mediaReloadTokens[getPanelMediaKey(panelId, item)] || 0;
      // Keep video keys stable across URL resolves so resume doesn't remount
      // mid-stream; bump only via explicit Retry.
      const key = isVideo
        ? `${item.id}:video:${reloadToken}`
        : `${item.id}:${playableSrc}:${reloadToken}`;
      return { isVideo, playableSrc, sources, key };
    },
    [getPanelMediaKey, mediaReloadTokens, resolveMediaUrl],
  );

  const leftSplitMedia = getMediaSources(leftSplitItem, "left");
  const rightSplitMedia = getMediaSources(rightSplitItem, "right");

  useEffect(() => {
    resetImageZoom();
  }, [resetImageZoom, viewerOpen, viewerMode, activeItem?.id, activeItemIsVideo]);

  useEffect(() => {
    // Reset zoom only for the panel whose media changed — keep the other
    // panel's zoom (e.g. top image stays zoomed when right video advances).
    if (!viewerOpen || viewerMode !== "split") {
      setSplitZoom(createDefaultSplitZoomState());
      splitPinchRef.current = createDefaultSplitPinchState();
      prevSplitItemIdsRef.current = { left: null, right: null };
      return;
    }

    const prev = prevSplitItemIdsRef.current;
    const leftId = leftSplitItem?.id ?? null;
    const rightId = rightSplitItem?.id ?? null;
    const leftChanged = leftId !== prev.left;
    const rightChanged = rightId !== prev.right;

    if (leftChanged || rightChanged) {
      setSplitZoom((current) => ({
        left: leftChanged ? { scale: 1, x: 0, y: 0 } : current.left,
        right: rightChanged ? { scale: 1, x: 0, y: 0 } : current.right,
      }));
      if (leftChanged) {
        splitPinchRef.current.left = {
          distance: 0,
          scale: 1,
          centerX: 0,
          centerY: 0,
          offsetX: 0,
          offsetY: 0,
        };
      }
      if (rightChanged) {
        splitPinchRef.current.right = {
          distance: 0,
          scale: 1,
          centerX: 0,
          centerY: 0,
          offsetX: 0,
          offsetY: 0,
        };
      }
    }

    prevSplitItemIdsRef.current = { left: leftId, right: rightId };
  }, [viewerOpen, viewerMode, leftSplitItem?.id, rightSplitItem?.id]);

  useEffect(() => {
    if (
      !viewerOpen ||
      !hideUI ||
      (viewerMode !== "split" && viewerMode !== "slideshow")
    ) {
      setFullscreenControlsHidden(false);
    }
  }, [viewerOpen, hideUI, viewerMode]);

  const buildSplitPinchHandlers = useCallback(
    (panelId) => {
      const getTouches = (event) => {
        const touches = event.touches;
        if (!touches || touches.length !== 2) return null;
        return [touches[0], touches[1]];
      };

      return {
        onPinchStart: (event) => {
          const touches = getTouches(event);
          if (!touches) return;
          const [a, b] = touches;
          const distance = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
          const centerX = (a.clientX + b.clientX) / 2;
          const centerY = (a.clientY + b.clientY) / 2;
          const currentZoom = splitZoom[panelId] || { scale: 1, x: 0, y: 0 };
          splitPinchRef.current[panelId] = {
            distance,
            scale: currentZoom.scale || 1,
            centerX,
            centerY,
            offsetX: currentZoom.x || 0,
            offsetY: currentZoom.y || 0,
          };
          event.preventDefault();
          event.stopPropagation();
        },
        onPinchMove: (event) => {
          const touches = getTouches(event);
          if (!touches) return;
          const [a, b] = touches;
          const distance = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
          const centerX = (a.clientX + b.clientX) / 2;
          const centerY = (a.clientY + b.clientY) / 2;
          const state = splitPinchRef.current[panelId];
          if (!state?.distance) return;
          const nextScale = state.scale * (distance / state.distance);
          const nextX = state.offsetX + (centerX - state.centerX);
          const nextY = state.offsetY + (centerY - state.centerY);
          updateSplitZoom(panelId, nextScale, nextX, nextY);
          event.preventDefault();
          event.stopPropagation();
        },
        onPinchEnd: (event) => {
          if (event.touches?.length >= 2) return;
          const currentZoom = splitZoom[panelId] || { scale: 1, x: 0, y: 0 };
          splitPinchRef.current[panelId] = {
            distance: 0,
            scale: currentZoom.scale || 1,
            centerX: 0,
            centerY: 0,
            offsetX: currentZoom.x || 0,
            offsetY: currentZoom.y || 0,
          };
          // Double-tap zooms images; triple-tap pauses/plays videos.
          if (event.changedTouches?.length === 1 && event.touches.length === 0) {
            const touch = event.changedTouches[0];
            const isVideo =
              panelId === "left" ? leftSplitIsVideo : rightSplitIsVideo;
            if (
              registerTap(panelId, touch.clientX, touch.clientY, { isVideo })
            ) {
              event.preventDefault();
              event.stopPropagation();
            }
          }
        },
      };
    },
    [
      leftSplitIsVideo,
      registerTap,
      rightSplitIsVideo,
      splitZoom,
      updateSplitZoom,
    ],
  );

  const leftSplitPinchHandlers = useMemo(
    () => buildSplitPinchHandlers("left"),
    [buildSplitPinchHandlers],
  );
  const rightSplitPinchHandlers = useMemo(
    () => buildSplitPinchHandlers("right"),
    [buildSplitPinchHandlers],
  );

  const moveSplitPanel = useCallback(
    (panelId, direction) => {
      const isNext = direction === "next";
      invalidatePendingNavigation();
      if (panelId === "left") {
        setActiveIndex((current) => {
          const candidates = buildSplitCandidates(getSplitPanelFilter("left"));
          if (candidates.length === 0) return current;
          const candidateSet = new Set(candidates);
          const matcher = (_item, idx) => candidateSet.has(idx);
          const nextIndex = isNext
            ? findNextIndexByType(current, filteredPhotos, matcher, {
                wrap: true,
              })
            : findPrevIndexByType(current, filteredPhotos, matcher, {
                wrap: true,
              });
          return nextIndex >= 0 ? nextIndex : candidates[0];
        });
        return;
      }

      setSplitPanels((current) => {
        const target = current[panelId];
        const candidates = buildSplitCandidates(getSplitPanelFilter(panelId));
        if (candidates.length === 0) return current;
        const candidateSet = new Set(candidates);
        const matcher = (_item, idx) => candidateSet.has(idx);
        const nextIndex = isNext
          ? findNextIndexByType(target.index, filteredPhotos, matcher, {
              wrap: true,
            })
          : findPrevIndexByType(target.index, filteredPhotos, matcher, {
              wrap: true,
            });
        const resolvedIndex = nextIndex >= 0 ? nextIndex : candidates[0];
        return {
          ...current,
          [panelId]: {
            ...target,
            index: resolvedIndex,
          },
        };
      });
    },
    [buildSplitCandidates, filteredPhotos, invalidatePendingNavigation],
  );

  activeSplitPanelRef.current = activeSplitPanel;
  moveSplitPanelRef.current = moveSplitPanel;

  const goToNextVideo = useCallback(() => {
    invalidatePendingNavigation();
    setActiveIndex((current) => {
      const nextVideoIndex = findNextIndexByType(
        current,
        filteredPhotos,
        (item) => isPhotoVideo(item),
        { wrap: true },
      );
      return nextVideoIndex >= 0 ? nextVideoIndex : current;
    });
  }, [filteredPhotos, invalidatePendingNavigation]);

  useEffect(() => {
    if (
      !viewerOpen ||
      !isPlaying ||
      !(delayMs > 0) ||
      !activeItem ||
      activeItemIsVideo ||
      viewerMode === "split"
    ) {
      return;
    }

    const navigationEpoch = navigationEpochRef.current;
    const timeout = window.setTimeout(() => {
      if (navigationEpoch !== navigationEpochRef.current) return;
      goToNext();
    }, delayMs);

    return () => window.clearTimeout(timeout);
  }, [
    viewerOpen,
    isPlaying,
    activeItem,
    activeItemIsVideo,
    delayMs,
    goToNext,
    viewerMode,
  ]);

  useEffect(() => {
    if (!viewerOpen || !activeItem || viewerMode === "split") return;
    setPanelLoading("primary", true);
    clearPanelMediaError("primary", activeItem);
  }, [
    viewerOpen,
    viewerMode,
    activeItem?.id,
    activePlayableSrc,
    setPanelLoading,
    clearPanelMediaError,
    activeItem,
  ]);

  const prevSplitMediaRef = useRef({
    leftId: null,
    rightId: null,
    leftKey: null,
    rightKey: null,
  });

  useEffect(() => {
    if (!viewerOpen || viewerMode !== "split") {
      prevSplitMediaRef.current = {
        leftId: null,
        rightId: null,
        leftKey: null,
        rightKey: null,
      };
      return;
    }

    const prev = prevSplitMediaRef.current;
    const leftId = leftSplitItem?.id ?? null;
    const rightId = rightSplitItem?.id ?? null;
    const leftKey = leftSplitMedia.key || null;
    const rightKey = rightSplitMedia.key || null;

    // Only the panel whose media actually changed should show a loader.
    // Setting both true on every next/prev made the other panel flash a
    // stuck spinner over already-playing video.
    if (
      leftSplitItem &&
      (leftId !== prev.leftId || leftKey !== prev.leftKey)
    ) {
      setPanelLoading("left", true);
      clearPanelMediaError("left", leftSplitItem);
    }
    if (
      rightSplitItem &&
      (rightId !== prev.rightId || rightKey !== prev.rightKey)
    ) {
      setPanelLoading("right", true);
      clearPanelMediaError("right", rightSplitItem);
    }

    prevSplitMediaRef.current = { leftId, rightId, leftKey, rightKey };
  }, [
    viewerOpen,
    viewerMode,
    leftSplitItem?.id,
    rightSplitItem?.id,
    leftSplitMedia.key,
    rightSplitMedia.key,
    setPanelLoading,
    clearPanelMediaError,
    leftSplitItem,
    rightSplitItem,
  ]);

  useEffect(() => {
    if (!viewerOpen || !activeItemIsVideo || viewerMode === "split")
      return undefined;
    const player = activeVideoRef.current;
    return () => {
      if (!player) return;
      player.pause();
    };
  }, [viewerOpen, activeItem?.id, activeItemIsVideo, viewerMode]);

  useEffect(() => {
    if (!viewerOpen || viewerMode !== "split") return undefined;
    const leftPlayer = splitLeftVideoRef.current;
    const rightPlayer = splitRightVideoRef.current;
    return () => {
      if (leftPlayer) {
        leftPlayer.pause();
      }
      if (rightPlayer) {
        rightPlayer.pause();
      }
    };
  }, [viewerOpen, viewerMode]);

  useEffect(() => {
    if (
      !viewerOpen ||
      viewerMode !== "split" ||
      !leftSplitPanel?.isPlaying ||
      !(leftSplitPanel?.delayMs > 0) ||
      !leftSplitItem ||
      leftSplitIsVideo
    ) {
      return;
    }
    const navigationEpoch = navigationEpochRef.current;
    const timeout = window.setTimeout(() => {
      if (navigationEpoch !== navigationEpochRef.current) return;
      moveSplitPanel("left", "next");
    }, leftSplitPanel.delayMs);
    return () => window.clearTimeout(timeout);
  }, [
    viewerOpen,
    viewerMode,
    leftSplitPanel,
    leftSplitItem,
    leftSplitIsVideo,
    moveSplitPanel,
  ]);

  useEffect(() => {
    if (
      !viewerOpen ||
      viewerMode !== "split" ||
      !rightSplitPanel?.isPlaying ||
      !(rightSplitPanel?.delayMs > 0) ||
      !rightSplitItem ||
      rightSplitIsVideo
    ) {
      return;
    }
    const navigationEpoch = navigationEpochRef.current;
    const timeout = window.setTimeout(() => {
      if (navigationEpoch !== navigationEpochRef.current) return;
      moveSplitPanel("right", "next");
    }, rightSplitPanel.delayMs);
    return () => window.clearTimeout(timeout);
  }, [
    viewerOpen,
    viewerMode,
    rightSplitPanel,
    rightSplitItem,
    rightSplitIsVideo,
    moveSplitPanel,
  ]);

  const isViewerSwipeZoomed = useCallback(() => {
    const zoomedSplit =
      showSplitMode &&
      ((splitZoom.left?.scale || 1) > 1 || (splitZoom.right?.scale || 1) > 1);
    const zoomedPrimary = !showSplitMode && imageZoom.scale > 1;
    return zoomedSplit || zoomedPrimary;
  }, [
    showSplitMode,
    splitZoom.left?.scale,
    splitZoom.right?.scale,
    imageZoom.scale,
  ]);

  const applyViewerSwipe = useCallback(
    (deltaX, deltaY, { horizontalThreshold = 35 } = {}) => {
      if (!viewerOpen) return;

      if (
        hideUI &&
        (showSplitMode || viewerMode === "slideshow") &&
        !isViewerSwipeZoomed()
      ) {
        if (Math.abs(deltaY) >= 45 && Math.abs(deltaY) > Math.abs(deltaX)) {
          setFullscreenControlsHidden(deltaY > 0);
          return;
        }
      }

      // Split fullscreen: swipe horizontally switches the active panel item.
      if (hideUI && showSplitMode) {
        if (isViewerSwipeZoomed()) return;
        if (Math.abs(deltaX) >= 45 && Math.abs(deltaX) > Math.abs(deltaY)) {
          moveSplitPanel(
            activeSplitPanelRef.current,
            deltaX < 0 ? "next" : "prev",
          );
          return;
        }
      }

      if (imageZoom.scale > 1) return;
      if (
        Math.abs(deltaX) < horizontalThreshold ||
        Math.abs(deltaX) < Math.abs(deltaY)
      ) {
        return;
      }
      if (deltaX < 0) {
        goToNext();
        return;
      }
      goToPrev();
    },
    [
      viewerOpen,
      hideUI,
      showSplitMode,
      viewerMode,
      isViewerSwipeZoomed,
      moveSplitPanel,
      imageZoom.scale,
      goToNext,
      goToPrev,
    ],
  );

  const handleTouchStart = (event) => {
    if (!viewerOpen) return;
    if (event.touches.length !== 1) return;

    // While zoomed, ignore swipe-to-hide / swipe-nav tracking so drag-pan works.
    if (isViewerSwipeZoomed()) {
      touchStartRef.current = { x: 0, y: 0, id: null, active: false };
      return;
    }

    const touch = event.touches[0];
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      id: touch.identifier,
      active: true,
    };
  };

  const handleTouchEnd = (event) => {
    if (!touchStartRef.current.active) return;
    const start = touchStartRef.current;
    touchStartRef.current = { x: 0, y: 0, id: null, active: false };
    const touch = Array.from(event.changedTouches || []).find(
      (candidate) => candidate.identifier === start.id,
    );
    if (!touch) return;
    applyViewerSwipe(touch.clientX - start.x, touch.clientY - start.y);
  };

  const isSwipeIgnoredTarget = (target) => {
    if (!(target instanceof Element)) return false;
    return Boolean(
      target.closest(
        "button, a, input, select, label, textarea, [data-no-swipe]",
      ),
    );
  };

  const handleSwipePointerDown = (event) => {
    if (!viewerOpen) return;
    // Touch keeps using touch handlers; this path is for mouse/pen on PC.
    if (event.pointerType === "touch") return;
    if (event.button !== 0) return;
    if (isSwipeIgnoredTarget(event.target)) return;
    if (isViewerSwipeZoomed()) {
      mouseSwipeRef.current = {
        x: 0,
        y: 0,
        active: false,
        pointerId: null,
      };
      return;
    }

    mouseSwipeRef.current = {
      x: event.clientX,
      y: event.clientY,
      active: true,
      pointerId: event.pointerId,
    };
  };

  const handleSwipePointerUp = (event) => {
    if (!mouseSwipeRef.current.active) return;
    if (mouseSwipeRef.current.pointerId !== event.pointerId) return;
    const start = mouseSwipeRef.current;
    mouseSwipeRef.current = {
      x: 0,
      y: 0,
      active: false,
      pointerId: null,
    };
    applyViewerSwipe(event.clientX - start.x, event.clientY - start.y, {
      // Slightly higher threshold so normal clicks don't change media.
      horizontalThreshold: 50,
    });
  };

  const handleSwipePointerCancel = (event) => {
    if (mouseSwipeRef.current.pointerId !== event.pointerId) return;
    mouseSwipeRef.current = {
      x: 0,
      y: 0,
      active: false,
      pointerId: null,
    };
  };

  const handleImagePointerDown = useCallback((event) => {
    if (imageZoom.scale <= 1) return;
    if (!event.isPrimary) return;
    zoomGestureRef.current = {
      ...zoomGestureRef.current,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOffsetX: imageZoom.x,
      startOffsetY: imageZoom.y,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }, [imageZoom.scale, imageZoom.x, imageZoom.y]);

  const handleImagePointerMove = useCallback((event) => {
    const gesture = zoomGestureRef.current;
    if (gesture.pointerId !== event.pointerId || imageZoom.scale <= 1) return;
    event.preventDefault();
    updateImageZoom(
      imageZoom.scale,
      gesture.startOffsetX + (event.clientX - gesture.startX),
      gesture.startOffsetY + (event.clientY - gesture.startY),
    );
  }, [imageZoom.scale, updateImageZoom]);

  const handleImagePointerEnd = useCallback((event) => {
    if (zoomGestureRef.current.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    zoomGestureRef.current.pointerId = null;
  }, []);

  const handleSplitZoomPan = useCallback(
    (panelId, nextX, nextY) => {
      const current = splitZoom[panelId] || { scale: 1, x: 0, y: 0 };
      if (current.scale <= 1) return;
      updateSplitZoom(panelId, current.scale, nextX, nextY);
    },
    [splitZoom, updateSplitZoom],
  );

  const handleImageTouchStart = useCallback((event) => {
    if (event.touches.length === 2) {
      const [firstTouch, secondTouch] = event.touches;
      const centerX = (firstTouch.clientX + secondTouch.clientX) / 2;
      const centerY = (firstTouch.clientY + secondTouch.clientY) / 2;
      zoomGestureRef.current.pinchDistance = Math.hypot(
        secondTouch.clientX - firstTouch.clientX,
        secondTouch.clientY - firstTouch.clientY,
      );
      zoomGestureRef.current.pinchScale = imageZoom.scale;
      zoomGestureRef.current.pinchCenterX = centerX;
      zoomGestureRef.current.pinchCenterY = centerY;
      zoomGestureRef.current.pinchOffsetX = imageZoom.x;
      zoomGestureRef.current.pinchOffsetY = imageZoom.y;
      event.stopPropagation();
    }
  }, [imageZoom.scale, imageZoom.x, imageZoom.y]);

  const handleImageTouchMove = useCallback((event) => {
    if (event.touches.length !== 2) return;
    const [firstTouch, secondTouch] = event.touches;
    const centerX = (firstTouch.clientX + secondTouch.clientX) / 2;
    const centerY = (firstTouch.clientY + secondTouch.clientY) / 2;
    const distance = Math.hypot(
      secondTouch.clientX - firstTouch.clientX,
      secondTouch.clientY - firstTouch.clientY,
    );
    if (!zoomGestureRef.current.pinchDistance) return;
    event.preventDefault();
    event.stopPropagation();
    const nextScale =
      zoomGestureRef.current.pinchScale *
      (distance / zoomGestureRef.current.pinchDistance);
    const nextX =
      zoomGestureRef.current.pinchOffsetX +
      (centerX - zoomGestureRef.current.pinchCenterX);
    const nextY =
      zoomGestureRef.current.pinchOffsetY +
      (centerY - zoomGestureRef.current.pinchCenterY);
    updateImageZoom(nextScale, nextX, nextY);
  }, [updateImageZoom]);

  const handleImageTouchEnd = useCallback((event) => {
    if (event.touches.length < 2) {
      zoomGestureRef.current.pinchDistance = 0;
      zoomGestureRef.current.pinchScale = imageZoom.scale;
      zoomGestureRef.current.pinchCenterX = 0;
      zoomGestureRef.current.pinchCenterY = 0;
      zoomGestureRef.current.pinchOffsetX = imageZoom.x;
      zoomGestureRef.current.pinchOffsetY = imageZoom.y;
    }
    // Double-tap to toggle zoom (single-finger only, small stationary taps).
    if (event.changedTouches?.length === 1 && event.touches.length === 0) {
      const touch = event.changedTouches[0];
      if (registerTap("primary", touch.clientX, touch.clientY)) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
  }, [imageZoom.scale, imageZoom.x, imageZoom.y, registerTap]);

  const albumCover =
    album?.coverPhoto?.imageUrl ||
    (Array.isArray(photos) && photos.length > 0 ? photos[0].imageUrl : "");
  const albumCoverIsAudio = isPhotoAudio(album?.coverPhoto, albumCover);
  const albumCoverIsVideo = !albumCoverIsAudio && isPhotoVideo(album?.coverPhoto, albumCover);
  const totalPhotos = photos.length;
  const totalAudio = photos.filter((item) => isPhotoAudio(item)).length;
  const totalVideos = photos.filter((item) => !isPhotoAudio(item) && isPhotoVideo(item)).length;
  const canContinueSlideshow =
    filteredPhotos.length > 0 && isResumableSession(savedViewerSession);
  const showDownloadZip = accessMode !== "public";
  const viewingActionCols = [
    canContinueSlideshow,
    true,
    showDownloadZip,
  ].filter(Boolean).length;
  const profileLinks = useMemo(() => {
    const links = album?.profileLinks;
    if (!Array.isArray(links)) return [];

    return links
      .map((entry) => {
        const platform = typeof entry?.platform === "string" ? entry.platform : "other";
        const url = typeof entry?.url === "string" ? entry.url.trim() : "";
        return { platform, url };
      })
      .filter((entry) => entry.url && isValidHttpUrl(entry.url));
  }, [album?.profileLinks]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(15,23,42,0.95),_rgba(2,6,23,1)_45%)] px-4 py-6 sm:px-6 md:py-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <Link
          href="/gallery"
          className="inline-flex items-center text-sm text-slate-200 transition hover:text-white"
        >
          Back to albums
        </Link>

        {resumePrompt && !viewerOpen && filteredPhotos.length > 0 ? (
          <div
            className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
            role="presentation"
            onClick={dismissResumePrompt}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="resume-prompt-title"
              aria-describedby="resume-prompt-desc"
              className="relative w-full max-w-xl rounded-3xl border border-white/10 bg-[#0b1220] p-6 text-slate-100 shadow-[0_24px_80px_rgba(0,0,0,0.55)] sm:p-7"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                onClick={dismissResumePrompt}
                aria-label="Close resume prompt"
                className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 text-slate-300 transition hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" strokeWidth={2} />
              </button>

              <div className="flex items-start gap-4 pr-8">
                <div className="relative mt-0.5 flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 ring-1 ring-emerald-400/40 shadow-[0_0_28px_rgba(16,185,129,0.35)]">
                  <div className="absolute inset-0 rounded-full bg-emerald-400/10 blur-md" />
                  <CloudUpload
                    className="relative h-7 w-7 text-emerald-400"
                    strokeWidth={1.75}
                  />
                </div>
                <div className="min-w-0 pt-1">
                  <h2
                    id="resume-prompt-title"
                    className="text-lg font-semibold tracking-tight text-white sm:text-xl"
                  >
                    Continue where you left off?
                  </h2>
                  <p
                    id="resume-prompt-desc"
                    className="mt-1.5 text-sm leading-relaxed text-slate-400"
                  >
                    A previous session was found. Would you like to load it?
                  </p>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => resumeFromSession(resumePrompt.session)}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white shadow-[0_0_24px_rgba(16,185,129,0.45)] transition hover:bg-emerald-400"
                >
                  <History className="h-4 w-4" strokeWidth={2} />
                  Continue
                </button>
                <button
                  type="button"
                  onClick={startFreshSession}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-600/80 bg-transparent px-4 py-2.5 text-sm font-medium text-white transition hover:border-slate-500 hover:bg-white/5"
                >
                  <Folder className="h-4 w-4" strokeWidth={2} />
                  Start New Session
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <section className="relative overflow-hidden rounded-3xl border border-white/15 bg-slate-900/70 shadow-2xl shadow-slate-950/70">
          {albumCover && !albumCoverIsAudio ? (
            albumCoverIsVideo ? (
              <VideoPoster
                src={albumCover}
                alt={album?.name || "Album cover"}
                className="h-[40vh] min-h-[250px] w-full object-cover"
                fallbackClassName="h-[40vh] min-h-[250px] w-full bg-[linear-gradient(135deg,#1e293b,#334155,#0f172a)]"
              />
            ) : (
              <img
                src={albumCover}
                alt={album?.name || "Album cover"}
                className="h-[40vh] min-h-[250px] w-full object-cover"
              />
            )
          ) : (
            <div className="h-[40vh] min-h-[250px] w-full bg-[linear-gradient(135deg,#1e293b,#334155,#0f172a)]" />
          )}
          <div className="absolute inset-0 bg-[linear-gradient(115deg,rgba(2,6,23,0.86),rgba(2,6,23,0.28)_50%,rgba(2,6,23,0.8))]" />
          <div className="absolute inset-0 flex items-end justify-between gap-4 p-5 sm:p-8">
            <div className="space-y-2 text-white">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-200/90">
                Album Story
              </p>
              <h1 className="text-3xl font-black leading-tight sm:text-4xl">
                {album?.name || "Album"}
              </h1>
              <p className="text-sm text-slate-100/90">
                {photos?.length ?? 0} items
                {album?.description ? ` · ${album.description}` : ""}
              </p>

            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="rounded-full border border-white/30 bg-white/10 px-4 py-2 text-xs uppercase tracking-[0.15em] text-slate-100 backdrop-blur">
                Collection
              </div>
              {profileLinks.length > 0 ? (
                <div className="flex flex-wrap justify-end gap-2">
                  {profileLinks.map((entry, index) => {
                    const Icon = platformIconMap[entry.platform] || FaLink;
                    const platformLabel = platformLabelMap[entry.platform] || "Link";
                    return (
                      <a
                        key={`${entry.platform}-${index}`}
                        href={entry.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex size-10 items-center justify-center rounded-full border border-white/30 bg-white/10 text-white/90 backdrop-blur transition hover:bg-white/15"
                        aria-label={`Open ${platformLabel}`}
                      >
                        <Icon size={18} aria-hidden="true" focusable="false" />
                      </a>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <header className="overflow-hidden rounded-[18px] border border-slate-600/60 bg-[#0f1623] shadow-[0_20px_50px_rgba(0,0,0,0.45)]">
          <div className="flex items-center gap-3 border-b border-slate-700/70 px-4 py-3.5 sm:px-5">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-600/80 bg-[#162033] text-white">
              <LayoutGrid className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-[17px] font-semibold leading-tight tracking-tight text-white sm:text-lg">
                Viewing Mode
              </h2>
              <p className="mt-1 truncate text-[12px] leading-none text-slate-400 sm:text-[13px]">
                {totalPhotos - totalAudio} items
                {" • "}
                {Math.max(0, totalPhotos - totalVideos - totalAudio)} photos
                {totalVideos > 0 ? ` • ${totalVideos} videos` : ""}
                {totalAudio > 0 ? ` • ${totalAudio} audio` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFilterOpen(true)}
              aria-label={`Filter and sort: ${activeFilterLabel} / ${activeSortLabel}`}
              title={`${activeFilterLabel} / ${activeSortLabel}`}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-600/80 bg-[#162033] text-white transition hover:bg-[#1c2940]"
            >
              <SlidersHorizontal className="h-[18px] w-[18px]" strokeWidth={2} />
            </button>
          </div>

          <div className="border-b border-slate-700/70 px-4 py-4 sm:px-5">
            <GridSizeSwiper density={density} onDensityChange={setDensity} />
          </div>

          <div
            className={`grid gap-2.5 p-3.5 sm:gap-3 sm:p-4 ${
              viewingActionCols >= 3
                ? "grid-cols-3"
                : viewingActionCols === 2
                  ? "grid-cols-2"
                  : "grid-cols-1"
            }`}
          >
            {canContinueSlideshow ? (
              <button
                type="button"
                onClick={openSlideshowOrResume}
                className="inline-flex h-11 min-w-0 items-center justify-between gap-1.5 rounded-xl border border-emerald-400/55 bg-[#0c3329] px-2.5 text-[12px] font-semibold text-white transition hover:bg-[#0f3f33] sm:px-3.5 sm:text-sm"
              >
                <Play className="h-3.5 w-3.5 shrink-0 fill-emerald-300 text-emerald-300" />
                <span className="truncate">Continue</span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-emerald-200" />
              </button>
            ) : null}

            <button
              type="button"
              onClick={startFreshSlideshow}
              disabled={filteredPhotos.length === 0}
              className="inline-flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl border border-slate-500/70 bg-transparent px-2.5 text-[12px] font-medium text-white transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40 sm:px-3.5 sm:text-sm"
            >
              <MonitorPlay className="h-4 w-4 shrink-0" />
              <span className="truncate">New Slideshow</span>
            </button>

            {showDownloadZip ? (
              <button
                type="button"
                onClick={handleDownloadAlbumZip}
                disabled={isAlbumDownloadPending || !album?.id}
                className="inline-flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl border border-sky-400/45 bg-transparent px-2.5 text-[12px] font-medium text-white transition hover:bg-sky-500/10 disabled:cursor-not-allowed disabled:opacity-40 sm:px-3.5 sm:text-sm"
              >
                <Download className="h-4 w-4 shrink-0" />
                <span className="truncate">
                  {isAlbumDownloadPending ? "Preparing…" : "Download ZIP"}
                </span>
              </button>
            ) : null}
          </div>
        </header>

        {loading ? (
          <p className="text-sm text-slate-300">Loading album...</p>
        ) : null}
        {error ? <p className="text-sm text-rose-300">{error}</p> : null}

        {!loading && !error && loadingPhotos && photos.length === 0 ? (
          <GalleryMediaGridSkeleton
            gridColumns={densityToSkeletonColumns[density] || 4}
          />
        ) : null}

        {!loading && !error && !loadingPhotos && filteredPhotos.length === 0 ? (
          <section className="rounded-2xl border border-white/15 bg-slate-900/50 p-10 text-center text-slate-200">
            <p className="text-lg font-semibold">No media in this filter</p>
            <p className="mt-1 text-sm text-slate-300">
              Try switching tabs or upload more items in the admin gallery
              manager.
            </p>
          </section>
        ) : null}

        {!loading && !error && filteredPhotos.length > 0 ? (
          <>
            <section
              className={`grid gap-4 ${densityGridMap[density] || densityGridMap.medium}`}
            >
              {pagedGalleryPhotos.map((photo, index) => {
                const absoluteIndex = (galleryPage - 1) * galleryPageSize + index;
                return (
            <article
              key={photo.id}
              className="group cursor-pointer overflow-hidden rounded-2xl border border-white/15 bg-slate-900/65 shadow-lg shadow-slate-950/40 transition duration-300 hover:-translate-y-1 hover:border-white/35"
              onClick={() => openViewerAt(absoluteIndex, { mode: "focus" })}
            >              <div className="relative aspect-[4/3] overflow-hidden bg-slate-900">
                {isPhotoVideo(photo) ? (
                  <VideoPoster
                    src={photo.imageUrl}
                    alt={photo.caption || `Video ${photo.id}`}
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                    fallbackClassName="h-full w-full bg-[linear-gradient(140deg,#1e293b,#334155,#0f172a)]"
                  />
                ) : (
                  <img
                    src={photo.imageUrl}
                    alt={photo.caption || `Photo ${photo.id}`}
                    className={`h-full w-full object-cover transition duration-500 group-hover:scale-105 ${
                      shouldBlurPhoto(photo, { blurEnabled: blurUnclothyGenerated }) ? "blur-md" : ""
                    }`}
                  />
                )}
                {showWatermark ? (
                  <WatermarkOverlay text={watermarkText} variant="thumb" />
                ) : null}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/55 to-transparent" />
                {isPhotoVideo(photo) ? (
                  <span className="absolute left-3 top-3 rounded-full border border-white/25 bg-black/45 px-2 py-1 text-[10px] uppercase tracking-[0.13em] text-white">
                    Video
                  </span>
                ) : null}
                {!isPhotoVideo(photo) && shouldBlurPhoto(photo, { blurEnabled: blurUnclothyGenerated }) ? (
                  <span className="absolute left-3 top-3 rounded-full border border-white/25 bg-black/55 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.13em] text-white">
                    NSFW
                  </span>
                ) : null}
              </div>
            </article>
                );
              })}
            </section>

            <div className="mt-2 flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/50 px-4 py-3 text-center sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:text-left">
              <div className="text-sm text-slate-300">
                <span className="font-medium text-white">Showing</span>{" "}
                <span className="tabular-nums">
                  {galleryStartIndex}–{galleryEndIndex}
                </span>{" "}
                <span>of</span>{" "}
                <span className="tabular-nums font-medium text-white">{filteredPhotoCount}</span>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-end">
                <label className="inline-flex items-center gap-2 text-sm text-slate-300">
                  <span className="hidden sm:inline">Per page</span>
                  <select
                    value={galleryPageSize}
                    onChange={(event) => {
                      const nextSize = Number(event.target.value);
                      setGalleryPageSize(
                        Number.isFinite(nextSize) && nextSize > 0 ? nextSize : 24,
                      );
                      setGalleryPage(1);
                    }}
                    className="h-10 rounded-2xl border border-white/15 bg-slate-950/70 px-3 text-sm text-white outline-none"
                  >
                    <option value={24}>24</option>
                    <option value={48}>48</option>
                    <option value={72}>72</option>
                  </select>
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setGalleryPage((current) => Math.max(1, current - 1))}
                    disabled={galleryPage <= 1}
                    className="inline-flex h-10 items-center justify-center rounded-2xl border border-white/15 bg-slate-950/70 px-3 text-sm font-medium text-white disabled:opacity-40"
                  >
                    Prev
                  </button>
                  <span className="text-sm text-slate-300">
                    <span className="tabular-nums font-medium text-white">{galleryPage}</span> /{" "}
                    <span className="tabular-nums">{galleryTotalPages}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setGalleryPage((current) => Math.min(galleryTotalPages, current + 1))
                    }
                    disabled={galleryPage >= galleryTotalPages}
                    className="inline-flex h-10 items-center justify-center rounded-2xl border border-white/15 bg-slate-950/70 px-3 text-sm font-medium text-white disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : null}

        <GalleryMediaFilterModal
          open={filterOpen}
          sortMode={sort}
          mediaFilter={mediaFilter}
          filterOptions={[
            { id: "all", title: "All media", description: "Show every media item in this album." },
            { id: "photos", title: "Photos", description: "Show photos and still image files only." },
            { id: "videos", title: "Videos", description: "Show video media only." },
            { id: "nsfw", title: "NSFW images", description: "Show images flagged by the scanner or manual blur mode." },
          ]}
          onClose={() => setFilterOpen(false)}
          onApplySort={setSort}
          onApplyFilter={setMediaFilter}
        />
      </div>
      {viewerOpen && slideshowPrefetchItems.length > 0 ? (
        <div
          aria-hidden
          className="pointer-events-none fixed h-0 w-0 overflow-hidden opacity-0"
        >
          {slideshowPrefetchItems.map((item) => {
            const src = resolveMediaUrl(item);
            if (!src) return null;
            if (isPhotoVideo(item)) return null;
            if (isPhotoAudio(item)) return null;
            return (
              <img
                key={`prefetch-image-${item.id}`}
                src={src}
                alt=""
                decoding="async"
              />
            );
          })}
          {videoPrefetchItems.map((item) => {
            const src = resolveMediaUrl(item);
            const playable = getPlayableMediaUrl(src) || src;
            if (!playable) return null;
            return (
              <video
                key={`prefetch-video-${item.id}`}
                src={playable}
                muted
                playsInline
                preload="auto"
                {...MEDIA_PROTECT_ELEMENT_PROPS}
                // Keep the element attached so the browser can keep buffering
                // the next Drive clip before the user advances.
                onLoadedData={(event) => {
                  try {
                    event.currentTarget.pause();
                  } catch {
                    // ignore
                  }
                }}
              />
            );
          })}
        </div>
      ) : null}

      {viewerOpen && activeItem ? (
        <div
          className={`fixed inset-0 z-50 bg-black/85 backdrop-blur-sm ${hideUI ? "p-0" : "p-4 sm:p-6"}`}
          onClick={closeViewer}
        >
          <div
            className={`mx-auto flex h-full w-full flex-col shadow-2xl shadow-black/70 transition-all duration-300 ${
              hideUI
                ? "max-w-none rounded-none border border-transparent bg-black p-0"
                : "max-w-6xl rounded-2xl border border-white/20 bg-slate-950/80 p-3 sm:p-5"
            }`}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              className={`mb-3 hidden items-center justify-between gap-3 text-sm text-slate-200 transition-all duration-300 sm:flex ${
                hideUI
                  ? "pointer-events-none mb-0 h-0 overflow-hidden opacity-0"
                  : "opacity-100"
              }`}
            >
              <p className="truncate">
                {activeItemIsVideo
                  ? activeItem.caption || "Untitled media"
                  : `${activeIndex + 1} / ${filteredPhotos.length} · ${activeItem.caption || "Untitled media"}`}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void handleHideUI();
                  }}
                  aria-label="Hide viewer interface"
                  title="Hide UI / Fullscreen"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/25 text-sm text-white transition hover:bg-white/10"
                >
                  ⛶
                </button>
                <button
                  type="button"
                  onClick={closeViewer}
                  aria-label="Close viewer"
                  title="Close"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/25 text-base text-white transition hover:bg-white/10"
                >
                  ×
                </button>
              </div>
            </div>

            <div
              className={`relative flex-1 overflow-hidden transition-all duration-300 ${
                hideUI
                  ? "rounded-md border border-transparent bg-black p-0"
                  : "rounded-xl border border-white/10 bg-black/70"
              } ${showSplitMode ? `${hideUI ? "grid grid-cols-1 gap-1 p-0 lg:grid-cols-2" : "grid grid-cols-1 gap-3 p-2 lg:grid-cols-2"}` : ""}`}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              onPointerDown={handleSwipePointerDown}
              onPointerUp={handleSwipePointerUp}
              onPointerCancel={handleSwipePointerCancel}
              onContextMenu={handleFullscreenVideoContextMenu}
            >
              {showSplitMode ? (
                <>
                  <SplitPanelMediaSurface
                    panelId="left"
                    hideUI={hideUI}
                    label={
                      <>
                        <span className="lg:hidden">
                          {isSplitMobileSwapped ? "Bottom" : "Top"}
                        </span>
                        <span className="hidden lg:inline">Left Panel</span>
                      </>
                    }
                    showWatermark={showWatermark}
                    watermarkText={watermarkText}
                    surfaceRef={(node) => {
                      splitSurfaceRefs.current.left = node;
                    }}
                    className={
                      isSplitMobileSwapped
                        ? "order-2 lg:order-1"
                        : "order-1"
                    }
                    isActive={activeSplitPanel === "left"}
                    onActivate={handleSplitPanelActivate}
                    onDoubleClickZoom={handleSplitDoubleClickZoom}
                    onZoomPan={handleSplitZoomPan}
                    item={leftSplitItem}
                    media={leftSplitMedia}
                    assignVideoRef={splitLeftVideoRef}
                    zoomState={splitZoom.left}
                    muted={Boolean(leftSplitPanel?.isMuted)}
                    autoPlay
                    onPinchStart={leftSplitPinchHandlers.onPinchStart}
                    onPinchMove={leftSplitPinchHandlers.onPinchMove}
                    onPinchEnd={leftSplitPinchHandlers.onPinchEnd}
                    onEnded={(event) => {
                      if (leftSplitPanel?.loop) {
                        event.currentTarget.currentTime = 0;
                        event.currentTarget.play().catch(() => {});
                        return;
                      }
                      // Videos always advance when finished; timer Off only
                      // disables timed photo autoplay on this panel.
                      moveSplitPanel("left", "next");
                    }}
                    onMediaSuccess={(item) => {
                      markPanelMediaSuccess("left", item);
                    }}
                    onMediaError={(item, eventName, mediaElement, finalVideoSrc, options) => {
                      markPanelMediaError(
                        "left",
                        item,
                        eventName,
                        mediaElement,
                        finalVideoSrc,
                        options,
                      );
                    }}
                    hasError={
                      mediaErrors[getPanelMediaKey("left", leftSplitItem)] ||
                      false
                    }
                    isLoading={Boolean(mediaLoadingByPanel.left)}
                    onRetry={() => retryPanelMedia("left", leftSplitItem)}
                  />
                  <SplitPanelMediaSurface
                    panelId="right"
                    hideUI={hideUI}
                    label={
                      <>
                        <span className="lg:hidden">
                          {isSplitMobileSwapped ? "Top" : "Bottom"}
                        </span>
                        <span className="hidden lg:inline">Right Panel</span>
                      </>
                    }
                    showWatermark={showWatermark}
                    watermarkText={watermarkText}
                    surfaceRef={(node) => {
                      splitSurfaceRefs.current.right = node;
                    }}
                    className={
                      isSplitMobileSwapped
                        ? "order-1 lg:order-2"
                        : "order-2"
                    }
                    isActive={activeSplitPanel === "right"}
                    onActivate={handleSplitPanelActivate}
                    onDoubleClickZoom={handleSplitDoubleClickZoom}
                    onZoomPan={handleSplitZoomPan}
                    item={rightSplitItem}
                    media={rightSplitMedia}
                    assignVideoRef={splitRightVideoRef}
                    zoomState={splitZoom.right}
                    onPinchStart={rightSplitPinchHandlers.onPinchStart}
                    onPinchMove={rightSplitPinchHandlers.onPinchMove}
                    onPinchEnd={rightSplitPinchHandlers.onPinchEnd}
                    muted={Boolean(rightSplitPanel?.isMuted)}
                    autoPlay
                    onEnded={(event) => {
                      if (rightSplitPanel?.loop) {
                        event.currentTarget.currentTime = 0;
                        event.currentTarget.play().catch(() => {});
                        return;
                      }
                      // Videos always advance when finished; timer Off only
                      // disables timed photo autoplay on this panel.
                      moveSplitPanel("right", "next");
                    }}
                    onMediaSuccess={(item) => {
                      markPanelMediaSuccess("right", item);
                    }}
                    onMediaError={(item, eventName, mediaElement, finalVideoSrc, options) => {
                      markPanelMediaError(
                        "right",
                        item,
                        eventName,
                        mediaElement,
                        finalVideoSrc,
                        options,
                      );
                    }}
                    hasError={
                      mediaErrors[getPanelMediaKey("right", rightSplitItem)] ||
                      false
                    }
                    isLoading={Boolean(mediaLoadingByPanel.right)}
                    onRetry={() => retryPanelMedia("right", rightSplitItem)}
                  />
                </>
              ) : activeItemIsVideo ? (
                <div
                  className="relative h-full w-full"
                  style={{ touchAction: hideUI ? "none" : "manipulation" }}
                  onTouchEnd={(event) => {
                    if (event.changedTouches?.length !== 1) return;
                    if (event.touches.length > 0) return;
                    const touch = event.changedTouches[0];
                    if (
                      registerTap("primary", touch.clientX, touch.clientY, {
                        isVideo: true,
                      })
                    ) {
                      event.preventDefault();
                      event.stopPropagation();
                    }
                  }}
                >
                  <video
                    key={activeMediaKey}
                    ref={activeVideoRef}
                    src={activePlayableSrc || undefined}
                    className="h-full w-full object-contain"
                    controls={!hideUI}
                    playsInline
                    preload="auto"
                    poster={getVideoPosterUrl(activeItem.imageUrl) || undefined}
                    style={{ touchAction: hideUI ? "none" : "manipulation" }}
                    {...MEDIA_PROTECT_ELEMENT_PROPS}
                    onLoadedMetadata={() => {
                      markPanelMediaSuccess("primary", activeItem);
                    }}
                    onLoadedData={() => {
                      markPanelMediaSuccess("primary", activeItem);
                    }}
                    onCanPlay={() => {
                      markPanelMediaSuccess("primary", activeItem);
                    }}
                    onEnded={() => {
                      if (viewerMode === "focus") {
                        goToNextVideo();
                        return;
                      }
                      // Slideshow videos always chain; photo timer Off does not block this.
                      if (viewerMode === "slideshow") {
                        goToNext();
                      }
                    }}
                    onError={(event) => {
                      const player = event.currentTarget;
                      void handleGalleryVideoElementError({
                        player,
                        playableSrc: activePlayableSrc,
                        autoPlay: false,
                        onGiveUp: ({ permanent, status }) => {
                          markPanelMediaError(
                            "primary",
                            activeItem,
                            "onError",
                            player,
                            activePlayableSrc,
                            { permanent, status },
                          );
                        },
                      });
                    }}
                  />
                  {showWatermark ? (
                    <WatermarkOverlay text={watermarkText} variant="viewer" />
                  ) : null}
                </div>
              ) : (
                <div
                  ref={zoomSurfaceRef}
                  className={`relative flex h-full w-full items-center justify-center overflow-hidden ${
                    imageZoom.scale > 1 ? "cursor-grab active:cursor-grabbing" : ""
                  }`}
                  onPointerDown={handleImagePointerDown}
                  onPointerMove={handleImagePointerMove}
                  onPointerUp={handleImagePointerEnd}
                  onPointerCancel={handleImagePointerEnd}
                  onDoubleClick={handleImageDoubleClickZoom}
                  onTouchStart={handleImageTouchStart}
                  onTouchMove={handleImageTouchMove}
                  onTouchEnd={handleImageTouchEnd}
                  onTouchCancel={handleImageTouchEnd}
                  style={{ touchAction: imageZoom.scale > 1 ? "none" : "pinch-zoom" }}
                >
                  <img
                    key={activeMediaKey}
                    src={activeResolvedSrc}
                    alt={activeItem.caption || `Photo ${activeItem.id}`}
                    className={`max-h-full max-w-full object-contain transition-transform duration-150 ease-out ${
                      shouldBlurPhoto(activeItem, { blurEnabled: blurUnclothyGenerated }) ? "blur-md" : ""
                    }`}
                    style={{
                      transform: `translate3d(${imageZoom.x}px, ${imageZoom.y}px, 0) scale(${imageZoom.scale})`,
                      ...MEDIA_PROTECT_IMAGE_PROPS.style,
                    }}
                    draggable={false}
                    onContextMenu={MEDIA_PROTECT_IMAGE_PROPS.onContextMenu}
                    onLoad={() => {
                      markPanelMediaSuccess("primary", activeItem);
                    }}
                    onError={(event) => {
                      const mediaElement = event.currentTarget;
                      const src = activePlayableSrc || activeResolvedSrc;
                      void (async () => {
                        let permanent = false;
                        let status = 0;
                        if (src) {
                          const probe = await probeGalleryMediaUrl(src);
                          permanent = isPermanentGalleryMediaStatus(probe.status);
                          status = probe.status;
                        }
                        markPanelMediaError(
                          "primary",
                          activeItem,
                          "onError",
                          mediaElement,
                          src,
                          { permanent, status },
                        );
                      })();
                    }}
                  />
                  {showWatermark ? (
                    <WatermarkOverlay text={watermarkText} variant="viewer" />
                  ) : null}
                  {shouldBlurPhoto(activeItem, { blurEnabled: blurUnclothyGenerated }) ? (
                    <div className="pointer-events-none absolute left-3 top-3 rounded-full border border-white/25 bg-black/55 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white">
                      NSFW
                    </div>
                  ) : null}
                </div>
              )}
              {!showSplitMode &&
              mediaErrors[getPanelMediaKey("primary", activeItem)] ? (
                <div className="absolute inset-0 z-30 grid place-items-center gap-3 bg-black p-4 text-center text-sm text-rose-200">
                  <p>
                    {mediaErrors[getPanelMediaKey("primary", activeItem)] ===
                      "missing" || unavailableMediaIds[activeItem?.id] === "missing"
                      ? "This Google Drive file is missing or was deleted."
                      : mediaErrors[getPanelMediaKey("primary", activeItem)] ===
                            "denied" ||
                          unavailableMediaIds[activeItem?.id] === "denied"
                        ? "Google Drive access was denied for this file."
                        : "Unable to load this media."}
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => retryPanelMedia("primary", activeItem)}
                      className="rounded-full border border-white/30 bg-white/10 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white transition hover:bg-white/20"
                    >
                      Retry
                    </button>
                    <button
                      type="button"
                      onClick={() => skipBrokenPanelMedia("primary")}
                      className="rounded-full border border-white/30 bg-white/10 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white transition hover:bg-white/20"
                    >
                      Skip
                    </button>
                  </div>
                </div>
              ) : null}
              {showSplitMode && hideUI ? (
                <>
                  {!fullscreenControlsHidden ? (
                    <div className="pointer-events-none absolute bottom-3 left-1/2 z-40 flex w-full max-w-[calc(100vw-1.5rem)] -translate-x-1/2 flex-col items-center gap-2">
                      {audioTracks.length > 0 && audioPlayerOpen ? (
                        <div className="pointer-events-auto flex max-w-full items-center gap-2 rounded-full border border-white/20 bg-black/35 px-2.5 py-1.5 backdrop-blur-md">
                          <Music2
                            className={`hidden h-3.5 w-3.5 shrink-0 sm:block ${
                              audioIsPlaying
                                ? "text-emerald-400 animate-pulse"
                                : "text-slate-400"
                            }`}
                          />
                          <p className="hidden min-w-0 max-w-[9rem] truncate text-[11px] text-slate-200 sm:block">
                            {currentAudioTrack?.caption ||
                              currentAudioTrack?.originalFilename ||
                              "Audio track"}
                          </p>
                          <button
                            type="button"
                            onClick={handleAudioTogglePlay}
                            aria-label={
                              audioIsPlaying ? "Pause music" : "Play music"
                            }
                            className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition ${
                              audioIsPlaying
                                ? "border-emerald-300/60 bg-emerald-500/25 text-emerald-100 hover:bg-emerald-500/35"
                                : "border-white/25 text-white hover:bg-white/15"
                            }`}
                          >
                            {audioIsPlaying ? (
                              <Pause className="h-3.5 w-3.5" />
                            ) : (
                              <Play className="h-3.5 w-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={handleAudioNext}
                            disabled={audioTracks.length <= 1}
                            aria-label="Next track"
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/25 text-white transition hover:bg-white/15 disabled:opacity-30"
                          >
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : null}
                      <div className="pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-white/20 bg-black/35 p-1.5 backdrop-blur-md">
                        <div
                          className="mr-0.5 inline-flex shrink-0 rounded-full border border-white/20 bg-black/40 p-0.5"
                          role="tablist"
                          aria-label="Active panel"
                        >
                          <button
                            type="button"
                            role="tab"
                            aria-selected={activeSplitPanel === topSplitPanelId}
                            onClick={() =>
                              handleSplitPanelActivate(topSplitPanelId)
                            }
                            className={`rounded-full px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] transition ${
                              activeSplitPanel === topSplitPanelId
                                ? "bg-emerald-500 text-white"
                                : "text-slate-300 hover:bg-white/10"
                            }`}
                          >
                            Top
                          </button>
                          <button
                            type="button"
                            role="tab"
                            aria-selected={
                              activeSplitPanel === bottomSplitPanelId
                            }
                            onClick={() =>
                              handleSplitPanelActivate(bottomSplitPanelId)
                            }
                            className={`rounded-full px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] transition ${
                              activeSplitPanel === bottomSplitPanelId
                                ? "bg-emerald-500 text-white"
                                : "text-slate-300 hover:bg-white/10"
                            }`}
                          >
                            Bottom
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => moveSplitPanel(activeSplitPanel, "prev")}
                          aria-label="Previous media on active panel"
                          className="rounded-full border border-white/25 p-2 text-white transition hover:bg-white/15"
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveSplitPanel(activeSplitPanel, "next")}
                          aria-label="Next media on active panel"
                          className="rounded-full border border-white/25 p-2 text-white transition hover:bg-white/15"
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setIsSplitMobileSwapped((current) => !current)
                          }
                          aria-label="Swap split layout"
                          aria-pressed={isSplitMobileSwapped}
                          className={`rounded-full border p-2 transition ${
                            isSplitMobileSwapped
                              ? "border-emerald-300/50 bg-emerald-500/25 text-emerald-100 hover:bg-emerald-500/35"
                              : "border-white/25 text-white hover:bg-white/15"
                          }`}
                        >
                          <ArrowUpDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSplitPanels((current) => ({
                              ...current,
                              [activeSplitPanel]: {
                                ...current[activeSplitPanel],
                                isPlaying: !current[activeSplitPanel].isPlaying,
                              },
                            }));
                          }}
                          aria-label={
                            activeSplitSettings?.isPlaying
                              ? "Pause active panel autoplay"
                              : "Play active panel autoplay"
                          }
                          className={`rounded-full border p-2 transition ${
                            activeSplitSettings?.isPlaying
                              ? "border-emerald-300/50 bg-emerald-500/25 text-emerald-100 hover:bg-emerald-500/35"
                              : "border-white/25 text-white hover:bg-white/15"
                          }`}
                        >
                          {activeSplitSettings?.isPlaying ? (
                            <Pause className="h-3.5 w-3.5" />
                          ) : (
                            <Play className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          aria-label="Toggle active panel mute"
                          aria-pressed={Boolean(activeSplitSettings?.isMuted)}
                          onClick={() => {
                            setSplitPanels((current) => ({
                              ...current,
                              [activeSplitPanel]: {
                                ...current[activeSplitPanel],
                                isMuted: !current[activeSplitPanel].isMuted,
                              },
                            }));
                          }}
                          className={`rounded-full border p-2 transition ${
                            activeSplitSettings?.isMuted
                              ? "border-emerald-300/50 bg-emerald-500/25 text-emerald-100 hover:bg-emerald-500/35"
                              : "border-white/25 text-white hover:bg-white/15"
                          }`}
                        >
                          {activeSplitSettings?.isMuted ? (
                            <VolumeX className="h-3.5 w-3.5" />
                          ) : (
                            <Volume2 className="h-3.5 w-3.5" />
                          )}
                        </button>
                        {audioTracks.length > 0 ? (
                          <button
                            type="button"
                            onClick={() =>
                              setAudioPlayerOpen((open) => !open)
                            }
                            aria-label={
                              audioPlayerOpen
                                ? "Hide music controls"
                                : "Show music controls"
                            }
                            aria-pressed={audioPlayerOpen}
                            title={
                              audioIsPlaying
                                ? "Music playing"
                                : "Background music"
                            }
                            className={`relative rounded-full border p-2 transition ${
                              audioPlayerOpen || audioIsPlaying
                                ? "border-emerald-300/50 bg-emerald-500/25 text-emerald-100 hover:bg-emerald-500/35"
                                : "border-white/25 text-white hover:bg-white/15"
                            }`}
                          >
                            <Music2 className="h-3.5 w-3.5" />
                            {audioIsPlaying ? (
                              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-emerald-400 ring-1 ring-black animate-pulse" />
                            ) : null}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          aria-label="Toggle active panel loop"
                          aria-pressed={Boolean(activeSplitSettings?.loop)}
                          onClick={() => {
                            setSplitPanels((current) => ({
                              ...current,
                              [activeSplitPanel]: {
                                ...current[activeSplitPanel],
                                loop: !current[activeSplitPanel].loop,
                              },
                            }));
                          }}
                          className={`rounded-full border p-2 transition ${
                            activeSplitSettings?.loop
                              ? "border-emerald-300/50 bg-emerald-500/25 text-emerald-100 hover:bg-emerald-500/35"
                              : "border-white/25 text-white hover:bg-white/15"
                          }`}
                        >
                          <Repeat2 className="h-3.5 w-3.5" />
                        </button>
                        <label className="relative inline-flex shrink-0 items-center">
                          <select
                            value={String(
                              activeSplitSettings?.delayMs > 0
                                ? activeSplitSettings.delayMs
                                : TIMER_OFF_MS,
                            )}
                            onChange={(event) => {
                              applySplitPanelTimer(
                                activeSplitPanel,
                                event.target.value,
                              );
                            }}
                            aria-label="Active panel timer"
                            className="h-8 appearance-none rounded-md border border-white/35 bg-[#0b1220] py-1 pl-2.5 pr-7 text-[11px] font-medium text-white outline-none transition hover:border-white/50"
                          >
                            <option value={TIMER_OFF_MS}>Off</option>
                            {timerPresetMs.map((ms) => (
                              <option key={`fs-split-delay-${ms}`} value={ms}>
                                {Math.round(ms / 1000)}s
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-1.5 h-3.5 w-3.5 text-white/90" />
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            void handleShowUI();
                          }}
                          aria-label="Show viewer interface"
                          className="rounded-full border border-white/25 p-2 text-white transition hover:bg-white/15"
                        >
                          ⛶
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="pointer-events-none absolute bottom-2 left-1/2 z-40 flex -translate-x-1/2" />
                  )}
                </>
              ) : viewerMode !== "split" ? (
                <div
                  className={`absolute bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-white/20 bg-black/45 p-1.5 backdrop-blur transition-all duration-300 ${
                    hideUI
                      ? viewerMode === "slideshow" && fullscreenControlsHidden
                        ? "pointer-events-none opacity-0"
                        : "opacity-95"
                      : "pointer-events-none opacity-0"
                  }`}
                >
                  <button
                    type="button"
                    onClick={goToPrev}
                    aria-label="Previous slide"
                    className="rounded-full border border-white/25 p-2 text-white transition hover:bg-white/15"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsPlaying((current) => !current)}
                    aria-label={
                      isPlaying ? "Pause slideshow" : "Play slideshow"
                    }
                    className={`rounded-full border p-2 transition ${
                      isPlaying
                        ? "border-emerald-300/50 bg-emerald-500/25 text-emerald-100 hover:bg-emerald-500/35"
                        : "border-white/25 text-white hover:bg-white/15"
                    }`}
                  >
                    {isPlaying ? (
                      <Pause className="h-3.5 w-3.5" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={goToNext}
                    aria-label="Next slide"
                    className="rounded-full border border-white/25 p-2 text-white transition hover:bg-white/15"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                  {viewerMode === "slideshow" ? (
                    <label className="relative inline-flex shrink-0 items-center">
                      <select
                        value={String(delayMs > 0 ? delayMs : TIMER_OFF_MS)}
                        onChange={(event) => {
                          applySlideshowTimer(event.target.value);
                        }}
                        aria-label="Slideshow timer"
                        className="h-8 appearance-none rounded-md border border-white/35 bg-[#0b1220] py-1 pl-2.5 pr-7 text-[11px] font-medium text-white outline-none transition hover:border-white/50"
                      >
                        <option value={TIMER_OFF_MS}>Off</option>
                        {timerPresetMs.map((ms) => (
                          <option key={`fs-slideshow-delay-${ms}`} value={ms}>
                            {Math.round(ms / 1000)}s
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-1.5 h-3.5 w-3.5 text-white/90" />
                    </label>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      void handleShowUI();
                    }}
                    aria-label="Show viewer interface"
                    className="rounded-full border border-white/25 p-2 text-white transition hover:bg-white/15"
                  >
                    ⛶
                  </button>
                  <button
                    type="button"
                    onClick={closeViewer}
                    aria-label="Close viewer"
                    className="rounded-full border border-white/25 px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-white transition hover:bg-white/15"
                  >
                    Close
                  </button>
                </div>
              ) : null}
            </div>

            {!hideUI ? (
              viewerMode !== "split" ? (
                <div className="relative z-[70] mt-3 flex flex-col items-center gap-2 overflow-visible pb-14 transition-opacity duration-300 md:pb-2">
                  {/* Embedded audio player — visible when album has tracks and player is open */}
                  {audioTracks.length > 0 && audioPlayerOpen ? (
                    <div className="flex w-full max-w-sm flex-col gap-2 rounded-2xl border border-white/15 bg-slate-900/80 px-3 py-2.5 backdrop-blur">
                      <div className="flex items-center gap-2">
                        <Music2 className={`h-3.5 w-3.5 shrink-0 ${audioIsPlaying ? "text-emerald-400 animate-pulse" : "text-slate-400"}`} />
                        <p className="min-w-0 flex-1 truncate text-xs text-slate-200">
                          {currentAudioTrack?.caption || currentAudioTrack?.originalFilename || "Audio track"}
                        </p>
                        <span className="shrink-0 text-[10px] text-slate-500">
                          {currentAudioTrackIndex + 1} / {audioTracks.length}
                        </span>
                      </div>
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={handleAudioPrev}
                          disabled={audioTracks.length <= 1}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/20 text-white transition hover:bg-white/10 disabled:opacity-30"
                          aria-label="Previous track"
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={handleAudioTogglePlay}
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-full border transition ${
                            audioIsPlaying
                              ? "border-emerald-300/60 bg-emerald-500/25 text-emerald-100 hover:bg-emerald-500/35"
                              : "border-white/25 bg-white/10 text-white hover:bg-white/20"
                          }`}
                          aria-label={audioIsPlaying ? "Pause music" : "Play music"}
                        >
                          {audioIsPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={handleAudioNext}
                          disabled={audioTracks.length <= 1}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/20 text-white transition hover:bg-white/10 disabled:opacity-30"
                          aria-label="Next track"
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setAudioLoop((l) => !l)}
                          aria-pressed={audioLoop}
                          aria-label={audioLoop ? "Disable loop" : "Enable loop"}
                          title={audioLoop ? "Loop on" : "Loop off"}
                          className={`inline-flex h-7 w-7 items-center justify-center rounded-full border transition ${
                            audioLoop
                              ? "border-emerald-300/60 bg-emerald-500/25 text-emerald-200 hover:bg-emerald-500/35"
                              : "border-white/20 text-slate-400 hover:bg-white/10 hover:text-white"
                          }`}
                        >
                          <Repeat2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {audioTracks.length > 1 ? (
                        <div className="max-h-28 space-y-0.5 overflow-y-auto">
                          {audioTracks.map((track, index) => (
                            <button
                              key={track.id}
                              type="button"
                              onClick={() => setCurrentAudioTrackIndex(index)}
                              className={`flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left text-[11px] transition ${
                                index === currentAudioTrackIndex
                                  ? "bg-emerald-500/20 text-emerald-200"
                                  : "text-slate-400 hover:bg-white/8 hover:text-white"
                              }`}
                            >
                              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                                index === currentAudioTrackIndex && audioIsPlaying
                                  ? "bg-emerald-400 animate-pulse"
                                  : "bg-slate-600"
                              }`} />
                              <span className="min-w-0 truncate">
                                {track.caption || track.originalFilename || `Track ${index + 1}`}
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="flex max-w-6xl flex-wrap items-center justify-center gap-2 overflow-visible">
                    <button
                      type="button"
                      onClick={goToPrev}
                      className="rounded-md border border-white/25 px-2 py-2 text-xs uppercase tracking-[0.12em] text-white transition hover:bg-white/10 sm:px-3"
                    >
                      <ChevronLeft className="h-3.5 w-3.5 sm:hidden" />
                      <span className="hidden sm:inline">Prev</span>
                    </button>
                    <button
                      type="button"
                      onClick={goToNext}
                      className="rounded-md border border-white/25 px-2 py-2 text-xs uppercase tracking-[0.12em] text-white transition hover:bg-white/10 sm:px-3"
                    >
                      <ChevronRight className="h-3.5 w-3.5 sm:hidden" />
                      <span className="hidden sm:inline">Next</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsPlaying((current) => !current)}
                      className="rounded-md border border-emerald-300/50 bg-emerald-500/20 px-2 py-2 text-xs uppercase tracking-[0.12em] text-emerald-100 transition hover:bg-emerald-500/30 sm:px-3"
                    >
                      {isPlaying ? (
                        <Pause className="h-3.5 w-3.5 sm:hidden" />
                      ) : (
                        <Play className="h-3.5 w-3.5 sm:hidden" />
                      )}
                      <span className="hidden sm:inline">
                        {isPlaying ? "Pause" : "Play"}
                      </span>
                    </button>
                    {audioTracks.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => setAudioPlayerOpen((open) => !open)}
                        title={audioIsPlaying ? "Music playing" : "Background music"}
                        className={`relative rounded-md border px-2 py-2 transition sm:px-3 ${
                          audioPlayerOpen || audioIsPlaying
                            ? "border-emerald-300/50 bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30"
                            : "border-white/25 text-white hover:bg-white/10"
                        }`}
                      >
                        <Music2 className="h-3.5 w-3.5" />
                        {audioIsPlaying ? (
                          <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-emerald-400 ring-1 ring-slate-900 animate-pulse" />
                        ) : null}
                      </button>
                    ) : null}
                    <span className="text-xs uppercase tracking-[0.12em] text-slate-300">
                      Mode
                    </span>
                    <select
                      value={viewerMode}
                      onChange={(event) => {
                        handleViewerModeChange(event.target.value);
                      }}
                      className="h-9 rounded-md border border-white/30 bg-slate-900/70 px-2 text-xs text-white"
                    >
                      <option value="focus">Focus</option>
                      <option value="slideshow">Slideshow</option>
                      <option value="split">Split</option>
                    </select>
                    {viewerMode === "slideshow" ? (
                      <>
                        <span className="hidden text-xs uppercase tracking-[0.12em] text-slate-300 sm:inline">
                          Timer
                        </span>
                        <select
                          value={
                            delayMs <= 0
                              ? String(TIMER_OFF_MS)
                              : isPresetDelay
                                ? String(delayMs)
                                : "custom"
                          }
                          onChange={(event) => {
                            if (event.target.value === "custom") {
                              const parsed = Number(customDelaySeconds);
                              if (Number.isFinite(parsed) && parsed > 0) {
                                applySlideshowTimer(
                                  Math.min(
                                    300000,
                                    Math.max(1000, parsed * 1000),
                                  ),
                                );
                              }
                              return;
                            }
                            applySlideshowTimer(event.target.value);
                          }}
                          className="h-9 rounded-md border border-white/30 bg-slate-900/70 px-2 text-xs text-white"
                        >
                          <option value={TIMER_OFF_MS}>Off</option>
                          <option value={2000}>2s</option>
                          <option value={5000}>5s</option>
                          <option value={10000}>10s</option>
                          <option value={15000}>15s</option>
                          <option value={20000}>20s</option>
                          <option value={30000}>30s</option>
                          <option value="custom">Custom</option>
                        </select>
                        {delayMs > 0 && !isPresetDelay ? (
                          <input
                            type="number"
                            min={1}
                            max={300}
                            step={1}
                            value={customDelaySeconds}
                            onChange={(event) => {
                              const value = event.target.value;
                              setCustomDelaySeconds(value);
                              const parsed = Number(value);
                              if (Number.isFinite(parsed) && parsed > 0) {
                                applySlideshowTimer(
                                  Math.min(
                                    300000,
                                    Math.max(1000, parsed * 1000),
                                  ),
                                );
                              }
                            }}
                            className="h-9 w-20 rounded-md border border-white/30 bg-slate-900/70 px-2 text-xs text-white"
                            aria-label="Custom timer in seconds"
                          />
                        ) : null}
                        <span className="hidden text-[10px] text-slate-400 sm:inline">
                          {delayMs > 0 ? `${Math.round(delayMs / 1000)}s` : "Off"}
                        </span>
                      </>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="relative z-[70] mt-3 overflow-visible pb-14 md:pb-2">
                  <div className="mx-auto w-full max-w-6xl rounded-md border border-white/15 bg-slate-900/40 p-2 text-[10px] tracking-[0.08em] text-slate-200">
                    {/* Mobile: Mode + Top/Bottom tabs + controls for active panel */}
                    <div className="flex flex-col gap-2 md:hidden">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs uppercase tracking-[0.12em] text-slate-300">
                            Mode
                          </span>
                          <select
                            value={viewerMode}
                            onChange={(event) => {
                              handleViewerModeChange(event.target.value);
                            }}
                            className="h-9 rounded-md border border-white/30 bg-slate-900/70 px-2 text-xs text-white"
                          >
                            <option value="focus">Focus</option>
                            <option value="slideshow">Slideshow</option>
                            <option value="split">Split</option>
                          </select>
                        </div>
                        <div
                          className="inline-flex rounded-md border border-white/20 bg-black/35 p-0.5"
                          role="tablist"
                          aria-label="Active panel"
                        >
                          <button
                            type="button"
                            role="tab"
                            aria-selected={activeSplitPanel === topSplitPanelId}
                            onClick={() => handleSplitPanelActivate(topSplitPanelId)}
                            className={`rounded px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] transition ${
                              activeSplitPanel === topSplitPanelId
                                ? "bg-emerald-500 text-white"
                                : "text-slate-300 hover:bg-white/10"
                            }`}
                          >
                            Top
                          </button>
                          <button
                            type="button"
                            role="tab"
                            aria-selected={activeSplitPanel === bottomSplitPanelId}
                            onClick={() =>
                              handleSplitPanelActivate(bottomSplitPanelId)
                            }
                            className={`rounded px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] transition ${
                              activeSplitPanel === bottomSplitPanelId
                                ? "bg-emerald-500 text-white"
                                : "text-slate-300 hover:bg-white/10"
                            }`}
                          >
                            Bottom
                          </button>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-2 rounded-md border border-white/10 bg-black/20 p-2">
                        <button
                          type="button"
                          onClick={() =>
                            setIsSplitMobileSwapped((current) => !current)
                          }
                          aria-label="Swap top and bottom panels"
                          aria-pressed={isSplitMobileSwapped}
                          className={`rounded-md border p-2 transition ${
                            isSplitMobileSwapped
                              ? "border-emerald-300/50 bg-emerald-500/20 text-emerald-100"
                              : "border-white/25 text-white hover:bg-white/10"
                          }`}
                        >
                          <ArrowUpDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveSplitPanel(activeSplitPanel, "prev")}
                          className="rounded-md border border-white/25 p-2 text-white transition hover:bg-white/10"
                          aria-label="Previous on active panel"
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveSplitPanel(activeSplitPanel, "next")}
                          className="rounded-md border border-white/25 p-2 text-white transition hover:bg-white/10"
                          aria-label="Next on active panel"
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            updateActiveSplitPanel({
                              isPlaying: !activeSplitSettings?.isPlaying,
                            })
                          }
                          className="rounded-md border border-emerald-300/50 bg-emerald-500/20 p-2 text-emerald-100 transition hover:bg-emerald-500/30"
                          aria-label={
                            activeSplitSettings?.isPlaying
                              ? "Pause active panel"
                              : "Play active panel"
                          }
                        >
                          {activeSplitSettings?.isPlaying ? (
                            <Pause className="h-3.5 w-3.5" />
                          ) : (
                            <Play className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          aria-label="Toggle active panel mute"
                          aria-pressed={Boolean(activeSplitSettings?.isMuted)}
                          onClick={() =>
                            updateActiveSplitPanel({
                              isMuted: !activeSplitSettings?.isMuted,
                            })
                          }
                          className={`rounded-md border p-2 transition ${
                            activeSplitSettings?.isMuted
                              ? "border-white/25 text-white hover:bg-white/10"
                              : "border-emerald-300/50 bg-emerald-500/20 text-emerald-100"
                          }`}
                        >
                          {activeSplitSettings?.isMuted ? (
                            <VolumeX className="h-3.5 w-3.5" />
                          ) : (
                            <Volume2 className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          aria-label="Toggle active panel loop"
                          aria-pressed={Boolean(activeSplitSettings?.loop)}
                          onClick={() =>
                            updateActiveSplitPanel({
                              loop: !activeSplitSettings?.loop,
                            })
                          }
                          className={`rounded-md border p-2 transition ${
                            activeSplitSettings?.loop
                              ? "border-emerald-300/50 bg-emerald-500/20 text-emerald-100"
                              : "border-white/25 text-white hover:bg-white/10"
                          }`}
                        >
                          <Repeat2 className="h-3.5 w-3.5" />
                        </button>
                        <select
                          value={String(
                            activeSplitSettings?.delayMs > 0
                              ? activeSplitSettings.delayMs
                              : TIMER_OFF_MS,
                          )}
                          onChange={(event) => {
                            applySplitPanelTimer(
                              activeSplitPanel,
                              event.target.value,
                            );
                          }}
                          className="h-8 rounded-md border border-white/30 bg-slate-900/70 px-2 text-[10px] text-white"
                          aria-label="Active panel timer"
                        >
                          <option value={TIMER_OFF_MS}>Off</option>
                          {timerPresetMs.map((ms) => (
                            <option key={`mobile-active-delay-${ms}`} value={ms}>
                              {Math.round(ms / 1000)}s
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Desktop: dual Left / Right columns + Mode */}
                    <div className="hidden gap-2 md:grid md:grid-cols-[1fr_auto_1fr] md:items-center">
                      <div className="flex flex-wrap items-center justify-center gap-2 rounded-md border border-white/10 bg-black/20 p-2 md:justify-start">
                        <span className="font-semibold uppercase text-slate-100">
                          Left panel
                        </span>
                        <span className="hidden rounded-md border border-white/30 bg-slate-900/70 px-2 py-1 text-[10px] text-white sm:inline-flex">
                          Image
                        </span>
                        <button
                          type="button"
                          onClick={() => moveSplitPanel("left", "prev")}
                          className="rounded-md border border-white/25 px-2 py-1 text-[10px] uppercase text-white transition hover:bg-white/10"
                        >
                          <span>Prev</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => moveSplitPanel("left", "next")}
                          className="rounded-md border border-white/25 px-2 py-1 text-[10px] uppercase text-white transition hover:bg-white/10"
                        >
                          <span>Next</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSplitPanels((current) => ({
                              ...current,
                              left: {
                                ...current.left,
                                isPlaying: !current.left.isPlaying,
                              },
                            }));
                          }}
                          className="rounded-md border border-emerald-300/50 bg-emerald-500/20 px-2 py-1 text-[10px] uppercase text-emerald-100 transition hover:bg-emerald-500/30"
                        >
                          {leftSplitPanel?.isPlaying ? "Pause" : "Play"}
                        </button>
                        <button
                          type="button"
                          aria-label="Toggle left loop"
                          aria-pressed={Boolean(leftSplitPanel?.loop)}
                          onClick={() => {
                            setSplitPanels((current) => ({
                              ...current,
                              left: {
                                ...current.left,
                                loop: !current.left.loop,
                              },
                            }));
                          }}
                          className={`rounded-md border px-2 py-1 transition ${
                            leftSplitPanel?.loop
                              ? "border-emerald-300/50 bg-emerald-500/20 text-emerald-100"
                              : "border-white/25 text-white hover:bg-white/10"
                          }`}
                        >
                          <Repeat2 className="h-3.5 w-3.5" />
                        </button>
                        <select
                          value={String(
                            leftSplitPanel?.delayMs > 0
                              ? leftSplitPanel.delayMs
                              : TIMER_OFF_MS,
                          )}
                          onChange={(event) => {
                            applySplitPanelTimer("left", event.target.value);
                          }}
                          className="h-8 rounded-md border border-white/30 bg-slate-900/70 px-2 text-[10px] text-white"
                        >
                          <option value={TIMER_OFF_MS}>Off</option>
                          {timerPresetMs.map((ms) => (
                            <option key={`left-delay-${ms}`} value={ms}>
                              {Math.round(ms / 1000)}s
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center justify-center gap-2 rounded-md border border-white/10 bg-black/20 p-2 text-xs uppercase tracking-[0.12em] text-slate-300">
                        <span>Mode</span>
                        <select
                          value={viewerMode}
                          onChange={(event) => {
                            handleViewerModeChange(event.target.value);
                          }}
                          className="h-9 rounded-md border border-white/30 bg-slate-900/70 px-2 text-xs text-white"
                        >
                          <option value="focus">Focus</option>
                          <option value="slideshow">Slideshow</option>
                          <option value="split">Split</option>
                        </select>
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-2 rounded-md border border-white/10 bg-black/20 p-2 md:justify-start">
                        <span className="font-semibold uppercase text-slate-100">
                          Right panel
                        </span>
                        <span className="hidden rounded-md border border-white/30 bg-slate-900/70 px-2 py-1 text-[10px] text-white sm:inline-flex">
                          Video
                        </span>
                        <button
                          type="button"
                          onClick={() => moveSplitPanel("right", "prev")}
                          className="rounded-md border border-white/25 px-2 py-1 text-[10px] uppercase text-white transition hover:bg-white/10"
                        >
                          <span>Prev</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => moveSplitPanel("right", "next")}
                          className="rounded-md border border-white/25 px-2 py-1 text-[10px] uppercase text-white transition hover:bg-white/10"
                        >
                          <span>Next</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSplitPanels((current) => ({
                              ...current,
                              right: {
                                ...current.right,
                                isPlaying: !current.right.isPlaying,
                              },
                            }));
                          }}
                          className="rounded-md border border-emerald-300/50 bg-emerald-500/20 px-2 py-1 text-[10px] uppercase text-emerald-100 transition hover:bg-emerald-500/30"
                        >
                          {rightSplitPanel?.isPlaying ? "Pause" : "Play"}
                        </button>
                        <button
                          type="button"
                          aria-label={
                            rightSplitPanel?.isMuted
                              ? "Unmute right panel audio"
                              : "Mute right panel audio"
                          }
                          aria-pressed={!rightSplitPanel?.isMuted}
                          onClick={() => {
                            setSplitPanels((current) => ({
                              ...current,
                              right: {
                                ...current.right,
                                isMuted: !current.right.isMuted,
                              },
                            }));
                          }}
                          className={`rounded-md border px-2 py-1 transition ${
                            rightSplitPanel?.isMuted
                              ? "border-white/25 text-white hover:bg-white/10"
                              : "border-emerald-300/50 bg-emerald-500/20 text-emerald-100"
                          }`}
                        >
                          {rightSplitPanel?.isMuted ? (
                            <VolumeX className="h-3.5 w-3.5" />
                          ) : (
                            <Volume2 className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          aria-label="Toggle right loop"
                          aria-pressed={Boolean(rightSplitPanel?.loop)}
                          onClick={() => {
                            setSplitPanels((current) => ({
                              ...current,
                              right: {
                                ...current.right,
                                loop: !current.right.loop,
                              },
                            }));
                          }}
                          className={`rounded-md border px-2 py-1 transition ${
                            rightSplitPanel?.loop
                              ? "border-emerald-300/50 bg-emerald-500/20 text-emerald-100"
                              : "border-white/25 text-white hover:bg-white/10"
                          }`}
                        >
                          <Repeat2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            ) : null}
            {!hideUI ? (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-white/15 bg-black/35 p-2 text-sm text-slate-200 sm:hidden">
                <p className="min-w-0 truncate">
                  {activeItemIsVideo
                    ? activeItem.caption || "Untitled media"
                    : `${activeIndex + 1} / ${filteredPhotos.length} · ${activeItem.caption || "Untitled media"}`}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void handleHideUI();
                    }}
                    aria-label="Hide viewer interface"
                    title="Hide UI / Fullscreen"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/25 text-sm text-white transition hover:bg-white/10"
                  >
                    ⛶
                  </button>
                  <button
                    type="button"
                    onClick={closeViewer}
                    aria-label="Close viewer"
                    title="Close"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/25 text-base text-white transition hover:bg-white/10"
                  >
                    ×
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Persistent background audio element — always mounted when album has audio tracks */}
      {audioTracks.length > 0 ? (
        <audio
          ref={audioRef}
          src={currentAudioTrack?.imageUrl || ""}
          onPlay={() => setAudioIsPlaying(true)}
          onPause={() => setAudioIsPlaying(false)}
          onEnded={audioLoop ? undefined : handleAudioNext}
          loop={audioLoop}
          preload="metadata"
          className="sr-only"
        />
      ) : null}

      <GalleryBatchProgressModal
        open={Boolean(isAlbumDownloadPending && albumDownloadProgress)}
        progress={albumDownloadProgress}
        heading="Album download in progress"
        currentItemFallback="Preparing album…"
        currentItemTitle="Downloading media"
        itemUnit="media"
        uploadedLabel="Packed"
        skippedLabel="Skipped"
        failedLabel="Failed"
        warningText="Do not go back or refresh while this is running. Use Cancel if you need to stop."
        onCancel={cancelAlbumDownload}
      />
    </main>
  );
}
