'use client';

import { useRef, useState } from 'react';
import { CloudUpload, FolderInput } from 'lucide-react';
import GalleryBatchResultSummary from './GalleryBatchResultSummary';
import GalleryBatchProgressCard from './GalleryBatchProgressCard';

export default function GalleryUploadDropzone({
  title = 'Upload files',
  description = 'Drag and drop images, videos, or audio here, or choose files from your device.',
  helpText = 'Uploads go directly into the selected album.',
  uploadLabel = 'Choose files',
  buttonTone = 'outline',
  buttonClassName = '',
  uploading = false,
  uploadProgress = null,
  uploadSummary = null,
  onUploadFiles,
}) {
  const inputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  const openPicker = () => {
    inputRef.current?.click();
  };

  const handleFiles = async (files) => {
    const nextFiles = Array.from(files || []);
    if (nextFiles.length === 0) return;

    await onUploadFiles?.(nextFiles);
  };

  const hasSummary = uploadSummary && uploadSummary.totalFiles > 0;
  const isPrimary = buttonTone === 'primary';

  const baseButtonClassName = isPrimary
    ? 'inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-50 dark:text-slate-900 dark:hover:bg-slate-200'
    : 'inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 sm:w-auto';

  return (
    <div
      className={`rounded-xl border border-dashed p-3 transition sm:p-4 ${
        isDragging
          ? 'border-sky-400 bg-sky-50 dark:border-sky-500/60 dark:bg-sky-950/20'
          : 'border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-950/30'
      }`}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={async (event) => {
        event.preventDefault();
        setIsDragging(false);
        await handleFiles(event.dataTransfer.files);
      }}
    >
      <div className="flex items-start gap-3">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 sm:size-10">
          <CloudUpload className="size-4 sm:size-5" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p>
          <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{helpText}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <button
          type="button"
          className={`${baseButtonClassName} ${buttonClassName}`}
          onClick={openPicker}
          disabled={uploading}
        >
          <FolderInput className="size-4" />
          {uploadLabel}
        </button>

        {!uploading ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {hasSummary
              ? `Last batch: ${uploadSummary.uploadedCount} uploaded · ${uploadSummary.skippedCount} skipped · ${uploadSummary.failedCount} failed`
              : 'Drop files anywhere in this box.'}
          </p>
        ) : null}
      </div>

      {uploading && uploadProgress ? (
        <GalleryBatchProgressCard
          progress={uploadProgress}
          heading="Upload in progress"
          currentItemFallback="Uploading file"
          currentItemTitle={uploadProgress.currentFileName || 'Uploading file'}
          itemUnit="file"
          className="mt-4"
        />
      ) : null}

      {hasSummary ? (
        <GalleryBatchResultSummary summary={uploadSummary} className="mt-4" />
      ) : null}

      <input
        ref={inputRef}
        className="hidden"
        type="file"
        accept="image/*,video/*,audio/*"
        multiple
        disabled={uploading}
        onChange={async (event) => {
          await handleFiles(event.target.files);
          event.target.value = '';
        }}
      />
    </div>
  );
}
