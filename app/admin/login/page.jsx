'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  KeyRound,
  LoaderCircle,
  Mail,
  RefreshCw,
} from 'lucide-react';
import { FcGoogle } from 'react-icons/fc';
import { AuthDivider, AuthFooterLinks, AuthShell } from '@/components/auth/AuthShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { normalizeProtectedPath } from '@/lib/auth/redirects';
import { cn } from '@/lib/utils';

const adminLastVisitedPathStorageKey = 'admin:lastVisitedPath';
const authLastVisitedPathStorageKey = 'auth:lastVisitedPath';

function getStoredCallbackTarget(callbackUrl) {
  if (typeof window === 'undefined') {
    return '/admin';
  }

  const safeCallbackFromQuery = normalizeProtectedPath(callbackUrl, window.location.origin);
  const safeLastVisitedAuth = normalizeProtectedPath(
    window.localStorage.getItem(authLastVisitedPathStorageKey) || '',
    window.location.origin,
  );
  const safeLastVisitedAdmin = normalizeProtectedPath(
    window.localStorage.getItem(adminLastVisitedPathStorageKey) || '',
    window.location.origin,
  );
  const safeReferrer = normalizeProtectedPath(document.referrer || '', window.location.origin);

  return safeCallbackFromQuery || safeLastVisitedAuth || safeLastVisitedAdmin || safeReferrer || '/admin';
}

async function parseJson(response) {
  return response.json().catch(() => ({}));
}

function Notice({ tone = 'info', children }) {
  const styles =
    tone === 'error'
      ? 'border-rose-200 bg-rose-50 text-rose-700'
      : 'border-amber-200 bg-amber-50 text-amber-700';

  return <div className={cn('rounded-2xl border px-4 py-3 text-sm font-medium', styles)}>{children}</div>;
}

function AuthField({ label, icon: Icon, trailing, children }) {
  return (
    <label className="block">
      <span className="mb-2.5 block text-sm font-semibold text-slate-800">{label}</span>
      <div className="group relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 transition group-focus-within:text-blue-500">
          <Icon className="h-5 w-5" />
        </span>
        {children}
        {trailing ? <div className="absolute right-3 top-1/2 -translate-y-1/2">{trailing}</div> : null}
      </div>
    </label>
  );
}

export default function AdminLoginPage() {
  const searchParams = useSearchParams();
  const callbackUrl = useMemo(() => searchParams.get('callbackUrl') || '/admin', [searchParams]);

  const [codeEmail, setCodeEmail] = useState('');
  const [codeOtp, setCodeOtp] = useState('');
  const [codeStep, setCodeStep] = useState('request');

  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [submittingMode, setSubmittingMode] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [redirecting, setRedirecting] = useState(false);
  const [neonConfigured, setNeonConfigured] = useState(false);

  useEffect(() => {
    let active = true;

    const checkSession = async () => {
      try {
        const response = await fetch('/api/session/status', {
          cache: 'no-store',
        });
        const payload = response.ok ? await parseJson(response) : null;
        if (!active || !payload) {
          return;
        }

        setNeonConfigured(Boolean(payload.neonConfigured));

        if (payload.authenticated) {
          const target = getStoredCallbackTarget(callbackUrl);
          setRedirecting(true);
          window.location.assign(target);
          return;
        }

        if (payload.state === 'pending') {
          setInfo('Your Neon account is connected, but your local workspace access is still waiting for admin approval.');
        } else if (payload.state === 'suspended') {
          setInfo('Your Neon identity is linked, but this local account is currently suspended.');
        } else if (payload.state === 'conflict') {
          setError('This Neon user cannot be linked automatically. Run the Neon audit/backfill flow before using this login.');
        } else if (!payload.neonConfigured) {
          setError('Neon auth is not configured yet.');
        }
      } finally {
        if (active) {
          setCheckingSession(false);
        }
      }
    };

    checkSession();
    return () => {
      active = false;
    };
  }, [callbackUrl]);

  const disableInputs = Boolean(submittingMode) || redirecting || checkingSession;

  const clearMessages = () => {
    setError('');
    setInfo('');
  };

  const startRedirect = (target, options = {}) => {
    const { allowExternal = false } = options;
    setRedirecting(true);

    if (allowExternal) {
      try {
        const resolved = new URL(target, window.location.origin);
        if (resolved.protocol === 'http:' || resolved.protocol === 'https:') {
          window.location.assign(resolved.toString());
          return;
        }
      } catch {
        // Fall back to protected internal routes if the OAuth target is malformed.
      }
    }

    window.location.assign(normalizeProtectedPath(target || '', window.location.origin) || '/admin');
  };

  const handleGoogle = async (flowMode = 'sign-in') => {
    clearMessages();
    setSubmittingMode('google');

    const response = await fetch('/api/neon/session/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callbackUrl: getStoredCallbackTarget(callbackUrl),
        mode: flowMode,
      }),
    });

    const payload = await parseJson(response);
    setSubmittingMode(null);

    if (!response.ok) {
      setError(payload.error || 'Unable to start Google sign-in.');
      return;
    }

    startRedirect(payload.redirectTo, { allowExternal: true });
  };

  const requestSignInCode = async () => {
    clearMessages();
    setSubmittingMode('send-code');

    const response = await fetch('/api/neon/session/send-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: codeEmail }),
    });

    const payload = await parseJson(response);
    setSubmittingMode(null);

    if (!response.ok) {
      setError(payload.error || 'Unable to send a sign-in code.');
      return false;
    }

    setCodeStep('verify');
    setInfo(payload.message || 'Check your email for the sign-in code.');
    return true;
  };

  const handleSendCode = async (event) => {
    event.preventDefault();
    await requestSignInCode();
  };

  const handleVerifyCode = async (event) => {
    event.preventDefault();
    clearMessages();
    setSubmittingMode('verify-code');

    const response = await fetch('/api/neon/session/verify-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callbackUrl: getStoredCallbackTarget(callbackUrl),
        email: codeEmail,
        otp: codeOtp,
      }),
    });

    const payload = await parseJson(response);
    setSubmittingMode(null);

    if (!response.ok) {
      setError(payload.error || 'Unable to verify that sign-in code.');
      return;
    }

    startRedirect(payload.redirectTo);
  };

  const primaryButtonClass =
    'h-14 w-full rounded-2xl border-0 bg-[#2563eb] text-base font-semibold text-white shadow-[0_20px_40px_-22px_rgba(37,99,235,0.9)] transition hover:bg-[#1d4ed8] disabled:bg-blue-300';
  const secondaryButtonClass =
    'h-[52px] w-full rounded-2xl border border-slate-200 bg-white text-[15px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50';

  return (
    <AuthShell
      hideBrandBadge
      headerVisual={
        <Image src="/jdn_logo.png" alt="JDN" width={280} height={92} className="h-20 w-auto object-contain sm:h-24" priority />
      }
      eyebrow="Admin Access"
      title="Welcome back"
      description="Sign in with an email code or Google."
      footer={
        <AuthFooterLinks
          secondaryHref="/"
          secondaryLabel="Return home"
          primaryHref="/register"
          primaryLabel="Need an account? Sign up"
        />
      }
    >
      <div className="space-y-5">
        {error ? <Notice tone="error">{error}</Notice> : null}
        {info ? <Notice>{info}</Notice> : null}

        <form className="space-y-5" onSubmit={codeStep === 'request' ? handleSendCode : handleVerifyCode}>
          <AuthField label="Email address" icon={Mail}>
            <Input
              value={codeEmail}
              disabled={disableInputs || codeStep === 'verify'}
              placeholder="Enter your email"
              autoComplete="email"
              type="email"
              required
              className="h-16 rounded-3xl border-slate-200 bg-slate-50/70 pl-12 pr-4 text-[15px] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]"
              onChange={(event) => setCodeEmail(event.target.value)}
            />
          </AuthField>

          {codeStep === 'verify' ? (
            <AuthField label="Verification code" icon={KeyRound}>
              <Input
                value={codeOtp}
                disabled={disableInputs}
                placeholder="Enter the code from your email"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                className="h-16 rounded-3xl border-slate-200 bg-slate-50/70 pl-12 pr-4 text-[15px] tracking-[0.35em] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]"
                onChange={(event) => setCodeOtp(event.target.value)}
              />
            </AuthField>
          ) : null}

          <Button type="submit" disabled={disableInputs || !neonConfigured} className={primaryButtonClass}>
            {submittingMode === 'send-code' || submittingMode === 'verify-code' || redirecting ? (
              <>
                <LoaderCircle className="mr-2 h-5 w-5 animate-spin" />
                {codeStep === 'request' ? 'Sending code...' : 'Verifying code...'}
              </>
            ) : checkingSession ? (
              'Checking session...'
            ) : codeStep === 'request' ? (
              <>
                <ArrowRight className="mr-2 h-5 w-5" />
                Send Code
              </>
            ) : (
              <>
                <KeyRound className="mr-2 h-5 w-5" />
                Sign In With Code
              </>
            )}
          </Button>

          {codeStep === 'verify' ? (
            <div className="flex items-center justify-between gap-3 text-sm">
              <button
                type="button"
                disabled={disableInputs}
                className="inline-flex items-center gap-2 font-semibold text-slate-500 transition hover:text-slate-900 disabled:text-slate-300"
                onClick={() => {
                  setCodeStep('request');
                  setCodeOtp('');
                  clearMessages();
                }}
              >
                <ArrowLeft className="h-4 w-4" />
                Change email
              </button>
              <button
                type="button"
                disabled={disableInputs}
                className="inline-flex items-center gap-2 font-semibold text-blue-600 transition hover:text-blue-700 disabled:text-slate-300"
                onClick={requestSignInCode}
              >
                <RefreshCw className="h-4 w-4" />
                Resend code
              </button>
            </div>
          ) : null}

          <AuthDivider />

          <Button
            type="button"
            disabled={disableInputs || !neonConfigured}
            className={secondaryButtonClass}
            onClick={() => handleGoogle('sign-in')}
          >
            {submittingMode === 'google' ? (
              <LoaderCircle className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <FcGoogle className="mr-2 h-5 w-5" />
            )}
            Continue with Google
          </Button>
        </form>

        <p className="text-center text-sm text-slate-500">
          New to the workspace?{' '}
          <Link href="/register" className="font-semibold text-blue-600 transition hover:text-blue-700">
            Create your account
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
