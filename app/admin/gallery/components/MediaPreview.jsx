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

  useEffect(() => {
    const nextPoster = getVideoPosterUrl(resolvedUrl) || getDriveThumbnailUrl(sourceType, sourceId);
    setPosterSrc(nextPoster);
    setMode(nextPoster ? 'poster' : 'video');
  }, [resolvedUrl, sourceType, sourceId]);

  if (mode === 'poster' && posterSrc) {
    return (
      <img
        src={posterSrc}
        alt={alt}
        className={className}
        onLoad={onLoadedData}
        onError={() => {
          // Drive/Cloudinary poster failed — show first video frame instead.
          setMode('video');
          onError?.();
        }}
        {...MEDIA_PROTECT_IMAGE_PROPS}
        {...imageProps}
      />
    );
  }

  const playable = getPlayableMediaUrl(resolvedUrl) || resolvedUrl;
  if (!playable) {
    return (
      <div
        className={`bg-slate-900 ${className}`}
        role="img"
        aria-label={alt || 'Video'}
        {...MEDIA_PROTECT_IMAGE_PROPS}
      />
    );
  }

  return (
    <video
      src={playable}
      className={`${className} pointer-events-none`}
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
        onLoadedData?.(event);
      }}
      onLoadedData={onLoadedData}
      onError={onError}
    />
  );
}

export default function MediaPreview({
  url,
  alt,
  className = 'h-full w-full object-cover',
  controls = false,
  mediaRef,
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
  const isGridThumbnail = !controls && !mediaRef;
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

  return (
    <img
      src={gridPreviewUrl || resolvedUrl}
      alt={alt}
      className={className}
      onLoad={onLoadedData}
      onError={onError}
      {...MEDIA_PROTECT_IMAGE_PROPS}
      {...imageProps}
    />
  );
}
