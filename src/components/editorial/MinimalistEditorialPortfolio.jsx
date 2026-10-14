/* eslint-disable @next/next/no-img-element */
'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import FormErrorSummary from '@/components/forms/FormErrorSummary';
import { splitAboutHighlightPoints } from '@/lib/aboutHighlights';
import {
  CERTIFICATE_SORT_MODES,
  compareCertificatesForDisplay,
  isPdfAssetUrl,
  sortCertificatesByMode,
  toCloudinaryPdfPreviewUrl,
} from '@/lib/certificates';
import { normalizeFormError, parseErrorResponse } from '@/lib/form-client';
import { defaultNavigation } from '@/lib/siteContentDefaults';
import { isSafeHttpUrl } from '@/lib/url-safety';
import { useLoadingStore } from '@/store/loading';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/src/components/ui/dialog';
import HideOnScroll from '@/src/components/HideOnScroll';

const ADMIN_CLICK_WINDOW_MS = 550;
const initialForm = { name: '', email: '', message: '' };

const useIsMdUp = () => {
  const [isMdUp, setIsMdUp] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)');
    const sync = () => setIsMdUp(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  return isMdUp;
};

const fetcher = (url) =>
  fetch(url, { cache: 'no-store' }).then((response) => {
    if (!response.ok) {
      throw new Error('Unable to load portfolio data.');
    }
    return response.json();
  });

const withProfile = (path, profileSlug) => {
  if (!profileSlug) return path;
  const joiner = path.includes('?') ? '&' : '?';
  return `${path}${joiner}profile=${encodeURIComponent(profileSlug)}`;
};

const cx = (...classes) => classes.filter(Boolean).join(' ');
const sanitizeInput = (value) => value.replace(/[<>]/g, '').replace(/\s+/g, ' ').trimStart();
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
const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short' });
};
const getSafeUrl = (value) => (isSafeHttpUrl(value) ? value : '');
const getSafeImage = (value) => (isSafeHttpUrl(value) ? value : '');
const getInitials = (value = '') => {
  const [first = '', second = ''] = String(value).trim().split(/\s+/);
  return ((first[0] || '') + (second[0] || '')).toUpperCase() || 'S';
};

const DEFAULT_RESUME_HREF = '/resume.pdf';

const getResumeCta = (hero) => {
  const label = typeof hero?.secondaryCtaLabel === 'string' ? hero.secondaryCtaLabel.trim() : '';
  const href = typeof hero?.secondaryCtaHref === 'string' ? hero.secondaryCtaHref.trim() : '';
  const looksLikeFile = href.startsWith('/') || /\.pdf(\?|$)/i.test(href) || isSafeHttpUrl(href);
  return {
    label: label || 'Download Resume',
    href: looksLikeFile ? href : DEFAULT_RESUME_HREF,
  };
};

function ResumeLink({ href = DEFAULT_RESUME_HREF, label = 'Download Resume', className }) {
  const safeHref = typeof href === 'string' && href.trim() ? href.trim() : DEFAULT_RESUME_HREF;
  const external = isSafeHttpUrl(safeHref);
  const canDownload = !external && (safeHref.startsWith('/') || /\.pdf(\?|$)/i.test(safeHref));

  return (
    <a
      href={safeHref}
      download={canDownload || undefined}
      target={external ? '_blank' : undefined}
      rel={external ? 'noreferrer' : undefined}
      className={className}
    >
      {label} <Icon name="download" className="h-3.5 w-3.5" />
    </a>
  );
}

const resolveSocialIcon = (label = '', href = '') => {
  const haystack = `${label} ${href}`.toLowerCase();
  if (haystack.includes('linkedin')) return 'linkedin';
  if (haystack.includes('github')) return 'github';
  if (haystack.includes('mailto:') || haystack.includes('email') || /\bmail\b/.test(haystack)) return 'mail';
  if (haystack.includes('resume') || haystack.includes('cv') || /\.pdf(\?|$)/i.test(href)) return 'download';
  return 'arrowUp';
};

const buildFloatingSocialLinks = (contact, hero) => {
  const links = [];
  const socials = Array.isArray(contact?.socialLinks) ? contact.socialLinks : [];

  socials.forEach((link, index) => {
    const label = typeof link?.label === 'string' ? link.label.trim() : '';
    const href = typeof link?.url === 'string' ? link.url.trim() : '';
    if (!label || !isSafeHttpUrl(href)) return;
    links.push({
      id: `social-${index}`,
      label,
      href,
      icon: resolveSocialIcon(label, href),
    });
  });

  const email = typeof contact?.email === 'string' ? contact.email.trim() : '';
  if (email && !links.some((link) => link.href === `mailto:${email}`)) {
    links.push({
      id: 'email',
      label: 'Email',
      href: `mailto:${email}`,
      icon: 'mail',
    });
  }

  const resume = getResumeCta(hero);
  if (resume.href && !links.some((link) => /resume|cv/i.test(link.label))) {
    const external = isSafeHttpUrl(resume.href);
    links.push({
      id: 'resume',
      label: resume.label.replace(/^download\s+/i, '') || 'Resume',
      href: resume.href,
      icon: 'download',
      download: !external && (resume.href.startsWith('/') || /\.pdf(\?|$)/i.test(resume.href)),
    });
  }

  return links.slice(0, 5);
};

function FloatingSocial({ contact, hero }) {
  const links = useMemo(() => buildFloatingSocialLinks(contact, hero), [contact, hero]);

  if (links.length === 0) {
    return null;
  }

  const renderLink = (item, { withTooltip = false } = {}) => {
    const external = isSafeHttpUrl(item.href);

    return (
      <li key={item.id} className={withTooltip ? 'group relative' : undefined}>
        <a
          href={item.href}
          target={item.download || item.href.startsWith('mailto:') ? undefined : external ? '_blank' : undefined}
          rel={item.download || item.href.startsWith('mailto:') ? undefined : external ? 'noreferrer' : undefined}
          download={item.download || undefined}
          className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-600 transition hover:bg-neutral-950 hover:text-white focus:bg-neutral-950 focus:text-white focus:outline-none"
          aria-label={item.label}
          title={item.label}
        >
          <Icon name={item.icon} className="h-[18px] w-[18px]" />
        </a>
        {withTooltip ? (
          <span className="pointer-events-none absolute left-full top-1/2 ml-3 -translate-y-1/2 whitespace-nowrap rounded-full bg-neutral-950 px-3 py-1 text-xs font-medium text-white opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-within:opacity-100">
            {item.label}
          </span>
        ) : null}
      </li>
    );
  };

  return (
    <HideOnScroll>
      <div className="fixed left-4 top-1/2 z-40 hidden -translate-y-1/2 md:block">
        <ul className="flex flex-col gap-2 rounded-full border border-neutral-200/90 bg-white/90 p-2 shadow-[0_18px_45px_rgba(0,0,0,.08)] backdrop-blur">
          {links.map((item) => renderLink(item, { withTooltip: true }))}
        </ul>
      </div>

      <nav className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 md:hidden" aria-label="Social links">
        <ul className="flex items-center gap-1.5 rounded-full border border-neutral-200/90 bg-white/95 px-2.5 py-2 shadow-[0_18px_45px_rgba(0,0,0,.1)] backdrop-blur">
          {links.map((item) => renderLink(item))}
        </ul>
      </nav>
    </HideOnScroll>
  );
}

function SkillIcon({ src, name }) {
  const image = getSafeImage(src);

  return (
    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-50">
      {image ? (
        <img src={image} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-xs font-medium text-neutral-500">
          {getInitials(name)}
        </span>
      )}
    </div>
  );
}

function Icon({ name, className = 'h-4 w-4' }) {
  const common = {
    className,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  };

  const icons = {
    arrowUp: (
      <>
        <path d="M7 17 17 7" />
        <path d="M8 7h9v9" />
      </>
    ),
    arrowDown: <path d="M12 5v14m0 0 5-5m-5 5-5-5" />,
    certificate: (
      <>
        <rect x="3" y="4" width="18" height="14" rx="2" />
        <path d="M7 8h10" />
        <path d="M7 12h6" />
        <path d="m15 18 2 3 2-3" />
      </>
    ),
    mail: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6" />
      </>
    ),
    menu: (
      <>
        <path d="M4 7h16" />
        <path d="M4 12h16" />
        <path d="M4 17h16" />
      </>
    ),
    sparkle: (
      <>
        <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z" />
        <path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8Z" />
      </>
    ),
    x: (
      <>
        <path d="m18 6-12 12" />
        <path d="m6 6 12 12" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v12" />
        <path d="m7 10 5 5 5-5" />
        <path d="M5 21h14" />
      </>
    ),
    linkedin: (
      <>
        <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6Z" />
        <rect x="2" y="9" width="4" height="12" />
        <circle cx="4" cy="4" r="2" />
      </>
    ),
    github: (
      <>
        <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.4 5.4 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65S8.93 17.38 9 18v4" />
        <path d="M9 18c-4.51 2-5-2-7-2" />
      </>
    ),
  };

  return <svg {...common}>{icons[name] || icons.arrowUp}</svg>;
}

const normalizeLinks = (config) => {
  const source =
    Array.isArray(config?.navigation?.links) && config.navigation.links.length > 0
      ? config.navigation.links
      : defaultNavigation.links;

  const links = source
    .filter((link) => link && link.isVisible !== false)
    .sort((left, right) => Number(left.sortOrder ?? 0) - Number(right.sortOrder ?? 0))
    .map((link) => {
      const target = typeof link.target === 'string' ? link.target.trim() : '';
      const normalizedTarget = target === '#about' ? '#about-me' : target;
      return {
        label: target === '#about' ? 'About Me' : typeof link.label === 'string' && link.label.trim() ? link.label.trim() : 'Link',
        target: normalizedTarget,
        type: link.type === 'url' ? 'url' : 'section',
      };
    })
    .filter((link) => link.target);

  if (!links.some((link) => link.target === '#skills')) {
    const experienceIndex = links.findIndex((link) => link.target === '#experience');
    links.splice(experienceIndex >= 0 ? experienceIndex : links.length, 0, {
      label: 'Skills',
      target: '#skills',
      type: 'section',
    });
  }

  return links;
};

function Logo({ config }) {
  const adminClickStateRef = useRef({ count: 0, timerId: null });
  const logoText = typeof config?.logoText === 'string' && config.logoText.trim() ? config.logoText.trim() : '';
  const logoImage = getSafeUrl(config?.logoImage);

  if (!logoText && !logoImage) {
    return null;
  }

  const clearAdminClicks = useCallback(() => {
    if (adminClickStateRef.current.timerId) {
      window.clearTimeout(adminClickStateRef.current.timerId);
      adminClickStateRef.current.timerId = null;
    }
    adminClickStateRef.current.count = 0;
  }, []);

  const handleLogoClick = (event) => {
    const nextCount = adminClickStateRef.current.count + 1;
    if (adminClickStateRef.current.timerId) window.clearTimeout(adminClickStateRef.current.timerId);

    if (nextCount >= 3) {
      event.preventDefault();
      clearAdminClicks();
      window.location.assign('/admin/login');
      return;
    }

    adminClickStateRef.current.count = nextCount;
    adminClickStateRef.current.timerId = window.setTimeout(clearAdminClicks, ADMIN_CLICK_WINDOW_MS);
  };

  useEffect(() => () => clearAdminClicks(), [clearAdminClicks]);

  return (
    <a href="#home" onClick={handleLogoClick} className="group inline-flex items-center gap-2">
      {logoImage ? (
        <img src={logoImage} alt={logoText} className="h-8 w-8 rounded-full object-contain" />
      ) : (
        <div className="relative h-7 w-7">
          <span className="absolute left-0 top-1 h-5 w-2 rotate-[-24deg] rounded-full bg-neutral-950" />
          <span className="absolute left-[9px] top-0 h-7 w-2 rotate-[24deg] rounded-full bg-neutral-950" />
          <span className="absolute right-0 top-1 h-5 w-2 rotate-[-24deg] rounded-full bg-neutral-950" />
        </div>
      )}
      <span className="sr-only">{logoText}</span>
    </a>
  );
}

function Header({ config, links }) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-neutral-200/90 bg-[#f7f7f5]/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1280px] items-center justify-between px-6 py-5 lg:px-10">
        <Logo config={config} />
        <nav className="hidden items-center gap-8 text-[13px] font-medium text-neutral-700 lg:flex">
          {links.map((item) => (
            <a key={`${item.label}-${item.target}`} href={item.target} className="transition hover:text-neutral-950">
              {item.label}
            </a>
          ))}
        </nav>
        <a href="#contact" className="hidden items-center gap-1 border-b border-neutral-950 pb-1 text-[13px] font-semibold text-neutral-950 sm:inline-flex">
          Book A Call <Icon name="arrowUp" className="h-3.5 w-3.5" />
        </a>
        <button type="button" onClick={() => setOpen(!open)} className="grid h-10 w-10 place-items-center rounded-full border border-neutral-300 bg-white lg:hidden" aria-label="Toggle menu">
          <Icon name={open ? 'x' : 'menu'} />
        </button>
      </div>
      {open ? (
        <div className="border-t border-neutral-200 bg-white px-6 py-4 lg:hidden">
          <nav className="grid gap-3 text-sm font-medium text-neutral-700">
            {links.map((item) => (
              <a key={`${item.label}-${item.target}`} href={item.target} onClick={() => setOpen(false)} className="rounded-2xl bg-neutral-50 px-4 py-3">
                {item.label}
              </a>
            ))}
            <a href="#contact" onClick={() => setOpen(false)} className="rounded-2xl bg-neutral-950 px-4 py-3 text-center font-semibold text-white">
              Book A Call
            </a>
          </nav>
        </div>
      ) : null}
    </header>
  );
}

function Portrait({ image, title }) {
  const heroImage = getSafeImage(image);

  return (
    <div className="relative mx-auto h-[340px] w-full max-w-[430px] overflow-hidden rounded-t-[12rem] rounded-b-[2rem] bg-neutral-200 sm:h-[390px] lg:mt-4 lg:h-[500px]">
      {heroImage ? (
        <img src={heroImage} alt={title || 'Profile portrait'} className="h-full w-full object-cover object-center" />
      ) : (
        <>
          <div className="absolute inset-0 bg-gradient-to-b from-neutral-100 to-neutral-300" />
          <div className="absolute bottom-0 left-1/2 h-[72%] w-[48%] -translate-x-1/2 rounded-t-[5rem] bg-neutral-100" />
          <div className="absolute left-1/2 top-[14%] h-[22%] w-[24%] -translate-x-1/2 rounded-full bg-neutral-300" />
          <div className="absolute left-1/2 top-[9%] h-[12%] w-[32%] -translate-x-1/2 rounded-t-full bg-neutral-700" />
        </>
      )}
    </div>
  );
}

function SectionLabel({ children }) {
  return <p className="text-xs font-medium uppercase text-neutral-500">{children}</p>;
}

function Hero({ hero, projects, experience }) {
  const resume = getResumeCta(hero);
  const primaryCtaLabel = typeof hero?.primaryCtaLabel === 'string' ? hero.primaryCtaLabel.trim() : '';
  const primaryCtaHref = typeof hero?.primaryCtaHref === 'string' ? hero.primaryCtaHref.trim() : '';
  const years = (() => {
    if (experience.length === 0) return '';
    const first = experience
      .map((item) => (item?.startDate ? new Date(item.startDate).getTime() : Number.NaN))
      .filter((value) => Number.isFinite(value))
      .sort((left, right) => left - right)[0];
    if (!Number.isFinite(first)) return '';
    return `${Math.max(1, Math.floor((Date.now() - first) / (365.25 * 24 * 60 * 60 * 1000)))}+`;
  })();
  const hasProjectMetric = projects.length > 0;
  const sideLabel = hero?.eyebrow || '';
  const recentProject = projects[0];

  return (
    <section id="home" className="relative overflow-hidden bg-[#f7f7f5] px-6 py-8 lg:min-h-[calc(100svh-73px)] lg:px-10 lg:py-10">
      <div className="absolute left-8 top-24 hidden h-[430px] w-px bg-neutral-200 lg:block" />
      {sideLabel ? <div className="absolute left-4 top-36 hidden -rotate-90 text-xs font-light text-neutral-300 lg:block">{sideLabel}</div> : null}
      <div className="absolute bottom-10 left-6 hidden -rotate-90 text-xs font-light text-neutral-300 lg:block">{new Date().getFullYear()}</div>
      <div className="relative z-10 mx-auto grid max-w-[1280px] items-center gap-8 lg:grid-cols-[0.96fr_1.04fr] lg:gap-6">
        <div className="lg:pl-14">
          {hasProjectMetric || years ? (
            <div className="mb-7 flex gap-10">
              {hasProjectMetric ? (
                <div>
                  <p className="text-3xl font-light text-neutral-900 sm:text-4xl">{projects.length}+</p>
                  <p className="mt-1 text-xs text-neutral-500">Projects</p>
                </div>
              ) : null}
              {years ? (
                <div>
                  <p className="text-3xl font-light text-neutral-900 sm:text-4xl">{years}</p>
                  <p className="mt-1 text-xs text-neutral-500">Years experience</p>
                </div>
              ) : null}
            </div>
          ) : null}
          {hero?.title ? (
            <h1 className="max-w-[720px] text-5xl font-light leading-[0.92] text-neutral-900 sm:text-6xl lg:text-7xl xl:text-8xl">
              {hero.title}
            </h1>
          ) : null}
          {hero?.description ? <p className="mt-5 max-w-xl text-sm leading-7 text-neutral-600 sm:text-base">{hero.description}</p> : null}
          <div className="mt-7 flex flex-wrap gap-3">
            {primaryCtaLabel && primaryCtaHref ? (
              <a
                href={primaryCtaHref}
                className="inline-flex items-center gap-2 rounded-full bg-neutral-950 px-5 py-3 text-xs font-medium text-white transition hover:bg-neutral-800"
              >
                {primaryCtaLabel} <Icon name="arrowUp" className="h-3.5 w-3.5" />
              </a>
            ) : null}
            <ResumeLink
              href={resume.href}
              label={resume.label}
              className="inline-flex items-center gap-2 rounded-full border border-neutral-300 bg-white px-5 py-3 text-xs font-medium text-neutral-950 transition hover:border-neutral-950"
            />
          </div>
        </div>
        <div className="relative">
          {recentProject ? <div className="absolute right-0 top-0 z-10 hidden max-w-[170px] items-center gap-3 text-xs text-neutral-500 lg:flex">
            <a href="#portfolio" className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#e8dfd3] text-neutral-900 transition hover:scale-105">
              <Icon name="arrowUp" />
            </a>
            <span>
              Recent work
              <br />
              {recentProject.title}
            </span>
          </div> : null}
          <Portrait image={hero?.image} title={hero?.title} />
        </div>
      </div>
    </section>
  );
}

function AboutHighlightCard({ item, className = '', style, cardRef, ...props }) {
  const points = splitAboutHighlightPoints(item.value);

  return (
    <article
      ref={cardRef}
      className={cx(
        'rounded-3xl border border-neutral-200 bg-white p-5 shadow-[0_18px_55px_rgba(0,0,0,.08)] sm:p-7',
        className,
      )}
      style={style}
      {...props}
    >
      <div className="flex items-center gap-3 sm:gap-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#ebe3d8] text-neutral-950">
          <Icon name="sparkle" />
        </div>
        <h3 className="text-2xl font-light text-neutral-950 sm:text-3xl">{item.label}</h3>
      </div>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-neutral-500">
        {points.map((point, pointIndex) => (
          <li key={`${item.label}-${pointIndex}-${point}`}>{point}</li>
        ))}
      </ul>
    </article>
  );
}

function AboutHighlightDeck({ highlights }) {
  const count = highlights.length;
  const [active, setActive] = useState(0);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [guideOffset, setGuideOffset] = useState(0);
  const frontRef = useRef(null);
  // mode: null (undecided) | 'scroll' (page) | 'deck' (next card)
  const dragRef = useRef({ mode: null, startY: 0, dy: 0, pointerId: null });

  useEffect(() => {
    if (count <= 1) return undefined;

    let step = 0;
    const timerId = window.setInterval(() => {
      if (dragRef.current.mode) {
        setGuideOffset(0);
        return;
      }
      step = (step + 1) % 6;
      // Subtle down-nudge loop: rest → drop → settle → rest
      if (step === 1) setGuideOffset(12);
      else if (step === 2) setGuideOffset(5);
      else setGuideOffset(0);
    }, 650);

    return () => window.clearInterval(timerId);
  }, [count, active]);

  // Touch intent lock: swipe up = page scroll; clear swipe down = next card.
  useEffect(() => {
    const el = frontRef.current;
    if (!el || count <= 1) return undefined;

    const reset = () => {
      dragRef.current = { mode: null, startY: 0, dy: 0, pointerId: null };
      setDragging(false);
      setDragY(0);
    };

    const onStart = (event) => {
      if (event.touches.length !== 1) return;
      dragRef.current = {
        mode: null,
        startY: event.touches[0].clientY,
        dy: 0,
        pointerId: null,
      };
      setGuideOffset(0);
    };

    const onMove = (event) => {
      const state = dragRef.current;
      if (state.mode === 'scroll') return;
      if (event.touches.length !== 1) return;

      const dy = event.touches[0].clientY - state.startY;

      if (state.mode === null) {
        if (Math.abs(dy) < 10) return;
        if (dy < 0) {
          // Scroll up — do not preventDefault; page keeps scrolling.
          state.mode = 'scroll';
          return;
        }
        // Swipe down — take over so the card advances instead of the page.
        state.mode = 'deck';
        setDragging(true);
      }

      if (state.mode === 'deck') {
        event.preventDefault();
        state.dy = Math.max(0, dy);
        setDragY(state.dy);
      }
    };

    const onEnd = () => {
      const state = dragRef.current;
      const shouldAdvance = state.mode === 'deck' && state.dy >= 48;
      reset();
      if (shouldAdvance) {
        setActive((current) => (current + 1) % count);
      }
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);

    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [count, active]);

  if (count === 0) {
    return null;
  }

  const goTo = (next) => {
    setActive(((next % count) + count) % count);
  };

  const handlePointerDown = (event) => {
    if (event.pointerType === 'touch') return;
    dragRef.current = {
      mode: null,
      startY: event.clientY,
      dy: 0,
      pointerId: event.pointerId,
    };
    setGuideOffset(0);
  };

  const handlePointerMove = (event) => {
    if (event.pointerType === 'touch') return;
    const state = dragRef.current;
    if (state.mode === 'scroll') return;
    if (state.pointerId == null && state.mode === null && state.startY === 0) return;

    const dy = event.clientY - state.startY;

    if (state.mode === null) {
      if (Math.abs(dy) < 10) return;
      if (dy < 0) {
        state.mode = 'scroll';
        return;
      }
      state.mode = 'deck';
      setDragging(true);
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // ignore
      }
    }

    if (state.mode === 'deck') {
      state.dy = Math.max(0, dy);
      setDragY(state.dy);
    }
  };

  const handlePointerUp = (event) => {
    if (event.pointerType === 'touch') return;
    const state = dragRef.current;
    const shouldAdvance = state.mode === 'deck' && state.dy >= 48;
    if (state.mode === 'deck' && state.pointerId != null) {
      try {
        event.currentTarget.releasePointerCapture(state.pointerId);
      } catch {
        // ignore
      }
    }
    dragRef.current = { mode: null, startY: 0, dy: 0, pointerId: null };
    setDragging(false);
    setDragY(0);
    if (shouldAdvance) {
      goTo(active + 1);
    }
  };

  return (
    <div className="mt-8 md:hidden">
      <div className="relative mx-auto w-full max-w-md pb-12">
        {/* Keep layout height = active card so peek stack cannot cover content below */}
        <div className="invisible pointer-events-none" aria-hidden>
          <AboutHighlightCard item={highlights[active]} />
        </div>
        {highlights.map((item, index) => {
          const offset = (index - active + count) % count;
          if (offset > Math.min(2, count - 1)) {
            return null;
          }

          const isFront = offset === 0;
          const scale = 1 - offset * 0.05;
          const peekY = offset * 14;
          const y = peekY + (isFront ? dragY + guideOffset : 0);

          return (
            <AboutHighlightCard
              key={item.label}
              item={item}
              cardRef={isFront ? frontRef : undefined}
              onPointerDown={isFront ? handlePointerDown : undefined}
              onPointerMove={isFront ? handlePointerMove : undefined}
              onPointerUp={isFront ? handlePointerUp : undefined}
              onPointerCancel={isFront ? handlePointerUp : undefined}
              className={cx(
                'absolute inset-x-0 top-0 cursor-grab active:cursor-grabbing',
                dragging && isFront ? 'transition-none' : 'transition-transform duration-300 ease-out',
              )}
              style={{
                zIndex: count - offset,
                transform: `translateY(${y}px) scale(${scale})`,
                opacity: offset === 0 ? 1 : 0.92 - offset * 0.08,
                touchAction: 'manipulation',
              }}
            />
          );
        })}
        {count > 1 && !dragging ? (
          <div className="pointer-events-none absolute -bottom-1 left-1/2 z-[20] flex -translate-x-1/2 flex-col items-center gap-0.5 text-neutral-400">
            <Icon name="arrowDown" className="h-3.5 w-3.5 animate-bounce" />
            <span className="text-[10px] font-medium uppercase tracking-[0.14em]">Swipe</span>
          </div>
        ) : null}
      </div>
      {count > 1 ? (
        <div className="mt-6 flex flex-col items-center gap-2">
          {highlights.map((item, index) => (
            <button
              key={`${item.label}-dot`}
              type="button"
              aria-label={`Show ${item.label}`}
              onClick={() => goTo(index)}
              className={cx(
                'w-2 rounded-full transition',
                index === active ? 'h-5 bg-neutral-950' : 'h-2 bg-neutral-300',
              )}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function About({ about }) {
  const highlights = Array.isArray(about?.highlights) ? about.highlights : [];
  const hasAbout = Boolean(about?.title || about?.body || highlights.length);

  if (!hasAbout) {
    return null;
  }

  return (
    <section id="about-me" className="bg-[#f7f7f5] px-6 py-12 sm:py-16 lg:px-10 lg:py-20">
      <div className="mx-auto max-w-[1280px]">
        <div className="grid gap-6 lg:grid-cols-[0.82fr_1.18fr] lg:items-end lg:gap-8">
          <h2 className="text-4xl font-light text-neutral-950 sm:text-5xl lg:text-6xl">{about?.title || 'About Me'}</h2>
          {about?.body ? <p className="max-w-2xl text-sm leading-7 text-neutral-500">{about.body}</p> : null}
        </div>
        <AboutHighlightDeck highlights={highlights} />
        <div className="mt-10 hidden gap-5 md:grid md:grid-cols-3">
          {highlights.map((item) => (
            <AboutHighlightCard key={item.label} item={item} />
          ))}
        </div>
        <div className="relative z-10 mt-8 md:mt-10">
          <a href="#certificates" className="inline-flex w-fit items-center gap-2 border-b border-neutral-950 pb-1 text-sm font-medium text-neutral-950">
            More about me <Icon name="arrowUp" className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </section>
  );
}

function ProjectImage({ image, title, onOpen }) {
  const projectImage = getSafeImage(image);

  return (
    <div className="relative h-40 overflow-hidden rounded-t-3xl bg-neutral-200 sm:h-52">
      {projectImage ? (
        <button
          type="button"
          className="h-full w-full transition hover:opacity-95"
          onClick={() => onOpen?.(projectImage)}
          aria-label={`View ${title || 'project'} details`}
        >
          <img src={projectImage} alt={`${title} project preview`} className="h-full w-full object-cover object-center" />
        </button>
      ) : (
        <div className="absolute inset-5 rounded-2xl bg-white p-4 shadow-xl">
          <div className="h-3 w-24 rounded-full bg-neutral-300" />
          <div className="mt-5 grid grid-cols-3 gap-3">
            {[1, 2, 3, 4, 5, 6].map((item) => (
              <div key={item} className="rounded-xl bg-neutral-100 p-3">
                <div className="h-2 w-10 rounded-full bg-neutral-400" />
                <div className="mt-5 h-8 rounded-lg bg-neutral-200" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Work({ projects, loading, error }) {
  const isMdUp = useIsMdUp();
  const [page, setPage] = useState(1);
  const [selectedProject, setSelectedProject] = useState(null);
  const itemsPerPage = isMdUp ? 6 : 3;
  const displayProjects = projects;
  const totalPages = Math.max(1, Math.ceil(displayProjects.length / itemsPerPage));
  const pageItems = displayProjects.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  useEffect(() => {
    setPage(1);
  }, [projects.length, itemsPerPage]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  if (!loading && !error && displayProjects.length === 0) {
    return null;
  }

  return (
    <section id="portfolio" className="bg-white px-6 py-12 sm:py-16 lg:px-10 lg:py-20">
      <div className="mx-auto max-w-[1280px] rounded-[2rem] bg-[#f4f0ea] px-5 py-8 sm:px-10 sm:py-10">
        <div className="mb-6 flex flex-col justify-between gap-4 sm:mb-8 sm:flex-row sm:items-end">
          <div>
            <SectionLabel>Selected Work</SectionLabel>
            <h2 className="mt-3 max-w-lg text-4xl font-light leading-[0.95] text-neutral-950 sm:mt-4 sm:text-5xl lg:text-6xl">Projects.</h2>
            <p className="mt-4 max-w-md text-sm leading-7 text-neutral-500 sm:mt-6">
              Selected projects that combine design quality, performance, and product thinking.
            </p>
          </div>
          <a href="#contact" className="inline-flex shrink-0 items-center gap-2 text-sm font-medium text-neutral-950">
            Start a project <Icon name="arrowUp" className="h-3.5 w-3.5" />
          </a>
        </div>
        {loading ? <p className="mb-4 text-sm text-neutral-500">Loading projects...</p> : null}
        {error ? <p className="mb-4 text-sm text-rose-600">{error.message}</p> : null}
        <div className="grid gap-5 sm:gap-6 md:grid-cols-3">
          {pageItems.map((project, index) => {
            const globalIndex = (page - 1) * itemsPerPage + index;
            const summary =
              (typeof project.summary === 'string' && project.summary.trim()) ||
              (typeof project.description === 'string' && project.description.trim()) ||
              '';
            const bulletPoints = normalizeDescriptions(project.descriptions);
            const link = getSafeUrl(project.demoUrl) || getSafeUrl(project.repoUrl);
            const tech = normalizeTech(project.tech ?? project.techStack);
            const badge = typeof project.badge === 'string' ? project.badge.trim() : '';
            return (
              <article key={project.id ?? project.slug ?? project.title} className="overflow-hidden rounded-3xl bg-white shadow-[0_18px_45px_rgba(0,0,0,.05)]">
                <ProjectImage
                  image={project.image}
                  title={project.title}
                  onOpen={(imageUrl) =>
                    setSelectedProject({
                      title: project.title,
                      imageUrl,
                      summary,
                      bulletPoints,
                      tech,
                      badge,
                      link,
                    })
                  }
                />
                <div className="p-4 sm:p-5">
                  <p className="text-xs text-neutral-400">{String(globalIndex + 1).padStart(2, '0')}</p>
                  <h3 className="mt-2 text-lg font-medium text-neutral-950 sm:text-xl">{project.title}</h3>
                  {summary ? <p className="mt-2 line-clamp-3 text-sm leading-6 text-neutral-500 sm:line-clamp-4 sm:min-h-[54px]">{summary}</p> : null}
                  {tech.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2 sm:mt-4">
                      {tech.slice(0, isMdUp ? 5 : 3).map((item) => (
                        <span
                          key={`${project.id ?? project.slug ?? project.title}-${item}`}
                          className="rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-[11px] font-medium text-neutral-600"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-4 flex items-center justify-between sm:mt-5">
                    {badge ? <span className="text-xs text-neutral-400">{badge}</span> : <span />}
                    <a href={link || '#contact'} target={link ? '_blank' : undefined} rel={link ? 'noreferrer' : undefined} className="grid h-9 w-9 place-items-center rounded-full bg-[#ede5da] text-neutral-950">
                      <Icon name="arrowUp" className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        {totalPages > 1 ? (
          <div className="mt-6 flex items-center justify-center gap-3 sm:mt-8">
            <button type="button" onClick={() => setPage((value) => Math.max(value - 1, 1))} disabled={page === 1} className="rounded-full border border-neutral-300 bg-white px-4 py-2 text-xs font-medium text-neutral-600 disabled:cursor-not-allowed disabled:opacity-40">
              Previous
            </button>
            <span className="rounded-full bg-neutral-950 px-4 py-2 text-xs font-medium text-white">
              {page} / {totalPages}
            </span>
            <button type="button" onClick={() => setPage((value) => Math.min(value + 1, totalPages))} disabled={page === totalPages} className="rounded-full border border-neutral-300 bg-white px-4 py-2 text-xs font-medium text-neutral-600 disabled:cursor-not-allowed disabled:opacity-40">
              Next
            </button>
          </div>
        ) : null}
        <div className="mt-6 flex items-center justify-between gap-3 rounded-2xl bg-[#e9dfd2] p-3.5 sm:mt-10 sm:gap-5 sm:rounded-3xl sm:p-6 sm:px-8">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-neutral-950 text-white sm:h-12 sm:w-12">
              <Icon name="arrowUp" className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </div>
            <p className="min-w-0 text-sm font-light leading-snug text-neutral-950 sm:text-2xl">
              Let&apos;s create something useful together.
            </p>
          </div>
          <a
            href="#contact"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-neutral-950 px-3.5 py-2 text-[11px] font-medium text-white sm:gap-2 sm:px-6 sm:py-3 sm:text-sm"
          >
            Book a Call <Icon name="arrowUp" className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
          </a>
        </div>
      </div>

      <Dialog open={Boolean(selectedProject)} onOpenChange={(isOpen) => setSelectedProject(isOpen ? selectedProject : null)}>
        <DialogContent className="max-h-[90vh] w-[min(980px,calc(100%-24px))] max-w-none overflow-y-auto rounded-3xl border border-neutral-200 bg-white p-3 shadow-[0_24px_70px_rgba(0,0,0,.12)] sm:p-4">
          <DialogTitle className="sr-only">{selectedProject?.title || 'Project preview'}</DialogTitle>
          <DialogDescription className="sr-only">Project image and full description.</DialogDescription>
          <div className="space-y-4">
            <div className="grid place-items-center rounded-2xl border border-neutral-200 bg-[#fbfaf7] p-3">
              {selectedProject?.imageUrl ? (
                <img
                  src={selectedProject.imageUrl}
                  alt={selectedProject.title || 'Project preview'}
                  className="max-h-[52vh] w-full object-contain"
                />
              ) : null}
            </div>
            <div className="px-1 pb-1 sm:px-2">
              {selectedProject?.badge ? (
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-neutral-400">{selectedProject.badge}</p>
              ) : null}
              <h3 className="mt-1 text-2xl font-medium text-neutral-950">{selectedProject?.title}</h3>
              {selectedProject?.summary ? (
                <p className="mt-3 text-sm leading-7 text-neutral-600">{selectedProject.summary}</p>
              ) : null}
              {Array.isArray(selectedProject?.bulletPoints) && selectedProject.bulletPoints.length > 0 ? (
                <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-neutral-600">
                  {selectedProject.bulletPoints.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              ) : null}
              {Array.isArray(selectedProject?.tech) && selectedProject.tech.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {selectedProject.tech.map((item) => (
                    <span
                      key={`${selectedProject.title}-${item}`}
                      className="rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-[11px] font-medium text-neutral-600"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              ) : null}
              {selectedProject?.link ? (
                <a
                  href={selectedProject.link}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-5 inline-flex items-center gap-2 rounded-full bg-neutral-950 px-4 py-2.5 text-xs font-medium text-white"
                >
                  View project <Icon name="arrowUp" className="h-3.5 w-3.5" />
                </a>
              ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function Skills({ skills, loading, error }) {
  const isMdUp = useIsMdUp();
  const [page, setPage] = useState(1);
  const itemsPerPage = isMdUp ? 9 : 4;
  const displaySkills = skills;
  const totalPages = Math.max(1, Math.ceil(displaySkills.length / itemsPerPage));
  const pageItems = displaySkills.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  useEffect(() => {
    setPage(1);
  }, [skills.length, itemsPerPage]);

  if (!loading && !error && displaySkills.length === 0) {
    return null;
  }

  return (
    <section id="skills" className="bg-[#f7f7f5] px-6 py-12 sm:py-16 lg:px-10 lg:py-20">
      <div className="mx-auto grid max-w-[1280px] gap-8 lg:grid-cols-[0.75fr_1.25fr] lg:gap-10">
        <div>
          <SectionLabel>Skills</SectionLabel>
          <h2 className="mt-3 max-w-md text-4xl font-light leading-[0.95] text-neutral-950 sm:mt-4 sm:text-5xl lg:text-6xl">Craft &amp; stack.</h2>
          <p className="mt-4 max-w-sm text-sm leading-7 text-neutral-500 sm:mt-6">
            Tools and frameworks I use to design, build, and ship reliable systems.
          </p>
          {loading ? <p className="mt-4 text-sm text-neutral-500">Loading skills...</p> : null}
          {error ? <p className="mt-4 text-sm text-rose-600">{error.message}</p> : null}
        </div>
        <div>
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
            {pageItems.map((skill) => {
              const value = Math.max(0, Math.min(100, Number(skill.level ?? 75)));
              return (
                <div key={skill.id ?? skill.name} className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-[0_18px_45px_rgba(0,0,0,.04)] sm:p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <SkillIcon src={skill.image} name={skill.name} />
                      <p className="truncate text-base font-medium text-neutral-950 sm:text-lg">{skill.name}</p>
                    </div>
                    <p className="shrink-0 text-sm text-neutral-400">{value}%</p>
                  </div>
                  <div className="mt-4 h-px bg-neutral-200 sm:mt-5">
                    <div className="h-px bg-neutral-950" style={{ width: `${value}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          {totalPages > 1 ? (
            <div className="mt-6 flex items-center justify-center gap-3">
              <button type="button" onClick={() => setPage((value) => Math.max(value - 1, 1))} disabled={page === 1} className="rounded-full border border-neutral-300 bg-white px-4 py-2 text-xs font-medium text-neutral-600 disabled:cursor-not-allowed disabled:opacity-40">
                Previous
              </button>
              <span className="rounded-full bg-neutral-950 px-4 py-2 text-xs font-medium text-white">
                {page} / {totalPages}
              </span>
              <button type="button" onClick={() => setPage((value) => Math.min(value + 1, totalPages))} disabled={page === totalPages} className="rounded-full border border-neutral-300 bg-white px-4 py-2 text-xs font-medium text-neutral-600 disabled:cursor-not-allowed disabled:opacity-40">
                Next
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function Experience({ items, loading, error }) {
  const displayItems = items;

  if (!loading && !error && displayItems.length === 0) {
    return null;
  }

  return (
    <section id="experience" className="bg-white px-6 py-12 sm:py-16 lg:px-10 lg:py-20">
      <div className="mx-auto max-w-[1280px]">
        <div className="mb-6 grid gap-6 sm:mb-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-8">
          <div>
            <SectionLabel>Experience</SectionLabel>
            <h2 className="mt-3 max-w-md text-4xl font-light leading-[0.95] text-neutral-950 sm:mt-4 sm:text-5xl lg:text-6xl">Path so far.</h2>
          </div>
        </div>
        {loading ? <p className="mb-4 text-sm text-neutral-500">Loading experience...</p> : null}
        {error ? <p className="mb-4 text-sm text-rose-600">{error.message}</p> : null}
        <div className="divide-y divide-neutral-200 border-y border-neutral-200">
          {displayItems.map((item) => (
            <article key={item.id ?? `${item.title}-${item.company}`} className="grid gap-3 py-6 sm:gap-6 sm:py-8 lg:grid-cols-[0.45fr_0.75fr_1fr]">
              <p className="text-sm text-neutral-400">
                {formatDate(item.startDate) || 'Recent'} - {item.endDate ? formatDate(item.endDate) : item.isCurrent ? 'Present' : ''}
              </p>
              <div>
                <h3 className="text-2xl font-light text-neutral-950 sm:text-3xl">{item.title}</h3>
                <p className="mt-1 text-sm text-neutral-500 sm:mt-2">{item.company}</p>
              </div>
              <p className="line-clamp-4 text-sm leading-7 text-neutral-500 sm:line-clamp-none">{item.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function CertificateCard({ cert, index, onSelect }) {
  const verifyLink = getSafeUrl(cert.link);
  const certificateImage = getSafeImage(cert.image);
  const isPdf = isPdfAssetUrl(cert.image);
  const pdfPreview = isPdf && typeof cert.image === 'string' ? toCloudinaryPdfPreviewUrl(cert.image) : null;
  const previewImage = pdfPreview || certificateImage;

  return (
    <article
      key={cert.id ?? `${cert.title}-${index}`}
      className="flex min-h-0 flex-col overflow-hidden rounded-3xl bg-white shadow-[0_18px_45px_rgba(0,0,0,.05)]"
    >
      <div className="relative flex aspect-[4/3] w-full shrink-0 items-center justify-center overflow-hidden bg-[#fbfaf7] sm:aspect-auto sm:h-56">
        {previewImage ? (
          <button
            type="button"
            className="flex h-full min-h-0 w-full items-center justify-center p-1.5 sm:p-3"
            onClick={() => onSelect({ title: cert.title, imageUrl: previewImage, pdfUrl: isPdf ? cert.image : null, isPdf })}
          >
            <img
              src={previewImage}
              alt={`${cert.title} certificate`}
              className="h-full w-full object-contain"
            />
          </button>
        ) : (
          <div className="m-4 flex h-full w-full flex-col items-center justify-center rounded-2xl border border-neutral-200 bg-white text-center">
            <Icon name="certificate" className="h-8 w-8 text-neutral-500" />
            <p className="mt-2 text-xs font-medium uppercase text-neutral-400">
              {isPdf ? 'PDF Certificate' : 'Verified Certificate'}
            </p>
          </div>
        )}
      </div>
      <div className="relative z-[1] flex min-h-0 flex-1 flex-col bg-white p-4 sm:p-5">
        {cert.category ? (
          <span className="inline-flex w-fit rounded-full border border-neutral-200 bg-neutral-100 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-700">
            {cert.category}
          </span>
        ) : null}
        <h3 className="mt-2 text-lg font-medium leading-tight text-neutral-950 sm:min-h-[52px] sm:text-xl">{cert.title}</h3>
        <p className="mt-2 text-sm text-neutral-500">{cert.issuer}</p>
        {verifyLink ? (
          <a href={verifyLink} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-neutral-950">
            Verify <Icon name="arrowUp" className="h-3.5 w-3.5" />
          </a>
        ) : null}
      </div>
    </article>
  );
}

function Certificates({ items, error }) {
  const isMdUp = useIsMdUp();
  const [activeCategory, setActiveCategory] = useState('All');
  const [sortMode, setSortMode] = useState('default');
  const [page, setPage] = useState(1);
  const [selectedCert, setSelectedCert] = useState(null);
  const itemsPerPage = isMdUp ? 6 : 3;
  const sorted = useMemo(() => [...items].sort(compareCertificatesForDisplay), [items]);
  const displayItems = sorted;
  const categories = ['All', ...Array.from(new Set(displayItems.map((item) => item.category).filter(Boolean)))];
  const filtered = activeCategory === 'All' ? displayItems : displayItems.filter((item) => item.category === activeCategory);
  const featuredItems = useMemo(
    () => sortCertificatesByMode(filtered.filter((item) => Boolean(item?.isFeatured)), sortMode),
    [filtered, sortMode],
  );
  const regularItems = useMemo(
    () => sortCertificatesByMode(filtered.filter((item) => !item?.isFeatured), sortMode),
    [filtered, sortMode],
  );
  const totalPages = Math.max(1, Math.ceil(regularItems.length / itemsPerPage));
  const pageItems = regularItems.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  useEffect(() => {
    setPage(1);
  }, [activeCategory, sortMode, items.length, itemsPerPage, regularItems.length]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  if (!error && displayItems.length === 0) {
    return null;
  }

  return (
    <section id="certificates" className="bg-[#f7f7f5] px-6 py-12 sm:py-16 lg:px-10 lg:py-20">
      <div className="mx-auto max-w-[1280px] rounded-[2rem] bg-[#f4f0ea] px-5 py-8 sm:px-10 sm:py-10">
        <div className="mb-6 flex flex-col gap-4 sm:mb-8">
          <div>
            <SectionLabel>Certificates</SectionLabel>
            <h2 className="mt-3 max-w-lg text-4xl font-light leading-[0.95] text-neutral-950 sm:mt-4 sm:text-5xl lg:text-6xl">Verified work.</h2>
            <p className="mt-4 max-w-md text-sm leading-7 text-neutral-500 sm:mt-6">
              Credentials that back the work — verified skills from trusted programs.
            </p>
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            <div className="-mx-5 min-w-0 overflow-x-auto px-5 [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:px-0">
              <div className="flex w-max flex-nowrap gap-2">
                {categories.map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setActiveCategory(filter)}
                    className={cx(
                      'shrink-0 rounded-full border px-3.5 py-2 text-xs font-medium sm:px-4',
                      activeCategory === filter ? 'border-neutral-950 bg-neutral-950 text-white' : 'border-neutral-300 bg-white text-neutral-600',
                    )}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </div>
            <label className="inline-flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-start">
              <span className="text-xs font-medium text-neutral-500">Sort</span>
              <select
                value={sortMode}
                onChange={(event) => setSortMode(event.target.value)}
                aria-label="Sort certificates"
                className="h-9 min-w-0 flex-1 rounded-full border border-neutral-300 bg-white px-3 text-xs font-medium text-neutral-700 sm:flex-none sm:min-w-[12rem]"
              >
                {CERTIFICATE_SORT_MODES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        {error ? <p className="mb-4 text-sm text-rose-600">{error.message}</p> : null}

        {featuredItems.length > 0 ? (
          <div className={regularItems.length > 0 ? 'mb-10' : ''}>
            <div className="mb-4 flex items-end gap-3">
              <p className="text-sm font-medium text-neutral-950">Featured</p>
              <div className="h-px flex-1 bg-neutral-200" aria-hidden />
            </div>
            <div className="grid gap-5 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {featuredItems.map((cert, index) => (
                <CertificateCard key={cert.id ?? `${cert.title}-featured-${index}`} cert={cert} index={index} onSelect={setSelectedCert} />
              ))}
            </div>
          </div>
        ) : null}

        {regularItems.length > 0 ? (
          <div>
            {featuredItems.length > 0 ? (
              <div className="mb-4 flex items-end gap-3">
                <p className="text-sm font-medium text-neutral-950">All certificates</p>
                <div className="h-px flex-1 bg-neutral-200" aria-hidden />
              </div>
            ) : null}
            <div className="grid gap-5 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {pageItems.map((cert, index) => (
                <CertificateCard key={cert.id ?? `${cert.title}-${index}`} cert={cert} index={index} onSelect={setSelectedCert} />
              ))}
            </div>
          </div>
        ) : null}

        {totalPages > 1 ? (
          <div className="mt-8 flex items-center justify-center gap-3">
            <button type="button" onClick={() => setPage((value) => Math.max(value - 1, 1))} disabled={page === 1} className="rounded-full border border-neutral-300 bg-white px-4 py-2 text-xs font-medium text-neutral-600 disabled:cursor-not-allowed disabled:opacity-40">
              Previous
            </button>
            <span className="rounded-full bg-neutral-950 px-4 py-2 text-xs font-medium text-white">
              {page} / {totalPages}
            </span>
            <button type="button" onClick={() => setPage((value) => Math.min(value + 1, totalPages))} disabled={page === totalPages} className="rounded-full border border-neutral-300 bg-white px-4 py-2 text-xs font-medium text-neutral-600 disabled:cursor-not-allowed disabled:opacity-40">
              Next
            </button>
          </div>
        ) : null}
      </div>

      <Dialog open={Boolean(selectedCert)} onOpenChange={(isOpen) => setSelectedCert(isOpen ? selectedCert : null)}>
        <DialogContent className="w-[min(980px,calc(100%-24px))] max-w-none rounded-3xl border border-neutral-200 bg-white p-3 shadow-[0_24px_70px_rgba(0,0,0,.12)]">
          <DialogTitle className="sr-only">{selectedCert?.title || 'Certificate preview'}</DialogTitle>
          <DialogDescription className="sr-only">Full-size certificate preview.</DialogDescription>
          {selectedCert?.isPdf && typeof selectedCert.pdfUrl === 'string' ? (
            <iframe
              title={selectedCert.title || 'Certificate preview'}
              src={selectedCert.pdfUrl}
              className="h-[80vh] w-full rounded-2xl border border-neutral-200 bg-white"
            />
          ) : (
            <div className="grid place-items-center rounded-2xl border border-neutral-200 bg-white p-3">
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

function Contact({ contact }) {
  const [formData, setFormData] = useState(initialForm);
  const [errors, setErrors] = useState(initialForm);
  const [formError, setFormError] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const startGlobalLoading = useLoadingStore((state) => state.startLoading);
  const stopGlobalLoading = useLoadingStore((state) => state.stopLoading);

  const validateForm = ({ name, email, message }) => {
    const nextErrors = { ...initialForm };
    if (!/^[A-Za-z\s]{3,60}$/.test(name.trim())) nextErrors.name = 'Enter a valid name (3-60 letters).';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) nextErrors.email = 'Enter a valid email address.';
    if (message.trim().length < 10 || message.trim().length > 800) nextErrors.message = 'Message must be between 10 and 800 characters.';
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
    if (Object.values(validationErrors).some(Boolean)) return;

    setLoading(true);
    startGlobalLoading('Sending your message');
    try {
      const promise = fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      }).then(async (res) => {
        if (!res.ok) throw await parseErrorResponse(res, 'Failed to send message');
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
    <section id="contact" className="bg-white px-6 py-12 sm:py-16 lg:px-10 lg:py-20">
      <div className="mx-auto grid max-w-[1280px] gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-10">
        <div>
          <SectionLabel>Contact</SectionLabel>
          <h2 className="mt-3 max-w-lg text-4xl font-light leading-[0.95] text-neutral-950 sm:mt-4 sm:text-5xl lg:text-6xl">
            Tell me about your next system.
          </h2>
          <p className="mt-4 max-w-md text-sm leading-7 text-neutral-500 sm:mt-6">
            Send a message for portfolio collaborations, internal workflow systems, dashboards, or automation projects.
          </p>
          <div className="mt-6 grid gap-2 text-sm text-neutral-500">
            {contact?.email ? <a href={`mailto:${contact.email}`} className="hover:text-neutral-950">{contact.email}</a> : null}
            {contact?.location ? <span>{contact.location}</span> : null}
          </div>
        </div>
        <form className="rounded-[2rem] bg-[#f7f7f5] p-6 shadow-[0_18px_50px_rgba(0,0,0,.05)]" onSubmit={handleSubmit} noValidate>
          {isSubmitted ? (
            <div className="grid min-h-80 place-items-center text-center">
              <div>
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-neutral-950 text-white">
                  <Icon name="mail" />
                </div>
                <h3 className="mt-4 text-2xl font-light text-neutral-950">Message sent.</h3>
                <button type="button" onClick={() => setIsSubmitted(false)} className="mt-5 rounded-full bg-neutral-950 px-5 py-3 text-sm font-medium text-white">
                  Send another
                </button>
              </div>
            </div>
          ) : (
            <>
              <FormErrorSummary error={formError} fieldErrors={{}} />
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <input className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-4 text-sm outline-none focus:border-neutral-500" placeholder="Your name" name="name" value={formData.name} onChange={handleChange} maxLength={60} required />
                  {errors.name ? <p className="mt-1 text-sm text-rose-600">{errors.name}</p> : null}
                </div>
                <div>
                  <input className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-4 text-sm outline-none focus:border-neutral-500" placeholder="Email address" name="email" type="email" value={formData.email} onChange={handleChange} maxLength={120} required />
                  {errors.email ? <p className="mt-1 text-sm text-rose-600">{errors.email}</p> : null}
                </div>
              </div>
              <div>
                <textarea className="mt-4 min-h-40 w-full resize-y rounded-2xl border border-neutral-200 bg-white px-4 py-4 text-sm outline-none focus:border-neutral-500" placeholder="Tell me about your project..." name="message" value={formData.message} onChange={handleChange} maxLength={800} required />
                {errors.message ? <p className="mt-1 text-sm text-rose-600">{errors.message}</p> : null}
              </div>
              <button type="submit" disabled={loading} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-neutral-950 px-6 py-4 text-sm font-medium text-white disabled:opacity-60">
                {loading ? 'Sending...' : 'Send Message'} <Icon name="mail" className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </form>
      </div>
    </section>
  );
}

function Footer({ config }) {
  const logoText = typeof config?.logoText === 'string' && config.logoText.trim() ? config.logoText.trim() : '';
  return (
    <footer className="border-t border-neutral-200 bg-[#f7f7f5] px-6 py-4 pb-24 md:px-8 md:py-6 md:pb-6 lg:px-10 lg:py-8">
      <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-3 text-[11px] leading-snug text-neutral-500 sm:gap-4 sm:text-sm">
        <Logo config={config} />
        <p className="min-w-0 truncate text-right">
          © {new Date().getFullYear()}
          {logoText ? ` ${logoText}` : ''}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

export default function MinimalistEditorialPortfolio({ profileSlug = null, siteContent, siteConfig }) {
  const links = useMemo(() => normalizeLinks(siteConfig), [siteConfig]);
  const { data: projectsData, error: projectsError, isLoading: projectsLoading } = useSWR(withProfile('/api/portfolio', profileSlug), fetcher);
  const { data: skillsData, error: skillsError, isLoading: skillsLoading } = useSWR(withProfile('/api/skills', profileSlug), fetcher);
  const { data: experienceData, error: experienceError, isLoading: experienceLoading } = useSWR(withProfile('/api/experience', profileSlug), fetcher);
  const { data: certificatesData, error: certificatesError } = useSWR(withProfile('/api/certificates', profileSlug), fetcher);
  const projects = Array.isArray(projectsData) ? projectsData : Array.isArray(projectsData?.projects) ? projectsData.projects : [];
  const skills = Array.isArray(skillsData) ? skillsData : [];
  const experience = Array.isArray(experienceData) ? experienceData : [];
  const certificates = Array.isArray(certificatesData) ? certificatesData : [];

  return (
    <main className="min-h-screen bg-[#f7f7f5] text-neutral-950">
      <Header config={siteConfig} links={links} />
      <FloatingSocial contact={siteContent?.contact} hero={siteContent?.hero} />
      <Hero hero={siteContent?.hero} projects={projects} experience={experience} />
      <About about={siteContent?.about} />
      <Work projects={projects} loading={projectsLoading} error={projectsError} />
      <Skills skills={skills} loading={skillsLoading} error={skillsError} />
      <Experience items={experience} loading={experienceLoading} error={experienceError} />
      <Certificates items={certificates} error={certificatesError} />
      <Contact contact={siteContent?.contact} />
      <Footer config={siteConfig} />
    </main>
  );
}
