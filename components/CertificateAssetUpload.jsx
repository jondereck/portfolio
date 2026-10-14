'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { FileText, Loader2, Upload } from 'lucide-react';
import { handleRequest } from '@/lib/handleRequest';
import { isPdfAssetUrl } from '@/lib/certificates';

const acceptedTypes = 'image/png,image/jpeg,image/webp,image/gif,application/pdf';

export default function CertificateAssetUpload({ id = 'certificate-asset-upload', label = 'Certificate File', value, onApply }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [warnings, setWarnings] = useState([]);
  const [sourceAssetUrl, setSourceAssetUrl] = useState('');
  const assetUrl = typeof value === 'string' ? value.trim() : '';
  const isPdf = isPdfAssetUrl(assetUrl);

  const openFilePicker = () => {
    inputRef.current?.click();
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const formData = new FormData();
    formData.append('assetFile', file);

    setUploading(true);
    setWarnings([]);
    const toastId = toast.loading('Uploading and extracting certificate data...');

    try {
      const result = await handleRequest(() =>
        fetch('/api/certificates/extract', {
          method: 'POST',
          body: formData,
        }),
      );

      const extractedFields = result?.extractedFields && typeof result.extractedFields === 'object' ? result.extractedFields : {};
      const assetUrl = typeof result?.assetUrl === 'string' ? result.assetUrl : '';
      const assetOpenUrl =
        typeof result?.assetOpenUrl === 'string' && result.assetOpenUrl.trim() ? result.assetOpenUrl.trim() : assetUrl;
      const thumbnailUrl = typeof result?.thumbnailUrl === 'string' && result.thumbnailUrl.trim() ? result.thumbnailUrl.trim() : assetUrl;
      setSourceAssetUrl(assetOpenUrl);
      const nextFields = {
        // For PDFs, page-1 JPG snapshot (Neon/Cloudinary); for images, the asset URL.
        image: thumbnailUrl,
        // Prefer extracted verify link; otherwise open the original PDF (not the JPG).
        link:
          typeof extractedFields.link === 'string' && extractedFields.link
            ? extractedFields.link
            : result?.assetKind === 'pdf'
              ? assetOpenUrl || assetUrl || thumbnailUrl || ''
              : assetOpenUrl || assetUrl || '',
      };

      for (const key of ['title', 'issuer', 'category', 'issuedAt', 'expiresAt', 'credentialId']) {
        if (typeof extractedFields[key] === 'string' && extractedFields[key]) {
          nextFields[key] = extractedFields[key];
        }
      }

      if (!nextFields.category) {
        nextFields.category = 'General';
      }

      onApply(nextFields);
      const nextWarnings = Array.isArray(result?.warnings) ? result.warnings.map((item) => String(item)).filter(Boolean) : [];
      setWarnings(nextWarnings);
      toast.success('Certificate asset uploaded.', { id: toastId });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Certificate upload failed.';
      toast.error(message, { id: toastId });
    } finally {
      setUploading(false);
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    }
  };

  return (
    <div className="space-y-3">
      <input ref={inputRef} id={id} type="file" accept={acceptedTypes} className="hidden" onChange={handleFileChange} />

      <button
        type="button"
        onClick={openFilePicker}
        disabled={uploading}
        className="flex min-h-32 w-full items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:hover:border-slate-600 dark:hover:bg-slate-900"
      >
        <div className="space-y-2">
          <div className="flex justify-center">
            {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
          </div>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {uploading ? 'Uploading and extracting…' : assetUrl ? 'Replace certificate image or PDF' : 'Upload certificate image or PDF'}
          </p>
          <p className="text-xs text-slate-500">PNG, JPG, WEBP, GIF, or PDF. The form will auto-fill after upload.</p>
        </div>
      </button>

      {assetUrl ? (
        isPdf ? (
          <div className="rounded-xl border bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-950">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-rose-100 p-3 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">
                <FileText className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">PDF certificate uploaded</p>
                <a href={assetUrl} target="_blank" rel="noreferrer" className="block truncate text-xs text-cyan-600 hover:underline dark:text-cyan-300">
                  {assetUrl}
                </a>
              </div>
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-slate-100 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex min-h-[180px] max-h-[320px] items-center justify-center p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={assetUrl} alt={`${label} preview`} className="max-h-[300px] max-w-full object-contain" />
            </div>
          </div>
        )
      ) : null}

      {sourceAssetUrl && isPdfAssetUrl(sourceAssetUrl) ? (
        <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950">
          <span className="text-slate-500 dark:text-slate-400">Original uploaded file:</span>{' '}
          <a href={sourceAssetUrl} target="_blank" rel="noreferrer" className="text-cyan-600 hover:underline dark:text-cyan-300">
            Open PDF
          </a>
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          {warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
