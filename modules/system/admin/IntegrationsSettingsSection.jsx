'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, ExternalLink, FolderOpen, Globe, Mail, RefreshCw, Settings2, ShieldCheck, Sparkles } from 'lucide-react';
import useSWR from 'swr';
import { toast } from 'sonner';
import AdminSectionHeader from '@/components/admin/shared/AdminSectionHeader';
import AdminStatusBadge from '@/components/admin/shared/AdminStatusBadge';
import FieldErrorText from '@/components/forms/FieldErrorText';
import FormErrorSummary from '@/components/forms/FormErrorSummary';
import { clearFieldErrors, getFieldError, normalizeFormError } from '@/lib/form-client';
import { handleRequest } from '@/lib/handleRequest';
import { notifyRealtimeUpdate, revalidatePublicData } from '@/lib/realtime';
import { cardStyles, fetcher, withFieldError } from '@/modules/system/admin/settingsShared';

const emptyState = {
  contactRecipientEmail: '',
  contactSenderName: '',
  contactSenderEmail: '',
  cloudinaryFolder: '',
  googleDriveImportEnabled: true,
  mediaScrapeEnabled: false,
  unclothyEnabled: false,
  unclothyWorkerEnabled: false,
  unclothyGlobalConcurrentGenerationLimit: '5',
  blurUnclothyGenerated: true,
  defaultGalleryView: 'cinematic',
};

const formId = 'integrations-settings-form';

const sectionStyles = 'rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/40 sm:p-4';
const panelStyles = 'rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900';
const inputBaseStyles =
  'h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-slate-500 dark:focus:ring-slate-800';
const iconInputStyles =
  'h-11 w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-slate-500 dark:focus:ring-slate-800';
const primaryButtonStyles =
  'inline-flex h-11 items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white';
const secondaryButtonStyles =
  'inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900';

function SectionTitle({ icon: Icon, title, description }) {
  return (
    <div className="flex items-start gap-3">
      <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-slate-950 dark:text-slate-50">{title}</h3>
        {description ? <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p> : null}
      </div>
    </div>
  );
}

function TextField({ label, icon: Icon, error, className = '', ...props }) {
  return (
    <label className={`flex flex-col gap-2 text-sm font-medium text-slate-700 dark:text-slate-200 ${className}`}>
      {label}
      <span className="relative">
        {Icon ? <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /> : null}
        <input className={withFieldError(Icon ? iconInputStyles : inputBaseStyles, Boolean(error))} {...props} />
      </span>
      <FieldErrorText error={error} />
    </label>
  );
}

function SettingSwitch({ checked, disabled, onChange, label }) {
  return (
    <label className={`relative inline-flex shrink-0 items-center ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} className="peer sr-only" aria-label={label} />
      <span className="h-7 w-12 rounded-full bg-slate-300 transition peer-checked:bg-emerald-500 peer-focus-visible:ring-2 peer-focus-visible:ring-slate-400 peer-focus-visible:ring-offset-2 dark:bg-slate-700 dark:peer-focus-visible:ring-offset-slate-900" />
      <span className="absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow-sm transition peer-checked:translate-x-5" />
    </label>
  );
}

function ToggleCard({ title, description, checked, error, onChange }) {
  return (
    <div className={panelStyles}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-slate-950 dark:text-slate-50">{title}</h4>
          <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>
        </div>
        <SettingSwitch checked={checked} onChange={onChange} label={title} />
      </div>
      <FieldErrorText error={error} />
    </div>
  );
}

export default function IntegrationsSettingsSection() {
  const nsfwScanCursorStorageKey = 'gallery:nsfwScanCursor:v1';
  const [integrations, setIntegrations] = useState(emptyState);
  const [saving, setSaving] = useState(false);
  const scanAbortRef = useRef(null);
  const [scanState, setScanState] = useState({
    running: false,
    processed: 0,
    flagged: 0,
    remainingEstimate: null,
    cursor: null,
    error: '',
  });
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const { data, error: requestError, isLoading, mutate } = useSWR('/api/admin/settings', fetcher);

  useEffect(() => {
    if (!data?.settings?.integrations) {
      return;
    }

    setIntegrations({
      contactRecipientEmail: data.settings.integrations.contactRecipientEmail ?? '',
      contactSenderName: data.settings.integrations.contactSenderName ?? '',
      contactSenderEmail: data.settings.integrations.contactSenderEmail ?? '',
      cloudinaryFolder: data.settings.integrations.cloudinaryFolder ?? '',
      googleDriveImportEnabled: data.settings.integrations.googleDriveImportEnabled !== false,
      mediaScrapeEnabled: data.settings.integrations.mediaScrapeEnabled === true,
      unclothyEnabled: data.settings.integrations.unclothyEnabled === true,
      unclothyWorkerEnabled: data.settings.integrations.unclothyWorkerEnabled === true,
      unclothyGlobalConcurrentGenerationLimit: String(data.settings.integrations.unclothyGlobalConcurrentGenerationLimit ?? 5),
      blurUnclothyGenerated: data.settings.integrations.blurUnclothyGenerated !== false,
      defaultGalleryView: data.settings.integrations.defaultGalleryView === 'compact' ? 'compact' : 'cinematic',
    });
    setFormError('');
    setFieldErrors({});
  }, [data]);

  useEffect(() => {
    if (!requestError) {
      return;
    }

    const message = requestError instanceof Error ? requestError.message : 'Unable to load integration settings';
    setFormError(message);
    toast.error('Unable to load integration settings', { description: message });
  }, [requestError]);

  const clearField = (field) => {
    setFieldErrors((current) => clearFieldErrors(current, `integrations.${field}`));
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    setFieldErrors({});

    try {
      const updatePromise = handleRequest(() =>
        fetch('/api/admin/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            integrations: {
              contactRecipientEmail: integrations.contactRecipientEmail.trim(),
              contactSenderName: integrations.contactSenderName.trim(),
              contactSenderEmail: integrations.contactSenderEmail.trim(),
              cloudinaryFolder: integrations.cloudinaryFolder.trim(),
              googleDriveImportEnabled: integrations.googleDriveImportEnabled,
              mediaScrapeEnabled: integrations.mediaScrapeEnabled,
              unclothyEnabled: integrations.unclothyEnabled,
              unclothyWorkerEnabled: integrations.unclothyWorkerEnabled,
              unclothyGlobalConcurrentGenerationLimit: Number.parseInt(String(integrations.unclothyGlobalConcurrentGenerationLimit), 10),
              blurUnclothyGenerated: integrations.blurUnclothyGenerated,
              defaultGalleryView: integrations.defaultGalleryView,
            },
          }),
        }),
      );

      toast.promise(updatePromise, {
        loading: 'Saving integration settings...',
        success: 'Integration settings updated.',
        error: (error) => (error instanceof Error ? error.message : 'Unable to update integration settings'),
      });

      await updatePromise;
      await mutate();
      await revalidatePublicData();
      notifyRealtimeUpdate();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('gallery:settings-updated'));
      }
    } catch (requestFailure) {
      const nextError = normalizeFormError(requestFailure, 'Unable to update integration settings');
      setFormError(nextError.formError);
      setFieldErrors(nextError.fieldErrors);
    } finally {
      setSaving(false);
    }
  };

  const stopScan = () => {
    try {
      scanAbortRef.current?.abort?.();
    } catch {
      // ignore
    }

    scanAbortRef.current = null;
    setScanState((current) => ({ ...current, running: false }));
  };

  const readStoredScanCursor = () => {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(nsfwScanCursorStorageKey);
    const parsed = Number.parseInt(raw ?? '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };

  const persistScanCursor = (cursor) => {
    if (typeof window === 'undefined') return;
    if (cursor && Number.isFinite(cursor)) {
      window.localStorage.setItem(nsfwScanCursorStorageKey, String(cursor));
      return;
    }
    window.localStorage.removeItem(nsfwScanCursorStorageKey);
  };

  const runNsfwScan = async ({ resume = false } = {}) => {
    if (scanState.running) return;

    setScanState({
      running: true,
      processed: 0,
      flagged: 0,
      remainingEstimate: null,
      cursor: resume ? readStoredScanCursor() : null,
      error: '',
    });

    const controller = new AbortController();
    scanAbortRef.current = controller;

    let cursor = resume ? readStoredScanCursor() : null;
    let processed = 0;
    let flagged = 0;

    try {
      // Keep running batches until the endpoint returns no next cursor.
      // This avoids inventing a separate long-running job system.
      for (let iteration = 0; iteration < 500; iteration += 1) {
        const payload = await handleRequest(() =>
          fetch('/api/admin/gallery/nsfw/scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cursor, limit: 20 }),
            signal: controller.signal,
          }),
        );

        const batchProcessed = Number(payload?.processed ?? 0);
        const batchFlagged = Number(payload?.flagged ?? 0);
        const nextCursor = payload?.nextCursor ?? null;

        processed += Number.isFinite(batchProcessed) ? batchProcessed : 0;
        flagged += Number.isFinite(batchFlagged) ? batchFlagged : 0;

        setScanState((current) => ({
          ...current,
          running: true,
          processed,
          flagged,
          remainingEstimate: typeof payload?.remainingEstimate === 'number' ? payload.remainingEstimate : current.remainingEstimate,
          cursor: nextCursor,
        }));

        persistScanCursor(nextCursor);

        if (!nextCursor || batchProcessed <= 0) {
          break;
        }

        cursor = nextCursor;
      }

      toast.success('NSFW scan completed.');
      persistScanCursor(null);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        setScanState((current) => ({ ...current, error: 'Scan stopped.' }));
        return;
      }

      const message = error instanceof Error ? error.message : 'Unable to scan existing media.';
      setScanState((current) => ({ ...current, error: message }));
      toast.error('Unable to scan existing media', { description: message });
    } finally {
      scanAbortRef.current = null;
      setScanState((current) => ({ ...current, running: false }));
    }
  };

  const storedScanCursor = readStoredScanCursor();

  const statuses = Array.isArray(data?.statuses) ? data.statuses : [];

  return (
    <section id="integrations" className={`${cardStyles} overflow-hidden`}>
      <AdminSectionHeader
        title="Integrations"
        description="Manage safe integration settings and check service connection status without exposing API secrets."
        actions={
          <>

            <button type="submit" form={formId} disabled={saving || isLoading} className={primaryButtonStyles}>
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </>
        }
      />
      <div className="grid gap-4 p-3 sm:p-4 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)]">
        <form id={formId} onSubmit={submit} className="min-w-0 space-y-5">
          <FormErrorSummary error={formError} fieldErrors={fieldErrors} />

          <section className={sectionStyles}>
            <SectionTitle icon={Mail} title="Contact email setup" description="Recipient and sender details used by the contact form." />
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <TextField
                label="Recipient email"
                type="email"
                value={integrations.contactRecipientEmail}
                icon={Mail}
                error={getFieldError(fieldErrors, 'integrations.contactRecipientEmail')}
                onChange={(event) => {
                  setIntegrations((previous) => ({ ...previous, contactRecipientEmail: event.target.value }));
                  clearField('contactRecipientEmail');
                }}
                aria-invalid={Boolean(getFieldError(fieldErrors, 'integrations.contactRecipientEmail'))}
              />
              <TextField
                label="Sender email"
                type="email"
                value={integrations.contactSenderEmail}
                icon={Mail}
                error={getFieldError(fieldErrors, 'integrations.contactSenderEmail')}
                onChange={(event) => {
                  setIntegrations((previous) => ({ ...previous, contactSenderEmail: event.target.value }));
                  clearField('contactSenderEmail');
                }}
                aria-invalid={Boolean(getFieldError(fieldErrors, 'integrations.contactSenderEmail'))}
              />
              <TextField
                label="Sender name"
                type="text"
                value={integrations.contactSenderName}
                icon={Settings2}
                className="md:col-span-2"
                error={getFieldError(fieldErrors, 'integrations.contactSenderName')}
                onChange={(event) => {
                  setIntegrations((previous) => ({ ...previous, contactSenderName: event.target.value }));
                  clearField('contactSenderName');
                }}
                aria-invalid={Boolean(getFieldError(fieldErrors, 'integrations.contactSenderName'))}
              />
            </div>
          </section>

          <section className={sectionStyles}>
            <SectionTitle icon={FolderOpen} title="Storage and imports" description="Media storage paths and import availability." />
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <TextField
                label="Cloudinary base folder"
                type="text"
                value={integrations.cloudinaryFolder}
                icon={FolderOpen}
                error={getFieldError(fieldErrors, 'integrations.cloudinaryFolder')}
                onChange={(event) => {
                  setIntegrations((previous) => ({ ...previous, cloudinaryFolder: event.target.value }));
                  clearField('cloudinaryFolder');
                }}
                aria-invalid={Boolean(getFieldError(fieldErrors, 'integrations.cloudinaryFolder'))}
              />
                <div className={panelStyles}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h4 className="text-sm font-semibold text-slate-950 dark:text-slate-50">Enable Google Drive imports</h4>
                      <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                        Global import switch. Admins still connect their own Drive account in the gallery import workflow.
                      </p>
                    </div>
                    <SettingSwitch
                      checked={integrations.googleDriveImportEnabled}
                      label="Enable Google Drive imports"
                      onChange={(event) => {
                        setIntegrations((previous) => ({ ...previous, googleDriveImportEnabled: event.target.checked }));
                        clearField('googleDriveImportEnabled');
                      }}
                    />
                  </div>
                </div>
                <div className={panelStyles}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-slate-500 dark:text-slate-300" />
                        <h4 className="text-sm font-semibold text-slate-950 dark:text-slate-50">Enable Media Scraper</h4>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                        Admin-only URL preview and ZIP download tool. Enable only when you have permission to download the content.
                      </p>
                    </div>
                    <SettingSwitch
                      checked={integrations.mediaScrapeEnabled}
                      label="Enable Media Scraper"
                      onChange={(event) => {
                        setIntegrations((previous) => ({ ...previous, mediaScrapeEnabled: event.target.checked }));
                        clearField('mediaScrapeEnabled');
                      }}
                    />
                  </div>
                </div>
              </div>
            </section>

          <section className="grid gap-4 md:grid-cols-2">
            <ToggleCard
              title="Enable Unclothy integration"
              description="Enables the admin-only workflow inside Gallery > Media. The API key stays server-side only."
              checked={integrations.unclothyEnabled}
              error={getFieldError(fieldErrors, 'integrations.unclothyEnabled')}
              onChange={(event) => {
                setIntegrations((previous) => ({ ...previous, unclothyEnabled: event.target.checked }));
                clearField('unclothyEnabled');
              }}
            />
            <ToggleCard
              title="Run Unclothy background worker"
              description="Allows the Cloudflare cron to process queued generations while the browser is closed."
              checked={integrations.unclothyWorkerEnabled}
              error={getFieldError(fieldErrors, 'integrations.unclothyWorkerEnabled')}
              onChange={(event) => {
                setIntegrations((previous) => ({ ...previous, unclothyWorkerEnabled: event.target.checked }));
                clearField('unclothyWorkerEnabled');
              }}
            />
            <div className={panelStyles}>
              <TextField
                label="Global active generations"
                type="number"
                min="1"
                max="5"
                inputMode="numeric"
                value={integrations.unclothyGlobalConcurrentGenerationLimit}
                icon={Sparkles}
                error={getFieldError(fieldErrors, 'integrations.unclothyGlobalConcurrentGenerationLimit')}
                onChange={(event) => {
                  setIntegrations((previous) => ({ ...previous, unclothyGlobalConcurrentGenerationLimit: event.target.value }));
                  clearField('unclothyGlobalConcurrentGenerationLimit');
                }}
                aria-invalid={Boolean(getFieldError(fieldErrors, 'integrations.unclothyGlobalConcurrentGenerationLimit'))}
              />
              <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                System-wide running cap. Maximum allowed value is 5.
              </p>
            </div>
            <ToggleCard
              title="NSFW blur in admin"
              description="Blurs media when the AI scan flags it as NSFW. Manual blur modes can override this per item."
              checked={integrations.blurUnclothyGenerated}
              error={getFieldError(fieldErrors, 'integrations.blurUnclothyGenerated')}
              onChange={(event) => {
                setIntegrations((previous) => ({ ...previous, blurUnclothyGenerated: event.target.checked }));
                clearField('blurUnclothyGenerated');
              }}
            />
          </section>

          <section className={sectionStyles}>
            <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)]">
              <SectionTitle icon={ShieldCheck} title="Scanning tools" description="Run moderation checks across existing gallery media." />
              <div className={panelStyles}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">NSFW blur scanner</p>
                    <p className="mt-1 text-sm font-semibold text-slate-950 dark:text-slate-50">{scanState.running ? 'Scanning' : 'Idle'}</p>
                  </div>
                  <AdminStatusBadge label={scanState.running ? 'Running' : storedScanCursor ? 'Resumable' : 'Ready'} tone={scanState.error ? 'warning' : 'success'} />
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" className={primaryButtonStyles} disabled={saving || isLoading || scanState.running} onClick={() => runNsfwScan({ resume: false })}>
                    <RefreshCw className={`mr-2 h-4 w-4 ${scanState.running ? 'animate-spin' : ''}`} />
                    {scanState.running ? 'Scanning...' : 'Run scan'}
                  </button>
                  {storedScanCursor ? (
                    <button
                      type="button"
                      className={secondaryButtonStyles}
                      disabled={saving || isLoading || scanState.running}
                      onClick={() => runNsfwScan({ resume: true })}
                      title={`Resume from id ${storedScanCursor}`}
                    >
                      Resume
                    </button>
                  ) : null}
                  {scanState.running ? (
                    <button type="button" className={secondaryButtonStyles} onClick={stopScan}>
                      Stop
                    </button>
                  ) : null}
                </div>

                <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-semibold text-slate-700 dark:text-slate-200">{scanState.processed}</span> processed |{' '}
                  <span className="font-semibold text-slate-700 dark:text-slate-200">{scanState.flagged}</span> flagged
                  {typeof scanState.remainingEstimate === 'number' ? (
                    <>
                      {' '}
                      | ~<span className="font-semibold text-slate-700 dark:text-slate-200">{scanState.remainingEstimate}</span> remaining
                    </>
                  ) : null}
                </div>
                {scanState.error ? <p className="mt-2 text-xs font-medium text-rose-600 dark:text-rose-300">{scanState.error}</p> : null}
              </div>
            </div>
          </section>

          <details className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-4">
            <summary className="cursor-pointer text-sm font-semibold text-slate-900 dark:text-slate-100">Private gallery default view</summary>
            <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
              Choose which layout loads by default before visitors switch views on the gallery page.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                { value: 'cinematic', label: 'Cinematic', description: 'Editorial hero slider with floating preview cards.' },
                { value: 'compact', label: 'Compact', description: 'Faster browsing view with simpler album emphasis.' },
              ].map((option) => (
                <label
                  key={option.value}
                  className={`cursor-pointer rounded-xl border p-4 text-left text-sm transition ${
                    integrations.defaultGalleryView === option.value
                      ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-white dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900'
                  }`}
                >
                  <input
                    type="radio"
                    name="defaultGalleryView"
                    value={option.value}
                    checked={integrations.defaultGalleryView === option.value}
                    onChange={(event) => {
                      setIntegrations((previous) => ({ ...previous, defaultGalleryView: event.target.value }));
                      clearField('defaultGalleryView');
                    }}
                    className="sr-only"
                  />
                  <span className="flex items-center gap-2 font-semibold">
                    {integrations.defaultGalleryView === option.value ? <CheckCircle2 className="h-4 w-4" /> : null}
                    {option.label}
                  </span>
                  <span className="mt-2 block text-xs leading-5 opacity-80">{option.description}</span>
                </label>
              ))}
            </div>
            <FieldErrorText error={getFieldError(fieldErrors, 'integrations.defaultGalleryView')} />
          </details>
        </form>

        <aside className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-4">
            <div className="flex items-center gap-3">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Connection status</p>
                <h3 className="text-lg font-semibold text-slate-950 dark:text-slate-50">Service health</h3>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {statuses.length ? (
                statuses.map((status) => (
                  <div key={status.key} className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/40">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{status.label}</h4>
                        <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{status.description}</p>
                      </div>
                      <AdminStatusBadge
                        label={status.state === 'connected' ? 'Connected' : status.state === 'disabled' ? 'Disabled' : 'Needs setup'}
                        tone={status.state === 'connected' ? 'success' : status.state === 'warning' ? 'warning' : 'neutral'}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
                  {isLoading ? 'Loading service health...' : 'Service health is unavailable.'}
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
