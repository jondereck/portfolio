/* eslint-disable @next/next/no-img-element */
import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import SectionContainer from './SectionContainer';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
import useSWR from 'swr';
import { FileText } from 'lucide-react';
import {
  CERTIFICATE_SORT_MODES,
  compareCertificatesForDisplay,
  resolveCertificateCardMedia,
  sortCertificatesByMode,
} from '@/lib/certificates';
import { isSafeHttpUrl } from '@/lib/url-safety';

const EMPTY_ITEMS = [];

const fetcher = (url) =>
  fetch(url, { cache: 'no-store' }).then((response) => {
    if (!response.ok) {
      throw new Error('Unable to load certificates');
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

const CertificateCard = ({ item, index, onSelect }) => {
  const media = resolveCertificateCardMedia(item.image);
  const previewImage = isSafeHttpUrl(media.previewImage) ? media.previewImage : '';
  const pdfUrl = isSafeHttpUrl(media.pdfUrl) ? media.pdfUrl : '';

  return (
    <motion.article
      key={`${item.id ?? 'cert'}-${item.title}-${index}`}
      whileHover={{ y: -6 }}
      className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      {previewImage ? (
        <button
          type="button"
          className="block w-full shrink-0 overflow-hidden"
          onClick={() => onSelect({ title: item.title, imageUrl: previewImage, pdfUrl: media.isPdf ? pdfUrl : null, isPdf: media.isPdf })}
        >
          <div className="flex aspect-[4/3] w-full min-h-0 items-center justify-center overflow-hidden bg-white p-1.5 sm:aspect-auto sm:h-56 sm:p-3">
            <img src={previewImage} alt={`${item.title} certificate`} className="h-full w-full object-contain" />
          </div>
        </button>
      ) : media.isPdf && pdfUrl ? (
        <button
          type="button"
          className="flex h-56 w-full shrink-0 items-center justify-center overflow-hidden bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900"
          onClick={() => onSelect({ title: item.title, imageUrl: null, pdfUrl, isPdf: true })}
        >
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/80 text-rose-600 shadow-sm dark:bg-slate-950/70 dark:text-rose-300">
              <FileText className="h-7 w-7" />
            </div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-100">PDF Certificate</p>
          </div>
        </button>
      ) : (
        <div className="flex h-56 w-full shrink-0 items-center justify-center overflow-hidden bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900">
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/80 text-rose-600 shadow-sm dark:bg-slate-950/70 dark:text-rose-300">
              <FileText className="h-7 w-7" />
            </div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-100">Verified Certificate</p>
          </div>
        </div>
      )}
      <div className="relative z-[1] min-h-0 flex-1 space-y-2 bg-white p-4 dark:bg-slate-900">
        <p className="text-sm font-semibold">{item.title}</p>
        <p className="text-xs text-slate-500">{item.issuer}</p>
        {item.issuedAt ? <p className="text-xs text-slate-500">Issued {new Date(item.issuedAt).toLocaleDateString()}</p> : null}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{item.category}</span>
          <a
            href={isSafeHttpUrl(item.link) ? item.link : '#'}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-cyan-400 px-3 py-1 text-xs font-semibold text-cyan-600 transition hover:bg-cyan-500 hover:text-white dark:text-cyan-300"
          >
            Verify
          </a>
        </div>
      </div>
    </motion.article>
  );
};

const Certificates = ({ profileSlug = null }) => {
  const [activeCategory, setActiveCategory] = useState('All');
  const [sortMode, setSortMode] = useState('default');
  const [selectedCert, setSelectedCert] = useState(null);
  const [page, setPage] = useState(1);
  const itemsPerPage = 6;
  const { data, error } = useSWR(withProfile('/api/certificates', profileSlug), fetcher);
  const items = Array.isArray(data) ? data : EMPTY_ITEMS;
  const sortedItems = useMemo(() => [...items].sort(compareCertificatesForDisplay), [items]);

  const categories = useMemo(() => {
    const unique = new Set(items.map((item) => item.category));
    return ['All', ...Array.from(unique)];
  }, [items]);

  const filteredCertificates = useMemo(() => {
    if (activeCategory === 'All') {
      return sortedItems;
    }
    return sortedItems.filter((item) => item.category === activeCategory);
  }, [activeCategory, sortedItems]);

  const featuredCertificates = useMemo(
    () => sortCertificatesByMode(filteredCertificates.filter((item) => Boolean(item?.isFeatured)), sortMode),
    [filteredCertificates, sortMode],
  );
  const regularCertificates = useMemo(
    () => sortCertificatesByMode(filteredCertificates.filter((item) => !item?.isFeatured), sortMode),
    [filteredCertificates, sortMode],
  );

  const totalPages = Math.ceil(regularCertificates.length / itemsPerPage);
  const paginatedData = regularCertificates.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  useEffect(() => {
    setPage(1);
  }, [activeCategory, sortMode, items.length, regularCertificates.length]);

  return (
    <SectionContainer
      name="certificates"
      title="Certificates"
      subtitle="Verified learning milestones across frontend, backend, and data tracks."
    >
      {error ? <p className="mb-4 text-sm text-rose-600 dark:text-rose-300">{error instanceof Error ? error.message : 'Unable to load certificates'}</p> : null}

      <div className="mb-8 flex min-w-0 flex-col gap-3">
        <div className="min-w-0 overflow-x-auto [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden">
          <div className="flex w-max flex-nowrap gap-2">
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setActiveCategory(category)}
                className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-semibold transition sm:px-4 ${
                  activeCategory === category
                    ? 'bg-gradient-to-r from-blue-500 to-cyan-400 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>
        <label className="inline-flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-start">
          <span className="text-xs font-semibold text-slate-500">Sort</span>
          <select
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value)}
            aria-label="Sort certificates"
            className="h-9 min-w-0 flex-1 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 sm:flex-none sm:min-w-[12rem]"
          >
            {CERTIFICATE_SORT_MODES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {featuredCertificates.length > 0 ? (
        <div className="mb-10">
          <div className="mb-4 flex items-end justify-between gap-3">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Featured</h3>
            <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" aria-hidden />
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {featuredCertificates.map((item, index) => (
              <CertificateCard key={item.id ?? `${item.title}-featured-${index}`} item={item} index={index} onSelect={setSelectedCert} />
            ))}
          </div>
        </div>
      ) : null}

      {regularCertificates.length > 0 ? (
        <div>
          {featuredCertificates.length > 0 ? (
            <div className="mb-4 flex items-end justify-between gap-3">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">All Certificates</h3>
              <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" aria-hidden />
            </div>
          ) : null}
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {paginatedData.map((item, index) => (
              <CertificateCard key={item.id ?? `${item.title}-${index}`} item={item} index={index} onSelect={setSelectedCert} />
            ))}
          </div>
        </div>
      ) : null}

      {totalPages > 1 ? (
        <Pagination className="mt-8">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                aria-disabled={page === 1}
                className={page === 1 ? 'pointer-events-none opacity-50' : ''}
              />
            </PaginationItem>
            {Array.from({ length: totalPages }).map((_, i) => (
              <PaginationItem key={`certificate-page-${i + 1}`}>
                <PaginationLink onClick={() => setPage(i + 1)} isActive={page === i + 1}>
                  {i + 1}
                </PaginationLink>
              </PaginationItem>
            ))}
            <PaginationItem>
              <PaginationNext
                onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                aria-disabled={page === totalPages}
                className={page === totalPages ? 'pointer-events-none opacity-50' : ''}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      ) : null}

      <Dialog open={Boolean(selectedCert)} onOpenChange={(isOpen) => setSelectedCert(isOpen ? selectedCert : null)}>
        <DialogContent className="max-w-4xl bg-white p-3 dark:bg-slate-900">
          <DialogTitle className="sr-only">{selectedCert?.title || 'Certificate preview'}</DialogTitle>
          <DialogDescription className="sr-only">Full-size certificate preview.</DialogDescription>
          {selectedCert?.isPdf && typeof selectedCert.pdfUrl === 'string' ? (
            <iframe title={selectedCert.title || 'Certificate preview'} src={selectedCert.pdfUrl} className="h-[80vh] w-full rounded-lg border border-slate-200 bg-white dark:border-slate-700" />
          ) : selectedCert?.imageUrl ? (
            <img src={selectedCert.imageUrl} alt={selectedCert.title || 'Certificate preview'} className="max-h-[80vh] w-full object-contain" />
          ) : null}
        </DialogContent>
      </Dialog>
    </SectionContainer>
  );
};

export default Certificates;
