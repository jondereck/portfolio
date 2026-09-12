'use client';

import { useRef, useState } from 'react';
import { Check, Music, Pause, Play } from 'lucide-react';
import MediaPreview from '@/app/admin/gallery/components/MediaPreview';
import { getAdminMediaUrl, getPlayableMediaUrl } from '@/app/admin/gallery/utils';
import { isPhotoAudio, shouldBlurPhoto } from '@/lib/gallery-media';

function isVideoMime(mimeType) {
  return typeof mimeType === 'string' && mimeType.toLowerCase().startsWith('video/');
}

const EQ_BARS = [0, 1, 2, 3, 4];

export default function GalleryMediaCard({
  photo,
  selected,
  selectionMode = false,
  statusLabel: _statusLabel,
  blurUnclothyGenerated = true,
  onToggleSelect,
  onOpenPreview,
}) {
  const title = photo?.caption || photo?.originalFilename || photo?.sourceId || `media_${photo?.id}`;
  const isVideo = isVideoMime(photo?.mimeType);
  const isAudio = Boolean(photo) && isPhotoAudio(photo, photo?.imageUrl);
  const shouldBlur = Boolean(photo) && shouldBlurPhoto(photo, { blurEnabled: blurUnclothyGenerated });

  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioUrl = isAudio ? getPlayableMediaUrl(getAdminMediaUrl(photo)) : '';

  const toggleAudio = (event) => {
    event.stopPropagation();
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  };

  const handlePrimaryClick = (event) => {
    if (selectionMode) {
      event.preventDefault();
      onToggleSelect?.(event);
      return;
    }
    onOpenPreview?.();
  };

  return (
    <article
      className={`group overflow-hidden rounded-xl border text-left transition select-none ${
        selected
          ? 'border-blue-500 bg-blue-50 shadow-sm ring-2 ring-blue-200 dark:border-blue-400 dark:bg-blue-950/30 dark:ring-blue-900/40'
          : 'border-slate-200 bg-slate-50 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white dark:border-slate-800 dark:bg-slate-950/20 dark:hover:border-slate-700 dark:hover:bg-slate-900'
      }`}
      onClick={
        selectionMode && isAudio
          ? (event) => {
              if (event.target instanceof Element && event.target.closest('[data-gallery-media-control],[data-gallery-select-toggle]')) {
                return;
              }
              handlePrimaryClick(event);
            }
          : undefined
      }
    >
      <div className="relative">
        {isAudio ? (
          <div
            className={`relative flex aspect-square flex-col items-center justify-center gap-3 overflow-hidden bg-gradient-to-br transition-colors ${
              isPlaying
                ? 'from-indigo-500/30 via-purple-500/20 to-sky-500/30 dark:from-indigo-500/35 dark:via-purple-500/25 dark:to-sky-500/35'
                : 'from-indigo-500/15 via-purple-500/10 to-sky-500/15 dark:from-indigo-500/20 dark:via-purple-500/15 dark:to-sky-500/20'
            }`}
          >
            <button
              type="button"
              data-gallery-media-control="true"
              onClick={toggleAudio}
              aria-label={isPlaying ? `Pause ${title}` : `Play ${title}`}
              className="relative flex h-16 w-16 items-center justify-center rounded-full bg-white/85 text-indigo-600 shadow-md transition hover:scale-105 hover:bg-white dark:bg-slate-900/75 dark:text-indigo-300"
            >
              {isPlaying ? (
                <>
                  <span className="absolute inset-0 rounded-full border-2 border-indigo-400/60 animate-audio-pulse-ring" />
                  <span
                    className="absolute inset-0 rounded-full border-2 border-indigo-400/50 animate-audio-pulse-ring"
                    style={{ animationDelay: '0.6s' }}
                  />
                  <Pause className="relative h-7 w-7" />
                </>
              ) : (
                <Play className="relative ml-0.5 h-7 w-7" />
              )}
            </button>

            {isPlaying ? (
              <div className="flex h-6 items-end gap-1" aria-hidden="true">
                {EQ_BARS.map((bar) => (
                  <span
                    key={bar}
                    className="w-1.5 rounded-full bg-indigo-500 animate-audio-eq dark:bg-indigo-300"
                    style={{ height: '100%', animationDelay: `${bar * 0.12}s` }}
                  />
                ))}
              </div>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-700 backdrop-blur dark:bg-slate-900/70 dark:text-slate-200">
                <Music className="h-3 w-3" />
                Audio
              </span>
            )}

            {audioUrl ? (
              <audio
                ref={audioRef}
                src={audioUrl}
                preload="none"
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
                className="hidden"
              />
            ) : null}
          </div>
        ) : (
          <button
            type="button"
            className="block w-full select-none"
            style={{ touchAction: 'manipulation', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
            onClick={handlePrimaryClick}
            aria-label={selectionMode ? (selected ? `Deselect ${title}` : `Select ${title}`) : `View ${title}`}
          >
            <div className="relative aspect-square bg-gradient-to-br from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-900 dark:to-slate-800">
              {photo?.imageUrl ? (
                <MediaPreview
                  url={photo.imageUrl}
                  mimeType={photo.mimeType}
                  sourceType={photo.sourceType}
                  sourceId={photo.sourceId}
                  alt={title}
                  className={`h-full w-full object-cover ${isVideo ? 'pointer-events-none' : ''} ${shouldBlur ? 'blur-md' : ''}`}
                  controls={false}
                />
              ) : null}
              {isVideo ? (
                <span className="pointer-events-none absolute bottom-1.5 right-1.5 rounded-md border border-white/15 bg-black/55 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-white/90 backdrop-blur-sm">
                  Video
                </span>
              ) : null}
              {shouldBlur ? (
                <div className="pointer-events-none absolute right-1.5 top-1.5 rounded-md border border-white/15 bg-black/55 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-white/90">
                  NSFW
                </div>
              ) : null}
            </div>
          </button>
        )}

        {selected ? (
          <span className="pointer-events-none absolute left-1 top-1 inline-flex h-9 w-9 items-center justify-center sm:left-1.5 sm:top-1.5">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white shadow-md">
              <Check className="h-3 w-3" strokeWidth={2.5} />
            </span>
          </span>
        ) : (
          <button
            type="button"
            data-gallery-select-toggle="true"
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            onClick={onToggleSelect}
            aria-label={`Select ${title}`}
            className="absolute left-1 top-1 inline-flex h-9 w-9 items-center justify-center sm:left-1.5 sm:top-1.5 sm:opacity-0 sm:group-hover:opacity-100"
          >
            <span className="inline-flex h-5 w-5 rounded-full border border-slate-200/90 bg-white/90 shadow-sm dark:border-slate-600 dark:bg-slate-900/85" />
          </button>
        )}
      </div>
    </article>
  );
}

