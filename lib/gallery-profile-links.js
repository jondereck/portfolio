/**
 * Detect a social platform from a pasted profile URL.
 * Returns one of: instagram | facebook | tiktok | youtube | x | linkedin | website | other
 */
export function detectProfileLinkPlatform(url) {
  if (typeof url !== 'string') return 'other';
  const trimmed = url.trim();
  if (!trimmed) return 'other';

  let host = '';
  try {
    const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    host = new URL(normalized).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    const lowered = trimmed.toLowerCase();
    if (lowered.includes('instagram')) return 'instagram';
    if (lowered.includes('tiktok')) return 'tiktok';
    if (lowered.includes('facebook') || lowered.includes('fb.com')) return 'facebook';
    if (lowered.includes('youtube') || lowered.includes('youtu.be')) return 'youtube';
    if (lowered.includes('linkedin')) return 'linkedin';
    if (lowered.includes('twitter') || /(^|[^a-z])x\.com/.test(lowered)) return 'x';
    return 'other';
  }

  if (host === 'instagram.com' || host.endsWith('.instagram.com')) return 'instagram';
  if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) return 'tiktok';
  if (host === 'facebook.com' || host.endsWith('.facebook.com') || host === 'fb.com' || host.endsWith('.fb.com')) {
    return 'facebook';
  }
  if (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be') return 'youtube';
  if (host === 'linkedin.com' || host.endsWith('.linkedin.com')) return 'linkedin';
  if (host === 'twitter.com' || host.endsWith('.twitter.com') || host === 'x.com' || host.endsWith('.x.com')) {
    return 'x';
  }
  if (host.includes('.')) return 'website';
  return 'other';
}
