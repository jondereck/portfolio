import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { LEGACY_PRIMARY_PROFILE_ID, LEGACY_PRIMARY_PROFILE_SLUG, LEGACY_PRIMARY_USER_ID } from '../lib/auth/constants';
import { defaultAdminSettings } from '../lib/adminSettingsDefaults';
import { hashPassword } from '../lib/password/password';
import { defaultSiteConfig, defaultSiteContent } from '../lib/siteContentDefaults';

const prisma = new PrismaClient();

async function main() {
  await prisma.$transaction([
    prisma.certificate.deleteMany(),
    prisma.skill.deleteMany(),
    prisma.experience.deleteMany(),
    prisma.portfolio.deleteMany(),
    prisma.albumPhoto.deleteMany(),
    prisma.album.deleteMany(),
    prisma.adminAuditEvent.deleteMany(),
    prisma.adminSettings.deleteMany(),
    prisma.siteConfig.deleteMany(),
    prisma.siteContent.deleteMany(),
    prisma.verificationToken.deleteMany(),
    prisma.session.deleteMany(),
    prisma.account.deleteMany(),
    prisma.profile.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase() || 'admin@example.com';
  const password = process.env.ADMIN_PASSWORD?.trim() || 'ChangeMe12345';
  const displayName = process.env.ADMIN_NAME?.trim() || 'Primary Admin';

  const user = await prisma.user.create({
    data: {
      id: LEGACY_PRIMARY_USER_ID,
      email,
      name: displayName,
      role: 'super_admin',
      isActive: true,
      passwordHash: hashPassword(password),
    },
  });

  const profile = await prisma.profile.create({
    data: {
      id: LEGACY_PRIMARY_PROFILE_ID,
      userId: user.id,
      slug: LEGACY_PRIMARY_PROFILE_SLUG,
      displayName,
      isPrimary: true,
      isPublic: true,
    },
  });

  await prisma.siteContent.create({
    data: {
      profileId: profile.id,
      hero: defaultSiteContent.hero,
      about: defaultSiteContent.about,
      contact: defaultSiteContent.contact,
      seo: defaultSiteContent.seo,
    },
  });
  await prisma.siteConfig.create({
    data: {
      profileId: profile.id,
      logoText: defaultSiteConfig.logoText,
      logoImage: defaultSiteConfig.logoImage,
      navigation: defaultSiteConfig.navigation,
      portfolioTheme: defaultSiteConfig.portfolioTheme,
      portfolioThemeRandomPool: defaultSiteConfig.portfolioThemeRandomPool,
    },
  });
  await prisma.adminSettings.create({ data: defaultAdminSettings });

  await prisma.skill.createMany({
    data: [
      {
        profileId: profile.id,
        name: 'React',
        level: 90,
        category: 'Frontend',
        description: 'Production-grade single-page apps',
        image: 'https://res.cloudinary.com/demo/image/upload/v1710000000/portfolio/react.png',
        sortOrder: 1,
      },
      {
        profileId: profile.id,
        name: 'Next.js',
        level: 88,
        category: 'Frontend',
        description: 'Hybrid SSR/ISR builds',
        image: 'https://res.cloudinary.com/demo/image/upload/v1710000000/portfolio/next.png',
        sortOrder: 2,
      },
    ],
  });

  await prisma.experience.createMany({
    data: [
      {
        profileId: profile.id,
        title: 'Senior Frontend Engineer',
        company: 'Nimbus Labs',
        description: 'Led UI platform, shipped reusable component library.',
        startDate: new Date('2022-01-01'),
        location: 'Remote',
        employmentType: 'Full-time',
        image: 'https://res.cloudinary.com/demo/image/upload/v1710000000/portfolio/nimbus.png',
        sortOrder: 1,
      },
      {
        profileId: profile.id,
        title: 'Product Engineer',
        company: 'Arc Studio',
        description: 'Partnered with design to deliver 0-1 SaaS experiences.',
        startDate: new Date('2020-04-01'),
        endDate: new Date('2021-12-01'),
        location: 'Manila',
        employmentType: 'Contract',
        image: 'https://res.cloudinary.com/demo/image/upload/v1710000000/portfolio/arc.png',
        sortOrder: 2,
      },
    ],
  });

  await prisma.certificate.createMany({
    data: [
      {
        profileId: profile.id,
        title: 'AWS Certified Cloud Practitioner',
        issuer: 'Amazon Web Services',
        image: 'https://res.cloudinary.com/demo/image/upload/v1710000000/portfolio/aws.png',
        link: 'https://aws.amazon.com/certification/',
        category: 'Cloud',
        sortOrder: 1,
        isFeatured: true,
      },
      {
        profileId: profile.id,
        title: 'Google UX Design',
        issuer: 'Google',
        image: 'https://res.cloudinary.com/demo/image/upload/v1710000000/portfolio/google-ux.png',
        link: 'https://grow.google/certificates/',
        category: 'Design',
        sortOrder: 2,
        isFeatured: false,
      },
    ],
  });

  await prisma.portfolio.createMany({
    data: [
      {
        profileId: profile.id,
        title: 'AI Insights Dashboard',
        slug: 'ai-insights-dashboard',
        description: 'Real-time analytics dashboard with streaming data visualizations.',
        descriptions: [
          'Shipped live KPI panels with sub-second updates for operations teams.',
          'Implemented role-based views for executive and analyst workflows.',
          'Improved time-to-insight with streamlined filtering and saved segments.',
        ],
        tech: ['Next.js', 'Prisma', 'Tailwind CSS'],
        image: 'https://res.cloudinary.com/demo/image/upload/v1710000000/portfolio/ai-dashboard.png',
        badge: 'Case Study',
        repoUrl: 'https://github.com/example/ai-dashboard',
        demoUrl: 'https://demo.example.com/ai',
        sortOrder: 1,
        isFeatured: true,
      },
      {
        profileId: profile.id,
        title: 'Commerce Platform UI',
        slug: 'commerce-platform-ui',
        description: 'Headless commerce storefront optimized for conversions.',
        descriptions: [
          'Built reusable product, cart, and checkout modules for rapid launches.',
          'Optimized mobile checkout flow to reduce drop-off at payment steps.',
          'Integrated CMS-driven merchandising content across category pages.',
        ],
        tech: ['React', 'Node.js', 'PostgreSQL'],
        image: 'https://res.cloudinary.com/demo/image/upload/v1710000000/portfolio/commerce.png',
        badge: 'Featured',
        repoUrl: 'https://github.com/example/commerce',
        demoUrl: 'https://demo.example.com/commerce',
        sortOrder: 2,
        isFeatured: false,
      },
    ],
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
