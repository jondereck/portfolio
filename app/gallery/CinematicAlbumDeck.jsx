'use client';

import { useEffect, useMemo, useRef } from 'react';
import { getVideoPosterUrl, isPhotoAudio, isPhotoVideo, shouldBlurPhoto } from '@/lib/gallery-media';
import { MEDIA_PROTECT_IMAGE_PROPS } from '@/lib/media-protect';

const CARD_GAP_PX = 14;
const SWIPE_DISTANCE_RATIO = 0.22;
const SWIPE_DISTANCE_MAX = 64;
const SWIPE_VELOCITY = 0.65;
const SNAP_DURATION_MS = 260;

const joinClassNames = (...values) => values.filter(Boolean).join(' ');

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

const resolveAlbumCoverPhoto = (album) => album?.coverPhoto || album?.photos?.[0] || null;

function getAlbumMediaCounts(album) {
  if (typeof album?.mediaCount?.photos === 'number' && typeof album?.mediaCount?.videos === 'number') {
    return {
      photos: album.mediaCount.photos ?? 0,
      videos: album.mediaCount.videos ?? 0,
      audio: album.mediaCount.audio ?? 0,
    };
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
}

function formatAlbumMediaCount(counts) {
  const parts = [`${counts.photos} photos`];
  if (counts.videos > 0) parts.push(`${counts.videos} videos`);
  if (counts.audio > 0) parts.push(`${counts.audio} audio`);
  return parts.join(' • ');
}

function DeckCard({ album, blurUnclothyGenerated, onSelect, cardRef, className = '' }) {
  const albumCounts = getAlbumMediaCounts(album);

  return (
    <button
      ref={cardRef}
      type="button"
      onClick={onSelect}
      data-focused="false"
      className={joinClassNames(
        'group relative aspect-[0.72] shrink-0 origin-center touch-none overflow-hidden rounded-[26px] border border-white/22 text-left shadow-[0_24px_60px_rgba(2,6,23,0.32)] will-change-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80',
        'data-[focused=true]:z-[1] data-[focused=true]:border-sky-200/75 data-[focused=true]:shadow-[0_0_32px_rgba(125,211,252,0.4)] data-[focused=true]:ring-2 data-[focused=true]:ring-sky-200/55',
        className,
      )}
      aria-label={`Show album ${album.name}`}
    >
      <AlbumCover
        photo={resolveAlbumCoverPhoto(album)}
        alt={album.name}
        className="pointer-events-none h-full w-full object-cover"
        fallbackClassName="h-full w-full bg-[linear-gradient(140deg,#475569,#64748b,#334155)]"
        blurUnclothyGenerated={blurUnclothyGenerated}
      />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(2,6,23,0.9),rgba(2,6,23,0.08)_62%)]" />
      <div data-deck-glass="" className="pointer-events-none absolute inset-0 bg-slate-950/40 backdrop-blur-[1.5px]" aria-hidden />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3.5 sm:p-4">
        <p className="text-[11px] uppercase tracking-[0.2em] text-white/88 [text-shadow:0_1px_2px_rgba(0,0,0,0.85),0_2px_10px_rgba(0,0,0,0.45)]">
          {formatAlbumMediaCount(albumCounts)}
        </p>
      </div>
    </button>
  );
}

function paintDeck(viewport, track, offsetX, cards) {
  if (!viewport || !track) return 0;

  const viewportRect = viewport.getBoundingClientRect();
  const focusX = viewportRect.left + Math.min(viewportRect.width * 0.28, 118);
  let bestOrder = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  track.style.transform = `translate3d(${offsetX}px, 0, 0)`;

  cards.forEach((card, order) => {
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const cardCenter = rect.left + rect.width / 2;
    const distance = Math.abs(cardCenter - focusX);
    const t = Math.min(1, distance / Math.max(rect.width * 0.85, 1));

    card.style.transform = `translate3d(0, ${t * 10}px, 0) scale(${1 - t * 0.14})`;
    card.style.opacity = String(1 - t * 0.4);

    const glass = card.querySelector('[data-deck-glass]');
    if (glass instanceof HTMLElement) {
      glass.style.opacity = String(Math.min(1, t * 1.2));
    }

    if (distance < bestDistance) {
      bestDistance = distance;
      bestOrder = order;
    }
  });

  cards.forEach((card, order) => {
    if (!card) return;
    card.dataset.focused = order === bestOrder ? 'true' : 'false';
  });

  return bestOrder;
}

/**
 * Pointer-drag deck: focused card = active album (BG + hero follow).
 */
export default function CinematicAlbumDeck({
  albums,
  activeIndex,
  blurUnclothyGenerated,
  onSelectAlbum,
  onPauseAutoplay,
  onResumeAutoplay,
}) {
  const viewportRef = useRef(null);
  const trackRef = useRef(null);
  const cardRefs = useRef([]);
  const offsetRef = useRef(0);
  const dragRef = useRef({
    active: false,
    pointerId: null,
    startX: 0,
    startOffset: 0,
    lastX: 0,
    lastTime: 0,
    velocity: 0,
    moved: false,
  });
  const momentumRafRef = useRef(0);
  const readyRef = useRef(false);
  const lastReportedIndexRef = useRef(activeIndex);
  const onSelectAlbumRef = useRef(onSelectAlbum);
  onSelectAlbumRef.current = onSelectAlbum;

  const deckEntries = useMemo(() => {
    if (!Array.isArray(albums) || albums.length === 0) return [];
    return albums.map((album, index) => ({ album, index }));
  }, [albums]);

  const loopedAlbums = useMemo(() => {
    if (deckEntries.length === 0) return [];
    if (deckEntries.length === 1) return deckEntries;
    return [...deckEntries, ...deckEntries, ...deckEntries];
  }, [deckEntries]);

  const loopedAlbumsRef = useRef(loopedAlbums);
  loopedAlbumsRef.current = loopedAlbums;

  const deckCountRef = useRef(deckEntries.length);
  deckCountRef.current = deckEntries.length;

  const getSetWidth = () => {
    const track = trackRef.current;
    if (!track || deckCountRef.current <= 1) return 0;
    return track.scrollWidth / 3;
  };

  const getCardStep = () => {
    const cards = cardRefs.current.filter(Boolean);
    if (cards.length >= 2) {
      const a = cards[0].getBoundingClientRect();
      const b = cards[1].getBoundingClientRect();
      const step = Math.abs(b.left - a.left);
      if (step > 0) return step;
    }

    const card = cards[0];
    if (card) {
      return card.getBoundingClientRect().width + CARD_GAP_PX;
    }

    return 180;
  };

  const normalizeLoopOffset = (value) => {
    const setWidth = getSetWidth();
    if (setWidth <= 0) return value;

    let next = value;
    while (next > -setWidth * 0.2) next -= setWidth;
    while (next < -setWidth * 1.8) next += setWidth;
    return next;
  };

  const getFocusX = () => {
    const viewport = viewportRef.current;
    if (!viewport) return 0;
    return viewport.getBoundingClientRect().left + Math.min(viewport.clientWidth * 0.28, 118);
  };

  const getOffsetForAlbumIndex = (albumIndex) => {
    const n = deckCountRef.current;
    if (n === 0) return offsetRef.current;

    const loopIndex = n > 1 ? n + albumIndex : albumIndex;
    const card = cardRefs.current[loopIndex];
    if (!(card instanceof HTMLElement)) return offsetRef.current;

    const rect = card.getBoundingClientRect();
    const cardCenter = rect.left + rect.width / 2;
    return normalizeLoopOffset(offsetRef.current + (getFocusX() - cardCenter));
  };

  const renderFrame = () => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) return 0;
    offsetRef.current = normalizeLoopOffset(offsetRef.current);
    return paintDeck(viewport, track, offsetRef.current, cardRefs.current);
  };

  const commitFocusedAlbum = (order) => {
    const entry = loopedAlbumsRef.current[order];
    if (!entry) return;
    if (entry.index === lastReportedIndexRef.current) return;
    lastReportedIndexRef.current = entry.index;
    onSelectAlbumRef.current?.(entry.index);
  };

  const stopMomentum = () => {
    if (momentumRafRef.current) {
      window.cancelAnimationFrame(momentumRafRef.current);
      momentumRafRef.current = 0;
    }
  };

  const animateToOffset = (targetOffset, { commit = false } = {}) => {
    stopMomentum();
    const start = offsetRef.current;
    const delta = targetOffset - start;
    if (Math.abs(delta) < 0.5) {
      offsetRef.current = normalizeLoopOffset(targetOffset);
      const order = renderFrame();
      if (commit) commitFocusedAlbum(order);
      return;
    }

    const startTime = performance.now();

    const step = (now) => {
      const t = Math.min(1, (now - startTime) / SNAP_DURATION_MS);
      const eased = 1 - (1 - t) ** 3;
      offsetRef.current = start + delta * eased;
      renderFrame();

      if (t < 1) {
        momentumRafRef.current = window.requestAnimationFrame(step);
        return;
      }

      offsetRef.current = normalizeLoopOffset(targetOffset);
      const order = renderFrame();
      momentumRafRef.current = 0;
      if (commit) commitFocusedAlbum(order);
    };

    momentumRafRef.current = window.requestAnimationFrame(step);
  };

  const snapOneCard = (direction) => {
    const step = getCardStep();
    const target = normalizeLoopOffset(dragRef.current.startOffset + direction * step);
    animateToOffset(target, { commit: true });
  };

  const centerAlbumIndex = (albumIndex, { animate = false } = {}) => {
    const target = getOffsetForAlbumIndex(albumIndex);
    if (animate) {
      animateToOffset(target, { commit: false });
      return;
    }
    offsetRef.current = target;
    renderFrame();
  };

  useEffect(() => {
    readyRef.current = false;
    cardRefs.current = [];
    stopMomentum();
    lastReportedIndexRef.current = activeIndex;

    const boot = window.requestAnimationFrame(() => {
      const setWidth = getSetWidth();
      offsetRef.current = setWidth > 0 ? -setWidth : 0;
      renderFrame();
      centerAlbumIndex(activeIndex, { animate: false });
      readyRef.current = true;
    });

    return () => {
      window.cancelAnimationFrame(boot);
      stopMomentum();
    };
    // Rebuild when album set size changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckEntries.length, loopedAlbums.length]);

  useEffect(() => {
    if (!readyRef.current || dragRef.current.active) return;
    if (activeIndex === lastReportedIndexRef.current) return;
    lastReportedIndexRef.current = activeIndex;
    centerAlbumIndex(activeIndex, { animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

  useEffect(() => {
    const onResize = () => {
      if (!readyRef.current) return;
      centerAlbumIndex(activeIndex, { animate: false });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, loopedAlbums.length]);

  const onPointerDown = (event) => {
    if (event.button != null && event.button !== 0) return;
    const viewport = viewportRef.current;
    if (!viewport) return;

    stopMomentum();
    onPauseAutoplay?.();

    dragRef.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startOffset: offsetRef.current,
      lastX: event.clientX,
      lastTime: performance.now(),
      velocity: 0,
      moved: false,
    };

    viewport.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId) return;

    const dx = event.clientX - drag.startX;
    if (Math.abs(dx) > 6) {
      drag.moved = true;
    }

    const now = performance.now();
    const dt = Math.max(now - drag.lastTime, 1);
    drag.velocity = ((event.clientX - drag.lastX) / dt) * 16;
    drag.lastX = event.clientX;
    drag.lastTime = now;

    const step = getCardStep();
    const cappedDx = Math.max(-step * 1.15, Math.min(step * 1.15, dx));
    offsetRef.current = drag.startOffset + cappedDx;
    renderFrame();
  };

  const endDrag = (event) => {
    const drag = dragRef.current;
    if (!drag.active || (event?.pointerId != null && drag.pointerId !== event.pointerId)) return;

    drag.active = false;
    const viewport = viewportRef.current;
    viewport?.releasePointerCapture?.(drag.pointerId);

    if (!drag.moved) {
      animateToOffset(drag.startOffset, { commit: true });
      onResumeAutoplay?.();
      return;
    }

    const releaseX = event?.clientX ?? drag.lastX;
    const dx = releaseX - drag.startX;
    const step = getCardStep();
    const distanceThreshold = Math.min(SWIPE_DISTANCE_MAX, step * SWIPE_DISTANCE_RATIO);

    let direction = 0;
    if (dx <= -distanceThreshold || drag.velocity <= -SWIPE_VELOCITY) {
      direction = -1;
    } else if (dx >= distanceThreshold || drag.velocity >= SWIPE_VELOCITY) {
      direction = 1;
    }

    if (direction === 0) {
      animateToOffset(drag.startOffset, { commit: true });
    } else {
      snapOneCard(direction);
    }

    onResumeAutoplay?.();
  };

  const onCardSelect = (albumIndex) => (event) => {
    if (dragRef.current.moved) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    lastReportedIndexRef.current = albumIndex;
    onSelectAlbum?.(albumIndex);
    centerAlbumIndex(albumIndex, { animate: true });
  };

  if (deckEntries.length <= 1) {
    return null;
  }

  return (
    <div
      className="relative select-none"
      onMouseEnter={onPauseAutoplay}
      onMouseLeave={onResumeAutoplay}
    >
      <div
        ref={viewportRef}
        data-gallery-deck-scroll="true"
        className="-mx-5 cursor-grab touch-none overflow-hidden px-5 pb-4 pt-3 active:cursor-grabbing sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0"
        style={{ touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div ref={trackRef} className="flex w-max items-end gap-3.5 will-change-transform pr-[30vw] sm:pr-[14vw] lg:pr-8">
          {loopedAlbums.map(({ album, index }, loopIndex) => (
            <DeckCard
              key={`${album.id}-${loopIndex}`}
              album={album}
              blurUnclothyGenerated={blurUnclothyGenerated}
              onSelect={onCardSelect(index)}
              cardRef={(node) => {
                cardRefs.current[loopIndex] = node;
              }}
              className="w-[42vw] min-w-[148px] max-w-[188px] sm:w-[31vw] sm:min-w-[170px] sm:max-w-[214px] lg:w-[185px] xl:w-[198px]"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
