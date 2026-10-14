import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import { isSafeHttpUrl } from '@/lib/url-safety';
import { RequestValidationError } from '@/lib/server/uploads';

const certificateExtractionSchema = z.object({
  title: z.string().nullable(),
  issuer: z.string().nullable(),
  category: z.string().nullable(),
  issuedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  credentialId: z.string().nullable(),
  link: z.string().nullable(),
  qrLink: z.string().nullable(),
  qrCredentialId: z.string().nullable(),
});

const certificateExtractionPrompt = [
  'Extract certificate metadata from the provided certificate image or PDF.',
  'Return only fields you can infer directly from the document or an explicit verification URL shown in the document.',
  'Do not hallucinate or invent values that are not supported by the document.',
  'Use null when a value is missing.',
  'For title, use the certificate/course/program name.',
  'For issuer, use the organization that issued the certificate.',
  'For category, choose exactly one best category from: Frontend, Backend, Fullstack, Cloud, Data, Design, Security, DevOps, AI/ML, Mobile, General.',
  'For dates: extract all visible dates and interpret them.',
  'If only one date exists, treat it as issuedAt (not expiresAt).',
  'If there are two dates (issued and expiry/valid until), map earlier date to issuedAt and later date to expiresAt.',
  'Return dates as YYYY-MM-DD only when the exact day is present; otherwise return null.',
  'For credentialId, return the visible credential or certificate identifier.',
  'For link, return a visible public verification URL from the document; if none is shown, return null.',
  'If there is a QR code, decode it if possible.',
  'If the QR decodes to a URL, return it as qrLink.',
  'If the QR decodes to an ID or text code, return it as qrCredentialId.',
  'Do not guess QR contents if you cannot decode it.',
].join(' ');

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

function normalizeOptionalText(value: string | null | undefined) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizeDateString(value: string | null | undefined) {
  const normalized = normalizeOptionalText(value);
  if (!normalized) {
    return undefined;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return undefined;
  }

  // The admin form's date fields expect YYYY-MM-DD (it serializes to ISO on submit).
  const timestamp = Date.parse(`${normalized}T00:00:00.000Z`);
  return Number.isFinite(timestamp) ? normalized : undefined;
}

export async function extractCertificateFieldsFromAsset(options: {
  assetUrl: string;
  filename: string;
  /** Prefer a data URL / base64 image so extraction does not depend on fetching storage URLs. */
  imageDataUrl?: string | null;
}) {
  if (!openai) {
    throw new RequestValidationError(
      'Certificate extraction is not configured. Set OPENAI_API_KEY.',
      500,
      undefined,
      'OPENAI_NOT_CONFIGURED',
    );
  }

  const imageUrl =
    typeof options.imageDataUrl === 'string' && options.imageDataUrl.trim()
      ? options.imageDataUrl.trim()
      : options.assetUrl;

  if (!imageUrl) {
    throw new RequestValidationError(
      'Certificate image is required for extraction.',
      400,
      { assetFile: ['Upload an image or PDF certificate.'] },
      'CERTIFICATE_IMAGE_REQUIRED',
    );
  }

  const assetInput = {
    type: 'input_image',
    image_url: imageUrl,
    detail: 'high',
  };

  const response = await openai.responses.parse({
    model: process.env.OPENAI_CERTIFICATE_EXTRACTION_MODEL || 'gpt-4o-mini',
    input: [
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: `${certificateExtractionPrompt} Filename: ${options.filename || 'unknown'}.`,
          },
          assetInput as any,
        ],
      },
    ],
    text: {
      format: zodTextFormat(certificateExtractionSchema, 'certificate_extraction'),
    },
  });

  const parsed = response.output_parsed;
  if (!parsed) {
    throw new RequestValidationError('Certificate extraction failed.', 502, undefined, 'CERTIFICATE_EXTRACTION_FAILED');
  }

  const extractedFields = {
    title: normalizeOptionalText(parsed.title),
    issuer: normalizeOptionalText(parsed.issuer),
    category: normalizeOptionalText(parsed.category),
    issuedAt: normalizeDateString(parsed.issuedAt),
    expiresAt: normalizeDateString(parsed.expiresAt),
    credentialId: normalizeOptionalText(parsed.credentialId),
    link: isSafeHttpUrl(parsed.link) ? parsed.link.trim() : undefined,
    qrLink: isSafeHttpUrl(parsed.qrLink) ? parsed.qrLink.trim() : undefined,
    qrCredentialId: normalizeOptionalText(parsed.qrCredentialId),
  };

  const warnings = [];

  // Date sanity:
  // - If only one date was extracted (and it landed in expiresAt), treat it as issuedAt.
  // - If both exist but reversed, swap.
  if (!extractedFields.issuedAt && extractedFields.expiresAt) {
    extractedFields.issuedAt = extractedFields.expiresAt;
    extractedFields.expiresAt = undefined;
  } else if (extractedFields.issuedAt && extractedFields.expiresAt) {
    const issuedTs = Date.parse(`${extractedFields.issuedAt}T00:00:00.000Z`);
    const expiresTs = Date.parse(`${extractedFields.expiresAt}T00:00:00.000Z`);
    if (Number.isFinite(issuedTs) && Number.isFinite(expiresTs) && expiresTs < issuedTs) {
      const tmp = extractedFields.issuedAt;
      extractedFields.issuedAt = extractedFields.expiresAt;
      extractedFields.expiresAt = tmp;
    }
  }

  if (!extractedFields.category) {
    extractedFields.category = 'General';
  }

  // Prefer QR values when present.
  if (extractedFields.qrLink) {
    extractedFields.link = extractedFields.qrLink;
    if (!extractedFields.qrCredentialId && !extractedFields.credentialId) {
      extractedFields.qrCredentialId = extractedFields.qrLink;
    }
  }
  if (extractedFields.qrCredentialId) {
    extractedFields.credentialId = extractedFields.qrCredentialId;
  }

  if (!extractedFields.title) {
    warnings.push('Certificate title could not be extracted confidently.');
  }
  if (!extractedFields.issuer) {
    warnings.push('Certificate issuer could not be extracted confidently.');
  }
  if (!extractedFields.link) {
    warnings.push('No verification URL was found in the document. The uploaded asset URL will be used as the reference link.');
  }

  return { extractedFields, warnings };
}
