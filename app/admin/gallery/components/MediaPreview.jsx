/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useState } from 'react';
import {
  getAdminGridPreviewUrl,
  getAdminMediaUrl,
  getGoogleDriveThumbnailUrl,
  getPlayableMediaUrl,
  getVideoPosterUrl,
  isVideoUrl,
} from '../utils';
import { isPhotoAudio, isPhotoVideo } from '@/lib/gallery-media';
import { MEDIA_PROTECT_ELEMENT_PROPS, MEDIA_PROTECT_IMAGE_PROPS } from '@/lib/media-protect';

function getDriveThumbnailUrl(sourceType, sourceId) {
  if (sourceType !== 'gdrive' || !sourceId) return '';
  return getGoogleDriveThumbnailUrl(sourceId, 'w1200');
}

function GridMediaFallback({ alt, className }) {
  return (
    <div
      className={`grid place-items-center bg-slate-200 text-slate-400 dark:bg-slate-800 dark:text-slate-500 ${className || ''}`}
      role="img"
      aria-label={alt || 'Media unavailable'}
      {...MEDIA_PROTECT_IMAGE_PROPS}
    >
      <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z"
        />
      </svg>
    </div>
  );
}

function ImagePreviewWithFallback({
  alt,
  className,
  imageSrc,
  setImageSrc,
  resolvedUrl,
  onLoadedData,
  onError,
  imageProps,
  eager = false,
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [imageSrc]);

  if (failed) {
    return <GridMediaFallback alt={alt} className={className} />;
  }

  return (
    <div className="relative h-full w-full">
      {!loaded ? (
        <div
          className="absolute inset-0 animate-pulse bg-slate-200 dark:bg-slate-800"
          aria-hidden
        />
      ) : null}
      <img
        src={imageSrc}
        alt={alt}
        className={`${className || ''} ${loaded ? '' : 'opacity-0'}`}
        decoding="async"
        loading={eager ? 'eager' : 'lazy'}
        fetchPriority={eager ? 'high' : 'auto'}
        onLoad={() => {
          setLoaded(true);
          onLoadedData?.();
        }}
        onError={() => {
          if (imageSrc && resolvedUrl && imageSrc !== resolvedUrl) {
            setImageSrc(resolvedUrl);
            return;
          }
          setFailed(true);
          onError?.();
        }}
        {...MEDIA_PROTECT_IMAGE_PROPS}
        {...imageProps}
      />
    </div>
  );
}

function VideoGridThumbnail({
  resolvedUrl,
  alt,
  className,
  onLoadedData,
  onError,
  imageProps,
  sourceType,
  sourceId,
}) {
  const cloudinaryPoster = getVideoPosterUrl(resolvedUrl);
  const drivePoster = getDriveThumbnailUrl(sourceType, sourceId);
  const initialPoster = cloudinaryPoster || drivePoster;
  const [mode, setMode] = useState(initialPoster ? 'poster' : 'video');
  const [posterSrc, setPosterSrc] = useState(initialPoster);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const nextPoster = getVideoPosterUrl(resolvedUrl) || getDriveThumbnailUrl(sourceType, sourceId);
    setPosterSrc(nextPoster);
    setMode(nextPoster ? 'poster' : 'video');
    setLoaded(false);
    setFailed(false);
  }, [resolvedUrl, sourceType, sourceId]);

  if (failed) {
    return <GridMediaFallback alt={alt} className={className} />;
  }

  if (mode === 'poster' && posterSrc) {
    return (
      <div className="relative h-full w-full">
        {!loaded ? (
          <div className="absolute inset-0 animate-pulse bg-slate-200 dark:bg-slate-800" aria-hidden />
        ) : null}
        <img
          src={posterSrc}
          alt={alt}
          className={`${className || ''} ${loaded ? '' : 'opacity-0'}`}
          decoding="async"
          loading="lazy"
          onLoad={() => {
            setLoaded(true);
            onLoadedData?.();
          }}
          onError={() => {
            // Drive public thumbnail often 403 — try authenticated admin proxy next.
            if (posterSrc !== resolvedUrl && resolvedUrl) {
              setPosterSrc(resolvedUrl);
              setLoaded(false);
              return;
            }
            // Then fall back to muted first video frame.
            setMode('video');
            setLoaded(false);
            onError?.();
          }}
          {...MEDIA_PROTECT_IMAGE_PROPS}
          {...imageProps}
        />
      </div>
    );
  }

  const playable = getPlayableMediaUrl(resolvedUrl) || resolvedUrl;
  if (!playable) {
    return <GridMediaFallback alt={alt || 'Video'} className={className} />;
  }

  return (
    <div className="relative h-full w-full">
      {!loaded ? (
        <div className="absolute inset-0 animate-pulse bg-slate-200 dark:bg-slate-800" aria-hidden />
      ) : null}
      <video
        src={playable}
        className={`${className || ''} pointer-events-none ${loaded ? '' : 'opacity-0'}`}
        muted
        playsInline
        preload="metadata"
        {...MEDIA_PROTECT_ELEMENT_PROPS}
        onLoadedMetadata={(event) => {
          const player = event.currentTarget;
          if (Number.isFinite(player.duration) && player.duration > 0.12) {
            try {
              player.currentTime = Math.min(0.1, player.duration / 2);
            } catch {
              // ignore seek failures; first decoded frame may still show
            }
          }
        }}
        onLoadedData={(event) => {
          setLoaded(true);
          onLoadedData?.(event);
        }}
        onError={() => {
          setFailed(true);
          onError?.();
        }}
      />
    </div>
  );
}

export default function MediaPreview({
  url,
  alt,
  className = 'h-full w-full object-cover',
  controls = false,
  mediaRef,
  detail = false,
  onLoadStart,
  onLoadedData,
  onCanPlay,
  onError,
  videoProps,
  imageProps,
  mimeType,
  sourceType,
  sourceId,
}) {
  const isGridThumbnail = !controls && !mediaRef && !detail;
  const resolvedUrl = getAdminMediaUrl(url, sourceType, sourceId);
  const gridPreviewUrl = isGridThumbnail ? getAdminGridPreviewUrl(url, sourceType, sourceId) : resolvedUrl;
  const mediaRecord =
    url && typeof url === 'object'
      ? url
      : { imageUrl: resolvedUrl, mimeType, sourceType, sourceId };

  if (isPhotoAudio(mediaRecord, resolvedUrl)) {
    return (
      <audio
        ref={mediaRef}
        src={resolvedUrl}
        controls={controls}
        onLoadStart={onLoadStart}
        onLoadedData={onLoadedData}
        onCanPlay={onCanPlay}
        onError={onError}
        preload="metadata"
        className="w-full"
        {...MEDIA_PROTECT_ELEMENT_PROPS}
        {...videoProps}
      />
    );
  }

  if (isPhotoVideo(mediaRecord, resolvedUrl) || isVideoUrl(resolvedUrl)) {
    // Grid/thumbnails: prefer static poster; fall back to muted first-frame video.
    if (!controls && !mediaRef) {
      return (
        <VideoGridThumbnail
          resolvedUrl={resolvedUrl}
          alt={alt}
          className={className}
          onLoadedData={onLoadedData}
          onError={onError}
          imageProps={imageProps}
          sourceType={sourceType}
          sourceId={sourceId}
        />
      );
    }

    return (
      <video
        ref={mediaRef}
        src={getPlayableMediaUrl(resolvedUrl)}
        className={className}
        controls={controls}
        crossOrigin="anonymous"
        onLoadStart={onLoadStart}
        onLoadedData={onLoadedData}
        onCanPlay={onCanPlay}
        onError={onError}
        playsInline
        preload="metadata"
        {...MEDIA_PROTECT_ELEMENT_PROPS}
        {...videoProps}
      />
    );
  }

  const [imageSrc, setImageSrc] = useState(detail ? resolvedUrl : gridPreviewUrl || resolvedUrl);

  useEffect(() => {
    setImageSrc(detail ? resolvedUrl : gridPreviewUrl || resolvedUrl);
  }, [detail, gridPreviewUrl, resolvedUrl]);

  if (isGridThumbnail || detail) {
    return (
      <ImagePreviewWithFallback
        alt={alt}
        className={className}
        imageSrc={imageSrc}
        setImageSrc={setImageSrc}
        resolvedUrl={resolvedUrl}
        onLoadedData={onLoadedData}
        onError={onError}
        imageProps={imageProps}
        eager={detail}
      />
    );
  }

  return (
    <img
      src={imageSrc}
      alt={alt}
      className={className}
      onLoad={onLoadedData}
      onError={() => {
        // Drive public thumbnails often 403; fall back to authenticated admin proxy.
        if (imageSrc && resolvedUrl && imageSrc !== resolvedUrl) {
          setImageSrc(resolvedUrl);
          return;
        }
        onError?.();
      }}
      {...MEDIA_PROTECT_IMAGE_PROPS}
      {...imageProps}
    />
  );
}
