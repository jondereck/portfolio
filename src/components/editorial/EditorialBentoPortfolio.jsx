/* eslint-disable @next/next/no-img-element */
'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import FormErrorSummary from '@/components/forms/FormErrorSummary';
import { splitAboutHighlightPoints } from '@/lib/aboutHighlights';
import { normalizeFormError, parseErrorResponse } from '@/lib/form-client';
import { defaultNavigation } from '@/lib/siteContentDefaults';
import { useLoadingStore } from '@/store/loading';
import { isSafeHttpUrl } from '@/lib/url-safety';
import { compareCertificatesByIssuedAtDesc, isPdfAssetUrl, toCloudinaryPdfPreviewUrl } from '@/lib/certificates';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/src/components/ui/dialog';

const cx = (...classes) => classes.filter(Boolean).join(' ');
const BENTO_ADMIN_CLICK_WINDOW_MS = 550;

const fetcher = (url) =>
  fetch(url, { cache: 'no-store' }).then((response) => {
    if (!response.ok) {
      throw new Error('Unable to load portfolio data.');
    }
    return response.json();
  });

const withProfile = (path, profileSlug) => {
  if (!profileSlug) {
    return path;
  }

  const joiner = path.includes('?') ? '&' : '?';
  return `${path}${joiner}profile=${encodeURIComponent(profileSlug)}`;
};

function Icon({ name, className = 'h-5 w-5' }) {
  const common = {
    className,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true',
  };

  const icons = {
    arrow: (
      <>
        <path d="M5 12h14" />
        <path d="m13 6 6 6-6 6" />
      </>
    ),
    arrowUp: (
      <>
        <path d="M7 17 17 7" />
        <path d="M7 7h10v10" />
      </>
    ),
    check: <path d="m20 6-11 11-5-5" />,
    database: (
      <>
        <ellipse cx="12" cy="5" rx="8" ry="3" />
        <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
        <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
      </>
    ),
    file: (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
        <path d="M14 2v6h6" />
        <path d="M8 13h8" />
        <path d="M8 17h5" />
      </>
    ),
    github: (
      <>
        <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-1.5 6-6.5.1-1.3-.3-2.6-1-3.7.3-1.1.3-2.3 0-3.3 0 0-1 0-3 1.5a10.3 10.3 0 0 0-5.5 0C8.5 1 7.5 1 7.5 1c-.3 1-.3 2.2 0 3.3a5.4 5.4 0 0 0-1 3.7c0 5 3 6.5 6 6.5a4.8 4.8 0 0 0-1 3.5v4" />
        <path d="M9 18c-4.5 2-5-2-7-2" />
      </>
    ),
    mail: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6" />
      </>
    ),
    map: (
      <>
        <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="3" />
      </>
    ),
    menu: (
      <>
        <path d="M4 6h16" />
        <path d="M4 12h16" />
        <path d="M4 18h16" />
      </>
    ),
    moon: <path d="M12 3a6 6 0 0 0 9 7.2A9 9 0 1 1 12 3Z" />,
    send: (
      <>
        <path d="m22 2-7 20-4-9-9-4Z" />
        <path d="M22 2 11 13" />
      </>
    ),
    shield: (
      <>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    spark: (
      <>
        <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z" />
        <path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8Z" />
      </>
    ),
    x: (
      <>
        <path d="M18 6 6 18" />
        <path d="m6 6 12 12" />
      </>
    ),
  };

  return <svg {...common}>{icons[name] || icons.spark}</svg>;
}

const normalizeLinks = (config) => {
  const source =
    Array.isArray(config?.navigation?.links) && config.navigation.links.length > 0
      ? config.navigation.links
      : defaultNavigation.links;

  return source
    .filter((link) => link && link.isVisible !== false)
    .sort((left, right) => Number(left.sortOrder ?? 0) - Number(right.sortOrder ?? 0))
    .map((link) => ({
      label: typeof link.label === 'string' && link.label.trim() ? link.label.trim() : 'Link',
      target: typeof link.target === 'string' ? link.target.trim() : '',
      type: link.type === 'url' ? 'url' : 'section',
    }))
    .filter((link) => link.target);
};

const normalizeTech = (value) => {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean);
  return [];
};

const normalizeDescriptions = (value) => {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === 'string') return value.split('\n').map((item) => item.trim()).filter(Boolean);
  return [];
};

const toIsoDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

const formatExperienceYears = (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    return '';
  }

  const earliestStart = items
    .map((item) => (item?.startDate ? new Date(item.startDate).getTime() : Number.NaN))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right)[0];

  if (!Number.isFinite(earliestStart)) {
    return '';
  }

  const yearMs = 365.25 * 24 * 60 * 60 * 1000;
  const years = Math.max(1, Math.floor((Date.now() - earliestStart) / yearMs));
  return `${years}+ ${years === 1 ? 'yr' : 'yrs'}`;
};

const getMostUsedTech = (projects) => {
  if (!Array.isArray(projects) || projects.length === 0) {
    return '';
  }

  const counts = new Map();
  projects.forEach((project) => {
    normalizeTech(project?.tech ?? project?.techStack).forEach((tech) => {
      counts.set(tech, (counts.get(tech) ?? 0) + 1);
    });
  });

  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? '';
};

const getSafeImage = (value) => (isSafeHttpUrl(value) ? value : '');

const getInitials = (value = '') => {
  const [first = '', second = ''] = String(value).trim().split(' ');
  return ((first[0] || '') + (second[0] || '')).toUpperCase() || 'N';
};

function MediaAvatar({ src, alt, className = 'h-12 w-12 rounded-2xl' }) {
  const image = getSafeImage(src);

  return (
    <div className={cx('relative shrink-0 overflow-hidden border-2 border-slate-950 bg-white', className)}>
      {image ? (
        <img src={image} alt={alt} className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center bg-lime-300 text-xs font-black text-slate-950">
          {getInitials(alt)}
        </span>
      )}
    </div>
  );
}

function Logo({ config }) {
  const adminClickStateRef = useRef({ count: 0, timerId: null });
  const logoText = typeof config?.logoText === 'string' && config.logoText.trim() ? config.logoText.trim() : '';
  const logoImage = isSafeHttpUrl(config?.logoImage) ? config.logoImage : '';

  if (!logoText && !logoImage) {
    return null;
  }

  const initial = logoText.trim()[0]?.toUpperCase() || 'N';

  const clearAdminClicks = useCallback(() => {
    if (adminClickStateRef.current.timerId) {
      window.clearTimeout(adminClickStateRef.current.timerId);
      adminClickStateRef.current.timerId = null;
    }
    adminClickStateRef.current.count = 0;
  }, []);

  const handleLogoClick = (event) => {
    if ('button' in event && event.button !== 0) {
      return;
    }

    const nextCount = adminClickStateRef.current.count + 1;
    if (adminClickStateRef.current.timerId) {
      window.clearTimeout(adminClickStateRef.current.timerId);
    }

    if (nextCount >= 3) {
      event.preventDefault();
      clearAdminClicks();
      window.location.assign('/admin/login');
      return;
    }

    adminClickStateRef.current.count = nextCount;
    adminClickStateRef.current.timerId = window.setTimeout(() => {
      clearAdminClicks();
    }, BENTO_ADMIN_CLICK_WINDOW_MS);
  };

  useEffect(() => () => clearAdminClicks(), [clearAdminClicks]);

  return (
    <a href="#home" onClick={handleLogoClick} className="flex items-center gap-3">
      {logoImage ? (
        <img src={logoImage} alt={logoText} className="h-12 w-12 rounded-[1.1rem] object-contain shadow-lg" />
      ) : (
        <div className="relative grid h-12 w-12 place-items-center overflow-hidden rounded-[1.1rem] bg-slate-950 text-white shadow-lg">
          <div className="absolute -left-3 top-1/2 h-12 w-12 -translate-y-1/2 rounded-full bg-lime-300" />
          <div className="absolute -right-4 top-1 h-12 w-12 rounded-full bg-blue-500" />
          <span className="relative text-xl font-black">{initial}</span>
        </div>
      )}
      <div>
        <p className="text-base font-black tracking-tight text-slate-950">{logoText}</p>
      </div>
    </a>
  );
}

function Header({ config, onToggleDark }) {
  const [open, setOpen] = useState(false);
  const links = useMemo(() => normalizeLinks(config), [config]);

  const renderLink = (link, isMobile = false) => {
    const className = isMobile
      ? 'rounded-2xl px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-100'
      : 'rounded-full px-4 py-2 text-sm font-black text-slate-700 transition hover:bg-slate-950 hover:text-white';
    const href = link.type === 'url' || !link.target.startsWith('#') ? link.target : link.target;
    const external = isSafeHttpUrl(href);

    return (
      <a
        key={`${link.label}-${link.target}`}
        href={href}
        target={external ? '_blank' : undefined}
        rel={external ? 'noreferrer' : undefined}
        onClick={isMobile ? () => setOpen(false) : undefined}
        className={className}
      >
        {link.label}
      </a>
    );
  };

  return (
    <header className="sticky top-0 z-50 border-b border-slate-950/10 bg-[#F5F1E8]/85 backdrop-blur-2xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Logo config={config} />
        <nav className="hidden items-center gap-2 lg:flex">{links.map((link) => renderLink(link))}</nav>
        <div className="flex items-center gap-2">
          <a href="#contact" className="hidden rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-lg shadow-slate-950/10 transition hover:-translate-y-0.5 sm:inline-flex">
            Let's Talk
          </a>
          <button
            type="button"
            onClick={onToggleDark}
            className="grid h-11 w-11 place-items-center rounded-full border border-slate-950/10 bg-white text-slate-950"
            aria-label="Toggle dark mode"
          >
            <Icon name="moon" className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="grid h-11 w-11 place-items-center rounded-full border border-slate-950/10 bg-white text-slate-950 lg:hidden"
            aria-label="Toggle navigation"
          >
            <Icon name={open ? 'x' : 'menu'} />
          </button>
        </div>
      </div>
      {open ? (
        <div className="border-t border-slate-950/10 px-4 pb-4 lg:hidden">
          <nav className="mx-auto grid max-w-7xl gap-2 rounded-3xl bg-white p-3 shadow-xl shadow-slate-950/5">
            {links.map((link) => renderLink(link, true))}
          </nav>
        </div>
      ) : null}
    </header>
  );
}

function SectionHeading({ eyebrow, title, desc, dark = false }) {
  return (
    <div className="mb-8">
      <p className={cx('text-xs font-black uppercase tracking-[0.28em]', dark ? 'text-lime-300' : 'text-blue-700')}>
        {eyebrow}
      </p>
      <h2 className={cx('mt-2 max-w-3xl text-4xl font-black tracking-tight sm:text-5xl', dark ? 'text-white' : 'text-slate-950')}>
        {title}
      </h2>
      {desc ? <p className={cx('mt-4 max-w-2xl text-base leading-8', dark ? 'text-slate-300' : 'text-slate-600')}>{desc}</p> : null}
    </div>
  );
}

function PortraitCard({ highlightValue = '', highlightLabel = '', image = '', title = 'Profile image' }) {
  const heroImage = getSafeImage(image);

  return (
    <div className="relative">
      <div className="absolute -inset-4 rounded-[2.5rem] bg-blue-500/20 blur-2xl" />
      <div className="relative overflow-hidden rounded-[2rem] border-[3px] border-slate-950 bg-slate-950 shadow-2xl shadow-slate-950/20">
        <div className="absolute left-0 top-0 h-full w-full bg-[radial-gradient(circle_at_50%_0%,rgba(132,204,22,.35),transparent_28%),radial-gradient(circle_at_0%_70%,rgba(37,99,235,.45),transparent_28%)]" />
        <div className="relative mx-auto grid min-h-[500px] max-w-[380px] place-items-end px-8 pt-10">
          {highlightValue ? <div className="absolute bottom-8 left-5 z-10 rounded-2xl bg-lime-300 p-4 text-slate-950 shadow-xl">
            <p className="text-2xl font-black">{highlightValue}</p>
            {highlightLabel ? <p className="text-xs font-black uppercase tracking-wider">{highlightLabel}</p> : null}
          </div> : null}
          {heroImage ? (
            <div className="relative h-[430px] w-[280px] overflow-hidden rounded-t-[9rem] border-[10px] border-slate-100 bg-slate-100 shadow-2xl">
              <img src={heroImage} alt={title} className="h-full w-full object-cover" />
              <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-slate-950/45 to-transparent" />
            </div>
          ) : (
            <div className="relative h-[430px] w-[280px] rounded-t-[9rem] bg-gradient-to-b from-slate-100 to-slate-300">
              <div className="absolute left-1/2 top-8 h-28 w-28 -translate-x-1/2 rounded-full bg-gradient-to-b from-amber-100 to-orange-200 shadow-inner" />
              <div className="absolute left-1/2 top-3 h-16 w-32 -translate-x-1/2 rounded-t-full bg-slate-900" />
              <div className="absolute left-1/2 top-[142px] h-64 w-52 -translate-x-1/2 rounded-t-[4.5rem] bg-gradient-to-b from-white to-slate-100" />
              <div className="absolute left-[94px] top-[108px] h-2 w-2 rounded-full bg-slate-950" />
              <div className="absolute right-[94px] top-[108px] h-2 w-2 rounded-full bg-slate-950" />
              <div className="absolute left-1/2 top-[130px] h-1 w-12 -translate-x-1/2 rounded-full bg-slate-700/60" />
              <div className="absolute left-[150px] top-[145px] h-64 w-16 rotate-[-18deg] rounded-full bg-gradient-to-b from-blue-700 via-blue-600 to-blue-900 shadow-lg" />
              <div className="absolute left-[166px] top-[185px] text-3xl font-black text-amber-300">P</div>
              <div className="absolute bottom-8 left-1/2 h-16 w-36 -translate-x-1/2 rounded-full bg-amber-100/80" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CtaLink({ href, children, className }) {
  const safeHref = typeof href === 'string' && href.trim() ? href.trim() : '#contact';
  const external = isSafeHttpUrl(safeHref);

  return (
    <a href={safeHref} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined} className={className}>
      {children}
    </a>
  );
}

function Hero({ hero, about, profileSlug }) {
  const { data: projectsData } = useSWR(withProfile('/api/portfolio', profileSlug), fetcher);
  const { data: experienceData } = useSWR(withProfile('/api/experience', profileSlug), fetcher);
  const projects = Array.isArray(projectsData) ? projectsData : Array.isArray(projectsData?.projects) ? projectsData.projects : [];
  const experienceItems = Array.isArray(experienceData) ? experienceData : [];
  const projectCount = projects.length;
  const experienceYears = formatExperienceYears(experienceItems);
  const mainStack = getMostUsedTech(projects);
  const aboutHighlights = Array.isArray(about?.highlights) ? about.highlights.slice(0, 3) : [];
  const normalizedHighlights = [
    projectCount > 0 ? {
      label: 'Systems built',
      value: `${projectCount}+`,
    } : null,
    experienceYears ? {
      label: 'Experience',
      value: experienceYears,
    } : null,
    mainStack ? {
      label: 'Main stack',
      value: mainStack,
    } : null,
    ...aboutHighlights.map((item) => ({
      label: item.label,
      value: item.value,
    })),
  ].filter((item) => item?.label && item?.value).slice(0, 3);
  const portraitHighlight = normalizedHighlights[0]?.value?.split(/[.,\n]/)[0]?.slice(0, 12) || '';
  const portraitLabel = normalizedHighlights[0]?.label || '';
  const sideCards = [
    {
      label: 'Systems Built',
      value: 'Custom Admin & Client Platforms',
    },
    {
      label: 'Specialty',
      value: 'Automation, Dashboards, Data Accuracy',
    },
  ];
  const eyebrow = typeof hero?.eyebrow === 'string' ? hero.eyebrow.trim() : '';
  const title = typeof hero?.title === 'string' ? hero.title.trim() : '';
  const primaryCtaLabel = typeof hero?.primaryCtaLabel === 'string' ? hero.primaryCtaLabel.trim() : '';
  const primaryCtaHref = typeof hero?.primaryCtaHref === 'string' ? hero.primaryCtaHref.trim() : '';
  const secondaryCtaLabel = typeof hero?.secondaryCtaLabel === 'string' ? hero.secondaryCtaLabel.trim() : '';
  const secondaryCtaHref = typeof hero?.secondaryCtaHref === 'string' ? hero.secondaryCtaHref.trim() : '';

  return (
    <section id="home" name="home" className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-16">
      <div className="grid content-between rounded-[2.5rem] border-[3px] border-slate-950 bg-white p-6 shadow-[12px_12px_0_#0f172a] sm:p-8 lg:min-h-[620px] lg:p-10">
        <div>
          {eyebrow ? (
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border-2 border-slate-950 bg-lime-300 px-4 py-2 text-xs font-black uppercase tracking-[0.25em] text-slate-950">
              <Icon name="spark" className="h-4 w-4" /> {eyebrow}
            </div>
          ) : null}
          {title ? (
            <h1 className="max-w-4xl text-5xl font-black leading-[0.92] tracking-tight text-slate-950 sm:text-7xl lg:text-8xl">
              {title}
            </h1>
          ) : null}
          {hero?.description ? <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-700">{hero.description}</p> : null}
          {primaryCtaLabel && primaryCtaHref ? (
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <CtaLink
                href={primaryCtaHref}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-blue-700 px-6 py-4 text-sm font-black text-white shadow-lg shadow-blue-700/20 transition hover:-translate-y-0.5"
              >
                {primaryCtaLabel} <Icon name="arrow" className="h-4 w-4" />
              </CtaLink>
              {secondaryCtaLabel && secondaryCtaHref ? (
                <CtaLink
                  href={secondaryCtaHref}
                  className="inline-flex items-center justify-center gap-2 rounded-full border-2 border-slate-950 bg-white px-6 py-4 text-sm font-black text-slate-950 transition hover:-translate-y-0.5 hover:bg-lime-300"
                >
                  {secondaryCtaLabel} <Icon name="arrowUp" className="h-4 w-4" />
                </CtaLink>
              ) : null}
            </div>
          ) : secondaryCtaLabel && secondaryCtaHref ? (
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <CtaLink
                href={secondaryCtaHref}
                className="inline-flex items-center justify-center gap-2 rounded-full border-2 border-slate-950 bg-white px-6 py-4 text-sm font-black text-slate-950 transition hover:-translate-y-0.5 hover:bg-lime-300"
              >
                {secondaryCtaLabel} <Icon name="arrowUp" className="h-4 w-4" />
              </CtaLink>
            </div>
          ) : null}
        </div>

        {normalizedHighlights.length > 0 ? <div className="mt-10 grid gap-3 sm:grid-cols-3">
          {normalizedHighlights.map((item) => (
            <div key={`${item.label}-${item.value}`} className="rounded-3xl border-2 border-slate-950 bg-[#F5F1E8] p-4">
              <p className="line-clamp-2 text-3xl font-black tracking-tight text-slate-950">{item.value}</p>
              <p className="mt-1 text-xs font-black uppercase tracking-wider text-slate-500">{item.label}</p>
            </div>
          ))}
        </div> : null}
      </div>

      <div className="grid gap-5">
        <PortraitCard highlightValue={portraitHighlight} highlightLabel={portraitLabel} image={hero?.image} title={hero?.title || 'Profile image'} />
        {sideCards.length > 0 ? (
          <div className="grid gap-5 sm:grid-cols-2">
            {sideCards.map((card, index) => (
              <div key={`${card.label}-${index}`} className={cx('rounded-[2rem] border-[3px] border-slate-950 p-6 shadow-[8px_8px_0_#0f172a]', index % 2 === 0 ? 'bg-slate-950 text-white shadow-blue-700' : 'bg-lime-300 text-slate-950')}>
                <Icon name={index % 2 === 0 ? 'shield' : 'database'} className={cx('h-8 w-8', index % 2 === 0 ? 'text-lime-300' : '')} />
                <p className="mt-4 text-sm font-black uppercase tracking-wider opacity-70">{card.label}</p>
                <p className="mt-3 line-clamp-4 text-2xl font-black">{card.value}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function About({ about }) {
  const cards = Array.isArray(about?.highlights) ? about.highlights.slice(0, 3) : [];
  const hasAbout = Boolean(about?.title || about?.body || cards.length);

  if (!hasAbout) {
    return null;
  }

  return (
    <section id="about" name="about" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <SectionHeading
        eyebrow="About"
        title={about?.title || 'About'}
        desc={about?.body}
      />
      {cards.length > 0 ? <div className="grid gap-5 md:grid-cols-3">
        {cards.map((card, index) => {
          const points = splitAboutHighlightPoints(card.value);

          return (
            <article key={`${card.label}-${index}`} className="rounded-[2rem] border-[3px] border-slate-950 bg-white p-6 shadow-[8px_8px_0_#0f172a] transition hover:-translate-y-1">
              <p className="text-sm font-black text-blue-700">{String(index + 1).padStart(2, '0')}</p>
              <h3 className="mt-4 text-2xl font-black tracking-tight text-slate-950">{card.label}</h3>
              <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-slate-600">
                {points.map((point, pointIndex) => (
                  <li key={`${card.label}-${pointIndex}-${point}`}>{point}</li>
                ))}
              </ul>
            </article>
          );
        })}
      </div> : null}
    </section>
  );
}

function ProjectVisual({ project, index }) {
  const title = project?.title || 'Project';
  const projectImage = getSafeImage(project?.image);

  if (projectImage) {
    return (
      <div className="relative min-h-[260px] overflow-hidden rounded-[1.7rem] border-2 border-slate-950 bg-white">
        <div className="absolute left-0 top-0 z-10 flex h-10 w-full items-center gap-2 border-b-2 border-slate-950 bg-slate-100/95 px-4 backdrop-blur">
          <span className="h-3 w-3 rounded-full bg-rose-400" />
          <span className="h-3 w-3 rounded-full bg-amber-400" />
          <span className="h-3 w-3 rounded-full bg-emerald-400" />
        </div>
        <img src={projectImage} alt={title} className="absolute inset-0 h-full w-full object-cover pt-10" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-transparent p-5 pt-24">
          <p className="line-clamp-2 text-2xl font-black text-white drop-shadow">{title}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-[260px] overflow-hidden rounded-[1.7rem] border-2 border-slate-950 bg-white">
      <div className="absolute left-0 top-0 flex h-10 w-full items-center gap-2 border-b-2 border-slate-950 bg-slate-100 px-4">
        <span className="h-3 w-3 rounded-full bg-rose-400" />
        <span className="h-3 w-3 rounded-full bg-amber-400" />
        <span className="h-3 w-3 rounded-full bg-emerald-400" />
      </div>
      <div className="p-5 pt-16">
        {index % 3 === 0 ? (
          <div className="grid gap-3">
            <div className="h-8 w-40 rounded-full bg-slate-950" />
            <div className="grid grid-cols-3 gap-3">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <div key={n} className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-3">
                  <div className="h-3 w-12 rounded-full bg-blue-600" />
                  <div className="mt-6 h-7 w-16 rounded-lg bg-slate-950" />
                </div>
              ))}
            </div>
          </div>
        ) : index % 3 === 1 ? (
          <div className="grid gap-3">
            <div className="rounded-2xl bg-blue-700 p-5 text-white">
              <p className="line-clamp-1 text-2xl font-black">{title}</p>
              <p className="mt-2 text-sm text-blue-100">Track - Route - Monitor</p>
            </div>
            <div className="grid grid-cols-[1fr_1.2fr] gap-3">
              <div className="rounded-2xl bg-slate-100 p-4">
                <Icon name="file" className="h-10 w-10 text-blue-700" />
              </div>
              <div className="space-y-2 rounded-2xl bg-slate-100 p-4">
                <div className="h-3 rounded bg-slate-300" />
                <div className="h-3 w-3/4 rounded bg-slate-300" />
                <div className="h-8 rounded bg-blue-600" />
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {['bg-orange-200', 'bg-pink-200', 'bg-amber-200', 'bg-blue-200', 'bg-purple-200', 'bg-rose-200'].map((color, n) => (
              <div key={`${color}-${n}`} className={cx('h-24 rounded-2xl border-2 border-white shadow', color)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Work({ profileSlug }) {
  const [page, setPage] = useState(1);
  const itemsPerPage = 3;
  const { data, error, isLoading } = useSWR(withProfile('/api/portfolio', profileSlug), fetcher);
  const projects = Array.isArray(data) ? data : Array.isArray(data?.projects) ? data.projects : [];
  const totalPages = Math.ceil(projects.length / itemsPerPage);
  const paginatedProjects = projects.slice((page - 1) * itemsPerPage, page * itemsPerPage);
  const cardThemes = [
    { color: 'bg-[#101827] text-white', accent: 'bg-lime-300 text-slate-950' },
    { color: 'bg-[#E8F7FF] text-slate-950', accent: 'bg-blue-700 text-white' },
    { color: 'bg-[#FFF0D8] text-slate-950', accent: 'bg-orange-500 text-white' },
  ];

  useEffect(() => {
    setPage(1);
  }, [projects.length]);

  if (!isLoading && !error && projects.length === 0) {
    return null;
  }

  return (
    <section id="portfolio" name="portfolio" className="bg-slate-950 py-16 text-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading dark eyebrow="Selected Work" title="Selected projects." />
        {error ? <p className="mb-4 rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error.message}</p> : null}
        {isLoading ? <p className="mb-4 text-sm text-slate-300">Loading projects...</p> : null}
        <div className="grid gap-6">
          {paginatedProjects.map((project, index) => {
            const globalIndex = (page - 1) * itemsPerPage + index;
            const theme = cardThemes[globalIndex % cardThemes.length];
            const tech = normalizeTech(project.tech ?? project.techStack);
            const summary = project.description ?? project.summary ?? normalizeDescriptions(project.descriptions)[0] ?? '';
            const link = isSafeHttpUrl(project.demoUrl) ? project.demoUrl : '';
            const repo = isSafeHttpUrl(project.repoUrl) ? project.repoUrl : '';
            const isDark = globalIndex % cardThemes.length === 0;

            return (
              <article key={project.id ?? project.slug ?? `${project.title}-${globalIndex}`} className={cx('grid gap-6 rounded-[2.2rem] border border-white/10 p-5 md:grid-cols-[0.9fr_1.1fr] lg:p-7', theme.color)}>
                <ProjectVisual project={project} index={globalIndex} />
                <div className="flex flex-col justify-between gap-8 p-2">
                  <div>
                    <span className={cx('inline-flex rounded-full px-4 py-2 text-xs font-black uppercase tracking-wider', theme.accent)}>
                      {project.badge || 'Featured Project'}
                    </span>
                    <h3 className="mt-5 max-w-2xl text-3xl font-black tracking-tight sm:text-4xl">{project.title}</h3>
                    <p className={cx('mt-4 max-w-2xl text-base leading-8', isDark ? 'text-slate-300' : 'text-slate-700')}>{summary}</p>
                  </div>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap gap-2">
                      {tech.slice(0, 4).map((metric) => (
                        <span key={`${project.id ?? project.slug}-${metric}`} className={cx('rounded-full border px-3 py-1 text-xs font-black', isDark ? 'border-white/15 bg-white/10 text-white' : 'border-slate-950/10 bg-white/70 text-slate-800')}>
                          {metric}
                        </span>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {link ? (
                        <a href={link} target="_blank" rel="noreferrer" className={cx('inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-black', isDark ? 'bg-lime-300 text-slate-950' : 'bg-slate-950 text-white')}>
                          View Project <Icon name="arrow" className="h-4 w-4" />
                        </a>
                      ) : null}
                      {repo ? (
                        <a href={repo} target="_blank" rel="noreferrer" className={cx('inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-black', isDark ? 'border-white/20 text-white' : 'border-slate-950/20 text-slate-950')}>
                          Repo <Icon name="github" className="h-4 w-4" />
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        {totalPages > 1 ? (
          <div className="mt-8 flex items-center justify-center gap-3">
            <button type="button" onClick={() => setPage((value) => Math.max(value - 1, 1))} disabled={page === 1} className="rounded-full border border-white/15 px-4 py-2 text-sm font-black text-white disabled:opacity-40">
              Previous
            </button>
            <span className="rounded-full bg-white px-4 py-2 text-sm font-black text-slate-950">
              {page} / {totalPages}
            </span>
            <button type="button" onClick={() => setPage((value) => Math.min(value + 1, totalPages))} disabled={page === totalPages} className="rounded-full border border-white/15 px-4 py-2 text-sm font-black text-white disabled:opacity-40">
              Next
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function SkillsExperience({ profileSlug }) {
  const { data: skillsData, error: skillsError, isLoading: skillsLoading } = useSWR(withProfile('/api/skills', profileSlug), fetcher);
  const { data: experienceData, error: experienceError, isLoading: experienceLoading } = useSWR(withProfile('/api/experience', profileSlug), fetcher);
  const skills = Array.isArray(skillsData) ? skillsData : [];
  const experienceItems = Array.isArray(experienceData) ? experienceData : [];
  const loading = skillsLoading || experienceLoading;
  const error = skillsError || experienceError;
  const hasSkills = skills.length > 0;
  const hasExperience = experienceItems.length > 0;

  if (!loading && !error && !hasSkills && !hasExperience) {
    return null;
  }

  return (
    <section id="experience" name="experience" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
        {hasSkills || loading || skillsError ? <div id="skills" name="skills">
          <SectionHeading eyebrow="Skills" title="Skills." />
          {loading ? <p className="mb-4 text-sm text-slate-500">Loading experience data...</p> : null}
          {error ? <p className="mb-4 text-sm text-rose-600">{error.message}</p> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            {skills.map((skill) => (
              <div key={skill.id} className="rounded-3xl border-2 border-slate-950 bg-white p-4 shadow-[5px_5px_0_#0f172a]">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <MediaAvatar src={skill.image} alt={`${skill.name} logo`} className="h-11 w-11 rounded-2xl" />
                    <p className="truncate font-black text-slate-950">{skill.name}</p>
                  </div>
                  <p className="rounded-full bg-lime-300 px-2 py-1 text-xs font-black text-slate-950">{skill.level}%</p>
                </div>
                <div className="h-3 overflow-hidden rounded-full border-2 border-slate-950 bg-[#F5F1E8]">
                  <div className="h-full bg-blue-700" style={{ width: `${skill.level}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div> : null}

        {hasExperience || loading || experienceError ? <div className="rounded-[2.3rem] border-[3px] border-slate-950 bg-white p-6 shadow-[10px_10px_0_#0f172a] lg:p-8">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-blue-700">Experience</p>
          <div className="mt-8 space-y-6">
            {experienceItems.map((item, index) => (
              <article key={item.id} className="relative border-l-[3px] border-slate-950 pl-6">
                <div className={cx('absolute -left-[13px] top-0 h-6 w-6 rounded-full border-[3px] border-slate-950', index === 0 ? 'bg-lime-300' : 'bg-blue-600')} />
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 gap-3">
                    <MediaAvatar src={item.image} alt={`${item.company} logo`} className="h-12 w-12 rounded-2xl" />
                    <div className="min-w-0">
                      <h3 className="text-2xl font-black text-slate-950">{item.title}</h3>
                      <p className="font-bold text-blue-700">{item.company}</p>
                      <p className="text-sm text-slate-500">
                        {toIsoDate(item.startDate)} - {item.endDate ? toIsoDate(item.endDate) : 'Present'}
                      </p>
                    </div>
                  </div>
                  {item.isCurrent ? <span className="w-fit rounded-full bg-slate-950 px-3 py-1 text-xs font-black text-white">Current</span> : null}
                </div>
                <p className="mt-4 text-sm leading-7 text-slate-600">{item.description}</p>
              </article>
            ))}
          </div>
        </div> : null}
      </div>
    </section>
  );
}

function Certificates({ profileSlug }) {
  const [activeCategory, setActiveCategory] = useState('All');
  const [page, setPage] = useState(1);
  const [selectedCert, setSelectedCert] = useState(null);
  const itemsPerPage = 6;
  const { data, error } = useSWR(withProfile('/api/certificates', profileSlug), fetcher);
  const items = Array.isArray(data) ? data : [];
  const categories = useMemo(() => ['All', ...Array.from(new Set(items.map((item) => item.category).filter(Boolean)))], [items]);
  const sortedItems = useMemo(() => [...items].sort(compareCertificatesByIssuedAtDesc), [items]);
  const filteredItems = activeCategory === 'All' ? sortedItems : sortedItems.filter((item) => item.category === activeCategory);
  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
  const pageItems = filteredItems.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  useEffect(() => {
    setPage(1);
  }, [activeCategory, items.length]);

  if (!error && items.length === 0) {
    return null;
  }

  return (
    <section id="certificates" name="certificates" className="bg-[#E8F7FF] py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading eyebrow="Certificates" title="Certificates." />
        {error ? <p className="mb-4 text-sm text-rose-600">{error.message}</p> : null}
        <div className="mb-6 flex gap-2 overflow-x-auto pb-2">
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => setActiveCategory(category)}
              className={cx('shrink-0 rounded-full border-2 border-slate-950 px-4 py-2 text-sm font-black', activeCategory === category ? 'bg-slate-950 text-white' : 'bg-white text-slate-950 hover:bg-lime-300')}
            >
              {category}
            </button>
          ))}
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {pageItems.map((cert, index) => {
            const certificateImage = getSafeImage(cert.image);
            const isPdf = isPdfAssetUrl(cert.image);
            const pdfPreview = isPdf && typeof cert.image === 'string' ? toCloudinaryPdfPreviewUrl(cert.image) : null;
            const previewImage = pdfPreview || certificateImage;

            return (
              <article key={`${cert.id ?? 'cert'}-${cert.title}-${index}`} className="overflow-hidden rounded-[2rem] border-[3px] border-slate-950 bg-white shadow-[8px_8px_0_#0f172a]">
                <div className="relative h-56 border-b-[3px] border-slate-950 bg-[#F5F1E8]">
                  <div className="absolute right-5 top-5 z-10 rounded-full bg-blue-700 px-3 py-1 text-xs font-black text-white">{cert.category}</div>
                  {previewImage ? (
                    <button
                      type="button"
                      className="h-full w-full"
                      onClick={() => setSelectedCert({ title: cert.title, imageUrl: previewImage, pdfUrl: isPdf ? cert.image : null, isPdf })}
                    >
                      <div className="grid h-full w-full place-items-center bg-white/50 p-4">
                        <div className="grid h-full w-full place-items-center rounded-2xl border-2 border-slate-950 bg-white p-2">
                          <img src={previewImage} alt={`${cert.title} certificate`} className="h-full w-full object-contain" />
                        </div>
                      </div>
                    </button>
                  ) : (
                    <div className="grid h-full place-items-center p-5">
                      <div className="grid h-full w-full place-items-center rounded-2xl border-2 border-slate-950 bg-white text-center">
                        <Icon name="file" className="h-10 w-10 text-blue-700" />
                        <p className="mt-2 text-xs font-black uppercase tracking-widest text-slate-500">
                          {isPdf ? 'PDF Certificate' : 'Verified Certificate'}
                        </p>
                        <p className="mt-1 px-3 text-sm font-black text-slate-950">{cert.credentialId || cert.issuer}</p>
                      </div>
                    </div>
                  )}
                </div>
                <div className="p-5">
                  <h3 className="text-lg font-black leading-tight text-slate-950">{cert.title}</h3>
                  <p className="mt-2 text-sm font-bold text-slate-500">{cert.issuer}</p>
                  {cert.issuedAt ? <p className="mt-1 text-xs font-bold text-slate-400">Issued {new Date(cert.issuedAt).toLocaleDateString()}</p> : null}
                  {isSafeHttpUrl(cert.link) ? (
                    <a href={cert.link} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white">
                      Verify <Icon name="arrowUp" className="h-4 w-4" />
                    </a>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
        {totalPages > 1 ? (
          <div className="mt-8 flex items-center justify-center gap-3">
            <button type="button" onClick={() => setPage((value) => Math.max(value - 1, 1))} disabled={page === 1} className="rounded-full border-2 border-slate-950 bg-white px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-40">
              Previous
            </button>
            <span className="rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white">
              {page} / {totalPages}
            </span>
            <button type="button" onClick={() => setPage((value) => Math.min(value + 1, totalPages))} disabled={page === totalPages} className="rounded-full border-2 border-slate-950 bg-white px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-40">
              Next
            </button>
          </div>
        ) : null}
      </div>

      <Dialog open={Boolean(selectedCert)} onOpenChange={(isOpen) => setSelectedCert(isOpen ? selectedCert : null)}>
        <DialogContent className="w-[min(980px,calc(100%-24px))] max-w-none rounded-[2rem] border-[3px] border-slate-950 bg-white p-3 shadow-[10px_10px_0_#0f172a]">
          <DialogTitle className="sr-only">{selectedCert?.title || 'Certificate preview'}</DialogTitle>
          <DialogDescription className="sr-only">Full-size certificate preview.</DialogDescription>
          {selectedCert?.isPdf && typeof selectedCert.pdfUrl === 'string' ? (
            <iframe
              title={selectedCert.title || 'Certificate preview'}
              src={selectedCert.pdfUrl}
              className="h-[80vh] w-full rounded-2xl border-2 border-slate-950 bg-white"
            />
          ) : (
            <div className="grid place-items-center rounded-2xl border-2 border-slate-950 bg-white p-3">
              {selectedCert?.imageUrl ? (
                <img src={selectedCert.imageUrl} alt={selectedCert.title || 'Certificate preview'} className="max-h-[80vh] w-full object-contain" />
              ) : null}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

const initialForm = { name: '', email: '', message: '' };
const sanitizeInput = (value) => value.replace(/[<>]/g, '').replace(/\s+/g, ' ').trimStart();

function Contact({ contact }) {
  const [formData, setFormData] = useState(initialForm);
  const [errors, setErrors] = useState(initialForm);
  const [formError, setFormError] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const startGlobalLoading = useLoadingStore((state) => state.startLoading);
  const stopGlobalLoading = useLoadingStore((state) => state.stopLoading);
  const contactItems = [
    contact?.email ? ['mail', contact.email, `mailto:${contact.email}`] : null,
    contact?.location ? ['map', contact.location, ''] : null,
    contact?.calendarLink && isSafeHttpUrl(contact.calendarLink) ? ['check', 'Book a call', contact.calendarLink] : null,
    ...(Array.isArray(contact?.socialLinks)
      ? contact.socialLinks
          .filter((link) => link?.label && isSafeHttpUrl(link.url))
          .slice(0, 3)
          .map((link) => ['check', link.label, link.url])
      : []),
  ].filter(Boolean);

  const validateForm = ({ name, email, message }) => {
    const nextErrors = { ...initialForm };

    if (!/^[A-Za-z\s]{3,60}$/.test(name.trim())) {
      nextErrors.name = 'Enter a valid name (3-60 letters).';
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      nextErrors.email = 'Enter a valid email address.';
    }
    if (message.trim().length < 10 || message.trim().length > 800) {
      nextErrors.message = 'Message must be between 10 and 800 characters.';
    }

    return nextErrors;
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: sanitizeInput(value) }));
    setErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const validationErrors = validateForm(formData);
    setErrors(validationErrors);
    setFormError('');

    const hasErrors = Object.values(validationErrors).some(Boolean);
    if (hasErrors) {
      return;
    }

    setLoading(true);
    startGlobalLoading('Sending your message');
    try {
      const promise = fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      }).then(async (res) => {
        if (!res.ok) {
          throw await parseErrorResponse(res, 'Failed to send message');
        }
        return res.json();
      });

      toast.promise(promise, {
        loading: 'Sending message...',
        success: (data) => {
          if (data.success) return 'Message sent successfully!';
          throw new Error('Failed');
        },
        error: (error) => (error instanceof Error ? error.message : 'Failed to send message'),
      });

      const data = await promise;
      if (data.success) {
        setIsSubmitted(true);
        setFormData(initialForm);
      }
    } catch (submitError) {
      const nextError = normalizeFormError(submitError, 'Failed to send message');
      setFormError(nextError.formError);
      setErrors((prev) => ({
        ...prev,
        name: nextError.fieldErrors?.name?.[0] || prev.name,
        email: nextError.fieldErrors?.email?.[0] || prev.email,
        message: nextError.fieldErrors?.message?.[0] || prev.message,
      }));
    } finally {
      setLoading(false);
      stopGlobalLoading();
    }
  };

  return (
    <section id="contact" name="contact" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="grid overflow-hidden rounded-[2.5rem] border-[3px] border-slate-950 bg-slate-950 shadow-[12px_12px_0_#2563eb] lg:grid-cols-[0.9fr_1.1fr]">
        <div className="p-6 text-white sm:p-8 lg:p-10">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-lime-300">Contact</p>
          <h2 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">Contact.</h2>
          <p className="mt-5 max-w-xl text-base leading-8 text-slate-300">Send a message about a project, workflow, or collaboration.</p>
          {contactItems.length > 0 ? <div className="mt-8 grid gap-3">
            {contactItems.map(([icon, text, href]) => {
              const content = (
                <>
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-lime-300 text-slate-950">
                  <Icon name={icon} />
                </div>
                <p className="font-black text-white">{text}</p>
                </>
              );
              return href ? (
                <a key={text} href={href} target={isSafeHttpUrl(href) ? '_blank' : undefined} rel={isSafeHttpUrl(href) ? 'noreferrer' : undefined} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                  {content}
                </a>
              ) : (
                <div key={text} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                  {content}
                </div>
              );
            })}
          </div> : null}
        </div>
        {isSubmitted ? (
          <div className="grid place-items-center border-t-[3px] border-slate-950 bg-lime-300 p-6 text-center sm:p-8 lg:border-l-[3px] lg:border-t-0 lg:p-10">
            <div className="rounded-[2rem] border-[3px] border-slate-950 bg-white p-8 shadow-[8px_8px_0_#0f172a]">
              <Icon name="check" className="mx-auto h-10 w-10 text-blue-700" />
              <h3 className="mt-4 text-2xl font-black text-slate-950">Message sent successfully.</h3>
              <button type="button" onClick={() => setIsSubmitted(false)} className="mt-5 rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white">
                Send another
              </button>
            </div>
          </div>
        ) : (
          <form className="border-t-[3px] border-slate-950 bg-lime-300 p-6 sm:p-8 lg:border-l-[3px] lg:border-t-0 lg:p-10" onSubmit={handleSubmit} noValidate>
            <FormErrorSummary error={formError} fieldErrors={{}} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <input className="w-full rounded-2xl border-[3px] border-slate-950 bg-white px-4 py-4 text-sm font-bold text-slate-950 outline-none placeholder:text-slate-400" placeholder="Your name" name="name" value={formData.name} onChange={handleChange} maxLength={60} required />
                {errors.name ? <p className="mt-1 text-sm font-bold text-rose-700">{errors.name}</p> : null}
              </div>
              <div>
                <input className="w-full rounded-2xl border-[3px] border-slate-950 bg-white px-4 py-4 text-sm font-bold text-slate-950 outline-none placeholder:text-slate-400" placeholder="Email address" name="email" type="email" value={formData.email} onChange={handleChange} maxLength={120} required />
                {errors.email ? <p className="mt-1 text-sm font-bold text-rose-700">{errors.email}</p> : null}
              </div>
            </div>
            <textarea className="mt-4 min-h-40 w-full resize-none rounded-2xl border-[3px] border-slate-950 bg-white px-4 py-4 text-sm font-bold text-slate-950 outline-none placeholder:text-slate-400" placeholder="Tell me about your project..." name="message" value={formData.message} onChange={handleChange} maxLength={800} required />
            {errors.message ? <p className="mt-1 text-sm font-bold text-rose-700">{errors.message}</p> : null}
            <button type="submit" disabled={loading} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-700 px-5 py-4 text-sm font-black text-white shadow-[5px_5px_0_#0f172a] transition hover:-translate-y-0.5 disabled:opacity-60">
              {loading ? 'Sending...' : 'Send Message'} <Icon name="send" className="h-4 w-4" />
            </button>
          </form>
        )}
      </div>
    </section>
  );
}

function Footer({ config, contact }) {
  const links = useMemo(() => normalizeLinks(config), [config]);
  const logoText = typeof config?.logoText === 'string' && config.logoText.trim() ? config.logoText.trim() : '';
  const socialLinks = Array.isArray(contact?.socialLinks) ? contact.socialLinks.filter((link) => link?.label && isSafeHttpUrl(link.url)) : [];

  return (
    <footer className="border-t-[3px] border-slate-950 bg-white">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.2fr_0.8fr_0.8fr] lg:px-8">
        <div>
          <Logo config={config} />
          {contact?.email ? <a href={`mailto:${contact.email}`} className="mt-4 block max-w-sm text-sm font-bold leading-7 text-slate-600 hover:text-blue-700">{contact.email}</a> : null}
          {contact?.location ? <p className="mt-2 max-w-sm text-sm leading-7 text-slate-600">{contact.location}</p> : null}
        </div>
        <div>
          <p className="font-black text-slate-950">Navigate</p>
          <div className="mt-3 grid gap-2 text-sm font-bold text-slate-600">
            {links.map((item) => (
              <a key={`${item.label}-${item.target}`} href={item.target} className="hover:text-blue-700">
                {item.label}
              </a>
            ))}
          </div>
        </div>
        {socialLinks.length > 0 ? <div>
          <p className="font-black text-slate-950">Links</p>
          <div className="mt-3 grid gap-2 text-sm font-bold text-slate-600">
            {socialLinks.map((link) => (
              <a key={`${link.label}-${link.url}`} href={link.url} target="_blank" rel="noreferrer" className="hover:text-blue-700">{link.label}</a>
            ))}
          </div>
        </div> : null}
      </div>
      <div className="border-t border-slate-950/10 py-5 text-center text-xs font-bold text-slate-500">
        © {new Date().getFullYear()}
        {logoText ? ` ${logoText}.` : ''} All rights reserved.
      </div>
    </footer>
  );
}

export default function EditorialBentoPortfolio({ profileSlug = null, siteContent, siteConfig, onToggleDark }) {
  return (
    <div className="min-h-screen bg-[#F5F1E8] text-slate-950 selection:bg-lime-300 selection:text-slate-950">
      <div className="fixed inset-0 -z-10 opacity-[0.23]" style={{ backgroundImage: 'radial-gradient(#0f172a 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
      <Header config={siteConfig} onToggleDark={onToggleDark} />
      <main>
        <Hero hero={siteContent?.hero} about={siteContent?.about} profileSlug={profileSlug} />
        <About about={siteContent?.about} />
        <Work profileSlug={profileSlug} />
        <SkillsExperience profileSlug={profileSlug} />
        <Certificates profileSlug={profileSlug} />
        <Contact contact={siteContent?.contact} />
      </main>
      <Footer config={siteConfig} contact={siteContent?.contact} />
    </div>
  );
}
