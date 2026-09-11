import {
  Award,
  BriefcaseBusiness,
  Briefcase,
  House,
  Layers3,
  SwatchBook,
  Sparkles,
} from 'lucide-react';
import AdminOverviewCard from '@/components/admin/shared/AdminOverviewCard';

const portfolioOverviewCards = [
  {
    title: 'Full Portfolio Workspace',
    description: 'Open the integrated portfolio workspace when you need every section in one operational view.',
    href: '/admin/portfolio/manage',
    icon: Layers3,
    badge: 'Workspace',
    accent: 'slate',
  },
  {
    title: 'Manage Homepage',
    description: 'Edit hero and about homepage sections without leaving the admin surface.',
    href: '/admin/portfolio/homepage',
    icon: House,
    badge: 'Homepage',
    accent: 'rose',
  },
  {
    title: 'Manage Projects',
    description: 'Create and edit portfolio projects with narrative, tech stack, links, and publishing controls.',
    href: '/admin/portfolio/projects',
    icon: BriefcaseBusiness,
    badge: 'Projects',
    accent: 'emerald',
  },
  {
    title: 'Manage Skills',
    description: 'Update skill categories, proficiency levels, and supporting iconography.',
    href: '/admin/portfolio/skills',
    icon: Sparkles,
    badge: 'Skills',
    accent: 'sky',
  },
  {
    title: 'Manage Certificates',
    description: 'Maintain certification records, metadata, dates, and visibility.',
    href: '/admin/portfolio/certificates',
    icon: Award,
    badge: 'Proof',
    accent: 'amber',
  },
  {
    title: 'Manage Experience',
    description: 'Maintain experience entries shown in the public portfolio experience section.',
    href: '/admin/portfolio/experience',
    icon: Briefcase,
    badge: 'Experience',
    accent: 'slate',
  },
  {
    title: 'Manage Theme',
    description: 'Control portfolio theme rotation, primary theme selection, and branding settings in one dedicated surface.',
    href: '/admin/portfolio/theme',
    icon: SwatchBook,
    badge: 'Theme',
    accent: 'sky',
  },
];

export default function PortfolioAdminPage() {
  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        {portfolioOverviewCards.map((card) => (
          <AdminOverviewCard key={card.title} {...card} />
        ))}
      </section>
    </div>
  );
}
