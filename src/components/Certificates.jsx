/* eslint-disable @next/next/no-img-element */
import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import SectionContainer from './SectionContainer';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
import useSWR from 'swr';
import { FileText } from 'lucide-react';
import { compareCertificatesByIssuedAtDesc, isPdfAssetUrl } from '@/lib/certificates';
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

const Certificates = ({ profileSlug = null }) => {
  const [activeCategory, setActiveCategory] = useState('All');
  const [selectedImage, setSelectedImage] = useState('');
  const [page, setPage] = useState(1);
  const itemsPerPage = 6;
  const { data, error } = useSWR(withProfile('/api/certificates', profileSlug), fetcher);
  const items = Array.isArray(data) ? data : EMPTY_ITEMS;
  const sortedItems = useMemo(() => [...items].sort(compareCertificatesByIssuedAtDesc), [items]);

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
  const totalPages = Math.ceil(filteredCertificates.length / itemsPerPage);
  const paginatedData = filteredCertificates.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  useEffect(() => {
    setPage(1);
  }, [activeCategory, items.length]);

  return (
    <SectionContainer
      name="certificates"
      title="Certificates"
      subtitle="Verified learning milestones across frontend, backend, and data tracks."
    >


      {error ? <p className="mb-4 text-sm text-rose-600 dark:text-rose-300">{error instanceof Error ? error.message : 'Unable to load certificates'}</p> : null}

      <div className="mb-8 flex flex-wrap gap-2">
        {categories.map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => setActiveCategory(category)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              activeCategory === category
                ? 'bg-gradient-to-r from-blue-500 to-cyan-400 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200'
            }`}
          >
            {category}
          </button>
        ))}
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
       {paginatedData.map((item, index) => (
          <motion.article
           key={`${item.id ?? 'cert'}-${item.title}-${index}`}
            whileHover={{ y: -6 }}
            className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
          >
            {isPdfAssetUrl(item.image) ? (
              <div className="flex h-56 w-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900">
                <div className="text-center">
                  <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/80 text-rose-600 shadow-sm dark:bg-slate-950/70 dark:text-rose-300">
                    <FileText className="h-7 w-7" />
                  </div>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-100">PDF Certificate</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Open from the Verify link</p>
                </div>
              </div>
            ) : (
              <button type="button" className="w-full" onClick={() => setSelectedImage(item.image)}>
                <div className="grid h-56 w-full place-items-center bg-white p-3">
                  <img src={item.image} alt={`${item.title} certificate`} className="h-full w-full object-contain" />
                </div>
              </button>
            )}
            <div className="space-y-2 p-4">
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
        ))}
      </div>
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

      <Dialog open={Boolean(selectedImage)} onOpenChange={(isOpen) => setSelectedImage(isOpen ? selectedImage : '')}>
        <DialogContent className="max-w-4xl bg-white p-3 dark:bg-slate-900">
          <DialogTitle className="sr-only">Certificate preview</DialogTitle>
          <DialogDescription className="sr-only">Full-size certificate preview.</DialogDescription>
          <img src={selectedImage} alt="Certificate preview" className="max-h-[80vh] w-full object-contain" />
        </DialogContent>
      </Dialog>
    </SectionContainer>
  );
};

export default Certificates;
