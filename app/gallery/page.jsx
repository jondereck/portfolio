/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { getVideoPosterUrl, isPhotoAudio, isPhotoVideo, shouldBlurPhoto } from '@/lib/gallery-media';
import { MEDIA_PROTECT_IMAGE_PROPS } from '@/lib/media-protect';
import { useLoadingStore } from '@/store/loading';

const GALLERY_VIEW_STORAGE_KEY = 'private-gallery-view';
const GALLERY_ADMIN_CLICK_WINDOW_MS = 550;
const authLastVisitedPathStorageKey = 'auth:lastVisitedPath';

const fetchJson = async (url) => {
  const response = await fetch(url, { cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || 'Request failed');
  }
  return data;
};

const joinClassNames = (...values) => values.filter(Boolean).join(' ');

const normalizeGalleryView = (value) => (value === 'compact' ? 'compact' : 'cinematic');

const VideoPoster = ({ src, alt, className, fallbackClassName }) => {
  const posterSrc = getVideoPosterUrl(src);
  if (!posterSrc) {
    return <div className={fallbackClassName} role="img" aria-label={alt || 'Video'} {...MEDIA_PROTECT_IMAGE_PROPS} />;
  }

  return <img src={posterSrc} alt={alt} className={className} {...MEDIA_PROTECT_IMAGE_PROPS} />;
};

const AlbumCover = ({ photo, alt, className, fallbackClassName, blurUnclothyGenerated = true }) => {
  const src = typeof photo?.imageUrl === 'string' ? photo.imageUrl : '';
  const shouldBlur = Boolean(photo) && shouldBlurPhoto(photo, { blurEnabled: blurUnclothyGenerated });
  if (!src || isPhotoAudio(photo)) {
    return <div className={fallbackClassName} />;
  }

  if (isPhotoVideo({ imageUrl: src })) {
    return (
      <>
        <VideoPoster
          src={src}
          alt={alt}
          className={joinClassNames(className, shouldBlur ? 'blur-md' : '')}
          fallbackClassName={fallbackClassName}
        />
        {shouldBlur ? (
          <div className="pointer-events-none absolute left-3 top-3 rounded-full border border-white/25 bg-black/55 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white">
            NSFW
          </div>
        ) : null}
      </>
    );
  }

  return (
    <>
      <img src={src} alt={alt} className={joinClassNames(className, shouldBlur ? 'blur-md' : '')} {...MEDIA_PROTECT_IMAGE_PROPS} />
      {shouldBlur ? (
        <div className="pointer-events-none absolute left-3 top-3 rounded-full border border-white/25 bg-black/55 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white">
          NSFW
        </div>
      ) : null}
    </>
  );
};

const normalizeLabel = (album) => {
  if (typeof album?.description === 'string' && album.description.trim()) {
    const firstChunk = album.description.split(/[.|·]/)[0]?.trim();
    if (firstChunk) return firstChunk;
  }

  return 'Private Collection';
};

const buildTitleLines = (name) => {
  if (!name || typeof name !== 'string') {
    return ['Private', 'Gallery'];
  }

  const words = name.toUpperCase().split(/\s+/).filter(Boolean);
  if (words.length <= 2) {
    return [words[0] || 'Private', words[1] || 'Gallery'];
  }

  const midpoint = Math.ceil(words.length / 2);
  return [words.slice(0, midpoint).join(' '), words.slice(midpoint).join(' ')];
};

const normalizeAlbumPhotosPayload = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.photos)) return payload.photos;
  return [];
};

const buildGalleryMediaUrl = (albumId, photoId) => {
  if (!albumId || !photoId) return '';
  return `/api/gallery/albums/${albumId}/photos/${photoId}/media`;
};

const normalizeGalleryPhoto = (photo, albumId) => {
  if (!photo || photo.sourceType !== 'gdrive' || !photo.sourceId) {
    return photo;
  }

  return {
    ...photo,
    imageUrl: buildGalleryMediaUrl(albumId, photo.id),
  };
};

const normalizeGalleryAlbum = (album) => {
  if (!album) return album;

  return {
    ...album,
    coverPhoto: album.coverPhoto ? normalizeGalleryPhoto(album.coverPhoto, album.id) : album.coverPhoto,
    photos: Array.isArray(album.photos) ? album.photos.map((photo) => normalizeGalleryPhoto(photo, album.id)) : album.photos,
  };
};

const resolveAlbumCoverPhoto = (album) => album?.coverPhoto || album?.photos?.[0] || null;
const resolveAlbumCover = (album) => resolveAlbumCoverPhoto(album)?.imageUrl || '';

const attachAlbumMediaCounts = async (albums) => {
  const withCounts = await Promise.all(
    albums.map(async (album) => {
      try {
        const payload = await fetchJson(`/api/gallery/albums/${album.id}/photos?sort=custom`);
        const mediaItems = normalizeAlbumPhotosPayload(payload);
        const audio = mediaItems.reduce((total, item) => (isPhotoAudio(item) ? total + 1 : total), 0);
        const videos = mediaItems.reduce((total, item) => (!isPhotoAudio(item) && isPhotoVideo(item) ? total + 1 : total), 0);

        return {
          ...album,
          mediaCount: {
            photos: Math.max(mediaItems.length - videos - audio, 0),
            videos,
            audio,
          },
        };
      } catch {
        return {
          ...album,
          mediaCount: {
            photos: album?._count?.photos ?? 0,
            videos: 0,
            audio: 0,
          },
        };
      }
    }),
  );

  return withCounts;
};

const getAlbumMediaCounts = (album) => {
  if (typeof album?.mediaCount?.photos === 'number' && typeof album?.mediaCount?.videos === 'number') {
    return album.mediaCount;
  }

  const mediaItems = Array.isArray(album?.photos) ? album.photos : [];
  if (!mediaItems.length) {
    return {
      photos: album?._count?.photos ?? 0,
      videos: 0,
      audio: 0,
    };
  }

  const audio = mediaItems.reduce((total, item) => (isPhotoAudio(item) ? total + 1 : total), 0);
  const videos = mediaItems.reduce((total, item) => (!isPhotoAudio(item) && isPhotoVideo(item) ? total + 1 : total), 0);
  return {
    photos: Math.max(mediaItems.length - videos - audio, 0),
    videos,
    audio,
  };
};

const getDescription = (album) =>
  album?.description?.trim() || 'A private cinematic album experience with premium storytelling visuals.';

const getSelectionDirection = (currentIndex, targetIndex, total) => {
  if (total <= 1 || currentIndex === targetIndex) return 1;

  const forwardDistance = (targetIndex - currentIndex + total) % total;
  const backwardDistance = (currentIndex - targetIndex + total) % total;
  return forwardDistance <= backwardDistance ? 1 : -1;
};

const getAlbumActivityTime = (album) =>
  new Date(album?.activityAt || album?.updatedAt || album?.createdAt || 0).getTime();

function GalleryViewToggle({ currentView, onChange }) {
  return (
    <div className="inline-flex w-fit rounded-full border border-white/28 bg-white/10 p-1 backdrop-blur">
      {[
        { value: 'cinematic', label: 'Cinematic' },
        { value: 'compact', label: 'Compact' },
      ].map((option) => {
        const isActive = currentView === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={joinClassNames(
              'rounded-full px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] transition sm:px-5',
              isActive ? 'bg-white text-slate-900 shadow-sm' : 'text-white/85 hover:bg-white/10',
            )}
            aria-pressed={isActive}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function AlbumStats({ counts, pillClassName = '', className = '' }) {
  return (
    <div className={joinClassNames('flex flex-wrap items-center gap-2.5', className)}>
      <span
        className={joinClassNames(
          'rounded-full border border-white/28 bg-white/[0.03] px-4 py-2 text-[11px] uppercase tracking-[0.22em] text-white/92',
          pillClassName,
        )}
      >
        {counts.photos} Photos
      </span>
      {counts.videos > 0 ? (
        <span
          className={joinClassNames(
            'rounded-full border border-white/28 bg-white/[0.03] px-4 py-2 text-[11px] uppercase tracking-[0.22em] text-white/92',
            pillClassName,
          )}
        >
          {counts.videos} Videos
        </span>
      ) : null}
      {counts.audio > 0 ? (
        <span
          className={joinClassNames(
            'rounded-full border border-white/28 bg-white/[0.03] px-4 py-2 text-[11px] uppercase tracking-[0.22em] text-white/92',
            pillClassName,
          )}
        >
          {counts.audio} Audio
        </span>
      ) : null}
    </div>
  );
}

function GalleryFooter({ activeIndex, total, onPrev, onNext, className = '' }) {
  return (
    <footer
      className={joinClassNames(
        'flex items-center justify-between gap-4 border-t border-white/22 pt-4 sm:pt-5',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPrev}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/35 bg-white/10 text-lg text-white transition hover:bg-white/18"
          aria-label="Previous album"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={onNext}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/35 bg-white/10 text-lg text-white transition hover:bg-white/18"
          aria-label="Next album"
        >
          ›
        </button>
      </div>

      <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.28em] text-white/88">
        <span>{(activeIndex + 1).toString().padStart(2, '0')}</span>
        <span className="h-px w-12 bg-white/35 sm:w-16" />
        <span>{total.toString().padStart(2, '0')}</span>
      </div>
    </footer>
  );
}

function CinematicGalleryView({
  activeAlbum,
  activeCounts,
  headlineTop,
  headlineBottom,
  previewAlbums,
  activeIndex,
  albumsLength,
  blurUnclothyGenerated,
  onSelectAlbum,
  onPauseAutoplay,
  onResumeAutoplay,
  onPrev,
  onNext,
}) {
  return (
    <>
      <section className="mt-6 flex-1 pt-4 sm:pt-6 lg:mt-10 lg:flex lg:flex-1 lg:flex-col lg:justify-center lg:pt-0">
        <div className="grid h-full content-between gap-7 lg:h-auto lg:content-normal lg:grid-cols-[minmax(0,1fr)_minmax(480px,0.96fr)] xl:grid-cols-[minmax(0,1fr)_minmax(640px,0.9fr)] xl:gap-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={`featured-copy-${activeAlbum.id}`}
              className="space-y-5 pr-4 sm:pr-6 lg:space-y-6 lg:pr-10"
              initial={{ opacity: 0, x: -26, scale: 0.985 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 18, scale: 0.99 }}
              transition={{ duration: 0.44, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="space-y-3 overflow-hidden">
                <p className="text-xs font-medium uppercase tracking-[0.24em] text-white/88 sm:text-sm">
                  {normalizeLabel(activeAlbum)}
                </p>

                <h1 className="max-w-full overflow-hidden font-['Bebas_Neue','Inter',sans-serif] text-[3.2rem] uppercase leading-[0.84] tracking-[0.03em] sm:text-[4.15rem] md:text-[4.8rem] lg:text-[6rem] xl:text-[7rem]">
                  <span className="block break-words">{headlineTop}</span>
                  <span className="block break-words">{headlineBottom}</span>
                </h1>
              </div>

              <p className="max-w-[calc(100vw-3.5rem)] break-words overflow-hidden pr-10 text-[0.98rem] leading-relaxed text-white/86 sm:max-w-[31rem] sm:pr-12 sm:text-[1.04rem] lg:max-w-[35rem] lg:pr-16 lg:text-[1.08rem] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3] lg:[display:block] lg:[-webkit-line-clamp:unset]">
                {getDescription(activeAlbum)}
              </p>

              <div className="space-y-3.5">
                <Link
                  href={`/gallery/${activeAlbum.slug}`}
                  className="inline-flex h-12 items-center rounded-full bg-white px-6 text-sm font-semibold text-slate-900 transition hover:scale-[1.02] hover:bg-slate-100"
                >
                  Open Album
                </Link>

                <AlbumStats counts={activeCounts} />
              </div>
            </motion.div>
          </AnimatePresence>

          <div
            className="relative"
            onMouseEnter={onPauseAutoplay}
            onMouseLeave={onResumeAutoplay}
          >
            <div
              className="-mx-5 overflow-x-auto px-5 pb-2 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0 [&::-webkit-scrollbar]:hidden"
              style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}
            >
              <div className="flex snap-x snap-mandatory items-stretch gap-3.5 pr-[24vw] sm:pr-[12vw] lg:pr-0">
                {previewAlbums.map(({ album, index, order }) => {
                  const coverPhoto = resolveAlbumCoverPhoto(album);
                  const albumCounts = getAlbumMediaCounts(album);
                  const isNextUp = order === 0;

                  return (
                    <button
                      key={album.id}
                      type="button"
                      onClick={() => onSelectAlbum(index)}
                      className={joinClassNames(
                        'group relative aspect-[0.72] w-[42vw] min-w-[148px] max-w-[188px] shrink-0 snap-start overflow-hidden rounded-[26px] border text-left shadow-[0_24px_60px_rgba(2,6,23,0.32)] transition duration-300 hover:-translate-y-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 sm:w-[31vw] sm:min-w-[170px] sm:max-w-[214px] lg:w-[185px] xl:w-[198px]',
                        isNextUp ? 'border-white/70 ring-2 ring-white/45' : 'border-white/28 hover:border-white/50',
                      )}
                      aria-label={`Show album ${album.name}`}
                    >
                      <AlbumCover
                        photo={coverPhoto}
                        alt={album.name}
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                        fallbackClassName="h-full w-full bg-[linear-gradient(140deg,#475569,#64748b,#334155)]"
                        blurUnclothyGenerated={blurUnclothyGenerated}
                      />
                      <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(2,6,23,0.9),rgba(2,6,23,0.08)_62%)]" />
                      <div className="absolute inset-x-0 bottom-0 space-y-1.5 p-3.5 sm:p-4">
                        <p className="line-clamp-2 text-[1rem] font-semibold uppercase leading-[1.02] tracking-[0.04em] text-white sm:text-[1.08rem]">
                          {album.name}
                        </p>
                        <p className="text-[11px] uppercase tracking-[0.2em] text-white/82">
                          {albumCounts.photos} photos{albumCounts.videos > 0 ? ` • ${albumCounts.videos} videos` : ''}{albumCounts.audio > 0 ? ` • ${albumCounts.audio} audio` : ''}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      <GalleryFooter
        activeIndex={activeIndex}
        total={albumsLength}
        onPrev={onPrev}
        onNext={onNext}
        className="mt-4 lg:mt-auto"
      />
    </>
  );
}

function CompactGalleryView({
  activeIndex,
  albums,
  searchQuery,
  blurUnclothyGenerated,
  onSearchChange,
  onSelectAlbum,
}) {
  const router = useRouter();

  const handleCardActivate = (index, slug) => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches) {
      router.push(`/gallery/${slug}`);
      return;
    }

    onSelectAlbum(index);
  };

  return (
    <section className="mt-6 space-y-4 pb-28 sm:pb-8 lg:mt-8 lg:space-y-5 lg:pb-10">
      <div className="space-y-4">
        <label className="hidden space-y-2 sm:block">
          <span className="text-[11px] font-medium uppercase tracking-[0.22em] text-white/72">Search album</span>
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search album"
            className="w-full rounded-full border border-white/18 bg-white/[0.08] px-4 py-3 text-sm text-white outline-none backdrop-blur placeholder:text-white/45 focus:border-white/40"
          />
        </label>

        {albums.length === 0 ? (
          <div className="rounded-[24px] border border-white/14 bg-white/[0.05] px-5 py-8 text-center text-sm text-white/70">
            No albums matched your search.
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3.5 sm:gap-5 xl:grid-cols-3">
        {albums.map(({ album, index }) => {
          const albumCounts = getAlbumMediaCounts(album);
          const isActive = index === activeIndex;

          return (
            <article
              key={album.id}
              className={joinClassNames(
                'cursor-pointer overflow-hidden rounded-[28px] border bg-white/[0.06] shadow-[0_20px_55px_rgba(2,6,23,0.24)] backdrop-blur transition',
                isActive ? 'border-white/45 ring-1 ring-white/30' : 'border-white/14 hover:border-white/26',
              )}
              onClick={() => handleCardActivate(index, album.slug)}
              onMouseEnter={() => onSelectAlbum(index)}
            >
              <div className="relative aspect-[0.86] overflow-hidden">
                <AlbumCover
                  photo={resolveAlbumCoverPhoto(album)}
                  alt={album.name}
                  className="h-full w-full object-cover transition duration-500 hover:scale-105"
                  fallbackClassName="h-full w-full bg-[linear-gradient(140deg,#475569,#64748b,#334155)]"
                  blurUnclothyGenerated={blurUnclothyGenerated}
                />
                <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(2,6,23,0.9),rgba(2,6,23,0.08)_55%)]" />
                {isActive ? (
                  <span className="absolute right-3 top-3 rounded-full border border-white/30 bg-slate-950/45 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/90 backdrop-blur">
                    Featured
                  </span>
                ) : null}
              </div>

              <div className="space-y-3 p-3.5 sm:space-y-4 sm:p-5">
                <div className="space-y-2">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-white/62">{normalizeLabel(album)}</p>
                  <h2 className="text-[1.05rem] font-semibold uppercase leading-[1.02] tracking-[0.04em] text-white sm:text-[1.55rem]">
                    {album.name}
                  </h2>
                  <p className="line-clamp-2 pr-1 text-[12px] leading-relaxed text-white/72 sm:line-clamp-3 sm:pr-3 sm:text-[0.98rem]">
                    {getDescription(album)}
                  </p>
                </div>

                <div className="flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                  <AlbumStats
                    counts={albumCounts}
                    className="flex-nowrap gap-1.5 overflow-x-auto pr-1 [&::-webkit-scrollbar]:hidden"
                    pillClassName="whitespace-nowrap border-white/20 bg-white/[0.02] px-2.5 py-1.5 text-[9px] tracking-[0.15em] text-white/86 sm:px-3 sm:text-[10px]"
                  />
                  <Link
                    href={`/gallery/${album.slug}`}
                    className="hidden h-9 items-center rounded-full border border-white/24 px-3.5 text-xs font-medium text-white transition hover:bg-white/10 sm:inline-flex sm:h-10 sm:px-4 sm:text-sm"
                  >
                    Open Album
                  </Link>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="fixed inset-x-0 bottom-4 z-20 px-4 sm:hidden">
        <label className="block rounded-full border border-white/18 bg-slate-950/78 p-1.5 shadow-[0_18px_40px_rgba(2,6,23,0.35)] backdrop-blur">
          <span className="sr-only">Search album</span>
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search album"
            className="w-full rounded-full bg-transparent px-4 py-3 text-sm text-white outline-none placeholder:text-white/45"
          />
        </label>
      </div>
    </section>
  );
}

export default function GalleryPage() {
  const pathname = usePathname();
  const router = useRouter();
  const startGlobalLoading = useLoadingStore((state) => state.startLoading);
  const stopGlobalLoading = useLoadingStore((state) => state.stopLoading);
  const galleryAdminClickStateRef = useRef({ count: 0, timerId: null });
  const [albums, setAlbums] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [currentView, setCurrentView] = useState('cinematic');
  const [blurUnclothyGenerated, setBlurUnclothyGenerated] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isAutoplayPaused, setIsAutoplayPaused] = useState(false);
  const [touchStartX, setTouchStartX] = useState(null);
  const [slideDirection, setSlideDirection] = useState(1);
  const [compactSearchQuery, setCompactSearchQuery] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!pathname || !pathname.startsWith('/gallery')) return;
    window.localStorage.setItem(authLastVisitedPathStorageKey, pathname);
  }, [pathname]);

  useEffect(() => {
    let finished = false;
    const finalize = () => {
      if (finished) {
        return;
      }

      finished = true;
      stopGlobalLoading();
    };

    setLoading(true);
    setError('');
    startGlobalLoading('Curating the gallery preview');

    const loadGallery = async () => {
      try {
        const [settingsPayload, albumsPayload] = await Promise.all([
          fetchJson('/api/gallery/settings').catch(() => null),
          fetchJson('/api/gallery/albums'),
        ]);

        const publishedAlbums = Array.isArray(albumsPayload)
          ? albumsPayload
              .filter((item) => item.isPublished)
              .sort((left, right) => getAlbumActivityTime(right) - getAlbumActivityTime(left))
          : [];
        const albumsWithCounts = await attachAlbumMediaCounts(publishedAlbums);
        const resolvedDefaultView = normalizeGalleryView(settingsPayload?.defaultGalleryView);
        setBlurUnclothyGenerated(settingsPayload?.blurUnclothyGenerated !== false);

        setAlbums(albumsWithCounts.map((album) => normalizeGalleryAlbum(album)));
        setActiveIndex(0);

        let storedView = null;
        if (typeof window !== 'undefined') {
          const storedValue = window.localStorage.getItem(GALLERY_VIEW_STORAGE_KEY);
          storedView = storedValue ? normalizeGalleryView(storedValue) : null;
        }

        setCurrentView(storedView || resolvedDefaultView);
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : 'Unable to load the gallery.');
      } finally {
        setLoading(false);
        finalize();
      }
    };

    loadGallery();
    return () => {
      finalize();
    };
  }, [startGlobalLoading, stopGlobalLoading]);

  useEffect(() => {
    if (currentView !== 'cinematic' || isAutoplayPaused || albums.length <= 1) {
      return;
    }

    const timer = setInterval(() => {
      setSlideDirection(1);
      setActiveIndex((previous) => (previous + 1) % albums.length);
    }, 5500);

    return () => clearInterval(timer);
  }, [currentView, isAutoplayPaused, albums.length]);

  const activeAlbum = albums[activeIndex] || null;
  const activeCover = activeAlbum ? resolveAlbumCover(activeAlbum) : '';
  const activeCounts = getAlbumMediaCounts(activeAlbum);
  const [headlineTop, headlineBottom] = buildTitleLines(activeAlbum?.name);

  const previewAlbums = useMemo(() => {
    if (albums.length <= 1) return [];

    return Array.from({ length: albums.length - 1 }, (_, offset) => {
      const index = (activeIndex + offset + 1) % albums.length;
      return { album: albums[index], index, order: offset };
    });
  }, [albums, activeIndex]);

  const compactAlbumEntries = useMemo(() => {
    const query = compactSearchQuery.trim().toLowerCase();

    return albums
      .map((album, index) => ({ album, index }))
      .filter(({ album }) => {
        if (!query) return true;

        const haystack = [album?.name, album?.description, album?.slug]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return haystack.includes(query);
      });
  }, [albums, compactSearchQuery]);

  const moveSlide = (direction) => {
    if (albums.length <= 1) return;
    setSlideDirection(direction >= 0 ? 1 : -1);
    setActiveIndex((previous) => (previous + direction + albums.length) % albums.length);
  };

  const selectAlbum = (targetIndex) => {
    if (albums.length <= 1 || targetIndex === activeIndex) {
      return;
    }

    setSlideDirection(getSelectionDirection(activeIndex, targetIndex, albums.length));
    setActiveIndex(targetIndex);
  };

  useEffect(() => {
    if (currentView !== 'compact' || compactAlbumEntries.length === 0) {
      return;
    }

    const activeStillVisible = compactAlbumEntries.some((entry) => entry.index === activeIndex);
    if (!activeStillVisible) {
      setActiveIndex(compactAlbumEntries[0].index);
    }
  }, [currentView, compactAlbumEntries, activeIndex]);

  const handleViewChange = (nextView) => {
    const normalizedView = normalizeGalleryView(nextView);
    setCurrentView(normalizedView);
    setIsAutoplayPaused(false);
    setTouchStartX(null);

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(GALLERY_VIEW_STORAGE_KEY, normalizedView);
    }
  };

  const onKeyDown = (event) => {
    if (currentView !== 'cinematic') {
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveSlide(-1);
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      moveSlide(1);
    }
  };

  const onTouchStart = (event) => {
    if (currentView !== 'cinematic') {
      return;
    }

    setTouchStartX(event.touches?.[0]?.clientX ?? null);
  };

  const onTouchEnd = (event) => {
    if (currentView !== 'cinematic') {
      return;
    }

    const endX = event.changedTouches?.[0]?.clientX ?? null;
    if (touchStartX === null || endX === null) {
      setTouchStartX(null);
      return;
    }

    const delta = endX - touchStartX;
    if (Math.abs(delta) > 45) {
      moveSlide(delta > 0 ? -1 : 1);
    }
    setTouchStartX(null);
  };

  const clearGalleryAdminClicks = () => {
    if (galleryAdminClickStateRef.current.timerId) {
      window.clearTimeout(galleryAdminClickStateRef.current.timerId);
      galleryAdminClickStateRef.current.timerId = null;
    }
    galleryAdminClickStateRef.current.count = 0;
  };

  const handleSecureSessionClick = (event) => {
    if ('button' in event && event.button !== 0) {
      return;
    }

    const nextCount = galleryAdminClickStateRef.current.count + 1;
    if (galleryAdminClickStateRef.current.timerId) {
      window.clearTimeout(galleryAdminClickStateRef.current.timerId);
    }

    if (nextCount >= 3) {
      clearGalleryAdminClicks();
      router.push('/admin/gallery');
      return;
    }

    galleryAdminClickStateRef.current.count = nextCount;
    galleryAdminClickStateRef.current.timerId = window.setTimeout(() => {
      clearGalleryAdminClicks();
    }, GALLERY_ADMIN_CLICK_WINDOW_MS);
  };

  useEffect(() => () => clearGalleryAdminClicks(), []);

  return (
    <main
      className="relative min-h-[100svh] overflow-x-hidden bg-slate-950 text-white lg:min-h-screen"
      onKeyDown={onKeyDown}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      tabIndex={0}
      aria-label={currentView === 'compact' ? 'Private gallery browser' : 'Private gallery slider'}
    >
      <AnimatePresence mode="wait">
        {activeCover ? (
          <motion.div
            key={`active-background-${activeAlbum?.id ?? 'none'}`}
            className="absolute inset-0"
            initial={{
              opacity: 0,
              scale: currentView === 'cinematic' ? (slideDirection > 0 ? 1.18 : 1.11) : 1.04,
              x: currentView === 'cinematic' ? (slideDirection > 0 ? 34 : -34) : 0,
              filter: 'blur(6px)',
            }}
            animate={{ opacity: 1, scale: 1, x: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 0.97, filter: 'blur(4px)' }}
            transition={{ duration: 0.62, ease: [0.22, 1, 0.36, 1] }}
          >
            <AlbumCover
              photo={resolveAlbumCoverPhoto(activeAlbum)}
              alt={activeAlbum?.name || 'Active album'}
              className="h-full w-full object-cover"
              fallbackClassName="h-full w-full bg-[linear-gradient(135deg,#0f172a,#1e293b,#0b1120)]"
              blurUnclothyGenerated={blurUnclothyGenerated}
            />
          </motion.div>
        ) : (
          <motion.div
            key="active-background-fallback"
            className="absolute inset-0 bg-[linear-gradient(135deg,#0f172a,#1e293b,#0b1120)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
        )}
      </AnimatePresence>

      <div
        className={joinClassNames(
          'absolute inset-0',
          currentView === 'compact'
            ? 'bg-[linear-gradient(135deg,rgba(2,6,23,0.95),rgba(2,6,23,0.82)_42%,rgba(2,6,23,0.95))]'
            : 'bg-[linear-gradient(108deg,rgba(2,6,23,0.84),rgba(2,6,23,0.36)_48%,rgba(2,6,23,0.92))]',
        )}
      />
      <div
        className={joinClassNames(
          'absolute inset-0',
          currentView === 'compact'
            ? 'bg-[radial-gradient(circle_at_78%_18%,rgba(255,255,255,0.12),transparent_32%)]'
            : 'bg-[radial-gradient(circle_at_72%_34%,rgba(255,255,255,0.15),transparent_42%)]',
        )}
      />

      <div className="relative z-10 mx-auto flex min-h-[100svh] max-w-[1480px] flex-col px-5 py-5 sm:px-6 sm:py-6 lg:min-h-screen lg:px-10 lg:py-8">
        <header className="flex items-center justify-between gap-4">
          <p className="text-xs uppercase tracking-[0.32em] text-white/85">Private Gallery</p>
          <button
            type="button"
            onClick={handleSecureSessionClick}
            onContextMenu={(event) => event.preventDefault()}
            className="rounded-full border border-white/30 bg-white/10 px-4 py-1.5 text-[10px] uppercase tracking-[0.2em] text-white/90 backdrop-blur transition hover:bg-white/14"
            aria-label="Secure session. Triple click to open gallery admin."
          >
            Secure Session
          </button>
        </header>

        <div className="mt-4 flex items-center gap-3">
          <GalleryViewToggle currentView={currentView} onChange={handleViewChange} />
        </div>

        {loading ? <p className="mt-8 text-sm text-white/80">Loading albums...</p> : null}
        {error ? <p className="mt-8 text-sm text-rose-300">{error}</p> : null}

        {!loading && !error && albums.length === 0 ? (
          <section className="mt-8 max-w-xl rounded-2xl border border-white/20 bg-white/10 p-8 backdrop-blur lg:my-auto">
            <p className="text-2xl font-semibold">No albums yet</p>
            <p className="mt-2 text-sm text-white/80">Add and publish albums in admin to show them here.</p>
          </section>
        ) : null}

        {!loading && !error && activeAlbum ? (
          currentView === 'compact' ? (
            <CompactGalleryView
              activeIndex={activeIndex}
              albums={compactAlbumEntries}
              searchQuery={compactSearchQuery}
              blurUnclothyGenerated={blurUnclothyGenerated}
              onSearchChange={setCompactSearchQuery}
              onSelectAlbum={selectAlbum}
            />
          ) : (
            <CinematicGalleryView
              activeAlbum={activeAlbum}
              activeCounts={activeCounts}
              headlineTop={headlineTop}
              headlineBottom={headlineBottom}
              previewAlbums={previewAlbums}
              activeIndex={activeIndex}
              albumsLength={albums.length}
              blurUnclothyGenerated={blurUnclothyGenerated}
              onSelectAlbum={selectAlbum}
              onPauseAutoplay={() => setIsAutoplayPaused(true)}
              onResumeAutoplay={() => setIsAutoplayPaused(false)}
              onPrev={() => moveSlide(-1)}
              onNext={() => moveSlide(1)}
            />
          )
        ) : null}
      </div>
    </main>
  );
}
