'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import {
  CalendarClock,
  Check,
  Clock3,
  Eye,
  ListChecks,
  Monitor,
  RefreshCw,
  Save,
  Shuffle,
  Star,
  Trash2,
} from 'lucide-react';
import ImageUpload from '@/components/ImageUpload';
import FieldErrorText from '@/components/forms/FieldErrorText';
import FormErrorSummary from '@/components/forms/FormErrorSummary';
import { clearFieldErrors, getFieldError, normalizeFormError } from '@/lib/form-client';
import { handleRequest } from '@/lib/handleRequest';
import { PORTFOLIO_THEMES, isPortfolioThemeId, normalizePortfolioThemeRandomPool } from '@/lib/portfolioThemes';
import { notifyRealtimeUpdate, revalidatePublicData } from '@/lib/realtime';
import { cardStyles, fetcher, inputStyles, withFieldError } from '@/modules/system/admin/settingsShared';

const isThemeMode = (value) => value === 'random' || isPortfolioThemeId(value);

const ROTATION_INTERVAL_OPTIONS = [
  { value: 0, label: 'Set 0 to rotate on every visit.' },
  { value: 30, label: 'Every 30 minutes (30 min)' },
  { value: 60, label: 'Every 1 hour (60 min)' },
  { value: 360, label: 'Every 6 hours (360 min)' },
  { value: 720, label: 'Every 12 hours (720 min)' },
  { value: 1440, label: 'Every 24 hours (1440 min)' },
  { value: 4320, label: 'Every 3 days (4320 min)' },
  { value: 10080, label: 'Every 7 days (10080 min)' },
];

const themeTitleMap = new Map(PORTFOLIO_THEMES.map((theme) => [theme.value, theme.title]));

function getThemeTitle(themeId) {
  return themeTitleMap.get(themeId) ?? themeId;
}

function formatRotationOptionLabel(minutes) {
  const match = ROTATION_INTERVAL_OPTIONS.find((option) => option.value === minutes);
  if (match) {
    return match.label;
  }

  if (!minutes) {
    return 'Set 0 to rotate on every visit.';
  }

  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return `Every ${days} day${days === 1 ? '' : 's'} (${minutes} min)`;
  }

  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `Every ${hours} hour${hours === 1 ? '' : 's'} (${minutes} min)`;
  }

  return `Every ${minutes} minutes`;
}

function formatDateTime(value, fallback = 'Not set yet') {
  if (!value) {
    return fallback;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  return date.toLocaleString();
}

function formatCountdown(ms) {
  if (!Number.isFinite(ms)) {
    return '--';
  }

  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

function SurfaceFrame({ children, className = '' }) {
  return (
    <div className={`relative h-[108px] overflow-hidden rounded-xl border border-slate-200 bg-white ${className}`}>
      {children}
    </div>
  );
}

function MinimalistEditorialPreview() {
  return (
    <SurfaceFrame className="bg-[#f8f5ef]">
      <div className="flex h-full">
        <div className="flex flex-1 flex-col justify-between px-4 py-4">
          <div className="space-y-2">
            <div className="h-1.5 w-16 rounded-full bg-slate-300" />
            <div className="max-w-[96px] text-[10px] font-medium leading-3 text-slate-700">
              Hello, I&apos;m Alex Morgan
            </div>
          </div>
          <div className="flex gap-1.5">
            <div className="h-1.5 w-5 rounded-full bg-slate-300" />
            <div className="h-1.5 w-7 rounded-full bg-slate-200" />
          </div>
        </div>
        <div className="flex w-full max-w-[42%] shrink items-end justify-center bg-[#f1eee8] px-3 pt-3">
          <div className="h-[82px] w-[62px] rounded-t-[36px] bg-[radial-gradient(circle_at_50%_28%,#fafafa_0,#ece9e1_38%,#cbc5ba_100%)]" />
        </div>
      </div>
    </SurfaceFrame>
  );
}

function EditorialBentoPreview() {
  return (
    <SurfaceFrame>
      <div className="grid h-full grid-cols-[1.08fr_0.92fr]">
        <div className="border-r border-slate-200 bg-[#f6f4ef] p-3">
          <div className="space-y-1">
            <div className="text-[9px] font-semibold text-slate-800">Alex Morgan</div>
            <div className="text-[7px] text-slate-500">Product Designer</div>
          </div>
          <div className="mt-8 rounded-md border border-slate-900 bg-white px-2 py-1 text-[6px] font-semibold text-slate-700">
            Selected Work
          </div>
        </div>
        <div className="grid grid-rows-2">
          <div className="relative border-b border-slate-200 bg-[#edf770] p-2">
            <div className="h-full rounded-md bg-[linear-gradient(135deg,#ffffff_0%,#e5edf8_44%,#dbeafe_100%)]" />
            <div className="absolute left-3 top-2 text-[6px] text-slate-500">Selected Series</div>
          </div>
          <div className="relative bg-[#dce9ff] p-2">
            <div className="h-full rounded-md border border-blue-200 bg-[linear-gradient(160deg,#f8fbff_0%,#d6e5ff_100%)]" />
            <div className="absolute left-3 top-2 text-[6px] font-medium text-blue-700">Case Studies</div>
          </div>
        </div>
      </div>
    </SurfaceFrame>
  );
}

function NeoEditorialPreview() {
  return (
    <SurfaceFrame className="bg-[#fcfbf8]">
      <div className="flex h-full">
        <div className="flex w-6 flex-col items-center gap-2 bg-[#161616] py-2">
          <div className="h-2 w-2 rounded-full bg-slate-200" />
          <div className="h-8 w-px bg-slate-500" />
          <div className="h-2 w-2 rounded-full border border-slate-500" />
        </div>
        <div className="flex-1 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-medium text-slate-800">Alex Morgan</div>
              <div className="text-[7px] text-slate-500">Designer &amp; Strategist</div>
            </div>
            <div className="max-w-[52px] text-right text-[5px] leading-2.5 text-orange-500">
              The next generation editorial portfolio.
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="h-10 rounded-md border border-orange-300 bg-[linear-gradient(135deg,#ff8b4d_0%,#d96228_100%)]" />
            <div className="h-10 rounded-md border border-orange-200 bg-[linear-gradient(135deg,#ef9d6d_0%,#ea7b38_100%)]" />
          </div>
        </div>
      </div>
    </SurfaceFrame>
  );
}

function ImmersiveThreeDPreview() {
  return (
    <SurfaceFrame className="bg-[radial-gradient(circle_at_72%_50%,rgba(78,132,255,0.36),rgba(4,9,19,0.95)_36%,#020617_75%)]">
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(15,23,42,0.92),rgba(15,23,42,0.1))]" />
      <div className="absolute left-4 top-4 text-[8px] font-semibold tracking-[0.24em] text-slate-100">
        ALEX MORGAN
      </div>
      <div className="absolute left-4 top-8 text-[6px] tracking-[0.18em] text-blue-100/80">
        PRODUCT DESIGNER
      </div>
      <div className="absolute bottom-3 left-4 rounded-full border border-blue-400/40 px-2 py-1 text-[6px] font-medium text-blue-100">
        VIEW WORK
      </div>
      <div className="absolute right-7 top-1/2 h-[84px] w-[84px] -translate-y-1/2 rounded-full border border-blue-300/60 bg-[radial-gradient(circle_at_35%_35%,rgba(255,255,255,0.7),rgba(89,146,255,0.3)_35%,rgba(5,8,19,0.05)_58%,transparent_65%)] shadow-[0_0_28px_rgba(59,130,246,0.45)]" />
    </SurfaceFrame>
  );
}

function ClassicPreview() {
  return (
    <SurfaceFrame className="bg-[#faf9f6]">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
          <div className="text-[9px] font-semibold text-slate-800">Alex Morgan</div>
          <div className="flex gap-2 text-[6px] text-slate-400">
            <span>Work</span>
            <span>About</span>
            <span>Journal</span>
            <span>Contact</span>
          </div>
        </div>
        <div className="grid flex-1 grid-cols-[0.9fr_1.1fr] gap-3 px-3 py-3">
          <div className="space-y-2">
            <div className="text-[7px] text-slate-500">Product Designer</div>
            <div className="h-2 w-16 rounded-full bg-slate-800" />
            <div className="h-1.5 w-14 rounded-full bg-slate-200" />
            <div className="h-1.5 w-12 rounded-full bg-slate-200" />
          </div>
          <div className="rounded-md bg-[linear-gradient(180deg,#dde6de_0%,#aab8ac_100%)]" />
        </div>
      </div>
    </SurfaceFrame>
  );
}

function ThemePreviewArt({ themeValue }) {
  switch (themeValue) {
    case 'minimalist-editorial':
      return <MinimalistEditorialPreview />;
    case 'editorial-bento':
      return <EditorialBentoPreview />;
    case 'neo-editorial':
      return <NeoEditorialPreview />;
    case 'immersive-3d':
      return <ImmersiveThreeDPreview />;
    case 'classic':
      return <ClassicPreview />;
    default:
      return <SurfaceFrame />;
  }
}

function ThemeIconToggle({
  active,
  onClick,
  label,
  activeIcon: ActiveIcon,
  inactiveIcon: InactiveIcon,
  activeClassName,
  inactiveClassName,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full border bg-white/95 shadow-sm transition hover:scale-[1.03] ${
        active
          ? `border-blue-200 ${activeClassName}`
          : `border-slate-200 ${inactiveClassName}`
      }`}
    >
      {active ? <ActiveIcon className="h-4 w-4 fill-current" /> : <InactiveIcon className="h-4 w-4" />}
    </button>
  );
}

function StatusRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start justify-between gap-3 py-3 text-sm">
      <div className="flex items-center gap-2 text-slate-500">
        <Icon className="h-4 w-4" />
        <span>{label}</span>
      </div>
      <span className="max-w-[58%] text-right font-medium text-slate-700">{value}</span>
    </div>
  );
}

function ActionButton({ children, variant = 'secondary', className = '', ...props }) {
  const styles =
    variant === 'primary'
      ? 'border border-blue-600 bg-blue-600 text-white hover:bg-blue-700'
      : variant === 'ghost-danger'
        ? 'border border-slate-200 bg-white text-rose-500 hover:bg-rose-50'
        : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50';

  return (
    <button
      type="button"
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${styles} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function SiteBrandingSection() {
  const [branding, setBranding] = useState({
    logoText: '',
    logoImage: '',
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [roleBlocked, setRoleBlocked] = useState(false);
  const { data: siteConfigData, error: siteConfigError, isLoading: loading, mutate } = useSWR('/api/site-config', fetcher);

  useEffect(() => {
    if (!siteConfigData) {
      return;
    }

    setBranding({
      logoText: typeof siteConfigData?.logoText === 'string' ? siteConfigData.logoText : '',
      logoImage: typeof siteConfigData?.logoImage === 'string' ? siteConfigData.logoImage : '',
    });
    setFormError('');
    setFieldErrors({});
  }, [siteConfigData]);

  useEffect(() => {
    if (!siteConfigError) {
      return;
    }

    const message = siteConfigError instanceof Error ? siteConfigError.message : 'Unable to load site configuration';
    setFormError(message);
    toast.error('Unable to load site configuration', { description: message });
  }, [siteConfigError]);

  const submit = async (event) => {
    event.preventDefault();

    setFormError('');
    setFieldErrors({});
    setRoleBlocked(false);
    setSaving(true);

    try {
      const updatePromise = handleRequest(() =>
        fetch('/api/site-config', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            logoText: branding.logoText.trim(),
            logoImage: branding.logoImage.trim(),
          }),
        }),
      );

      toast.promise(updatePromise, {
        loading: 'Saving site config...',
        success: 'Site config updated.',
        error: (error) => (error instanceof Error ? error.message : 'Unable to update site config'),
      });

      await updatePromise;
      await revalidatePublicData();
      notifyRealtimeUpdate();
      await mutate();
    } catch (requestError) {
      const nextError = normalizeFormError(requestError, 'Unable to update site config');
      if (nextError.errorCode === 'FORBIDDEN') {
        setRoleBlocked(true);
        setFormError('Your account role cannot update site settings. Ask a super admin to grant editor/admin access.');
        setFieldErrors({});
        return;
      }
      setFormError(nextError.formError);
      setFieldErrors(nextError.fieldErrors);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={`${cardStyles} overflow-hidden`}>
      <form onSubmit={submit} className="space-y-4 p-3 sm:p-4">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">Branding</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Manage the public portfolio logo text and image used across the site.
            </p>
          </div>
          <button
            type="submit"
            disabled={saving || loading || roleBlocked}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-blue-600 bg-blue-600 px-4 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {roleBlocked ? 'Insufficient permissions' : saving ? 'Saving...' : 'Save branding'}
          </button>
        </div>

        <FormErrorSummary error={formError} fieldErrors={fieldErrors} />

        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            Logo text
            <input
              type="text"
              value={branding.logoText}
              onChange={(event) => {
                setBranding((previous) => ({ ...previous, logoText: event.target.value }));
                setFieldErrors((current) => clearFieldErrors(current, 'logoText'));
              }}
              aria-invalid={Boolean(getFieldError(fieldErrors, 'logoText'))}
              className={withFieldError(`${inputStyles} rounded-xl border-slate-200`, Boolean(getFieldError(fieldErrors, 'logoText')))}
            />
            <FieldErrorText error={getFieldError(fieldErrors, 'logoText')} />
          </label>

          <div className="space-y-2">
            <ImageUpload
              id="site-config-logo-image"
              label="Logo image"
              value={branding.logoImage}
              onChange={(uploadedUrl) => {
                setBranding((previous) => ({ ...previous, logoImage: uploadedUrl }));
                setFieldErrors((current) => clearFieldErrors(current, 'logoImage'));
              }}
            />
            <FieldErrorText error={getFieldError(fieldErrors, 'logoImage')} />
          </div>
        </div>
      </form>
    </section>
  );
}

export default function SiteConfigSection() {
  const [siteConfig, setSiteConfig] = useState({
    logoText: '',
    logoImage: '',
    portfolioTheme: 'editorial-bento',
    portfolioThemeRotationMinutes: 0,
    portfolioThemeRandomPool: PORTFOLIO_THEMES.map((theme) => theme.value),
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [roleBlocked, setRoleBlocked] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [themeActionLoading, setThemeActionLoading] = useState(false);
  const { data: siteConfigData, error: siteConfigError, isLoading: loading, mutate } = useSWR('/api/site-config', fetcher);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!siteConfigData) {
      return;
    }

    setSiteConfig({
      logoText: typeof siteConfigData?.logoText === 'string' ? siteConfigData.logoText : '',
      logoImage: typeof siteConfigData?.logoImage === 'string' ? siteConfigData.logoImage : '',
      portfolioTheme: isThemeMode(siteConfigData?.portfolioTheme) ? siteConfigData.portfolioTheme : 'editorial-bento',
      portfolioThemeRotationMinutes:
        typeof siteConfigData?.portfolioThemeRotationMinutes === 'number'
          ? siteConfigData.portfolioThemeRotationMinutes
          : 0,
      portfolioThemeRandomPool: normalizePortfolioThemeRandomPool(siteConfigData?.portfolioThemeRandomPool),
    });
    setFormError('');
    setFieldErrors({});
  }, [siteConfigData]);

  useEffect(() => {
    if (!siteConfigError) {
      return;
    }

    const message = siteConfigError instanceof Error ? siteConfigError.message : 'Unable to load site configuration';
    setFormError(message);
    toast.error('Unable to load site configuration', { description: message });
  }, [siteConfigError]);

  const submit = async (event) => {
    event.preventDefault();

    setFormError('');
    setFieldErrors({});
    setRoleBlocked(false);
    setSaving(true);

    if (siteConfig.portfolioThemeRandomPool.length === 0) {
      setFieldErrors({ portfolioThemeRandomPool: ['Choose at least one theme for random selection.'] });
      setSaving(false);
      return;
    }

    try {
      const updatePromise = handleRequest(() =>
        fetch('/api/site-config', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            logoText: siteConfig.logoText.trim(),
            logoImage: siteConfig.logoImage.trim(),
            portfolioTheme: siteConfig.portfolioTheme,
            portfolioThemeRotationMinutes: siteConfig.portfolioThemeRotationMinutes,
            portfolioThemeRandomPool: siteConfig.portfolioThemeRandomPool,
          }),
        }),
      );

      toast.promise(updatePromise, {
        loading: 'Saving site config...',
        success: 'Site config updated.',
        error: (error) => (error instanceof Error ? error.message : 'Unable to update site config'),
      });

      await updatePromise;
      await revalidatePublicData();
      notifyRealtimeUpdate();
      await mutate();
    } catch (requestError) {
      const nextError = normalizeFormError(requestError, 'Unable to update site config');
      if (nextError.errorCode === 'FORBIDDEN') {
        setRoleBlocked(true);
        setFormError('Your account role cannot update site settings. Ask a super admin to grant editor/admin access.');
        setFieldErrors({});
        return;
      }
      setFormError(nextError.formError);
      setFieldErrors(nextError.fieldErrors);
    } finally {
      setSaving(false);
    }
  };

  const setThemeMode = (mode) => {
    if (mode === 'random') {
      const pool = siteConfig.portfolioThemeRandomPool.filter(isPortfolioThemeId);
      if (pool.length === 0) {
        setFieldErrors((current) => ({
          ...current,
          portfolioThemeRandomPool: ['Choose at least one theme for random selection.'],
        }));
        return;
      }
    }

    setSiteConfig((previous) => ({ ...previous, portfolioTheme: mode }));
    setFieldErrors((current) =>
      clearFieldErrors(clearFieldErrors(current, 'portfolioTheme'), 'portfolioThemeRandomPool'),
    );
  };

  const toggleRandomPoolTheme = (themeValue) => {
    setSiteConfig((previous) => {
      const included = previous.portfolioThemeRandomPool.includes(themeValue);
      return {
        ...previous,
        portfolioThemeRandomPool: included
          ? previous.portfolioThemeRandomPool.filter((value) => value !== themeValue)
          : [...previous.portfolioThemeRandomPool, themeValue],
      };
    });
    setFieldErrors((current) => clearFieldErrors(current, 'portfolioThemeRandomPool'));
  };

  const randomStatus =
    siteConfigData?.randomThemeStatus && typeof siteConfigData.randomThemeStatus === 'object'
      ? siteConfigData.randomThemeStatus
      : null;
  const rotationMinutes = Number(siteConfig.portfolioThemeRotationMinutes) || 0;
  const nextRotationAtMs = randomStatus?.nextRotationAt ? Date.parse(randomStatus.nextRotationAt) : null;
  const msRemaining = Number.isFinite(nextRotationAtMs) ? Math.max(0, nextRotationAtMs - now) : null;
  const includedThemesPreview = useMemo(
    () => siteConfig.portfolioThemeRandomPool.filter(isPortfolioThemeId),
    [siteConfig.portfolioThemeRandomPool],
  );
  const includedCount = includedThemesPreview.length;
  const randomWarning =
    siteConfig.portfolioTheme === 'random' && includedCount === 0
      ? 'No themes are included in rotation. A fallback theme will be used.'
      : siteConfig.portfolioTheme === 'random' && includedCount === 1
        ? 'Only one theme is included, so auto-rotation cannot switch to another layout.'
        : '';
  const currentThemeId =
    typeof randomStatus?.currentTheme === 'string'
      ? randomStatus.currentTheme
      : typeof siteConfigData?.activePortfolioTheme === 'string'
        ? siteConfigData.activePortfolioTheme
        : siteConfig.portfolioTheme === 'random'
          ? includedThemesPreview[0] || 'editorial-bento'
          : siteConfig.portfolioTheme;
  const themeListLabel = includedThemesPreview.map(getThemeTitle).join(', ') || 'None';
  const isRandomMode = siteConfig.portfolioTheme === 'random';
  const rotationSelectValue =
    ROTATION_INTERVAL_OPTIONS.some((option) => option.value === rotationMinutes) || rotationMinutes === 0
      ? String(rotationMinutes)
      : '__custom__';

  const triggerThemeAction = async (action) => {
    setThemeActionLoading(true);
    try {
      const response = await handleRequest(() =>
        fetch('/api/site-config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action,
            logoText: siteConfig.logoText.trim(),
            logoImage: siteConfig.logoImage.trim(),
            portfolioTheme: siteConfig.portfolioTheme,
            portfolioThemeRotationMinutes: siteConfig.portfolioThemeRotationMinutes,
            portfolioThemeRandomPool: siteConfig.portfolioThemeRandomPool,
          }),
        }),
      );
      await revalidatePublicData();
      notifyRealtimeUpdate();
      await mutate(response, false);
      toast.success(
        action === 'rotate_now'
          ? 'Theme rotated now.'
          : action === 'preview_next'
            ? 'Next theme preview refreshed.'
            : 'Theme cache refreshed.',
      );
    } catch (requestError) {
      const nextError = normalizeFormError(requestError, 'Unable to process theme action');
      toast.error(nextError.formError);
    } finally {
      setThemeActionLoading(false);
    }
  };

  return (
    <section className={`${cardStyles} overflow-hidden`}>
      <form onSubmit={submit} className="space-y-4 p-3 sm:p-4">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">Portfolio Theme</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Choose how your public portfolio theme is displayed without changing your content.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href="/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <Eye className="h-4 w-4" />
              Preview
            </a>
            <button
              type="submit"
              disabled={saving || loading || roleBlocked}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-blue-600 bg-blue-600 px-4 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {roleBlocked ? 'Insufficient permissions' : saving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </div>

        <FormErrorSummary error={formError} fieldErrors={fieldErrors} />

        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-2 sm:inline-flex sm:flex-row">
          <label
            className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition ${
              !isRandomMode ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-500'
            }`}
          >
            <input
              type="radio"
              name="portfolioThemeMode"
              checked={!isRandomMode}
              onChange={() => setThemeMode(currentThemeId && currentThemeId !== 'random' ? currentThemeId : 'editorial-bento')}
              className="h-4 w-4 border-slate-300 text-blue-600"
            />
            Use one theme
          </label>
          <label
            className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition ${
              isRandomMode ? 'bg-white text-slate-900 shadow-sm ring-1 ring-blue-200' : 'text-slate-500'
            }`}
          >
            <input
              type="radio"
              name="portfolioThemeMode"
              checked={isRandomMode}
              onChange={() => setThemeMode('random')}
              className="h-4 w-4 border-slate-300 text-blue-600"
            />
            Auto-rotate themes
          </label>
        </div>

        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)]">
          <aside className="min-w-0 space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Rotation Settings</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    {isRandomMode ? 'Auto-rotate enabled' : 'Switch to auto-rotate to schedule theme changes.'}
                  </p>
                </div>
                {isRandomMode ? (
                  <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
                    Auto-rotate enabled
                  </span>
                ) : null}
              </div>

              <div className="mt-5 space-y-4">
                <label className="block text-sm font-medium text-slate-700">
                  Rotation interval
                  <select
                    value={rotationSelectValue}
                    onChange={(event) => {
                      const rawValue = event.target.value;
                      if (rawValue === '__custom__') {
                        return;
                      }

                      const nextValue = Number(rawValue);
                      setSiteConfig((previous) => ({
                        ...previous,
                        portfolioThemeRotationMinutes: Number.isFinite(nextValue)
                          ? Math.max(0, Math.min(nextValue, 60 * 24 * 30))
                          : 0,
                      }));
                      setFieldErrors((current) => clearFieldErrors(current, 'portfolioThemeRotationMinutes'));
                    }}
                    className={`mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 ${withFieldError('', Boolean(getFieldError(fieldErrors, 'portfolioThemeRotationMinutes')))}`}
                    disabled={!isRandomMode}
                  >
                    {ROTATION_INTERVAL_OPTIONS.map((option) => (
                      <option key={option.value} value={String(option.value)}>
                        {option.label}
                      </option>
                    ))}
                    {rotationSelectValue === '__custom__' ? (
                      <option value="__custom__">{formatRotationOptionLabel(rotationMinutes)}</option>
                    ) : null}
                  </select>
                  <span className="mt-2 block text-xs text-slate-500">
                    {rotationMinutes === 0 ? 'Set 0 to rotate on every visit.' : 'Change how often the public theme rotates.'}
                  </span>
                  <FieldErrorText error={getFieldError(fieldErrors, 'portfolioThemeRotationMinutes')} />
                </label>

                <div className="space-y-2">
                  <ActionButton
                    onClick={() => triggerThemeAction('rotate_now')}
                    disabled={!isRandomMode || themeActionLoading || saving}
                    variant="primary"
                    className="w-full"
                  >
                    <RefreshCw className={`h-4 w-4 ${themeActionLoading ? 'animate-spin' : ''}`} />
                    Rotate now
                  </ActionButton>
                  <ActionButton
                    onClick={async () => {
                      await revalidatePublicData();
                      notifyRealtimeUpdate();
                      await mutate();
                      toast.success('Theme cache refreshed.');
                    }}
                    disabled={themeActionLoading || saving}
                    variant="ghost-danger"
                    className="w-full"
                  >
                    <Trash2 className="h-4 w-4" />
                    Clear cache
                  </ActionButton>
                </div>

                {randomWarning ? <p className="text-xs text-amber-600">{randomWarning}</p> : null}
                {randomStatus?.warning ? <p className="text-xs text-amber-600">{randomStatus.warning}</p> : null}
                {randomStatus?.note ? <p className="text-xs text-slate-500">{randomStatus.note}</p> : null}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-sm font-semibold text-slate-900">Current Status</h3>
              <div className="mt-3 divide-y divide-slate-100">
                <StatusRow icon={Monitor} label="Current public theme" value={getThemeTitle(currentThemeId || 'N/A')} />
                <StatusRow icon={ListChecks} label="Included themes" value={`${includedCount} selected`} />
                <StatusRow icon={ListChecks} label="Theme list" value={themeListLabel} />
                <StatusRow icon={Clock3} label="Last rotation" value={formatDateTime(randomStatus?.lastRotatedAt)} />
                <StatusRow
                  icon={CalendarClock}
                  label="Next scheduled rotation"
                  value={
                    isRandomMode
                      ? rotationMinutes === 0
                        ? 'On next visit'
                        : formatDateTime(randomStatus?.nextRotationAt, 'Not scheduled')
                      : 'Not enabled'
                  }
                />
                <StatusRow
                  icon={Shuffle}
                  label="Next theme"
                  value={isRandomMode ? getThemeTitle(randomStatus?.nextTheme || 'N/A') : 'N/A'}
                />
                <StatusRow
                  icon={Clock3}
                  label="Countdown"
                  value={isRandomMode ? (rotationMinutes > 0 ? (msRemaining === 0 ? 'Due now' : formatCountdown(msRemaining)) : 'Every visit') : '--'}
                />
              </div>
            </div>
          </aside>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-slate-900">Theme Library</h3>
              <p className="mt-1 text-sm text-slate-500">
                Select a primary theme or choose themes to include in auto-rotation.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {PORTFOLIO_THEMES.map((theme) => {
                const selected = !isRandomMode && siteConfig.portfolioTheme === theme.value;
                const includedInRandom = siteConfig.portfolioThemeRandomPool.includes(theme.value);
                const isCurrent = currentThemeId === theme.value;

                return (
                  <article
                    key={theme.value}
                    className={`rounded-xl border p-4 transition ${
                      selected || isCurrent
                        ? 'border-blue-400 bg-blue-50/50 shadow-[0_0_0_1px_rgba(96,165,250,0.15)]'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="relative">
                      <div className="absolute left-3 top-3 z-10 flex items-center gap-2">
                        <ThemeIconToggle
                          active={includedInRandom}
                          onClick={() => toggleRandomPoolTheme(theme.value)}
                          label={includedInRandom ? 'Included in rotation' : 'Include in rotation'}
                          activeIcon={Check}
                          inactiveIcon={Check}
                          activeClassName="bg-emerald-50 text-emerald-600"
                          inactiveClassName="text-transparent"
                        />
                      </div>
                      <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
                        <ThemeIconToggle
                          active={selected}
                          onClick={() => {
                            setSiteConfig((previous) => ({ ...previous, portfolioTheme: theme.value }));
                            setFieldErrors((current) => clearFieldErrors(current, 'portfolioTheme'));
                          }}
                          label={selected ? 'Primary theme selected' : 'Set as primary theme'}
                          activeIcon={Star}
                          inactiveIcon={Star}
                          activeClassName="bg-amber-50 text-amber-500"
                          inactiveClassName="text-slate-300"
                        />
                        {isCurrent ? (
                          <span className="rounded-full bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white">
                            Current
                          </span>
                        ) : null}
                      </div>
                      <ThemePreviewArt themeValue={theme.value} />
                    </div>

                    <div className="mt-4">
                      <h4 className="text-base font-semibold text-slate-900">{theme.title}</h4>
                      <p className="mt-1 text-sm leading-6 text-slate-500">{theme.description}</p>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="mt-4">
              <FieldErrorText error={getFieldError(fieldErrors, 'portfolioTheme')} />
              <FieldErrorText error={getFieldError(fieldErrors, 'portfolioThemeRandomPool')} />
            </div>
          </div>
        </div>

      </form>
    </section>
  );
}
