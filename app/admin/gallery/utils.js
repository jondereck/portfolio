export {
  getPlayableMediaUrl,
  getVideoPosterUrl,
  isPhotoVideo,
  isUnclothyGenerated,
  isVideoUrl,
} from '@/lib/gallery-media';

export const getGoogleDriveThumbnailUrl = (sourceId, size = 'w400') => {
  if (!sourceId) return '';
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(String(sourceId))}&sz=${size}`;
};

export const getAdminGridPreviewUrl = (photoOrUrl, sourceTypeArg, sourceIdArg) => {
  if (photoOrUrl && typeof photoOrUrl === 'object') {
    const sourceType = photoOrUrl.sourceType;
    const sourceId = photoOrUrl.sourceId;
    const imageUrl = photoOrUrl.imageUrl;

    if (sourceType === 'gdrive' && sourceId) {
      return getGoogleDriveThumbnailUrl(sourceId);
    }

    return typeof imageUrl === 'string' ? imageUrl : '';
  }

  if (sourceTypeArg === 'gdrive' && sourceIdArg) {
    return getGoogleDriveThumbnailUrl(sourceIdArg);
  }

  return typeof photoOrUrl === 'string' ? photoOrUrl : '';
};

export const getAdminMediaUrl = (photoOrUrl, sourceTypeArg, sourceIdArg) => {
  if (photoOrUrl && typeof photoOrUrl === 'object') {
    const sourceType = photoOrUrl.sourceType;
    const sourceId = photoOrUrl.sourceId;
    const imageUrl = photoOrUrl.imageUrl;

    if (sourceType === 'gdrive' && sourceId) {
      return `/api/admin/integrations/google-drive/files/${encodeURIComponent(sourceId)}`;
    }

    return imageUrl ?? '';
  }

  if (sourceTypeArg === 'gdrive' && sourceIdArg) {
    return `/api/admin/integrations/google-drive/files/${encodeURIComponent(sourceIdArg)}`;
  }

  return photoOrUrl;
};

export const buildPublicAlbumHref = (album) => {
  const slug = typeof album?.slug === 'string' ? album.slug.trim() : '';
  if (!slug) return '';

  const shareToken = typeof album?.shareToken === 'string' ? album.shareToken.trim() : '';
  const shareEnabled = Boolean(album?.shareLinkEnabled) && Boolean(shareToken);

  return shareEnabled ? `/gallery/${encodeURIComponent(slug)}?share=${encodeURIComponent(shareToken)}` : `/gallery/${encodeURIComponent(slug)}`;
};

export const formatLocalDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString();
};

export const getPhotoSortTime = (photo) => {
  const value = new Date(photo?.dateTaken ?? photo?.uploadedAt ?? 0).getTime();
  return Number.isNaN(value) ? 0 : value;
};

export const getPhotoDedupeKey = (photo) => {
  if (!photo) return null;
  if (photo.sourceId) return `source:${photo.sourceId}`;
  if (photo.imageUrl) return `url:${photo.imageUrl}`;
  return null;
};

export const areIdListsEqual = (left, right) => {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
};
