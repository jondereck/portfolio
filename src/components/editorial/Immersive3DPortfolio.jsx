/* eslint-disable @next/next/no-img-element */
'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import FormErrorSummary from '@/components/forms/FormErrorSummary';
import { splitAboutHighlightPoints } from '@/lib/aboutHighlights';
import { compareCertificatesForDisplay, isPdfAssetUrl, toCloudinaryPdfPreviewUrl } from '@/lib/certificates';
import { normalizeFormError, parseErrorResponse } from '@/lib/form-client';
import { defaultNavigation } from '@/lib/siteContentDefaults';
import { isSafeHttpUrl } from '@/lib/url-safety';
import { useLoadingStore } from '@/store/loading';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/src/components/ui/dialog';

const cx = (...classes) => classes.filter(Boolean).join(' ');
const ADMIN_CLICK_WINDOW_MS = 1600;
const initialForm = { name: '', email: '', message: '' };

const fetcher = (url) =>
  fetch(url, { cache: 'no-store' }).then((response) => {
    if (!response.ok) throw new Error('Unable to load portfolio data.');
    return response.json();
  });

const withProfile = (path, profileSlug) => {
  if (!profileSlug) return path;
  const joiner = path.includes('?') ? '&' : '?';
  return `${path}${joiner}profile=${encodeURIComponent(profileSlug)}`;
};

const getSafeImage = (value) => (isSafeHttpUrl(value) ? value : '');
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

const formatExperienceYears = (items) => {
  if (!Array.isArray(items) || items.length === 0) return '';
  const earliestStart = items
    .map((item) => (item?.startDate ? new Date(item.startDate).getTime() : Number.NaN))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right)[0];

  if (!Number.isFinite(earliestStart)) return '';
  const yearMs = 365.25 * 24 * 60 * 60 * 1000;
  return `${Math.max(1, Math.floor((Date.now() - earliestStart) / yearMs))}+`;
};

const getMostUsedTech = (projects) => {
  if (!Array.isArray(projects) || projects.length === 0) return '';
  const counts = new Map();
  projects.forEach((project) => {
    normalizeTech(project?.tech ?? project?.techStack).forEach((tech) => {
      counts.set(tech, (counts.get(tech) ?? 0) + 1);
    });
  });
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? '';
};

const getProjectSummary = (project) => {
  if (typeof project?.description === 'string' && project.description.trim()) return project.description.trim();
  if (typeof project?.summary === 'string' && project.summary.trim()) return project.summary.trim();
  return normalizeDescriptions(project?.descriptions)[0] ?? '';
};

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
    send: (
      <>
        <path d="m22 2-7 20-4-9-9-4Z" />
        <path d="M22 2 11 13" />
      </>
    ),
  };
  return <svg {...common}>{icons[name] || icons.arrow}</svg>;
}

function Logo({ config }) {
  const adminClickStateRef = useRef({ count: 0, timerId: null });
  const logoText = typeof config?.logoText === 'string' && config.logoText.trim() ? config.logoText.trim() : 'JN System';
  const logoImage = getSafeImage(config?.logoImage);

  const clearAdminClicks = useCallback(() => {
    if (adminClickStateRef.current.timerId) {
      window.clearTimeout(adminClickStateRef.current.timerId);
      adminClickStateRef.current.timerId = null;
    }
    adminClickStateRef.current.count = 0;
  }, []);

  const handleLogoClick = (event) => {
    if ('button' in event && event.button !== 0) return;
    event.preventDefault();
    const nextCount = adminClickStateRef.current.count + 1;
    if (adminClickStateRef.current.timerId) window.clearTimeout(adminClickStateRef.current.timerId);

    if (nextCount >= 3) {
      clearAdminClicks();
      window.location.assign('/admin/login');
      return;
    }

    adminClickStateRef.current.count = nextCount;
    adminClickStateRef.current.timerId = window.setTimeout(() => {
      const finalCount = adminClickStateRef.current.count;
      clearAdminClicks();
      if (finalCount === 1) {
        window.location.hash = 'home';
      }
    }, ADMIN_CLICK_WINDOW_MS);
  };

  useEffect(() => () => clearAdminClicks(), [clearAdminClicks]);

  return (
    <a href="#home" onClick={handleLogoClick} className="brand" aria-label="Go to home">
      <span className="mark">
        {logoImage ? <img src={logoImage} alt="" /> : null}
      </span>
      <div>
        <h3>{logoText}</h3>
      
      </div>
    </a>
  );
}

function NavLinks({ links }) {
  return (
    <nav className="nav-links">
      {links.map((link) => {
        const href = link.type === 'url' || !link.target.startsWith('#') ? link.target : link.target;
        const external = isSafeHttpUrl(href);
        return (
          <a key={`${link.label}-${link.target}`} href={href} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined}>
            {link.label}
          </a>
        );
      })}
    </nav>
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

function SectionHead({ eyebrow, title, desc, right }) {
  return (
    <div className="section-head">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h2 className="section-title">{title}</h2>
        {desc ? <p className="lead">{desc}</p> : null}
      </div>
      {right ? <div className="section-actions">{right}</div> : null}
    </div>
  );
}

function HeroVisual({ heroImage }) {
  const image = getSafeImage(heroImage);
  return (
    <div className="panel hero-stage tilt">
      <div className="stage-bg" />
      <div className="orbit" />
      <div className="orbit-sm" />
      <div className="float-node node-b">3D</div>
      <div className="float-node node-c">UX</div>

      <div className="avatar-stack">
        <div className="shadow-disc" />
        <div className="back-plate" />
        <div className="mid-plate" />
        <div className="front-card">

          {image ? (
            <img src={image} alt="Portfolio hero visual" className="hero-image" />
          ) : (
            <>
              <div className="avatar-face" />
              <div className="avatar-hair" />
              <div className="avatar-body" />
              <div className="avatar-sash" />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function HeroSection({ hero, about, profileSlug }) {
  const { data: projectsData } = useSWR(withProfile('/api/portfolio', profileSlug), fetcher);
  const { data: experienceData } = useSWR(withProfile('/api/experience', profileSlug), fetcher);
  const projects = Array.isArray(projectsData) ? projectsData : Array.isArray(projectsData?.projects) ? projectsData.projects : [];
  const experienceItems = Array.isArray(experienceData) ? experienceData : [];
  const mainStack = getMostUsedTech(projects);
  const experienceYears = formatExperienceYears(experienceItems);
  const eyebrow = typeof hero?.eyebrow === 'string' && hero.eyebrow.trim() ? hero.eyebrow.trim() : 'Immersive 3D Portfolio';
  const title = typeof hero?.title === 'string' && hero.title.trim() ? hero.title.trim() : 'A more kakaiba theme with premium depth.';
  const primaryCtaLabel = typeof hero?.primaryCtaLabel === 'string' && hero.primaryCtaLabel.trim() ? hero.primaryCtaLabel.trim() : 'Explore Projects';
  const primaryCtaHref = typeof hero?.primaryCtaHref === 'string' && hero.primaryCtaHref.trim() ? hero.primaryCtaHref.trim() : '#portfolio';
  const secondaryCtaLabel = typeof hero?.secondaryCtaLabel === 'string' && hero.secondaryCtaLabel.trim() ? hero.secondaryCtaLabel.trim() : 'Request Full React Version';
  const secondaryCtaHref = typeof hero?.secondaryCtaHref === 'string' && hero.secondaryCtaHref.trim() ? hero.secondaryCtaHref.trim() : '#contact';
  const metrics = [
    { value: projects.length > 0 ? `${projects.length}+` : '3D', label: projects.length > 0 ? 'Projects designed' : 'Theme quality' },
    { value: experienceYears || `${experienceItems.length}`, label: experienceYears ? 'Years experience' : 'Experience entries' },
    { value: mainStack || 'Live', label: mainStack ? 'Main stack' : 'Real data' },
  ];

  return (
    <section id="home" className="hero">
      <div className="hero-left">
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {hero?.description ? (
          <p className="lead">{hero.description}</p>
        ) : (
          <p className="lead">
            I improved the concept with a stronger visual identity: layered 3D hero composition, orbit rings, floating glass nodes, richer section cards, cleaner spacing, and a more futuristic premium look across the whole page.
          </p>
        )}

        <div className="action-row">
          <CtaLink href={primaryCtaHref} className="button-primary">{primaryCtaLabel}</CtaLink>
          <CtaLink href={secondaryCtaHref} className="button-secondary">{secondaryCtaLabel}</CtaLink>
        </div>

        <div className="stats">
          {metrics.map((metric) => (
            <div key={`${metric.label}-${metric.value}`} className="panel card tilt">
              <div className="meta">{metric.label}</div>
              <div className="metric">{metric.value}</div>
            </div>
          ))}
        </div>
      </div>

      <HeroVisual heroImage={hero?.image} />
    </section>
  );
}

function AboutSection({ about }) {
  const cards = Array.isArray(about?.highlights) ? about.highlights : [];
  const hasAbout = Boolean(about?.title || about?.body || cards.length > 0);
  if (!hasAbout) return null;

  return (
    <section id="about">
      <div className="section-head">
        <div>
          <div className="eyebrow">About</div>
          {about?.title ? <h2 className="section-title">{about.title}</h2> : null}
          {about?.body ? <p className="lead">{about.body}</p> : null}
        </div>
      </div>
      {cards.length > 0 ? (
        <div className="about-highlights">
          {cards.map((card, index) => {
            const points = splitAboutHighlightPoints(card.value);

            return (
              <article key={`${card.label}-${index}`} className="panel card tilt about-highlight">
                <div className="meta">{card.label}</div>
                <ul className="about-highlight-list">
                  {points.map((point, pointIndex) => (
                    <li key={`${card.label}-${pointIndex}-${point}`}>{point}</li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function ProjectMock({ variant = 0 }) {
  const mode = variant % 3 === 0 ? 'dashboard' : variant % 3 === 1 ? 'tracker' : 'gallery';
  return (
    <div className={`project-top ${mode}`}>
      <div className="window-bar" />
      <div className="screen" />
    </div>
  );
}

function ProjectVisual({ project, index }) {
  const image = getSafeImage(project?.image);
  if (!image) return <ProjectMock variant={index} />;
  return (
    <div className="project-top has-image">
      <img src={image} alt={project?.title || 'Project image'} />
      <div className="window-bar" />
    </div>
  );
}

function WorkSection({ profileSlug }) {
  const [page, setPage] = useState(1);
  const itemsPerPage = 3;
  const { data, error, isLoading } = useSWR(withProfile('/api/portfolio', profileSlug), fetcher);
  const projects = Array.isArray(data) ? data : Array.isArray(data?.projects) ? data.projects : [];
  const totalPages = Math.ceil(projects.length / itemsPerPage);
  const pageItems = projects.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  useEffect(() => setPage(1), [projects.length]);
  if (!isLoading && !error && projects.length === 0) return null;
  const projectDescription = projects.length > 0
    ? `${projects.length} selected ${projects.length === 1 ? 'project' : 'projects'} with real screenshots, links, and technical details.`
    : 'Projects load directly from the portfolio database.';

  return (
    <section id="portfolio">
      <SectionHead
        eyebrow="Portfolio"
        title="Selected Projects"
        desc={projectDescription}
        right={<a href="#contact" className="cta">Start a project ↗</a>}
      />
      {error ? <p className="error-text">{error.message}</p> : null}
      {isLoading ? <p className="lead">Loading projects...</p> : null}
      <div className="cards-3">
        {pageItems.map((project, index) => {
          const globalIndex = (page - 1) * itemsPerPage + index;
          const tech = normalizeTech(project.tech ?? project.techStack);
          const summary = getProjectSummary(project);
          const link = isSafeHttpUrl(project.demoUrl) ? project.demoUrl : '';
          const repo = isSafeHttpUrl(project.repoUrl) ? project.repoUrl : '';
          return (
            <article key={project.id ?? project.slug ?? `${project.title}-${globalIndex}`} className="panel card tilt project-card">
              <ProjectVisual project={project} index={globalIndex} />
              <h3>{project.title}</h3>
              {summary ? <p className="lead wide">{summary}</p> : null}
              <div className="project-tag">{project.badge || tech.slice(0, 2).join(' • ') || 'Featured Project'}</div>
              {tech.length > 0 ? (
                <div className="pill-row compact">
                  {tech.slice(0, 6).map((item) => <span key={`${project.id ?? project.slug}-${item}`} className="pill">{item}</span>)}
                </div>
              ) : null}
              <div className="action-row compact">
                {link ? <a href={link} target="_blank" rel="noreferrer" className="button-primary">View project <Icon name="arrow" className="h-4 w-4" /></a> : null}
                {repo ? <a href={repo} target="_blank" rel="noreferrer" className="button-secondary">Source <Icon name="github" className="h-4 w-4" /></a> : null}
              </div>
            </article>
          );
        })}
      </div>
      {totalPages > 1 ? (
        <div className="pager">
          <button type="button" onClick={() => setPage((value) => Math.max(value - 1, 1))} disabled={page === 1}>Previous</button>
          <span>{page} / {totalPages}</span>
          <button type="button" onClick={() => setPage((value) => Math.min(value + 1, totalPages))} disabled={page === totalPages}>Next</button>
        </div>
      ) : null}
    </section>
  );
}

function SkillsExperienceSection({ profileSlug }) {
  const { data: skillsData, error: skillsError, isLoading: skillsLoading } = useSWR(withProfile('/api/skills', profileSlug), fetcher);
  const { data: experienceData, error: experienceError, isLoading: experienceLoading } = useSWR(withProfile('/api/experience', profileSlug), fetcher);
  const [showAllSkills, setShowAllSkills] = useState(false);
  const skills = Array.isArray(skillsData) ? skillsData : [];
  const experienceItems = Array.isArray(experienceData) ? experienceData : [];
  const loading = skillsLoading || experienceLoading;
  const error = skillsError || experienceError;
  const previewLimit = 8;
  const visibleSkills = showAllSkills || skills.length <= previewLimit ? skills : skills.slice(0, previewLimit);
  const leftSkills = visibleSkills.filter((_, index) => index % 2 === 0);
  const rightSkills = visibleSkills.filter((_, index) => index % 2 === 1);
  const skillsDescription = skills.length > 0
    ? `${skills.length} technical ${skills.length === 1 ? 'skill' : 'skills'} grouped by proficiency and current portfolio data.`
    : 'Skills load directly from the portfolio database.';
  const experienceDescription = experienceItems.length > 0
    ? `${experienceItems.length} professional ${experienceItems.length === 1 ? 'role' : 'roles'} shown from the experience timeline.`
    : 'Experience entries load directly from the portfolio database.';

  if (!loading && !error && skills.length === 0 && experienceItems.length === 0) return null;

  return (
    <>
      {(skills.length > 0 || loading || skillsError) ? (
        <section id="skills">
          <SectionHead eyebrow="Skills" title="Technical Skills" desc={skillsDescription} />
          {loading ? <p className="lead">Loading experience data...</p> : null}
          {error ? <p className="error-text">{error.message}</p> : null}
          <div className="cards-2">
            {[leftSkills, rightSkills.length > 0 ? rightSkills : []].map((group, index) => (
              <div key={`skill-group-${index}`} className="panel skill-box tilt">
                {group.map((skill) => (
                  <div key={skill.id} className="skill-row">
                    <div className="skill-head"><span>{skill.name}</span><span>{skill.level}%</span></div>
                    <div className="bar"><div className="fill" style={{ width: `${skill.level}%` }} /></div>
                  </div>
                ))}
              </div>
            ))}
          </div>
          {skills.length > previewLimit ? (
            <div className="pager">
              <button type="button" onClick={() => setShowAllSkills((value) => !value)}>{showAllSkills ? 'Show less' : 'Show all skills'}</button>
            </div>
          ) : null}
        </section>
      ) : null}

      {(experienceItems.length > 0 || loading || experienceError) ? (
        <section id="experience">
          <SectionHead eyebrow="Experience" title="Work Experience" desc={experienceDescription} />
          <div className="timeline">
            {experienceItems.map((item) => (
              <article key={item.id} className="panel card tilt timeline-item">
                <div className="year-pill">{formatDate(item.startDate)} — {item.endDate ? formatDate(item.endDate) : 'Present'}</div>
                <div>
                  <h3>{item.title}</h3>
                  <div className="meta">{item.company}{item.location ? ` — ${item.location}` : ''}</div>
                  <p className="lead wide">{item.description}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

function CertificatesSection({ profileSlug }) {
  const [activeCategory, setActiveCategory] = useState('All');
  const [page, setPage] = useState(1);
  const [selectedCert, setSelectedCert] = useState(null);
  const itemsPerPage = 6;
  const { data, error } = useSWR(withProfile('/api/certificates', profileSlug), fetcher);
  const items = Array.isArray(data) ? data : [];
  const categories = useMemo(() => ['All', ...Array.from(new Set(items.map((item) => item.category).filter(Boolean)))], [items]);
  const sortedItems = useMemo(() => [...items].sort(compareCertificatesForDisplay), [items]);
  const filteredItems = activeCategory === 'All' ? sortedItems : sortedItems.filter((item) => item.category === activeCategory);
  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
  const pageItems = filteredItems.slice((page - 1) * itemsPerPage, page * itemsPerPage);
  const certificatesDescription = items.length > 0
    ? `${items.length} ${items.length === 1 ? 'credential' : 'credentials'} with certificate previews and verification links where available.`
    : 'Certificates load directly from the portfolio database.';

  useEffect(() => setPage(1), [activeCategory, items.length]);
  if (!error && items.length === 0) return null;

  return (
    <section id="certificates">
      <SectionHead
        eyebrow="Certificates"
        title="Certificates"
        desc={certificatesDescription}
        right={categories.length > 1 ? (
          <div className="filter-row">
            {categories.map((category) => (
              <button key={category} type="button" onClick={() => setActiveCategory(category)} className={cx(activeCategory === category && 'active')}>{category}</button>
            ))}
          </div>
        ) : null}
      />
      {error ? <p className="error-text">{error.message}</p> : null}
      <div className="cards-3">
        {pageItems.map((cert, index) => {
          const certificateImage = getSafeImage(cert.image);
          const isPdf = isPdfAssetUrl(cert.image);
          const pdfPreview = isPdf && typeof cert.image === 'string' ? toCloudinaryPdfPreviewUrl(cert.image) : null;
          const previewImage = pdfPreview || certificateImage;
          return (
            <article key={`${cert.id ?? 'cert'}-${cert.title}-${index}`} className="panel card tilt certificate-card">
              <button
                type="button"
                className="cert-button"
                onClick={() => {
                  const imageUrl = previewImage || '';
                  setSelectedCert(imageUrl ? { title: cert.title, imageUrl, pdfUrl: isPdf ? cert.image : null, isPdf } : null);
                }}
              >
                <div className="cert-top">
                  {previewImage ? <img src={previewImage} alt={`${cert.title} certificate`} /> : <span>Verified Certificate</span>}
                </div>
              </button>
              <div className="certificate-body">
                <h3 className="certificate-title">{cert.title}</h3>
                {cert.issuer ? <p className="lead wide">{cert.issuer}</p> : null}
                {cert.issuedAt ? <div className="meta">Issued {new Date(cert.issuedAt).toLocaleDateString()}</div> : null}
                {isSafeHttpUrl(cert.link) ? (
                  <a href={cert.link} target="_blank" rel="noreferrer" className="project-tag">Verify <Icon name="arrowUp" className="h-4 w-4" /></a>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
      {totalPages > 1 ? (
        <div className="pager">
          <button type="button" onClick={() => setPage((value) => Math.max(value - 1, 1))} disabled={page === 1}>Previous</button>
          <span>{page} / {totalPages}</span>
          <button type="button" onClick={() => setPage((value) => Math.min(value + 1, totalPages))} disabled={page === totalPages}>Next</button>
        </div>
      ) : null}

      <Dialog open={Boolean(selectedCert)} onOpenChange={(isOpen) => setSelectedCert(isOpen ? selectedCert : null)}>
        <DialogContent className="w-[min(980px,calc(100%-24px))] max-w-none rounded-[28px] border border-white/15 bg-[#0d1430] p-3 text-white shadow-[0_28px_80px_rgba(0,0,0,.5)]">
          <DialogTitle className="sr-only">{selectedCert?.title || 'Certificate preview'}</DialogTitle>
          <DialogDescription className="sr-only">Full-size certificate preview.</DialogDescription>
          {selectedCert?.isPdf && typeof selectedCert.pdfUrl === 'string' ? (
            <iframe title={selectedCert.title || 'Certificate preview'} src={selectedCert.pdfUrl} className="h-[80vh] w-full rounded-[22px] border border-white/15 bg-white" />
          ) : (
            <div className="grid place-items-center rounded-[22px] border border-white/15 bg-white/5 p-3">
              {selectedCert?.imageUrl ? <img src={selectedCert.imageUrl} alt={selectedCert.title || 'Certificate preview'} className="max-h-[80vh] w-full object-contain" /> : null}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function ContactSection({ contact }) {
  const [formData, setFormData] = useState(initialForm);
  const [errors, setErrors] = useState(initialForm);
  const [formError, setFormError] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const startGlobalLoading = useLoadingStore((state) => state.startLoading);
  const stopGlobalLoading = useLoadingStore((state) => state.stopLoading);
  const contactItems = [
    contact?.email ? ['Email', contact.email, `mailto:${contact.email}`] : null,
    contact?.location ? ['Location', contact.location, ''] : null,
    contact?.calendarLink && isSafeHttpUrl(contact.calendarLink) ? ['Calendar', 'Book a call', contact.calendarLink] : null,
  ].filter(Boolean);

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
    <section id="contact">
      <SectionHead eyebrow="Contact" title="Contact" desc="Send a message about a project, workflow, or collaboration." />
      <div className="contact-layout">
        <div className="panel card tilt">
          <h3>Contact Details</h3>
          <div className="contact-grid">
            {contactItems.length > 0 ? contactItems.map(([label, text, href]) =>
              href ? (
                <a key={text} href={href} target={isSafeHttpUrl(href) ? '_blank' : undefined} rel={isSafeHttpUrl(href) ? 'noreferrer' : undefined} className="contact-item">
                  <span>{label}</span>{text}
                </a>
              ) : (
                <div key={text} className="contact-item"><span>{label}</span>{text}</div>
              ),
            ) : <div className="contact-item">Use the form to send a message.</div>}
          </div>
        </div>

        <div className="panel card tilt">
          {isSubmitted ? (
            <div className="success-state">
              <div className="success-icon"><Icon name="check" /></div>
              <h3>Message sent successfully.</h3>
              <button type="button" className="button-primary" onClick={() => setIsSubmitted(false)}>Send another</button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              <FormErrorSummary error={formError} fieldErrors={{}} />
              <div className="form-grid">
                <label>
                  <input placeholder="Your name" name="name" value={formData.name} onChange={handleChange} maxLength={60} required />
                  {errors.name ? <span className="field-error">{errors.name}</span> : null}
                </label>
                <label>
                  <input placeholder="Email address" name="email" type="email" value={formData.email} onChange={handleChange} maxLength={120} required />
                  {errors.email ? <span className="field-error">{errors.email}</span> : null}
                </label>
              </div>
              <label>
                <textarea placeholder="Tell me about your project..." name="message" value={formData.message} onChange={handleChange} maxLength={800} required />
                {errors.message ? <span className="field-error">{errors.message}</span> : null}
              </label>
              <button type="submit" disabled={loading} className="button-primary">{loading ? 'Sending...' : 'Send Message'} <Icon name="send" className="h-4 w-4" /></button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

function Footer({ config }) {
  const logoText = typeof config?.logoText === 'string' && config.logoText.trim() ? config.logoText.trim() : 'JN System';
  return (
    <footer className="footer">
      <div>{logoText} — Portfolio</div>
      <div>Projects, skills, experience, and certificates powered by portfolio data.</div>
    </footer>
  );
}

function ImmersiveStyles() {
  return (
    <style>{`
      .i3d {
        --bg: #050816;
        --bg-2: #0d1430;
        --panel: rgba(255,255,255,0.08);
        --panel-2: rgba(255,255,255,0.06);
        --stroke: rgba(255,255,255,0.12);
        --text: #eef3ff;
        --muted: #aeb8d8;
        --muted-2: #8792b5;
        --accent: #86a0ff;
        --accent-2: #46f1c7;
        --accent-3: #b46dff;
        --gold: #ffcf7b;
        --shadow: 0 28px 80px rgba(0,0,0,.42);
        --radius: 28px;
        --radius-lg: 34px;
        min-height: 100vh;
        color: var(--text);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background:
          radial-gradient(circle at 15% 10%, rgba(134,160,255,.18), transparent 25%),
          radial-gradient(circle at 85% 15%, rgba(70,241,199,.14), transparent 20%),
          radial-gradient(circle at 50% 80%, rgba(180,109,255,.16), transparent 28%),
          linear-gradient(145deg, #040611 0%, #091022 28%, #0d1430 55%, #0a0f24 100%);
        overflow-x: hidden;
      }
      .i3d * { box-sizing: border-box; }
      .i3d .noise, .i3d .grid-overlay, .i3d .spotlight { position: fixed; inset: 0; pointer-events: none; z-index: 0; }
      .i3d .grid-overlay {
        background-image:
          linear-gradient(rgba(255,255,255,.045) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,.045) 1px, transparent 1px);
        background-size: 42px 42px;
        mask-image: radial-gradient(circle at center, rgba(0,0,0,.85), transparent 80%);
        opacity: .32;
      }
      .i3d .noise {
        opacity: .08;
        background-image:
          radial-gradient(circle at 20% 20%, rgba(255,255,255,.3) 1px, transparent 1px),
          radial-gradient(circle at 80% 40%, rgba(255,255,255,.25) 1px, transparent 1px),
          radial-gradient(circle at 50% 80%, rgba(255,255,255,.22) 1px, transparent 1px);
        background-size: 90px 90px, 110px 110px, 130px 130px;
        mix-blend-mode: overlay;
      }
      .i3d .spotlight { background: radial-gradient(circle at var(--mx, 50%) var(--my, 20%), rgba(134,160,255,.13), transparent 18%); transition: background .08s linear; }
      .i3d .glow { position: fixed; border-radius: 999px; filter: blur(28px); opacity: .35; pointer-events: none; z-index: 0; animation: i3dFloatBlob 14s ease-in-out infinite; }
      .i3d .glow.one { width: 220px; height: 220px; top: 12%; left: -70px; background: #6f8cff; }
      .i3d .glow.two { width: 260px; height: 260px; top: 35%; right: -90px; background: #47f4cd; animation-delay: -4s; }
      .i3d .glow.three { width: 240px; height: 240px; bottom: 8%; left: 22%; background: #b46dff; animation-delay: -8s; }
      @keyframes i3dFloatBlob {
        0%, 100% { transform: translate3d(0,0,0) scale(1); }
        33% { transform: translate3d(20px,-16px,0) scale(1.08); }
        66% { transform: translate3d(-10px,18px,0) scale(.96); }
      }
      .i3d .shell {
        position: relative;
        z-index: 1;
        width: min(1280px, calc(100% - 20px));
        margin: 12px auto 28px;
        border-radius: 34px;
        overflow: hidden;
        border: 1px solid rgba(255,255,255,.1);
        background: linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.04));
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        box-shadow: var(--shadow), inset 0 1px 0 rgba(255,255,255,.12);
      }
      .i3d .nav {
        position: sticky;
        top: 0;
        z-index: 25;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
        padding: 18px 24px;
        background: linear-gradient(180deg, rgba(5,8,22,.92), rgba(5,8,22,.58));
        border-bottom: 1px solid rgba(255,255,255,.08);
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
      }
      .i3d .brand { display: flex; align-items: center; gap: 14px; text-decoration: none; color: var(--text); }
      .i3d .mark {
        width: 44px;
        height: 44px;
        border-radius: 16px;
        background: linear-gradient(135deg, var(--accent), var(--accent-2));
        position: relative;
        transform: perspective(700px) rotateX(12deg) rotateY(-18deg);
        box-shadow: 0 16px 28px rgba(80,120,255,.22), inset 0 1px 0 rgba(255,255,255,.28);
        overflow: hidden;
      }
      .i3d .mark img { position: absolute; inset: 5px; width: calc(100% - 10px); height: calc(100% - 10px); object-fit: contain; z-index: 2; }
      .i3d .mark::before, .i3d .mark::after { content: ""; position: absolute; border-radius: 12px; background: rgba(255,255,255,.18); box-shadow: inset 0 1px 0 rgba(255,255,255,.3); }
      .i3d .mark::before { inset: 7px 20px 7px 7px; }
      .i3d .mark::after { inset: 11px 7px 11px 22px; }
      .i3d .brand h3 { margin: 0; font-size: 16px; letter-spacing: .01em; }
      .i3d .brand p { margin: 2px 0 0; color: var(--muted-2); font-size: 12px; }
      .i3d .nav-links { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
      .i3d .nav-links a {
        text-decoration: none;
        color: var(--muted);
        font-size: 13px;
        padding: 10px 14px;
        border-radius: 999px;
        border: 1px solid transparent;
        transition: .2s ease;
      }
      .i3d .nav-links a:hover { color: #fff; border-color: rgba(255,255,255,.08); background: rgba(255,255,255,.05); }
      .i3d .cta {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        min-height: 46px;
        padding: 0 16px;
        border-radius: 16px;
        background: linear-gradient(135deg, rgba(134,160,255,.22), rgba(70,241,199,.14));
        border: 1px solid rgba(255,255,255,.12);
        color: white;
        text-decoration: none;
        font-weight: 700;
        box-shadow: inset 0 1px 0 rgba(255,255,255,.18);
      }
      .i3d section { padding: 32px 24px 22px; }
      .i3d #about { padding-bottom: 52px; }
      .i3d .section-head { display: flex; align-items: end; justify-content: space-between; gap: 20px; margin-bottom: 18px; }
      .i3d .section-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
      .i3d .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        padding: 8px 12px;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,.1);
        background: rgba(255,255,255,.04);
        color: var(--accent-2);
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: .18em;
        margin-bottom: 14px;
      }
      .i3d .eyebrow::before { content: ""; width: 8px; height: 8px; border-radius: 999px; background: linear-gradient(135deg, var(--accent), var(--accent-2)); box-shadow: 0 0 16px rgba(70,241,199,.55); }
      .i3d h1, .i3d h2, .i3d h3, .i3d h4 { margin: 0; letter-spacing: -.05em; }
      .i3d h1 { font-size: clamp(52px, 8vw, 94px); line-height: .94; }
      .i3d h3 { font-size: 28px; }
      .i3d .section-title { font-size: clamp(28px, 4vw, 46px); line-height: 1; }
      .i3d .lead { color: var(--muted); line-height: 1.82; font-size: 16px; max-width: 720px; margin: 14px 0 0; }
      .i3d .lead.wide { max-width: none; font-size: 15px; }
      .i3d .hero { display: grid; grid-template-columns: 1.05fr .95fr; gap: 20px; align-items: stretch; padding-top: 26px; }
      .i3d .hero-left { padding: 12px 4px 8px; }
      .i3d .pill-row { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 22px; }
      .i3d .pill-row.compact { margin-top: 14px; gap: 8px; }
      .i3d .pill {
        padding: 10px 14px;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,.08);
        background: rgba(255,255,255,.045);
        color: var(--muted);
        font-size: 13px;
        box-shadow: inset 0 1px 0 rgba(255,255,255,.08);
      }
      .i3d .project-card .pill-row.compact { gap: 6px; margin-top: 10px; }
      .i3d .project-card .pill {
        max-width: 150px;
        padding: 6px 10px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 11px;
      }
      .i3d .action-row { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 28px; }
      .i3d .action-row.compact { margin-top: 16px; gap: 10px; }
      .i3d .button-primary, .i3d .button-secondary {
        min-height: 52px;
        padding: 0 18px;
        border-radius: 18px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        text-decoration: none;
        font-weight: 700;
        cursor: pointer;
        transition: transform .18s ease, box-shadow .18s ease;
        border: 0;
      }
      .i3d .button-primary { color: white; background: linear-gradient(135deg, var(--accent), var(--accent-2)); box-shadow: 0 18px 34px rgba(68,110,255,.24), inset 0 1px 0 rgba(255,255,255,.3); }
      .i3d .button-secondary { color: white; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.1); box-shadow: inset 0 1px 0 rgba(255,255,255,.12); }
      .i3d .button-primary:hover, .i3d .button-secondary:hover { transform: translateY(-2px); }
      .i3d .button-primary:disabled, .i3d button:disabled { opacity: .55; cursor: not-allowed; }
      .i3d .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 26px; }
      .i3d .panel {
        border-radius: var(--radius);
        border: 1px solid var(--stroke);
        background: linear-gradient(180deg, rgba(255,255,255,.11), rgba(255,255,255,.05));
        box-shadow: var(--shadow), inset 0 1px 0 rgba(255,255,255,.14);
        position: relative;
        overflow: hidden;
      }
      .i3d .panel::before {
        content: "";
        position: absolute;
        inset: 0;
        background: linear-gradient(120deg, transparent, rgba(255,255,255,.06), transparent);
        transform: translateX(-110%);
        transition: transform .5s ease;
        pointer-events: none;
      }
      .i3d .panel:hover::before { transform: translateX(110%); }
      .i3d .panel > * { position: relative; z-index: 1; }
      .i3d .card { padding: 22px; }
      .i3d .metric { font-size: 42px; margin-top: 8px; font-weight: 800; letter-spacing: -.05em; }
      .i3d .meta { color: var(--muted); font-size: 13px; }
      .i3d .tilt { transform-style: preserve-3d; transition: transform .16s ease, box-shadow .16s ease; will-change: transform; }
      .i3d .hero-stage { min-height: 620px; padding: 20px; display: grid; place-items: center; position: relative; }
      .i3d .stage-bg {
        position: absolute;
        inset: 16px;
        border-radius: 28px;
        background:
          radial-gradient(circle at 50% 25%, rgba(255,255,255,.14), transparent 18%),
          linear-gradient(180deg, rgba(255,255,255,.05), transparent 55%);
        border: 1px solid rgba(255,255,255,.08);
        overflow: hidden;
      }
      .i3d .stage-bg::before {
        content: "";
        position: absolute;
        inset: 0;
        background-image: radial-gradient(rgba(255,255,255,.1) 1px, transparent 1px);
        background-size: 18px 18px;
        mask-image: linear-gradient(180deg, rgba(0,0,0,.95), transparent 75%);
        opacity: .28;
      }
      .i3d .orbit, .i3d .orbit-sm { position: absolute; border-radius: 999px; border: 1px dashed rgba(255,255,255,.16); left: 50%; top: 50%; transform: translate(-50%, -50%); animation: i3dSpin 16s linear infinite; }
      .i3d .orbit { width: 420px; height: 420px; }
      .i3d .orbit-sm { width: 300px; height: 300px; animation-duration: 12s; animation-direction: reverse; }
      @keyframes i3dSpin {
        from { transform: translate(-50%, -50%) rotate(0deg); }
        to { transform: translate(-50%, -50%) rotate(360deg); }
      }
      .i3d .float-node {
        position: absolute;
        width: 58px; height: 58px;
        border-radius: 18px;
        background: linear-gradient(180deg, rgba(255,255,255,.18), rgba(255,255,255,.08));
        border: 1px solid rgba(255,255,255,.12);
        box-shadow: 0 16px 30px rgba(0,0,0,.22), inset 0 1px 0 rgba(255,255,255,.16);
        display: grid; place-items: center;
        color: #fff;
        font-weight: 800;
        font-size: 12px;
        animation: i3dBob 5.6s ease-in-out infinite;
      }
      .i3d .node-b { top: 150px; right: 68px; animation-delay: -.8s; }
      .i3d .node-c { bottom: 110px; left: 90px; animation-delay: -1.7s; }
      @keyframes i3dBob {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-12px); }
      }
      .i3d .avatar-stack { position: relative; width: min(450px, 90%); aspect-ratio: 4 / 5; transform-style: preserve-3d; z-index: 1; }
      .i3d .shadow-disc { position: absolute; left: 50%; bottom: 16px; width: 72%; height: 46px; transform: translateX(-50%); border-radius: 999px; background: rgba(0,0,0,.35); filter: blur(18px); }
      .i3d .back-plate, .i3d .mid-plate, .i3d .front-card { position: absolute; inset: 0; border-radius: 32px; }
      .i3d .back-plate { transform: translate3d(22px,-6px,-40px) rotate(8deg); background: linear-gradient(135deg, rgba(180,109,255,.16), rgba(134,160,255,.08)); border: 1px solid rgba(255,255,255,.06); }
      .i3d .mid-plate { transform: translate3d(-18px,8px,-16px) rotate(-8deg); background: linear-gradient(135deg, rgba(70,241,199,.16), rgba(255,207,123,.1)); border: 1px solid rgba(255,255,255,.07); }
      .i3d .front-card { overflow: hidden; border: 1px solid rgba(255,255,255,.12); background: linear-gradient(180deg, #1e2948 0%, #14203a 48%, #10182d 100%); box-shadow: 0 30px 80px rgba(0,0,0,.38), inset 0 1px 0 rgba(255,255,255,.14); }
      .i3d .front-card::before {
        content: "";
        position: absolute;
        inset: 0;
        background:
          radial-gradient(circle at 50% 15%, rgba(255,255,255,.28), transparent 16%),
          radial-gradient(circle at 80% 20%, rgba(70,241,199,.12), transparent 20%),
          radial-gradient(circle at 15% 78%, rgba(134,160,255,.14), transparent 20%);
      }
      .i3d .hero-image { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: .86; }
      .i3d .avatar-face { position: absolute; left: 50%; top: 15%; width: 28%; height: 18%; transform: translateX(-50%); border-radius: 50%; background: radial-gradient(circle at 50% 35%, #f3d7c8 0%, #ddb5a4 72%); box-shadow: inset 0 -10px 14px rgba(0,0,0,.09); z-index: 3; }
      .i3d .avatar-hair { position: absolute; left: 50%; top: 11%; width: 34%; height: 12%; transform: translateX(-50%); border-radius: 60% 60% 40% 40%; background: linear-gradient(180deg, #0c1324, #161f36); z-index: 4; }
      .i3d .avatar-body { position: absolute; left: 50%; bottom: -2%; width: 74%; height: 58%; transform: translateX(-50%); border-radius: 34px 34px 0 0; background: linear-gradient(180deg, #edf2ff 0%, #d2dcf3 100%); z-index: 2; }
      .i3d .avatar-sash { position: absolute; left: 45%; top: 28%; width: 16%; height: 54%; transform: translateX(-50%) rotate(24deg); border-radius: 999px; background: linear-gradient(180deg, var(--accent), var(--accent-2)); z-index: 5; box-shadow: 0 12px 24px rgba(65,137,255,.25); }
      .i3d .badge-float, .i3d .status-float, .i3d .tag-float {
        position: absolute;
        padding: 12px 14px;
        border-radius: 18px;
        background: linear-gradient(180deg, rgba(255,255,255,.16), rgba(255,255,255,.08));
        border: 1px solid rgba(255,255,255,.12);
        box-shadow: 0 18px 28px rgba(0,0,0,.22), inset 0 1px 0 rgba(255,255,255,.16);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        font-size: 13px;
        z-index: 6;
        color: white;
      }
      .i3d .badge-float { top: 24px; left: 24px; }
      .i3d .status-float { top: 38px; right: 22px; max-width: 44%; }
      .i3d .tag-float { bottom: 24px; left: 24px; max-width: calc(100% - 48px); }
      .i3d .about-highlights, .i3d .cards-2, .i3d .cards-3 { display: grid; gap: 18px; }
      .i3d .about-highlights { grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); margin-top: 18px; }
      .i3d .cards-2 { grid-template-columns: repeat(2, 1fr); }
      .i3d .cards-3 { grid-template-columns: repeat(3, 1fr); }
      .i3d .about-highlight-list {
        margin: 10px 0 0;
        padding-left: 18px;
        color: var(--text);
        font-size: 15px;
        line-height: 1.7;
        display: grid;
        gap: 8px;
        list-style: disc;
        overflow-wrap: anywhere;
        word-break: normal;
      }
      .i3d .project-top {
        min-height: 210px;
        border-radius: 22px;
        position: relative;
        overflow: hidden;
        background: linear-gradient(180deg, rgba(255,255,255,.12), rgba(255,255,255,.04));
        border: 1px solid rgba(255,255,255,.08);
        box-shadow: inset 0 1px 0 rgba(255,255,255,.12);
        margin-bottom: 16px;
      }
      .i3d .project-top img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
      .i3d .project-top.has-image::after { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(5,8,22,.05), rgba(5,8,22,.64)); }
      .i3d .project-top .window-bar { position: absolute; top: 16px; left: 16px; right: 16px; height: 16px; border-radius: 999px; background: rgba(255,255,255,.08); z-index: 2; }
      .i3d .project-top .screen { position: absolute; left: 24px; right: 24px; bottom: 22px; top: 48px; border-radius: 18px; background: linear-gradient(180deg, rgba(255,255,255,.14), rgba(255,255,255,.05)); border: 1px solid rgba(255,255,255,.08); }
      .i3d .project-top .screen::before, .i3d .project-top .screen::after { content: ""; position: absolute; border-radius: 16px; background: rgba(255,255,255,.1); }
      .i3d .project-top.dashboard .screen::before { inset: 16px 48% 42% 16px; }
      .i3d .project-top.dashboard .screen::after { inset: 16px 16px 16px 54%; }
      .i3d .project-top.tracker .screen::before { inset: 18px 20px 18px 20px; }
      .i3d .project-top.gallery .screen::before { inset: 18px 56% 54% 18px; }
      .i3d .project-top.gallery .screen::after { inset: 18px 18px 18px 50%; }
      .i3d .project-card h3 { font-size: 24px; }
      .i3d .project-tag { display: inline-flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 999px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.08); font-size: 12px; color: var(--muted); margin-top: 16px; text-decoration: none; }
      .i3d .project-card .project-tag {
        width: fit-content;
        max-width: 170px;
        padding: 6px 10px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 11px;
      }
      .i3d .skill-box { padding: 22px; }
      .i3d .skill-row { margin-top: 16px; }
      .i3d .skill-row:first-child { margin-top: 0; }
      .i3d .skill-head { display: flex; justify-content: space-between; gap: 10px; margin-bottom: 8px; font-size: 14px; color: #fff; font-weight: 700; }
      .i3d .bar { height: 12px; border-radius: 999px; overflow: hidden; background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.08); box-shadow: inset 0 1px 0 rgba(255,255,255,.08); }
      .i3d .fill { height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--accent), var(--accent-2)); box-shadow: 0 10px 22px rgba(70,241,199,.18); }
      .i3d .timeline { display: grid; gap: 16px; position: relative; }
      .i3d .timeline-item { display: grid; grid-template-columns: 140px 1fr; gap: 18px; align-items: start; }
      .i3d .timeline-item h3 { font-size: 30px; }
      .i3d .year-pill { padding: 12px 14px; border-radius: 18px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.08); color: var(--accent-2); font-weight: 700; text-align: center; }
      .i3d .certificate-card { display: flex; flex-direction: column; gap: 18px; }
      .i3d .cert-button { display: block; flex: 0 0 auto; width: 100%; padding: 0; border: 0; background: transparent; text-align: left; cursor: pointer; }
      .i3d .certificate-card .cert-top {
        height: 178px;
        display: grid;
        place-items: center;
        border-radius: 22px;
        margin-bottom: 0;
        background:
          linear-gradient(180deg, rgba(255,255,255,.16), rgba(255,255,255,.06)),
          radial-gradient(circle at 20% 20%, rgba(134,160,255,.2), transparent 28%),
          radial-gradient(circle at 80% 80%, rgba(70,241,199,.14), transparent 30%);
        border: 1px solid rgba(255,255,255,.08);
        box-shadow: inset 0 1px 0 rgba(255,255,255,.14);
        text-align: center;
        padding: 16px;
        overflow: hidden;
      }
      .i3d .cert-top img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: contain;
        border-radius: 14px;
        background: rgba(255,255,255,.95);
        box-shadow: 0 16px 34px rgba(0,0,0,.18);
      }
      .i3d .cert-top span { font-size: 12px; letter-spacing: .24em; text-transform: uppercase; color: rgba(255,255,255,.86); font-weight: 800; }
      .i3d .certificate-body { display: grid; gap: 9px; align-content: start; flex: 1; }
      .i3d .certificate-title {
        color: var(--text);
        font-size: clamp(20px, 2vw, 24px);
        line-height: 1.2;
        letter-spacing: -.035em;
        overflow-wrap: anywhere;
        text-shadow: 0 10px 28px rgba(5,8,22,.45);
      }
      .i3d .certificate-body .lead { margin-top: 0; font-size: 15px; line-height: 1.7; }
      .i3d .certificate-body .project-tag { width: fit-content; margin-top: 8px; }
      .i3d .contact-layout { display: grid; grid-template-columns: .9fr 1.1fr; gap: 18px; }
      .i3d .form-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
      .i3d form { display: grid; gap: 14px; }
      .i3d input, .i3d textarea {
        width: 100%;
        border: 1px solid rgba(255,255,255,.12);
        background: rgba(255,255,255,.05);
        color: white;
        border-radius: 18px;
        padding: 15px 16px;
        outline: none;
        box-shadow: inset 0 1px 0 rgba(255,255,255,.08);
      }
      .i3d textarea { min-height: 170px; resize: vertical; }
      .i3d input::placeholder, .i3d textarea::placeholder { color: #95a2c5; }
      .i3d .contact-grid { display: grid; gap: 12px; margin-top: 18px; }
      .i3d .contact-item { padding: 16px 18px; border-radius: 18px; background: rgba(255,255,255,.045); border: 1px solid rgba(255,255,255,.08); color: var(--muted); text-decoration: none; }
      .i3d .contact-item span { display: block; color: var(--accent-2); font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .16em; margin-bottom: 4px; }
      .i3d .success-state { min-height: 360px; display: grid; place-items: center; text-align: center; align-content: center; gap: 16px; }
      .i3d .success-icon { width: 56px; height: 56px; margin: 0 auto; display: grid; place-items: center; border-radius: 999px; background: linear-gradient(135deg, var(--accent), var(--accent-2)); }
      .i3d .footer { padding: 24px; display: flex; justify-content: space-between; align-items: center; gap: 14px; border-top: 1px solid rgba(255,255,255,.08); color: var(--muted); font-size: 14px; }
      .i3d .pager { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 22px; color: var(--muted); }
      .i3d .pager button, .i3d .pager span, .i3d .filter-row button {
        border: 1px solid rgba(255,255,255,.1);
        background: rgba(255,255,255,.05);
        color: var(--muted);
        border-radius: 999px;
        padding: 10px 14px;
        font-weight: 700;
      }
      .i3d .filter-row { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
      .i3d .filter-row button.active { color: white; background: linear-gradient(135deg, rgba(134,160,255,.34), rgba(70,241,199,.2)); }
      .i3d .error-text, .i3d .field-error { color: #fda4af; font-size: 13px; font-weight: 700; }
      .i3d .field-error { display: block; margin-top: 6px; }
      @media (max-width: 1100px) {
        .i3d .hero, .i3d .about-highlights, .i3d .contact-layout, .i3d .cards-3, .i3d .cards-2, .i3d .stats { grid-template-columns: 1fr; }
        .i3d .hero-stage { min-height: 540px; }
        .i3d .timeline-item { grid-template-columns: 1fr; }
      }
      @media (max-width: 860px) {
        .i3d .nav { flex-wrap: wrap; }
        .i3d .nav-links { order: 3; width: 100%; justify-content: center; }
        .i3d .form-grid { grid-template-columns: 1fr; }
      }
      @media (max-width: 640px) {
        .i3d .shell { width: calc(100% - 10px); margin: 6px auto 18px; border-radius: 24px; }
        .i3d .nav, .i3d section, .i3d .footer { padding-left: 14px; padding-right: 14px; }
        .i3d .hero-stage { min-height: 420px; padding: 12px; }
        .i3d .orbit { width: 300px; height: 300px; }
        .i3d .orbit-sm { width: 220px; height: 220px; }
        .i3d .node-b { top: 82px; right: 20px; }
        .i3d .node-c { bottom: 78px; left: 22px; }
        .i3d .footer { flex-direction: column; align-items: flex-start; }
        .i3d h1 { font-size: clamp(42px, 15vw, 70px); }
      }
      @media (prefers-reduced-motion: reduce) {
        .i3d *, .i3d *::before, .i3d *::after {
          animation: none !important;
          transition: none !important;
        }
      }
    `}</style>
  );
}

export default function Immersive3DPortfolio({ profileSlug = null, siteContent, siteConfig }) {
  const rootRef = useRef(null);
  const activeTiltRef = useRef(null);
  const links = useMemo(() => normalizeLinks(siteConfig), [siteConfig]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const handlePointerMove = (event) => {
      root.style.setProperty('--mx', `${(event.clientX / window.innerWidth) * 100}%`);
      root.style.setProperty('--my', `${(event.clientY / window.innerHeight) * 100}%`);
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    return () => window.removeEventListener('pointermove', handlePointerMove);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    const reducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!root || reducedMotion) return undefined;

    const resetTilt = (item) => {
      if (!item) return;
      item.style.transform = '';
      item.style.boxShadow = '';
    };

    const handleMove = (event) => {
      const item = event.target.closest?.('.tilt');
      if (!item || !root.contains(item)) {
        resetTilt(activeTiltRef.current);
        activeTiltRef.current = null;
        return;
      }
      if (activeTiltRef.current && activeTiltRef.current !== item) resetTilt(activeTiltRef.current);
      activeTiltRef.current = item;
      const rect = item.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const px = (event.clientX - rect.left) / rect.width;
      const py = (event.clientY - rect.top) / rect.height;
      const rx = (0.5 - py) * 11;
      const ry = (px - 0.5) * 11;
      item.style.transform = `perspective(1000px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-6px)`;
      item.style.boxShadow = '0 40px 95px rgba(0,0,0,.38), inset 0 1px 0 rgba(255,255,255,.14)';
    };

    const handleLeave = () => {
      resetTilt(activeTiltRef.current);
      activeTiltRef.current = null;
    };

    root.addEventListener('mousemove', handleMove);
    root.addEventListener('mouseleave', handleLeave);
    return () => {
      root.removeEventListener('mousemove', handleMove);
      root.removeEventListener('mouseleave', handleLeave);
      resetTilt(activeTiltRef.current);
    };
  }, []);

  return (
    <div ref={rootRef} className="i3d">
      <div className="grid-overlay" />
      <div className="noise" />
      <div className="spotlight" />
      <div className="glow one" />
      <div className="glow two" />
      <div className="glow three" />
      <div className="shell">
        <header className="nav">
          <Logo config={siteConfig} />
          <NavLinks links={links} />
          <a className="cta" href="#contact">Launch Project ↗</a>
        </header>
        <HeroSection hero={siteContent?.hero} about={siteContent?.about} profileSlug={profileSlug} />
        <AboutSection about={siteContent?.about} />
        <WorkSection profileSlug={profileSlug} />
        <SkillsExperienceSection profileSlug={profileSlug} />
        <CertificatesSection profileSlug={profileSlug} />
        <ContactSection contact={siteContent?.contact} />
        <Footer config={siteConfig} />
      </div>
      <ImmersiveStyles />
    </div>
  );
}
