'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const segmentLabels = {
  admin: 'Dashboard',
  portfolio: 'Portfolio',
  gallery: 'Gallery',
  settings: 'Site Settings',
  navigation: 'Navigation',
  integrations: 'Integrations',
  security: 'Security',
  manage: 'Manage',
  workspace: 'Workspace',
  projects: 'Projects',
  skills: 'Skills',
  certificates: 'Certificates',
  homepage: 'Homepage',
  experience: 'Experience',
  theme: 'Theme',
  albums: 'Albums',
  media: 'Media',
  arrange: 'Arrange',
  import: 'Import',
  users: 'Users',
  account: 'Account',
  'media-scraper': 'Media Scraper',
};

function getLabel(segment) {
  if (segmentLabels[segment]) {
    return segmentLabels[segment];
  }

  return segment
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export default function AdminBreadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);

  return (
    <div className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
      {segments.map((segment, index) => {
        const href = `/${segments.slice(0, index + 1).join('/')}`;
        const isLast = index === segments.length - 1;

        return (
          <div key={href} className="flex items-center gap-1">
            {index > 0 ? <span>/</span> : null}
            {isLast ? (
              <span className="font-semibold text-slate-700 dark:text-slate-200">{getLabel(segment)}</span>
            ) : (
              <Link href={href} className="hover:text-slate-700 dark:hover:text-slate-200">
                {getLabel(segment)}
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}
