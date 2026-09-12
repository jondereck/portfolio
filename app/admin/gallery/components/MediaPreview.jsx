/* eslint-disable @next/next/no-img-element */
'use client';

import { getAdminMediaUrl, getPlayableMediaUrl, getVideoPosterUrl, isVideoUrl } from '../utils';
import { isPhotoAudio, isPhotoVideo } from '@/lib/gallery-media';
import { MEDIA_PROTECT_ELEMENT_PROPS, MEDIA_PROTECT_IMAGE_PROPS } from '@/lib/media-protect';

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
  const resolvedUrl = getAdminMediaUrl(url, sourceType, sourceId);
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
    // Grid/thumbnails: avoid mounting <video src> (download managers hook those).
    // Real players pass mediaRef and/or controls.
    if (!controls && !mediaRef) {
      const posterSrc = getVideoPosterUrl(resolvedUrl);
      if (posterSrc) {
        return (
          <img
            src={posterSrc}
            alt={alt}
            className={className}
            onLoad={onLoadedData}
            onError={onError}
            {...MEDIA_PROTECT_IMAGE_PROPS}
            {...imageProps}
          />
        );
      }

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
      src={resolvedUrl}
      alt={alt}
      className={className}
      onLoad={onLoadedData}
      onError={onError}
      {...MEDIA_PROTECT_IMAGE_PROPS}
      {...imageProps}
    />
  );
}
