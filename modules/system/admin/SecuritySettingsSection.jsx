'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import AdminSectionHeader from '@/components/admin/shared/AdminSectionHeader';
import AdminStatusBadge from '@/components/admin/shared/AdminStatusBadge';
import FieldErrorText from '@/components/forms/FieldErrorText';
import FormErrorSummary from '@/components/forms/FormErrorSummary';
import { clearFieldErrors, getFieldError, normalizeFormError } from '@/lib/form-client';
import { handleRequest } from '@/lib/handleRequest';
import {
  buttonStyles,
  cardStyles,
  fetcher,
  formatAuditEventDetails,
  formatAuditEventLabel,
  inputStyles,
  withFieldError,
} from '@/modules/system/admin/settingsShared';

const emptySecurity = {
  sessionTtlHours: 8,
  loginRateLimitMax: 10,
  loginRateLimitWindowSeconds: 60,
  mutationRateLimitMax: 120,
  mutationRateLimitWindowSeconds: 60,
  contactRateLimitMax: 8,
  contactRateLimitWindowSeconds: 60,
  sessionVersion: 1,
};

const numericField = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

export default function SecuritySettingsSection() {
  const [security, setSecurity] = useState(emptySecurity);
  const [saving, setSaving] = useState(false);
  const [forcingLogout, setForcingLogout] = useState(false);
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const { data, error: requestError, isLoading, mutate } = useSWR('/api/admin/settings', fetcher);

  useEffect(() => {
    if (!data?.settings?.security) {
      return;
    }

    setSecurity({
      sessionTtlHours: numericField(data.settings.security.sessionTtlHours),
      loginRateLimitMax: numericField(data.settings.security.loginRateLimitMax),
      loginRateLimitWindowSeconds: numericField(data.settings.security.loginRateLimitWindowSeconds),
      mutationRateLimitMax: numericField(data.settings.security.mutationRateLimitMax),
      mutationRateLimitWindowSeconds: numericField(data.settings.security.mutationRateLimitWindowSeconds),
      contactRateLimitMax: numericField(data.settings.security.contactRateLimitMax),
      contactRateLimitWindowSeconds: numericField(data.settings.security.contactRateLimitWindowSeconds),
      sessionVersion: numericField(data.settings.security.sessionVersion),
    });
    setFormError('');
    setFieldErrors({});
  }, [data]);

  useEffect(() => {
    if (!requestError) {
      return;
    }

    const message = requestError instanceof Error ? requestError.message : 'Unable to load security settings';
    setFormError(message);
    toast.error('Unable to load security settings', { description: message });
  }, [requestError]);

  const clearField = (field) => {
    setFieldErrors((current) => clearFieldErrors(current, `security.${field}`));
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
            security: {
              sessionTtlHours: numericField(security.sessionTtlHours),
              loginRateLimitMax: numericField(security.loginRateLimitMax),
              loginRateLimitWindowSeconds: numericField(security.loginRateLimitWindowSeconds),
              mutationRateLimitMax: numericField(security.mutationRateLimitMax),
              mutationRateLimitWindowSeconds: numericField(security.mutationRateLimitWindowSeconds),
              contactRateLimitMax: numericField(security.contactRateLimitMax),
              contactRateLimitWindowSeconds: numericField(security.contactRateLimitWindowSeconds),
            },
          }),
        }),
      );

      toast.promise(updatePromise, {
        loading: 'Saving security settings...',
        success: 'Security settings updated.',
        error: (error) => (error instanceof Error ? error.message : 'Unable to update security settings'),
      });

      await updatePromise;
      await mutate();
    } catch (requestFailure) {
      const nextError = normalizeFormError(requestFailure, 'Unable to update security settings');
      setFormError(nextError.formError);
      setFieldErrors(nextError.fieldErrors);
    } finally {
      setSaving(false);
    }
  };

  const forceSignOut = async () => {
    setForcingLogout(true);
    setFormError('');
    setFieldErrors({});

    try {
      const updatePromise = handleRequest(() =>
        fetch('/api/admin/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ forceSignOutAllSessions: true }),
        }),
      );

      toast.promise(updatePromise, {
        loading: 'Invalidating all active sessions...',
        success: 'All sessions have been invalidated.',
        error: (error) => (error instanceof Error ? error.message : 'Unable to invalidate sessions'),
      });

      await updatePromise;
      window.location.href = '/';
    } catch (requestFailure) {
      const nextError = normalizeFormError(requestFailure, 'Unable to invalidate sessions');
      setFormError(nextError.formError);
      setFieldErrors(nextError.fieldErrors);
      setForcingLogout(false);
    }
  };

  const events = Array.isArray(data?.events) ? data.events : [];

  return (
    <section id="security" className={cardStyles}>
      <AdminSectionHeader
        title="Security & Access"
        description="Control admin access behavior, session limits, and recent authentication activity."
        actions={<AdminStatusBadge label={`Session version ${security.sessionVersion}`} tone="neutral" />}
      />
      <div className="grid gap-4 p-3 sm:p-4 lg:grid-cols-[1.25fr_1fr]">
        <form onSubmit={submit} className="space-y-4">
          <FormErrorSummary error={formError} fieldErrors={fieldErrors} />

          <div className="grid gap-4 md:grid-cols-2">
            {[
              ['sessionTtlHours', 'Session TTL (hours)'],
              ['loginRateLimitMax', 'Login attempts limit'],
              ['loginRateLimitWindowSeconds', 'Login window (seconds)'],
              ['mutationRateLimitMax', 'Admin mutation limit'],
              ['mutationRateLimitWindowSeconds', 'Admin mutation window (seconds)'],
              ['contactRateLimitMax', 'Contact submit limit'],
              ['contactRateLimitWindowSeconds', 'Contact window (seconds)'],
            ].map(([field, label]) => (
              <label key={field} className="flex flex-col gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                {label}
                <input
                  type="number"
                  min={1}
                  value={security[field]}
                  onChange={(event) => {
                    setSecurity((previous) => ({ ...previous, [field]: Number(event.target.value) }));
                    clearField(field);
                  }}
                  aria-invalid={Boolean(getFieldError(fieldErrors, `security.${field}`))}
                  className={withFieldError(inputStyles, Boolean(getFieldError(fieldErrors, `security.${field}`)))}
                />
                <FieldErrorText error={getFieldError(fieldErrors, `security.${field}`)} />
              </label>
            ))}

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 md:col-span-2 dark:border-slate-800 dark:bg-slate-950/40">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Force logout</p>
              <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                Bump the session version and invalidate every currently signed-in admin session, including this one.
              </p>
              <button
                type="button"
                disabled={forcingLogout}
                onClick={forceSignOut}
                className="mt-4 rounded-md border border-rose-200 px-3 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-50 dark:border-rose-500/40 dark:text-rose-300 dark:hover:bg-rose-500/10"
              >
                {forcingLogout ? 'Signing out...' : 'Sign Out All Sessions'}
              </button>
            </div>
          </div>

          <button type="submit" disabled={saving || isLoading || forcingLogout} className={buttonStyles}>
            {saving ? 'Saving...' : 'Update Security Settings'}
          </button>
        </form>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/40">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Recent activity</h3>
          <div className="mt-3 space-y-3">
            {events.length === 0 ? <p className="text-sm text-slate-500">No recent security or settings activity.</p> : null}
            {events.map((event) => (
              <div key={event.id} className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{formatAuditEventLabel(event.type)}</p>
                  <span className="text-xs text-slate-500">{new Date(event.createdAt).toLocaleString()}</span>
                </div>
                {formatAuditEventDetails(event.details) ? (
                  <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                    {formatAuditEventDetails(event.details)}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
