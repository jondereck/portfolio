const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.aac', '.ogg', '.m4a', '.flac'];

export const isCloudinaryMediaUrl = (value) => {
  if (!value || typeof value !== 'string') return false;
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === 'res.cloudinary.com' || host.endsWith('.cloudinary.com');
  } catch {
    return value.includes('res.cloudinary.com');
  }
};

export const isAudioMimeType = (value) =>
  typeof value === 'string' && value.toLowerCase().startsWith('audio/');

export const isAudioUrl = (value) => {
  if (!value || typeof value !== 'string') return false;
  const normalized = value.toLowerCase().split('?')[0];
  return AUDIO_EXTENSIONS.some((ext) => normalized.endsWith(ext));
};

export const isPhotoAudio = (photoOrUrl, fallbackUrl = '') => {
  if (!photoOrUrl) return isAudioUrl(fallbackUrl);
  if (typeof photoOrUrl === 'string') return isAudioUrl(photoOrUrl);
  if (isAudioMimeType(photoOrUrl.mimeType)) return true;
  return isAudioUrl(photoOrUrl.imageUrl || fallbackUrl);
};

export const isVideoUrl = (value) => {
  if (!value || typeof value !== 'string') return false;
  const normalized = value.toLowerCase().split('?')[0];
  // Audio files hosted on Cloudinary's /video/upload/ path must not be misclassified as video
  if (AUDIO_EXTENSIONS.some((ext) => normalized.endsWith(ext))) return false;
  return (
    normalized.includes('/video/upload/') ||
    normalized.endsWith('.mp4') ||
    normalized.endsWith('.mov') ||
    normalized.endsWith('.webm') ||
    normalized.endsWith('.mkv')
  );
};

export const isVideoMimeType = (value) =>
  typeof value === 'string' && value.toLowerCase().startsWith('video/');

export const isPhotoVideo = (photoOrUrl, fallbackUrl = '') => {
  if (!photoOrUrl) return isVideoUrl(fallbackUrl);

  if (typeof photoOrUrl === 'string') {
    return isVideoUrl(photoOrUrl);
  }

  if (isAudioMimeType(photoOrUrl.mimeType)) return false;

  if (isVideoMimeType(photoOrUrl.mimeType)) {
    return true;
  }

  return isVideoUrl(photoOrUrl.imageUrl || fallbackUrl);
};

export const isUnclothyGenerated = (photoOrFilename) => {
  return false;
};

export const shouldBlurPhoto = (photo, { blurEnabled = true } = {}) => {
  if (!blurEnabled) return false;
  if (!photo || typeof photo !== 'object') return false;

  const override =
    typeof photo.blurOverride === 'string' && photo.blurOverride.trim()
      ? photo.blurOverride.trim()
      : 'auto';

  if (override === 'force_unblur') return false;
  if (override === 'force_blur') return true;

  return photo.nsfwDetected === true;
};

export const getPlayableMediaUrl = (value) => {
  if (!value || typeof value !== 'string') return value;
  if (isAudioUrl(value)) return value;
  if (!isVideoUrl(value)) return value;
  // Cloudinary-only delivery transforms; Neon/public URLs are served as stored.
  if (!isCloudinaryMediaUrl(value) || !value.includes('/video/upload/')) return value;

  const [withoutQuery, query] = value.split('?');
  const transformed = withoutQuery
    .replace('/video/upload/', '/video/upload/f_mp4,vc_h264,ac_aac,q_auto/')
    .replace(/\.(mov|mkv|webm)$/i, '.mp4');

  return query ? `${transformed}?${query}` : transformed;
};

export const getVideoPosterUrl = (value) => {
  if (!isVideoUrl(value) || !isCloudinaryMediaUrl(value) || !value.includes('/video/upload/')) {
    return '';
  }

  const [withoutQuery, query] = value.split('?');
  const posterBase = withoutQuery
    .replace('/video/upload/', '/video/upload/so_0,f_jpg,q_auto/')
    .replace(/\.(mp4|mov|webm|mkv)$/i, '.jpg');

  return query ? `${posterBase}?${query}` : posterBase;
};
