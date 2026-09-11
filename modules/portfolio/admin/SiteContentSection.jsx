'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import ImageUpload from '@/components/ImageUpload';
import AdminSectionHeader from '@/components/admin/shared/AdminSectionHeader';
import FieldErrorText from '@/components/forms/FieldErrorText';
import FormErrorSummary from '@/components/forms/FormErrorSummary';
import { clearFieldErrors, getFieldError, normalizeFormError } from '@/lib/form-client';
import { handleRequest } from '@/lib/handleRequest';
import { notifyRealtimeUpdate, revalidatePublicData } from '@/lib/realtime';
import { buttonStyles, cardStyles, contentPadStyles, fetcher, inputStyles, textareaStyles, withFieldError } from '@/modules/system/admin/settingsShared';
import { cn } from '@/lib/utils';

export default function SiteContentSection() {
  const emptyHighlight = { label: '', value: '' };
  const [hero, setHero] = useState({
    eyebrow: '',
    title: '',
    description: '',
    primaryCtaLabel: '',
    primaryCtaHref: '',
    secondaryCtaLabel: '',
    secondaryCtaHref: '',
    image: '',
  });
  const [about, setAbout] = useState({
    title: '',
    body: '',
    highlights: [{ ...emptyHighlight }],
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const { data: siteContent, error: siteContentError, isLoading: loading } = useSWR('/api/site-content', fetcher);

  useEffect(() => {
    if (!siteContent) {
      return;
    }

    setHero({
      eyebrow: siteContent?.hero?.eyebrow ?? '',
      title: siteContent?.hero?.title ?? '',
      description: siteContent?.hero?.description ?? '',
      primaryCtaLabel: siteContent?.hero?.primaryCtaLabel ?? '',
      primaryCtaHref: siteContent?.hero?.primaryCtaHref ?? '',
      secondaryCtaLabel: siteContent?.hero?.secondaryCtaLabel ?? '',
      secondaryCtaHref: siteContent?.hero?.secondaryCtaHref ?? '',
      image: siteContent?.hero?.image ?? '',
    });

    setAbout({
      title: siteContent?.about?.title ?? '',
      body: siteContent?.about?.body ?? '',
      highlights:
        Array.isArray(siteContent?.about?.highlights) && siteContent.about.highlights.length > 0
          ? siteContent.about.highlights.map((item) => ({
              label: typeof item?.label === 'string' ? item.label : '',
              value:
                typeof item?.value === 'string'
                  ? item.value
                  : Array.isArray(item?.value)
                    ? item.value.filter((line) => typeof line === 'string').join(', ')
                    : '',
            }))
          : [{ ...emptyHighlight }],
    });
    setFormError('');
    setFieldErrors({});
  }, [siteContent]);

  useEffect(() => {
    if (!siteContentError) {
      return;
    }

    const message = siteContentError instanceof Error ? siteContentError.message : 'Unable to load hero/about content';
    setFormError(message);
    toast.error('Unable to load hero/about content', { description: message });
  }, [siteContentError]);

  const submit = async (event) => {
    event.preventDefault();

    const parsedHighlights = about.highlights
      .map((item) => ({
        label: item.label.trim(),
        value: item.value.trim(),
      }))
      .filter((item) => item.label && item.value);

    if (parsedHighlights.length === 0) {
      const message = 'Add at least one highlight with both label and value.';
      setFormError(message);
      toast.error(message);
      return;
    }

    setFormError('');
    setFieldErrors({});
    setSaving(true);

    try {
      const siteContentPromise = handleRequest(() =>
        fetch('/api/site-content', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            hero,
            about: {
              title: about.title,
              body: about.body,
              highlights: parsedHighlights,
            },
          }),
        }),
      );

      toast.promise(siteContentPromise, {
        loading: 'Saving site content...',
        success: 'Site content updated.',
        error: (error) => (error instanceof Error ? error.message : 'Unable to update site content'),
      });

      await siteContentPromise;
      await revalidatePublicData();
      notifyRealtimeUpdate();
    } catch (requestError) {
      const nextError = normalizeFormError(requestError, 'Unable to update site content');
      setFormError(nextError.formError);
      setFieldErrors(nextError.fieldErrors);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={cardStyles}>
      <AdminSectionHeader
        title="Homepage Content"
        description="Manage hero and about section content for the public homepage."
      />
      <div className={cn(contentPadStyles, 'min-w-0')}>
        <form onSubmit={submit} className="space-y-4">
          <FormErrorSummary error={formError} fieldErrors={fieldErrors} />

          <div className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Hero</h3>
            <div className="grid gap-4 md:grid-cols-2">
              {Object.entries(hero).map(([field, value]) => {
                const label = field.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase());
                const errorKey = `hero.${field}`;

                if (field === 'image') {
                  return (
                    <div key={field} className="md:col-span-2 max-w-sm">
                      <ImageUpload
                        id={`hero-${field}`}
                        label={label}
                        value={value}
                        onChange={(url) => {
                          setHero((prev) => ({ ...prev, [field]: url }));
                          setFieldErrors((current) => clearFieldErrors(current, errorKey));
                        }}
                      />
                      <FieldErrorText error={getFieldError(fieldErrors, errorKey)} />
                    </div>
                  );
                }

                const isMultiline = field === 'description';

                return (
                  <label key={field} className="flex flex-col gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                    {label}
                    {isMultiline ? (
                      <textarea
                        value={value}
                        onChange={(event) => {
                          setHero((prev) => ({ ...prev, [field]: event.target.value }));
                          setFieldErrors((current) => clearFieldErrors(current, errorKey));
                        }}
                        rows={4}
                        aria-invalid={Boolean(getFieldError(fieldErrors, errorKey))}
                        className={withFieldError(textareaStyles, Boolean(getFieldError(fieldErrors, errorKey)))}
                      />
                    ) : (
                      <input
                        type="text"
                        value={value}
                        onChange={(event) => {
                          setHero((prev) => ({ ...prev, [field]: event.target.value }));
                          setFieldErrors((current) => clearFieldErrors(current, errorKey));
                        }}
                        aria-invalid={Boolean(getFieldError(fieldErrors, errorKey))}
                        className={withFieldError(inputStyles, Boolean(getFieldError(fieldErrors, errorKey)))}
                      />
                    )}
                    <FieldErrorText error={getFieldError(fieldErrors, errorKey)} />
                  </label>
                );
              })}
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">About</h3>
            <div className="grid gap-4">
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                About title
                <input
                  type="text"
                  value={about.title}
                  onChange={(event) => {
                    setAbout((prev) => ({ ...prev, title: event.target.value }));
                    setFieldErrors((current) => clearFieldErrors(current, 'about.title'));
                  }}
                  required
                  aria-invalid={Boolean(getFieldError(fieldErrors, 'about.title'))}
                  className={withFieldError(inputStyles, Boolean(getFieldError(fieldErrors, 'about.title')))}
                />
                <FieldErrorText error={getFieldError(fieldErrors, 'about.title')} />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                Body
                <textarea
                  value={about.body}
                  onChange={(event) => {
                    setAbout((prev) => ({ ...prev, body: event.target.value }));
                    setFieldErrors((current) => clearFieldErrors(current, 'about.body'));
                  }}
                  rows={5}
                  required
                  aria-invalid={Boolean(getFieldError(fieldErrors, 'about.body'))}
                  className={withFieldError(textareaStyles, Boolean(getFieldError(fieldErrors, 'about.body')))}
                />
                <FieldErrorText error={getFieldError(fieldErrors, 'about.body')} />
              </label>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Highlights</h4>
                  <button
                    type="button"
                    className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
                    onClick={() => setAbout((prev) => ({ ...prev, highlights: [...prev.highlights, { label: '', value: '' }] }))}
                  >
                    Add highlight
                  </button>
                </div>
                {about.highlights.map((highlight, index) => (
                  <div key={`highlight-${index}`} className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 p-3 md:grid-cols-[minmax(0,200px)_minmax(0,1fr)_auto] dark:border-slate-700">
                    <div>
                      <input
                        type="text"
                        value={highlight.label}
                        onChange={(event) =>
                          setAbout((prev) => ({
                            ...prev,
                            highlights: prev.highlights.map((item, idx) =>
                              idx === index ? { ...item, label: event.target.value } : item,
                            ),
                          }))
                        }
                        onInput={() => setFieldErrors((current) => clearFieldErrors(current, `about.highlights[${index}].label`))}
                        placeholder="Label"
                        className={withFieldError(inputStyles, Boolean(getFieldError(fieldErrors, `about.highlights[${index}].label`)))}
                      />
                      <FieldErrorText error={getFieldError(fieldErrors, `about.highlights[${index}].label`)} />
                    </div>
                    <div>
                      <textarea
                        value={highlight.value}
                        onChange={(event) =>
                          setAbout((prev) => ({
                            ...prev,
                            highlights: prev.highlights.map((item, idx) =>
                              idx === index ? { ...item, value: event.target.value } : item,
                            ),
                          }))
                        }
                        onInput={() => setFieldErrors((current) => clearFieldErrors(current, `about.highlights[${index}].value`))}
                        rows={2}
                        placeholder="Value"
                        className={withFieldError(textareaStyles, Boolean(getFieldError(fieldErrors, `about.highlights[${index}].value`)))}
                      />
                      <FieldErrorText error={getFieldError(fieldErrors, `about.highlights[${index}].value`)} />
                    </div>
                    <button
                      type="button"
                      className="h-10 rounded-md border border-red-300 px-3 text-sm text-red-700 hover:bg-red-50 dark:border-red-900/40 dark:text-red-300"
                      onClick={() =>
                        setAbout((prev) => ({
                          ...prev,
                          highlights: prev.highlights.filter((_, idx) => idx !== index),
                        }))
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <button type="submit" disabled={saving || loading} className={buttonStyles}>
            {saving ? 'Saving...' : 'Update Homepage Content'}
          </button>
        </form>
      </div>
    </section>
  );
}
