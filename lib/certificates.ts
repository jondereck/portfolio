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

export const CERTIFICATE_SORT_MODES = [
  { value: 'default', label: 'Featured · arranged' },
  { value: 'issued-newest', label: 'Issued · newest' },
  { value: 'issued-oldest', label: 'Issued · oldest' },
  { value: 'added-newest', label: 'Added · newest' },
  { value: 'added-oldest', label: 'Added · oldest' },
  { value: 'title-asc', label: 'Title · A–Z' },
  { value: 'title-desc', label: 'Title · Z–A' },
  { value: 'issuer-asc', label: 'Issuer · A–Z' },
] as const;

export type CertificateSortMode = (typeof CERTIFICATE_SORT_MODES)[number]['value'];

const toTime = (value: unknown) => {
  const parsed = Date.parse(typeof value === 'string' ? value : '');
  return Number.isFinite(parsed) ? parsed : null;
};

const compareText = (left: unknown, right: unknown) =>
  String(left ?? '')
    .trim()
    .localeCompare(String(right ?? '').trim(), undefined, { sensitivity: 'base' });

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

/** Sort within a list (does not change Featured vs Regular grouping). */
export function sortCertificatesByMode(list: any[], mode: CertificateSortMode | string = 'default') {
  const next = Array.isArray(list) ? [...list] : [];

  if (mode === 'default') {
    return next.sort(compareCertificatesForDisplay);
  }

  next.sort((left, right) => {
    switch (mode) {
      case 'issued-newest':
      case 'issued-oldest': {
        const leftIssued = toTime(left?.issuedAt);
        const rightIssued = toTime(right?.issuedAt);
        if (leftIssued !== null && rightIssued !== null && leftIssued !== rightIssued) {
          return mode === 'issued-newest' ? rightIssued - leftIssued : leftIssued - rightIssued;
        }
        if (leftIssued !== null && rightIssued === null) return -1;
        if (leftIssued === null && rightIssued !== null) return 1;
        break;
      }
      case 'added-newest':
      case 'added-oldest': {
        const leftAdded = toTime(left?.createdAt) ?? toTime(left?.updatedAt);
        const rightAdded = toTime(right?.createdAt) ?? toTime(right?.updatedAt);
        if (leftAdded !== null && rightAdded !== null && leftAdded !== rightAdded) {
          return mode === 'added-newest' ? rightAdded - leftAdded : leftAdded - rightAdded;
        }
        if (leftAdded !== null && rightAdded === null) return -1;
        if (leftAdded === null && rightAdded !== null) return 1;
        break;
      }
      case 'title-asc':
        return compareText(left?.title, right?.title) || Number(left?.id ?? 0) - Number(right?.id ?? 0);
      case 'title-desc':
        return compareText(right?.title, left?.title) || Number(left?.id ?? 0) - Number(right?.id ?? 0);
      case 'issuer-asc':
        return compareText(left?.issuer, right?.issuer) || compareText(left?.title, right?.title);
      default:
        break;
    }

    return Number(left?.id ?? 0) - Number(right?.id ?? 0);
  });

  return next;
}

/** @deprecated Use compareCertificatesForDisplay — kept for older imports. */
export function compareCertificatesByIssuedAtDesc(left: any, right: any) {
  return compareCertificatesForDisplay(left, right);
}
