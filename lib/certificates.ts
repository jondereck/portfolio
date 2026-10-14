export function isPdfAssetUrl(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  try {
    const parsed = new URL(trimmed);
    const pathname = parsed.pathname.toLowerCase();
    return pathname.endsWith('.pdf') || parsed.searchParams.get('format')?.toLowerCase() === 'pdf';
  } catch {
    return trimmed.toLowerCase().includes('.pdf');
  }
}

export function toCloudinaryPdfPreviewUrl(assetUrl: string) {
  try {
    const parsed = new URL(assetUrl);
    if (!parsed.hostname.endsWith('res.cloudinary.com')) {
      return null;
    }

    // Common Cloudinary URLs: /image/upload/... or /raw/upload/...
    // Insert a transform to render the first page as JPG.
    const nextPathname = parsed.pathname.replace('/upload/', '/upload/f_jpg,pg_1/');
    if (nextPathname === parsed.pathname) {
      return null;
    }

    const next = new URL(parsed.toString());
    next.pathname = nextPathname;
    return next.toString();
  } catch {
    return null;
  }
}

/** Featured first, then manual sortOrder (admin arrange), then id. */
export function compareCertificatesForDisplay(left: any, right: any) {
  const leftFeatured = Boolean(left?.isFeatured);
  const rightFeatured = Boolean(right?.isFeatured);
  if (leftFeatured !== rightFeatured) {
    return leftFeatured ? -1 : 1;
  }

  const leftOrder = Number.isFinite(Number(left?.sortOrder)) ? Number(left.sortOrder) : Number.MAX_SAFE_INTEGER;
  const rightOrder = Number.isFinite(Number(right?.sortOrder)) ? Number(right.sortOrder) : Number.MAX_SAFE_INTEGER;

  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }

  return Number(left?.id ?? 0) - Number(right?.id ?? 0);
}

/** @deprecated Use compareCertificatesForDisplay — kept for older imports. */
export function compareCertificatesByIssuedAtDesc(left: any, right: any) {
  return compareCertificatesForDisplay(left, right);
}
