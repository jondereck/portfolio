/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { getVideoPosterUrl, isPhotoAudio, isPhotoVideo, shouldBlurPhoto } from '@/lib/gallery-media';
import { MEDIA_PROTECT_IMAGE_PROPS } from '@/lib/media-protect';
import { useLoadingStore } from '@/store/loading';
import CinematicAlbumDeck from './CinematicAlbumDeck';

const GALLERY_VIEW_STORAGE_KEY = 'private-gallery-view';
const GALLERY_ADMIN_CLICK_WINDOW_MS = 550;
const CINEMATIC_AUTOPLAY_MS = 10_000;
const IMMERSIVE_LONG_PRESS_MS = 480;
const IMMERSIVE_MOVE_CANCEL_PX = 12;
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

const resolveAlbumCoverDisplayUrl = (album) => {
  const photo = resolveAlbumCoverPhoto(album);
  if (!photo) return '';
  const src = typeof photo.imageUrl === 'string' ? photo.imageUrl : '';
  if (!src || isPhotoAudio(photo)) return '';
  if (isPhotoVideo({ imageUrl: src })) {
    return getVideoPosterUrl(src) || '';
  }
  return src;
};

const preloadCoverUrl = (url, cache) => {
  if (typeof window === 'undefined' || !url || cache.has(url)) return;
  cache.add(url);
  const image = new window.Image();
  image.decoding = 'async';
  image.src = url;
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

const getSelectionDirection = (currentIndex, targetIndex, total) => {
  if (total <= 1 || currentIndex === targetIndex) return 1;

  const forwardDistance = (targetIndex - currentIndex + total) % total;
  const backwardDistance = (currentIndex - targetIndex + total) % total;
  return forwardDistance <= backwardDistance ? 1 : -1;
};

const getCinematicDescription = (album) =>
  album?.description?.trim() ||
  'A private cinematic album experience with premium storytelling visuals.';

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

function AlbumDeckCard({
  album,
  isActive = false,
  blurUnclothyGenerated,
  onSelect,
  className = '',
  cardRef = null,
  variant = 'deck',
}) {
  const albumCounts = getAlbumMediaCounts(album);
  const isDeck = variant === 'deck';

  return (
    <button
      ref={cardRef}
      type="button"
      onClick={onSelect}
      className={joinClassNames(
        'group relative aspect-[0.72] shrink-0 overflow-hidden rounded-[26px] border text-left shadow-[0_24px_60px_rgba(2,6,23,0.32)] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80',
        isDeck
          ? joinClassNames(
              'transition duration-300',
              isActive ? 'border-white/70 ring-2 ring-white/45' : 'border-white/28 hover:border-white/50',
            )
          : joinClassNames(
              'w-full transition duration-300',
              isActive ? 'border-white/70 ring-2 ring-white/45' : 'border-white/28 hover:border-white/50',
            ),
        className,
      )}
      aria-label={`Show album ${album.name}`}
      aria-current={isActive ? 'true' : undefined}
    >
      <AlbumCover
        photo={resolveAlbumCoverPhoto(album)}
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
          {albumCounts.photos} photos
          {albumCounts.videos > 0 ? ` • ${albumCounts.videos} videos` : ''}
          {albumCounts.audio > 0 ? ` • ${albumCounts.audio} audio` : ''}
        </p>
      </div>
    </button>
  );
}

function CinematicGalleryView({
  activeAlbum,
  headlineTop,
  headlineBottom,
  albums,
  activeIndex,
  albumsLength,
  blurUnclothyGenerated,
  onSelectAlbum,
  onPauseAutoplay,
  onResumeAutoplay,
  onPrev,
  onNext,
}) {
  const description = getCinematicDescription(activeAlbum);

  return (
    <>
      <section className="mt-7 flex flex-1 flex-col pt-3 sm:mt-9 sm:pt-5 lg:mt-12 lg:justify-center lg:pt-0">
        <div className="flex min-h-0 flex-1 flex-col gap-4 sm:gap-5 lg:grid lg:flex-none lg:grid-cols-[minmax(0,1fr)_minmax(480px,0.96fr)] lg:items-center lg:gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(640px,0.9fr)]">
          <div className="relative shrink-0">
            <AnimatePresence initial={false}>
              <motion.div
                key={`featured-copy-${activeAlbum.id}`}
                className="space-y-3.5 pr-2 sm:space-y-5 sm:pr-6 lg:space-y-6 lg:pr-10"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8, position: 'absolute', insetInline: 0, top: 0 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="space-y-2.5 overflow-hidden sm:space-y-3">
                  <p className="text-xs font-normal uppercase tracking-[0.24em] text-white/65 sm:text-sm">
                    {normalizeLabel(activeAlbum)}
                  </p>

                  <h1 className="max-w-full overflow-hidden font-['Bebas_Neue','Inter',sans-serif] text-[4.35rem] uppercase leading-[0.82] tracking-[0.03em] sm:text-[5.1rem] md:text-[5.75rem] lg:text-[7rem] xl:text-[8rem]">
                    <span className="block break-words">{headlineTop}</span>
                    <span className="block break-words">{headlineBottom}</span>
                  </h1>
                </div>

                <p className="max-w-[calc(100vw-3.5rem)] break-words overflow-hidden pr-10 text-[0.98rem] leading-relaxed text-white/86 sm:max-w-[31rem] sm:pr-12 sm:text-[1.04rem] lg:max-w-[35rem] lg:pr-16 lg:text-[1.08rem] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3] lg:[display:block] lg:[-webkit-line-clamp:unset]">
                  {description}
                </p>

                <div>
                  <Link
                    href={`/gallery/${activeAlbum.slug}`}
                    className="inline-flex h-12 items-center rounded-full bg-white px-6 text-sm font-semibold text-slate-900 transition hover:scale-[1.02] hover:bg-slate-100"
                  >
                    Open Album
                  </Link>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="mt-auto min-w-0 -translate-y-10 sm:-translate-y-12 lg:mt-0 lg:translate-y-0">
            <CinematicAlbumDeck
              albums={albums}
              activeIndex={activeIndex}
              blurUnclothyGenerated={blurUnclothyGenerated}
              onSelectAlbum={onSelectAlbum}
              onPauseAutoplay={onPauseAutoplay}
              onResumeAutoplay={onResumeAutoplay}
            />
          </div>
        </div>
      </section>

      <GalleryFooter
        activeIndex={activeIndex}
        total={albumsLength}
        onPrev={onPrev}
        onNext={onNext}
        className="mt-3 sm:mt-4 lg:mt-auto"
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
    onSelectAlbum(index);
    router.push(`/gallery/${slug}`);
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
          const isActive = index === activeIndex;

          return (
            <AlbumDeckCard
              key={album.id}
              album={album}
              isActive={isActive}
              variant="grid"
              blurUnclothyGenerated={blurUnclothyGenerated}
              onSelect={() => handleCardActivate(index, album.slug)}
            />
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
  const [chromeHidden, setChromeHidden] = useState(false);
  const [touchStartX, setTouchStartX] = useState(null);
  const [slideDirection, setSlideDirection] = useState(1);
  const [compactSearchQuery, setCompactSearchQuery] = useState('');
  const [sessionState, setSessionState] = useState('checking');
  const immersivePressRef = useRef({
    timerId: null,
    pointerId: null,
    startX: 0,
    startY: 0,
    armed: false,
  });

  const verifySecureSession = async ({ redirectOnFail = false } = {}) => {
    try {
      const response = await fetch('/api/session/status', {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      const data = await response.json().catch(() => ({}));
      const ok = Boolean(data?.authenticated);
      setSessionState(ok ? 'secure' : 'unsecured');

      if (!ok && redirectOnFail) {
        const next = encodeURIComponent(pathname || '/gallery');
        router.replace(`/admin/login?next=${next}`);
      }

      return ok;
    } catch {
      setSessionState('unsecured');
      if (redirectOnFail) {
        const next = encodeURIComponent(pathname || '/gallery');
        router.replace(`/admin/login?next=${next}`);
      }
      return false;
    }
  };

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const ok = await verifySecureSession({ redirectOnFail: true });
      if (cancelled && !ok) return;
    };

    void run();

    const intervalId = window.setInterval(() => {
      void verifySecureSession({ redirectOnFail: false });
    }, 45_000);

    const onFocus = () => {
      void verifySecureSession({ redirectOnFail: false });
    };

    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

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
        const resolvedDefaultView = normalizeGalleryView(settingsPayload?.defaultGalleryView);
        setBlurUnclothyGenerated(settingsPayload?.blurUnclothyGenerated !== false);

        setAlbums(publishedAlbums.map((album) => normalizeGalleryAlbum(album)));
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
    if (currentView !== 'cinematic' || isAutoplayPaused || chromeHidden || albums.length <= 1) {
      return;
    }

    const timer = setInterval(() => {
      setSlideDirection(1);
      setActiveIndex((previous) => (previous + 1) % albums.length);
    }, CINEMATIC_AUTOPLAY_MS);

    return () => clearInterval(timer);
  }, [currentView, isAutoplayPaused, chromeHidden, albums.length]);

  const coverPreloadCacheRef = useRef(new Set());

  useEffect(() => {
    if (!albums.length) return;

    const cache = coverPreloadCacheRef.current;
    const indexesToWarm = [
      activeIndex,
      (activeIndex + 1) % albums.length,
      (activeIndex + 2) % albums.length,
      (activeIndex - 1 + albums.length) % albums.length,
    ];

    indexesToWarm.forEach((index) => {
      preloadCoverUrl(resolveAlbumCoverDisplayUrl(albums[index]), cache);
    });
  }, [albums, activeIndex]);

  const activeAlbum = albums[activeIndex] || null;
  const activeCover = activeAlbum ? resolveAlbumCoverDisplayUrl(activeAlbum) || resolveAlbumCover(activeAlbum) : '';
  const [headlineTop, headlineBottom] = buildTitleLines(activeAlbum?.name);

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

  useEffect(() => {
    if (!chromeHidden) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setChromeHidden(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [chromeHidden]);

  const clearImmersivePress = () => {
    if (immersivePressRef.current.timerId != null) {
      window.clearTimeout(immersivePressRef.current.timerId);
      immersivePressRef.current.timerId = null;
    }
    immersivePressRef.current.armed = false;
    immersivePressRef.current.pointerId = null;
  };

  const isImmersiveExemptTarget = (target) => {
    if (!(target instanceof Element)) return true;
    return Boolean(
      target.closest(
        'a,button,input,textarea,select,label,[data-gallery-deck-scroll],[data-no-immersive]',
      ),
    );
  };

  const onImmersivePointerDown = (event) => {
    if (chromeHidden) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (isImmersiveExemptTarget(event.target)) return;

    clearImmersivePress();
    immersivePressRef.current = {
      timerId: window.setTimeout(() => {
        immersivePressRef.current.timerId = null;
        immersivePressRef.current.armed = false;
        setChromeHidden(true);
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          navigator.vibrate(12);
        }
      }, IMMERSIVE_LONG_PRESS_MS),
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      armed: true,
    };
  };

  const onImmersivePointerMove = (event) => {
    const press = immersivePressRef.current;
    if (!press.armed || press.pointerId !== event.pointerId) return;
    const dx = event.clientX - press.startX;
    const dy = event.clientY - press.startY;
    if (Math.hypot(dx, dy) > IMMERSIVE_MOVE_CANCEL_PX) {
      clearImmersivePress();
    }
  };

  const onImmersivePointerUp = (event) => {
    if (immersivePressRef.current.pointerId === event.pointerId) {
      clearImmersivePress();
    }
  };

  useEffect(() => () => clearImmersivePress(), []);

  const onTouchStart = (event) => {
    if (chromeHidden || currentView !== 'cinematic') {
      return;
    }

    const target = event.target;
    if (target instanceof Element && target.closest('[data-gallery-deck-scroll]')) {
      setTouchStartX(null);
      return;
    }

    setTouchStartX(event.touches?.[0]?.clientX ?? null);
  };

  const onTouchEnd = (event) => {
    if (chromeHidden || currentView !== 'cinematic') {
      return;
    }

    const target = event.target;
    if (target instanceof Element && target.closest('[data-gallery-deck-scroll]')) {
      setTouchStartX(null);
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

    if (nextCount === 1) {
      void verifySecureSession({ redirectOnFail: true });
    }
  };

  useEffect(() => () => clearGalleryAdminClicks(), []);

  return (
    <main
      className="relative min-h-[100svh] overflow-x-hidden bg-slate-950 text-white lg:min-h-screen"
      onKeyDown={onKeyDown}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onPointerDown={onImmersivePointerDown}
      onPointerMove={onImmersivePointerMove}
      onPointerUp={onImmersivePointerUp}
      onPointerCancel={onImmersivePointerUp}
      onContextMenu={(event) => {
        if (chromeHidden || immersivePressRef.current.armed) {
          event.preventDefault();
        }
      }}
      tabIndex={0}
      aria-label={currentView === 'compact' ? 'Private gallery browser' : 'Private gallery slider'}
    >
      <AnimatePresence initial={false}>
        {activeCover ? (
          <motion.div
            key={`active-background-${activeAlbum?.id ?? 'none'}`}
            className="absolute inset-0"
            initial={{
              opacity: 0,
              scale: currentView === 'cinematic' ? (slideDirection > 0 ? 1.06 : 1.04) : 1.02,
            }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
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

      {!chromeHidden ? (
        <>
          <div
            className={joinClassNames(
              'absolute inset-0',
              currentView === 'compact'
                ? 'bg-[linear-gradient(135deg,rgba(2,6,23,0.95),rgba(2,6,23,0.82)_42%,rgba(2,6,23,0.95))]'
                : 'bg-[linear-gradient(180deg,rgba(2,6,23,0.55)_0%,rgba(2,6,23,0.42)_42%,rgba(2,6,23,0.78)_100%)] lg:bg-[linear-gradient(108deg,rgba(2,6,23,0.84),rgba(2,6,23,0.36)_48%,rgba(2,6,23,0.92))]',
            )}
          />
          <div
            className={joinClassNames(
              'absolute inset-0',
              currentView === 'compact'
                ? 'bg-[radial-gradient(circle_at_78%_18%,rgba(255,255,255,0.12),transparent_32%)]'
                : 'bg-[radial-gradient(circle_at_50%_28%,rgba(255,255,255,0.12),transparent_48%)] lg:bg-[radial-gradient(circle_at_72%_34%,rgba(255,255,255,0.15),transparent_42%)]',
            )}
          />

          <div className="relative z-10 mx-auto flex min-h-[100svh] max-w-[1480px] flex-col px-5 py-5 sm:px-6 sm:py-6 lg:min-h-screen lg:px-10 lg:py-8">
            <header className="flex items-center justify-between gap-4">
              <p className="text-xs uppercase tracking-[0.32em] text-white/85">Private Gallery</p>
              <button
                type="button"
                onClick={handleSecureSessionClick}
                onContextMenu={(event) => event.preventDefault()}
                className={joinClassNames(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[8px] uppercase tracking-[0.14em] backdrop-blur transition',
                  sessionState === 'secure'
                    ? 'border-emerald-200/35 bg-emerald-400/10 text-emerald-50/90 hover:bg-emerald-400/16'
                    : sessionState === 'checking'
                      ? 'border-white/25 bg-white/10 text-white/70'
                      : 'border-amber-200/40 bg-amber-400/10 text-amber-50/90 hover:bg-amber-400/16',
                )}
                aria-label={
                  sessionState === 'secure'
                    ? 'Secure session active. Triple click to open gallery admin.'
                    : sessionState === 'checking'
                      ? 'Checking session'
                      : 'Session expired. Tap to sign in again.'
                }
              >
                <span
                  className={joinClassNames(
                    'h-1.5 w-1.5 rounded-full',
                    sessionState === 'secure'
                      ? 'bg-emerald-300'
                      : sessionState === 'checking'
                        ? 'bg-white/45'
                        : 'bg-amber-300',
                  )}
                  aria-hidden
                />
                {sessionState === 'secure'
                  ? 'Secure'
                  : sessionState === 'checking'
                    ? 'Checking'
                    : 'Sign in'}
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
                  headlineTop={headlineTop}
                  headlineBottom={headlineBottom}
                  albums={albums}
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
        </>
      ) : (
        <button
          type="button"
          className="absolute inset-0 z-20 cursor-default bg-transparent"
          aria-label="Show gallery"
          onClick={() => setChromeHidden(false)}
          onContextMenu={(event) => event.preventDefault()}
        />
      )}
    </main>
  );
}
