'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import FieldErrorText from '@/components/forms/FieldErrorText';
import FormErrorSummary from '@/components/forms/FormErrorSummary';
import { clearFieldErrors, getFieldError, normalizeFormError, parseErrorResponse } from '@/lib/form-client';

export default function AdminAccountClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [feedback, setFeedback] = useState('');
  const [account, setAccount] = useState(null);
  const [actorSource, setActorSource] = useState(null);
  const [sessionPolicy, setSessionPolicy] = useState({ sessionTtlHours: null });
  const [form, setForm] = useState({
    name: '',
    email: '',
    currentPassword: '',
    newPassword: '',
  });
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetFieldErrors, setResetFieldErrors] = useState({});
  const [resetInfo, setResetInfo] = useState('');
  const [reset, setReset] = useState({
    otp: '',
    newPassword: '',
    confirmPassword: '',
  });

  useEffect(() => {
    const loadAccount = async () => {
      setLoading(true);
      setFormError('');

      try {
        const response = await fetch('/api/admin/account', { cache: 'no-store' });
        if (!response.ok) {
          throw await parseErrorResponse(response, 'Unable to load account.');
        }
        const payload = await response.json().catch(() => ({}));

        setAccount(payload.account);
        setActorSource(typeof payload.actorSource === 'string' ? payload.actorSource : null);
        setSessionPolicy({
          sessionTtlHours:
            Number.isFinite(Number(payload.sessionPolicy?.sessionTtlHours))
              ? Number(payload.sessionPolicy.sessionTtlHours)
              : null,
        });
        setForm((current) => ({
          ...current,
          name: payload.account?.name || '',
          email: payload.account?.email || '',
        }));
      } catch (requestError) {
        const nextError = normalizeFormError(requestError, 'Unable to load account.');
        setFormError(nextError.formError);
      } finally {
        setLoading(false);
      }
    };

    loadAccount();
  }, []);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => clearFieldErrors(current, field));
  };

  const updateResetField = (field, value) => {
    setReset((current) => ({ ...current, [field]: value }));
    setResetFieldErrors((current) => clearFieldErrors(current, field));
  };
  const formatTtl = (hours) => {
    if (!Number.isFinite(hours) || hours <= 0) return 'Not configured';
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    if (days > 0 && remainingHours > 0) {
      return `${days} day${days === 1 ? '' : 's'} ${remainingHours} hour${remainingHours === 1 ? '' : 's'}`;
    }
    if (days > 0) {
      return `${days} day${days === 1 ? '' : 's'}`;
    }
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    setFieldErrors({});
    setFeedback('');

    try {
      const response = await fetch('/api/admin/account', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(form),
      });

      if (!response.ok) {
        throw await parseErrorResponse(response, 'Unable to update account.');
      }
      const payload = await response.json().catch(() => ({}));

      setAccount(payload.account);
      setForm((current) => ({
        ...current,
        name: payload.account?.name || '',
        email: payload.account?.email || '',
        currentPassword: '',
        newPassword: '',
      }));

      const successMessage = payload.account?.passwordChanged
        ? 'Account updated. Sign in again with your new password.'
        : 'Account updated.';

      setFeedback(successMessage);
      toast.success(successMessage);
    } catch (requestError) {
      const nextError = normalizeFormError(requestError, 'Unable to update account.');
      setFormError(nextError.formError);
      setFieldErrors(nextError.fieldErrors);
      toast.error(nextError.formError);
    } finally {
      setSaving(false);
    }
  };

  const sendResetCode = async () => {
    if (!account?.email) {
      setResetError('Email is missing.');
      return;
    }

    setResetting(true);
    setResetError('');
    setResetFieldErrors({});
    setResetInfo('');

    try {
      const response = await fetch('/api/neon/session/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: account.email }),
      });

      if (!response.ok) {
        throw await parseErrorResponse(response, 'Unable to send reset code.');
      }

      const payload = await response.json().catch(() => ({}));
      const message = typeof payload?.message === 'string' ? payload.message : 'Reset code sent. Check your email.';
      setResetInfo(message);
      toast.success(message);
    } catch (requestError) {
      const nextError = normalizeFormError(requestError, 'Unable to send reset code.');
      setResetError(nextError.formError);
      setResetFieldErrors(nextError.fieldErrors);
      toast.error(nextError.formError);
    } finally {
      setResetting(false);
    }
  };

  const submitResetPassword = async (event) => {
    event.preventDefault();
    if (!account?.email) {
      setResetError('Email is missing.');
      return;
    }

    setResetting(true);
    setResetError('');
    setResetFieldErrors({});
    setResetInfo('');

    if (!reset.newPassword || reset.newPassword !== reset.confirmPassword) {
      setResetFieldErrors({
        confirmPassword: ['Passwords do not match.'],
      });
      setResetting(false);
      return;
    }

    try {
      const response = await fetch('/api/neon/session/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: account.email,
          otp: reset.otp,
          password: reset.newPassword,
        }),
      });

      if (!response.ok) {
        throw await parseErrorResponse(response, 'Unable to reset password.');
      }

      const payload = await response.json().catch(() => ({}));
      const message =
        typeof payload?.message === 'string'
          ? payload.message
          : 'Password updated. You can now sign in with email + password.';

      setReset({ otp: '', newPassword: '', confirmPassword: '' });
      setResetInfo(message);
      toast.success(message);
    } catch (requestError) {
      const nextError = normalizeFormError(requestError, 'Unable to reset password.');
      setResetError(nextError.formError);
      setResetFieldErrors(nextError.fieldErrors);
      toast.error(nextError.formError);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Account</p>
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Manage your login</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Update your own name, email, or password here. Changing email or password requires your current password.
          </p>
          {actorSource === 'neon' ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              This account is authenticated via Neon. Email is managed by Neon Auth, and password updates apply to Neon (so you can sign in with email + password).
            </p>
          ) : null}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {loading ? <p className="text-sm text-slate-500">Loading account...</p> : null}

        {!loading && account ? (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Role</p>
                <p className="mt-1 text-sm font-medium uppercase tracking-[0.12em] text-slate-900 dark:text-slate-100">
                  {account.role}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Profile</p>
                <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
                  {account.profile?.slug || 'No profile'}
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Session security</p>
              <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
                Session duration: {formatTtl(sessionPolicy.sessionTtlHours)}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                This is managed globally in security settings.
              </p>
              <Link
                href="/admin/security"
                className="mt-3 inline-flex h-9 items-center rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Open Security Settings
              </Link>
            </div>

            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              <FormErrorSummary error={formError} fieldErrors={fieldErrors} />

              <div>
                <Input
                  value={form.name}
                  placeholder="Full name"
                  disabled={saving}
                  aria-invalid={Boolean(getFieldError(fieldErrors, 'name'))}
                  onChange={(event) => updateField('name', event.target.value)}
                />
                <FieldErrorText error={getFieldError(fieldErrors, 'name')} />
              </div>
              <div>
                <Input
                  type="email"
                  value={form.email}
                  placeholder="Email address"
                  disabled={saving || actorSource === 'neon'}
                  aria-invalid={Boolean(getFieldError(fieldErrors, 'email'))}
                  onChange={(event) => updateField('email', event.target.value)}
                />
                <FieldErrorText error={getFieldError(fieldErrors, 'email')} />
              </div>
              <div>
                <Input
                  type="password"
                  value={form.currentPassword}
                  placeholder="Current password"
                  disabled={saving}
                  aria-invalid={Boolean(getFieldError(fieldErrors, 'currentPassword'))}
                  onChange={(event) => updateField('currentPassword', event.target.value)}
                />
                <FieldErrorText error={getFieldError(fieldErrors, 'currentPassword')} />
              </div>
              <div>
                <Input
                  type="password"
                  value={form.newPassword}
                  placeholder="New password (leave blank to keep current)"
                  disabled={saving}
                  aria-invalid={Boolean(getFieldError(fieldErrors, 'newPassword'))}
                  onChange={(event) => updateField('newPassword', event.target.value)}
                />
                <FieldErrorText error={getFieldError(fieldErrors, 'newPassword')} />
              </div>

              <div className="flex items-center gap-3">
                <Button type="submit" disabled={saving}>
                  {saving ? 'Saving...' : 'Save account'}
                </Button>
                {feedback ? <p className="text-sm text-emerald-600 dark:text-emerald-400">{feedback}</p> : null}
              </div>
            </form>

            {actorSource === 'neon' ? (
              <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/40">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Forgot current password?</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Send a reset code to your email, then set a new Neon password.
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Button type="button" disabled={resetting} onClick={sendResetCode}>
                    {resetting ? 'Sending...' : 'Send reset code'}
                  </Button>
                  {resetInfo ? <p className="text-xs text-emerald-600 dark:text-emerald-400">{resetInfo}</p> : null}
                </div>

                {resetError ? (
                  <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{resetError}</p>
                ) : null}

                <form className="mt-4 grid gap-3 md:grid-cols-3" onSubmit={submitResetPassword}>
                  <div className="md:col-span-1">
                    <Input
                      value={reset.otp}
                      placeholder="Reset code"
                      disabled={resetting}
                      aria-invalid={Boolean(getFieldError(resetFieldErrors, 'otp'))}
                      onChange={(event) => updateResetField('otp', event.target.value)}
                    />
                    <FieldErrorText error={getFieldError(resetFieldErrors, 'otp')} />
                  </div>
                  <div className="md:col-span-1">
                    <Input
                      type="password"
                      value={reset.newPassword}
                      placeholder="New password"
                      disabled={resetting}
                      aria-invalid={Boolean(getFieldError(resetFieldErrors, 'password') || getFieldError(resetFieldErrors, 'newPassword'))}
                      onChange={(event) => updateResetField('newPassword', event.target.value)}
                    />
                    <FieldErrorText error={getFieldError(resetFieldErrors, 'password') || getFieldError(resetFieldErrors, 'newPassword')} />
                  </div>
                  <div className="md:col-span-1">
                    <Input
                      type="password"
                      value={reset.confirmPassword}
                      placeholder="Confirm password"
                      disabled={resetting}
                      aria-invalid={Boolean(getFieldError(resetFieldErrors, 'confirmPassword'))}
                      onChange={(event) => updateResetField('confirmPassword', event.target.value)}
                    />
                    <FieldErrorText error={getFieldError(resetFieldErrors, 'confirmPassword')} />
                  </div>

                  <div className="md:col-span-3">
                    <Button type="submit" disabled={resetting}>
                      {resetting ? 'Updating...' : 'Update Neon password'}
                    </Button>
                  </div>
                </form>
              </div>
            ) : null}
          </>
        ) : null}
      </section>
    </div>
  );
}
