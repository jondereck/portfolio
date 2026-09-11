'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Download, Loader2, Search, ShieldAlert } from 'lucide-react';

const cardStyles =
  'rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-4';
const panelStyles =
  'rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/40 sm:p-4';
const inputStyles =
  'h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-slate-500 dark:focus:ring-slate-800';
const primaryButton =
  'inline-flex h-11 items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white';
const secondaryButton =
  'inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900';

function formatBytes(value) {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num) || num <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = num;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size >= 10 ? size.toFixed(0) : size.toFixed(1)} ${units[unitIndex]}`;
}

function parseFilenameFromContentDisposition(value) {
  if (!value || typeof value !== 'string') return null;
  const match = value.match(/filename\\*=(?:UTF-8'')?([^;]+)|filename=\"?([^\";]+)\"?/i);
  const raw = (match?.[1] || match?.[2] || '').trim();
  if (!raw) return null;
  try {
    return decodeURIComponent(raw.replace(/^\"|\"$/g, ''));
  } catch {
    return raw.replace(/^\"|\"$/g, '');
  }
}

export default function MediaScraperPanel() {
  const [url, setUrl] = useState('');
  const [confirmRights, setConfirmRights] = useState(false);
  const [useHeadless, setUseHeadless] = useState(false);
  const [ignoreHttpsErrors, setIgnoreHttpsErrors] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [selected, setSelected] = useState(() => new Set());

  const selectableItems = useMemo(() => {
    const items = Array.isArray(preview?.items) ? preview.items : [];
    return items.filter((item) => item && typeof item.url === 'string');
  }, [preview]);

  const selectedCount = selected.size;
  const canPreview = confirmRights && url.trim().length > 0 && !loadingPreview && !downloading;
  const canDownload = confirmRights && selectedCount > 0 && preview?.pageUrl && !downloading && !loadingPreview;

  const toggleSelectAll = (checked) => {
    if (!checked) {
      setSelected(new Set());
      return;
    }

    const next = new Set();
    for (const item of selectableItems) {
      if (item.blockedReason) continue;
      if (item.kind !== 'image' && item.kind !== 'video') continue;
      next.add(item.url);
    }
    setSelected(next);
  };

  const toggleOne = (itemUrl) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(itemUrl)) next.delete(itemUrl);
      else next.add(itemUrl);
      return next;
    });
  };

  const runPreview = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    if (!confirmRights) {
      toast.error('Confirm you have permission before previewing.');
      return;
    }

    setLoadingPreview(true);
    setPreview(null);
    setSelected(new Set());

    try {
      const response = await fetch('/api/admin/media-scrape/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed, useHeadless, ignoreHttpsErrors: useHeadless ? ignoreHttpsErrors : false, maxItems: 50 }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Preview failed.');
      }

      setPreview(payload);
      const autoSelect = new Set();
      for (const item of Array.isArray(payload?.items) ? payload.items : []) {
        if (!item || typeof item.url !== 'string') continue;
        if (item.blockedReason) continue;
        if (item.kind !== 'image' && item.kind !== 'video') continue;
        autoSelect.add(item.url);
      }
      setSelected(autoSelect);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Preview failed.');
    } finally {
      setLoadingPreview(false);
    }
  };

  const runDownload = async () => {
    if (!preview?.pageUrl) return;
    if (!confirmRights) {
      toast.error('Confirm you have permission before downloading.');
      return;
    }

    const urls = Array.from(selected);
    if (urls.length === 0) return;

    setDownloading(true);
    try {
      const response = await fetch('/api/admin/media-scrape/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageUrl: preview.pageUrl,
          items: urls,
          useHeadless,
          ignoreHttpsErrors: useHeadless ? ignoreHttpsErrors : false,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || 'Download failed.');
      }

      const blob = await response.blob();
      const suggestedName =
        parseFilenameFromContentDisposition(response.headers.get('content-disposition')) || 'media.zip';
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = suggestedName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
      toast.success('ZIP download started.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Download failed.');
    } finally {
      setDownloading(false);
    }
  };

  const allSelectableCount = useMemo(() => {
    return selectableItems.filter((item) => !item.blockedReason && (item.kind === 'image' || item.kind === 'video')).length;
  }, [selectableItems]);

  return (
    <div className="space-y-4">
      <section className={cardStyles}>
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">Media Scraper</h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
              Paste a page URL, preview detected media, then download a ZIP. Use this only for content you own or have explicit permission to download.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
            <input
              className={inputStyles}
              type="url"
              placeholder="https://example.com/page"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
            <button type="button" className={primaryButton} disabled={!canPreview} onClick={runPreview}>
              {loadingPreview ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              Preview
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                checked={confirmRights}
                onChange={(event) => setConfirmRights(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400 dark:border-slate-700"
              />
              I confirm I have permission/rights to download this content
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                checked={useHeadless}
                onChange={(event) => setUseHeadless(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400 dark:border-slate-700"
              />
              Use headless browser (JS-rendered pages)
            </label>
            <label className={`flex items-center gap-2 text-sm ${useHeadless ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500'}`}>
              <input
                type="checkbox"
                checked={ignoreHttpsErrors}
                disabled={!useHeadless}
                onChange={(event) => setIgnoreHttpsErrors(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700"
              />
              Ignore HTTPS errors (insecure)
            </label>
          </div>
        </div>
      </section>

      <section className={panelStyles}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-950 dark:text-slate-50">Preview</h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {preview?.title ? (
                  <>
                    <span className="font-medium text-slate-700 dark:text-slate-200">Title:</span> {preview.title}
                  </>
                ) : (
                  'Run a preview to see detected media.'
                )}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                className={secondaryButton}
                disabled={loadingPreview || downloading || selectableItems.length === 0}
                onClick={() => toggleSelectAll(selected.size !== allSelectableCount)}
                title="Select all supported items"
              >
                {selected.size === allSelectableCount ? 'Clear selection' : 'Select all'}
              </button>
              <button type="button" className={primaryButton} disabled={!canDownload} onClick={runDownload}>
                {downloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                Download ZIP ({selectedCount})
              </button>
            </div>
          </div>

          {selectableItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              <div className="flex items-start gap-3">
                <ShieldAlert className="mt-0.5 h-5 w-5 text-slate-500 dark:text-slate-300" />
                <div>
                  <p className="font-medium text-slate-800 dark:text-slate-100">No items loaded</p>
                  <p className="mt-1">
                    If the page is JS-rendered, enable the headless option. If the server blocks previews, you may see an error.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid gap-3">
              {selectableItems.map((item) => {
                const itemUrl = item.url;
                const disabled = Boolean(item.blockedReason) || (item.kind !== 'image' && item.kind !== 'video');
                const checked = selected.has(itemUrl);
                const sizeLabel = item.contentLength ? formatBytes(item.contentLength) : '';
                const badge =
                  item.kind === 'image'
                    ? 'bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-200'
                    : item.kind === 'video'
                      ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-200'
                      : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200';

                return (
                  <div
                    key={itemUrl}
                    className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 ${
                      disabled ? 'opacity-70' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400 dark:border-slate-700"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => toggleOne(itemUrl)}
                        aria-label={`Select ${itemUrl}`}
                      />

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${badge}`}>
                            {item.kind || 'unknown'}
                          </span>
                          {sizeLabel ? (
                            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{sizeLabel}</span>
                          ) : null}
                        </div>

                        <p className="mt-2 break-all text-sm text-slate-700 dark:text-slate-200">{itemUrl}</p>

                        {item.blockedReason ? (
                          <p className="mt-2 text-xs text-rose-600 dark:text-rose-300">{item.blockedReason}</p>
                        ) : null}

                        {item.kind === 'image' && !item.blockedReason ? (
                          <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/30">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={itemUrl}
                              alt=""
                              className="h-28 w-full object-cover"
                              loading="lazy"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
