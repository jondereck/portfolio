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

  return (
    <article
      className={`group overflow-hidden rounded-xl border text-left transition select-none ${
        selected
          ? 'border-blue-500 bg-blue-50 shadow-sm ring-2 ring-blue-200 dark:border-blue-400 dark:bg-blue-950/30 dark:ring-blue-900/40'
          : 'border-slate-200 bg-slate-50 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white dark:border-slate-800 dark:bg-slate-950/20 dark:hover:border-slate-700 dark:hover:bg-slate-900'
      }`}
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
            onClick={onOpenPreview}
            aria-label={`View ${title}`}
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
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <span className="rounded-full border border-white/30 bg-slate-950/70 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-white shadow-lg backdrop-blur">
                    Video
                  </span>
                </div>
              ) : null}
              {shouldBlur ? (
                <div className="pointer-events-none absolute left-2 top-2 rounded-full border border-white/25 bg-black/55 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white">
                  NSFW
                </div>
              ) : null}
            </div>
          </button>
        )}

        {selected ? (
          <button
            type="button"
            data-gallery-select-toggle="true"
            onClick={onToggleSelect}
            aria-label="Deselect"
            className="absolute left-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-white shadow-md transition hover:bg-blue-700"
          >
            <Check className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            data-gallery-select-toggle="true"
            onClick={onToggleSelect}
            className="absolute left-2 top-2 rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-900 shadow-sm transition hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-50 dark:hover:bg-slate-800"
          >
            Select
          </button>
        )}


      </div>

      <div className="p-3">
        <p className="truncate text-sm font-semibold text-blue-600 dark:text-blue-400">{title}</p>
      </div>
    </article>
  );
}

