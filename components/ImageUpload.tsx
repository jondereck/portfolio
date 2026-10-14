/* eslint-disable @next/next/no-img-element */
'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';

type ImageUploadProps = {
  id?: string;
  label?: string;
  value: string;
  onChange: (url: string) => void;
  className?: string;
  cropAspectRatio?: number;
};

const dropzoneBaseStyles =
  'group flex min-h-32 cursor-pointer items-center justify-center rounded-md border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm transition dark:border-slate-700 dark:bg-slate-950';

const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

export default function ImageUpload({
  id = 'image-upload',
  label = 'Image',
  value,
  onChange,
  className,
}: ImageUploadProps) {
  const [uploadError, setUploadError] = useState('');
  const [isDragActive, setIsDragActive] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const uploadToastIdRef = useRef<string | number | null>(null);
  const previewUrl = typeof value === 'string' ? value.trim() : '';

  const dismissUploadToast = () => {
    if (uploadToastIdRef.current !== null) {
      toast.dismiss(uploadToastIdRef.current);
      uploadToastIdRef.current = null;
    }
  };

  const uploadFile = async (file: File) => {
    if (!ALLOWED_TYPES.has(file.type)) {
      setUploadError('Use PNG, JPG, WEBP, or GIF.');
      toast.error('Unsupported image type');
      return;
    }

    setUploadError('');
    setIsUploading(true);
    dismissUploadToast();
    uploadToastIdRef.current = toast.loading('Uploading image...');

    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Image upload failed');
      }

      const uploadedUrl =
        (typeof payload?.playback_url === 'string' && payload.playback_url) ||
        (typeof payload?.secure_url === 'string' && payload.secure_url) ||
        '';

      if (!uploadedUrl) {
        throw new Error('Image upload failed');
      }

      onChange(uploadedUrl);
      toast.success('Image uploaded');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Image upload failed';
      setUploadError(message);
      toast.error(message);
    } finally {
      dismissUploadToast();
      setIsUploading(false);
    }
  };

  const openPicker = () => {
    if (isUploading) return;
    inputRef.current?.click();
  };

  return (
    <label htmlFor={id} className={`flex flex-col space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200 ${className ?? ''}`}>
      {label}
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="sr-only"
        disabled={isUploading}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) {
            void uploadFile(file);
          }
        }}
      />
      {previewUrl ? (
        <div
          role="button"
          tabIndex={0}
          onClick={openPicker}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              openPicker();
            }
          }}
          className="overflow-hidden rounded-xl border bg-slate-100 dark:bg-slate-900"
        >
          <div className="flex min-h-[180px] max-h-[320px] items-center justify-center p-2">
            <img src={previewUrl} alt={`${label} preview`} className="max-h-[300px] max-w-full object-contain" />
          </div>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={openPicker}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              openPicker();
            }
          }}
          onDragEnter={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setIsDragActive(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setIsDragActive(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setIsDragActive(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setIsDragActive(false);
            const file = event.dataTransfer.files?.[0];
            if (file) {
              void uploadFile(file);
            }
          }}
          className={`${dropzoneBaseStyles} ${isDragActive ? 'border-slate-900 bg-slate-50 dark:border-slate-100 dark:bg-slate-900' : ''}`}
        >
          <div className="space-y-1">
            <p className="font-medium text-slate-700 dark:text-slate-200">
              {isUploading ? 'Uploading…' : 'Click or drag and drop to upload'}
            </p>
            <p className="text-xs text-slate-500">Single image only</p>
          </div>
        </div>
      )}
      {previewUrl ? (
        <div
          role="button"
          tabIndex={0}
          onClick={openPicker}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              openPicker();
            }
          }}
          className="rounded-md border border-dashed border-slate-300 px-3 py-2 text-center text-xs text-slate-500 transition hover:border-slate-400 dark:border-slate-700 dark:text-slate-400 dark:hover:border-slate-600"
        >
          Click to replace image
        </div>
      ) : null}
      {uploadError ? <span className="text-xs text-red-600">{uploadError}</span> : null}
    </label>
  );
}
