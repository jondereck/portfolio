import { NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';
import { canAccessAdminModuleAction } from '@/lib/auth/module-access';
import { toAuthErrorResponse } from '@/lib/auth/responses';
import { isPdfAssetUrl } from '@/lib/certificates';
import { resolveManagedProfileFromRequest } from '@/lib/profile/resolve-profile';
import { toErrorResponse } from '@/lib/server/api-responses';
import { extractCertificateFieldsFromAsset } from '@/lib/server/certificate-extraction';
import { createFieldErrorResponse, createFormErrorResponse } from '@/lib/server/form-responses';
import { STORAGE_PROVIDER_NEON, uploadObjectBuffer } from '@/lib/server/object-storage';
import { renderPdfPagePreview } from '@/lib/server/pdf-preview';
import { isRateLimited } from '@/lib/server/rate-limit';
import { RequestValidationError, uploadCertificateAssetFile } from '@/lib/server/uploads';

export const runtime = 'nodejs';

const configureCloudinary = () => {
  const cloudName =
    process.env.CLOUDINARY_NAME ||
    process.env.CLOUDINARY_CLOUD_NAME ||
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_KEY || process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_SECRET || process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return null;
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
  });

  return { cloudName, apiKey, apiSecret };
};

const isFile = (value: FormDataEntryValue | null): value is File => {
  return typeof File !== 'undefined' && value instanceof File;
};

const previewFilenameFromPdf = (filename: string) => {
  const base = filename.replace(/\.[^.]+$/i, '').trim() || 'certificate';
  return `${base}-preview.jpg`;
};

const toJpegDataUrl = (buffer: Buffer) => `data:image/jpeg;base64,${buffer.toString('base64')}`;

const toImageDataUrl = (buffer: Buffer, mimeType: string) => {
  const mime = (mimeType || 'image/jpeg').toLowerCase();
  const safeMime = mime.startsWith('image/') ? mime : 'image/jpeg';
  return `data:${safeMime};base64,${buffer.toString('base64')}`;
};

export async function POST(request: Request) {
  if (await isRateLimited(request, 'admin-mutation', 120, 60_000)) {
    return createFormErrorResponse({ error: 'Too many requests. Try again later.', errorCode: 'RATE_LIMITED' }, 429);
  }

  try {
    const { actor } = await resolveManagedProfileFromRequest(request);
    if (!(await canAccessAdminModuleAction(actor.user.role, 'portfolio', 'createUpdate'))) {
      return createFormErrorResponse({ error: 'You are not allowed to extract certificate data.', errorCode: 'FORBIDDEN' }, 403);
    }

    const formData = await request.formData();
    const assetFile = formData.get('assetFile');

    if (!isFile(assetFile)) {
      return createFieldErrorResponse({ field: 'assetFile', message: 'Choose an image or PDF file to upload.', errorCode: 'FILE_REQUIRED' });
    }

    const looksLikePdf = assetFile.type === 'application/pdf' || assetFile.name.toLowerCase().endsWith('.pdf');
    const sourceBuffer = Buffer.from(await assetFile.arrayBuffer());
    const pdfBuffer = looksLikePdf ? sourceBuffer : null;
    // Re-wrap so upload + preview share one buffer (File.arrayBuffer may be one-shot in some runtimes).
    const fileForUpload = new File([sourceBuffer], assetFile.name, {
      type: assetFile.type || (looksLikePdf ? 'application/pdf' : 'application/octet-stream'),
    });

    const uploaded = await uploadCertificateAssetFile(fileForUpload, 'portfolio/certificates');
    const assetUrl = uploaded.secureUrl;
    const isPdfUpload = Boolean(pdfBuffer) || looksLikePdf || uploaded.format === 'pdf';
    let extractedFields = {};
    let warnings: string[] = [];
    let thumbnailUrl = assetUrl;
    let assetOpenUrl = assetUrl;
    let extractionImageDataUrl: string | null = null;

    // Cloudinary PDFs: signed page-1 JPG delivery URL.
    if (isPdfUpload && uploaded.publicId) {
      const configured = configureCloudinary();
      if (configured) {
        const resourceType = uploaded.resourceType === 'raw' ? 'raw' : 'image';
        assetOpenUrl = cloudinary.url(uploaded.publicId, {
          secure: true,
          sign_url: true,
          resource_type: resourceType,
          format: uploaded.format || 'pdf',
        });

        thumbnailUrl = cloudinary.url(uploaded.publicId, {
          secure: true,
          sign_url: true,
          resource_type: 'image',
          transformation: [{ fetch_format: 'jpg', page: 1, quality: 'auto' }],
        });
      }
    }

    // Neon PDFs: render page 1 locally, upload that JPG as the card/AI image (PDF stays as open/link fallback).
    if (isPdfUpload && uploaded.storageProvider === STORAGE_PROVIDER_NEON && pdfBuffer) {
      assetOpenUrl = assetUrl;
      const previewJpeg = await renderPdfPagePreview(pdfBuffer);
      if (!previewJpeg) {
        throw new RequestValidationError(
          'Could not create an image preview from this PDF. Upload a PNG/JPG screenshot of the certificate instead.',
          422,
          { assetFile: ['PDF preview failed.'] },
          'PDF_PREVIEW_FAILED',
        );
      }

      try {
        const previewUpload = await uploadObjectBuffer({
          body: previewJpeg,
          folder: 'portfolio/certificates',
          contentType: 'image/jpeg',
          filename: previewFilenameFromPdf(assetFile.name),
        });
        thumbnailUrl = previewUpload.publicUrl;
        extractionImageDataUrl = toJpegDataUrl(previewJpeg);
      } catch (error) {
        throw new RequestValidationError(
          error instanceof Error && error.message
            ? `PDF preview upload failed: ${error.message}`
            : 'PDF preview upload failed.',
          502,
          { assetFile: ['Could not store certificate preview image.'] },
          'PDF_PREVIEW_UPLOAD_FAILED',
        );
      }
    }

    // Non-PDF images: feed bytes directly so AI does not need to fetch Neon/Cloudinary URLs.
    if (!isPdfUpload && sourceBuffer.length) {
      extractionImageDataUrl = toImageDataUrl(sourceBuffer, assetFile.type || 'image/jpeg');
    }

    try {
      const extractionResult = await extractCertificateFieldsFromAsset({
        assetUrl: thumbnailUrl,
        filename: assetFile.name,
        imageDataUrl: extractionImageDataUrl,
      });
      extractedFields = extractionResult.extractedFields;
      warnings = [...warnings, ...(extractionResult.warnings || [])];
    } catch (error) {
      warnings = [
        ...warnings,
        error instanceof Error ? error.message : 'Certificate details could not be extracted. You can still fill the form manually.',
      ];
    }

    return NextResponse.json({
      assetUrl,
      assetOpenUrl,
      thumbnailUrl,
      assetKind: isPdfUpload || isPdfAssetUrl(assetUrl) ? 'pdf' : 'image',
      extractedFields,
      warnings,
    });
  } catch (error) {
    const authError = toAuthErrorResponse(error);
    if (authError) {
      return authError;
    }
    return toErrorResponse(error, 'Unable to extract certificate data.');
  }
}
