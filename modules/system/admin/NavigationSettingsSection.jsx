'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import AdminSectionHeader from '@/components/admin/shared/AdminSectionHeader';
import FieldErrorText from '@/components/forms/FieldErrorText';
import FormErrorSummary from '@/components/forms/FormErrorSummary';
import { clearFieldErrors, getFieldError, normalizeFormError } from '@/lib/form-client';
import { handleRequest } from '@/lib/handleRequest';
import { notifyRealtimeUpdate, revalidatePublicData } from '@/lib/realtime';
import { buttonStyles, cardStyles, fetcher, inputStyles, withFieldError } from '@/modules/system/admin/settingsShared';

const emptyLink = {
  label: '',
  target: '',
  type: 'section',
  isVisible: true,
  sortOrder: 0,
};

const normalizeTarget = (link) => {
  const trimmedTarget = String(link.target || '').trim();
  if (!trimmedTarget) {
    return '';
  }

  if (link.type === 'section') {
    return `#${trimmedTarget.replace(/^#/, '')}`;
  }

  return trimmedTarget;
};

export default function NavigationSettingsSection() {
  const [navigation, setNavigation] = useState({ links: [{ ...emptyLink }], showAdminButton: true });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const { data, error: requestError, isLoading, mutate } = useSWR('/api/site-config', fetcher);

  useEffect(() => {
    if (!data?.navigation) {
      return;
    }

    setNavigation({
      links:
        Array.isArray(data.navigation.links) && data.navigation.links.length > 0
          ? data.navigation.links.map((link) => ({
              label: typeof link.label === 'string' ? link.label : '',
              target: typeof link.target === 'string' ? link.target : '',
              type: link.type === 'url' ? 'url' : 'section',
              isVisible: link.isVisible !== false,
              sortOrder: Number.isFinite(Number(link.sortOrder)) ? Number(link.sortOrder) : 0,
            }))
          : [{ ...emptyLink }],
      showAdminButton: data.navigation.showAdminButton !== false,
    });
    setFormError('');
    setFieldErrors({});
  }, [data]);

  useEffect(() => {
    if (!requestError) {
      return;
    }

    const message = requestError instanceof Error ? requestError.message : 'Unable to load navigation settings';
    setFormError(message);
    toast.error('Unable to load navigation settings', { description: message });
  }, [requestError]);

  const updateLink = (index, field, value) => {
    setNavigation((previous) => ({
      ...previous,
      links: previous.links.map((link, linkIndex) => (linkIndex === index ? { ...link, [field]: value } : link)),
    }));
    setFieldErrors((current) => clearFieldErrors(current, `navigation.links[${index}].${field}`));
  };

  const addLink = () => {
    setNavigation((previous) => ({
      ...previous,
      links: [
        ...previous.links,
        {
          ...emptyLink,
          sortOrder: previous.links.length + 1,
        },
      ],
    }));
  };

  const removeLink = (index) => {
    setNavigation((previous) => ({
      ...previous,
      links: previous.links.filter((_, linkIndex) => linkIndex !== index),
    }));
  };

  const submit = async (event) => {
    event.preventDefault();

    const links = navigation.links
      .map((link, index) => ({
        label: String(link.label || '').trim(),
        target: normalizeTarget(link),
        type: link.type === 'url' ? 'url' : 'section',
        isVisible: link.isVisible !== false,
        sortOrder: Number.isFinite(Number(link.sortOrder)) ? Number(link.sortOrder) : index + 1,
      }))
      .filter((link) => link.label && link.target);

    if (links.length === 0) {
      const message = 'Add at least one navigation link.';
      setFormError(message);
      toast.error(message);
      return;
    }

    setSaving(true);
    setFormError('');
    setFieldErrors({});

    try {
      const updatePromise = handleRequest(() =>
        fetch('/api/site-config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            navigation: {
              links,
              showAdminButton: navigation.showAdminButton,
            },
          }),
        }),
      );

      toast.promise(updatePromise, {
        loading: 'Saving navigation settings...',
        success: 'Navigation settings updated.',
        error: (error) => (error instanceof Error ? error.message : 'Unable to update navigation settings'),
      });

      await updatePromise;
      await mutate();
      await revalidatePublicData();
      notifyRealtimeUpdate();
    } catch (requestFailure) {
      const nextError = normalizeFormError(requestFailure, 'Unable to update navigation settings');
      setFormError(nextError.formError);
      setFieldErrors(nextError.fieldErrors);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section id="navigation" className={cardStyles}>
      <AdminSectionHeader
        title="Navigation Settings"
        description="Manage header and mobile navigation labels, targets, ordering, and visibility."
        actions={
          <button type="button" className={buttonStyles} onClick={addLink}>
            Add Link
          </button>
        }
      />
      <div className="min-w-0 p-3 sm:p-4">
        <form onSubmit={submit} className="space-y-4">
          <FormErrorSummary error={formError} fieldErrors={fieldErrors} />

          <div className="space-y-3">
            {navigation.links.map((link, index) => (
              <div
                key={`nav-link-${index}`}
                className="grid min-w-0 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.3fr)_minmax(0,7.5rem)_minmax(0,7.5rem)_auto_auto] dark:border-slate-800 dark:bg-slate-950/40"
              >
                <div>
                  <input
                    type="text"
                    value={link.label}
                    onChange={(event) => updateLink(index, 'label', event.target.value)}
                    placeholder="Label"
                    aria-invalid={Boolean(getFieldError(fieldErrors, `navigation.links[${index}].label`))}
                    className={withFieldError(inputStyles, Boolean(getFieldError(fieldErrors, `navigation.links[${index}].label`)))}
                  />
                  <FieldErrorText error={getFieldError(fieldErrors, `navigation.links[${index}].label`)} />
                </div>
                <div>
                  <input
                    type="text"
                    value={link.target}
                    onChange={(event) => updateLink(index, 'target', event.target.value)}
                    placeholder={link.type === 'section' ? '#portfolio' : 'https://example.com'}
                    aria-invalid={Boolean(getFieldError(fieldErrors, `navigation.links[${index}].target`))}
                    className={withFieldError(inputStyles, Boolean(getFieldError(fieldErrors, `navigation.links[${index}].target`)))}
                  />
                  <FieldErrorText error={getFieldError(fieldErrors, `navigation.links[${index}].target`)} />
                </div>
                <div>
                  <select
                    value={link.type}
                    onChange={(event) => updateLink(index, 'type', event.target.value)}
                    className={withFieldError(inputStyles, Boolean(getFieldError(fieldErrors, `navigation.links[${index}].type`)))}
                  >
                    <option value="section">Section</option>
                    <option value="url">URL</option>
                  </select>
                  <FieldErrorText error={getFieldError(fieldErrors, `navigation.links[${index}].type`)} />
                </div>
                <div>
                  <input
                    type="number"
                    value={link.sortOrder}
                    onChange={(event) => updateLink(index, 'sortOrder', Number(event.target.value))}
                    min={0}
                    aria-invalid={Boolean(getFieldError(fieldErrors, `navigation.links[${index}].sortOrder`))}
                    className={withFieldError(inputStyles, Boolean(getFieldError(fieldErrors, `navigation.links[${index}].sortOrder`)))}
                  />
                  <FieldErrorText error={getFieldError(fieldErrors, `navigation.links[${index}].sortOrder`)} />
                </div>
                <label className="flex items-center justify-center gap-2 rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-600 dark:border-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={link.isVisible}
                    onChange={(event) => updateLink(index, 'isVisible', event.target.checked)}
                  />
                  Visible
                </label>
                <button
                  type="button"
                  onClick={() => removeLink(index)}
                  disabled={navigation.links.length === 1}
                  className="rounded-md border border-rose-200 px-3 text-sm font-medium text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-500/40 dark:text-rose-300 dark:hover:bg-rose-500/10"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          <button type="submit" disabled={saving || isLoading} className={buttonStyles}>
            {saving ? 'Saving...' : 'Update Navigation Settings'}
          </button>
        </form>
      </div>
    </section>
  );
}
