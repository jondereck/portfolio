import { z } from 'zod';
import { ADMIN_MODULE_IDS, CONFIGURABLE_ACCESS_ROLES, MODULE_ACCESS_ACTIONS } from '@/lib/auth/module-access-config';
import { PORTFOLIO_THEME_IDS } from './portfolioThemes';
import { isAnchorOrSafeHttpUrl, isSafeHttpUrl } from '@/lib/url-safety';

const textField = (min: number, max: number) => z.string().trim().min(min).max(max);
const optionalTextField = (min: number, max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() || undefined : value),
    z.string().min(min).max(max).optional(),
  );
const urlField = (max: number) =>
  z
    .string()
    .trim()
    .url()
    .max(max)
    .refine((value) => isSafeHttpUrl(value), { message: 'Only http/https URLs are allowed.' });
const requiredImageUrlField = (label: string, max: number) =>
  z
    .string({
      required_error: `Upload ${label.toLowerCase()}.`,
      invalid_type_error: `Upload ${label.toLowerCase()}.`,
    })
    .trim()
    .min(1, `Upload ${label.toLowerCase()}.`)
    .url(`Upload a valid ${label.toLowerCase()} URL.`)
    .max(max)
    .refine((value) => isSafeHttpUrl(value), { message: 'Only http/https URLs are allowed.' });
const optionalUrlField = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() || undefined : value),
    z
      .string()
      .url()
      .max(max)
      .refine((value) => isSafeHttpUrl(value), { message: 'Only http/https URLs are allowed.' })
      .optional(),
  );
const emailField = () => z.string().trim().email().max(120);
const optionalEmailField = () =>
  z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() || undefined : value),
    z.string().email().max(120).optional(),
  );
const orderField = (max = 9999) => z.number().int().min(0).max(max).optional().default(0);
const publishField = () => z.boolean().optional().default(true);

export const skillSchema = z.object({
  name: textField(1, 60),
  level: z.number().int().min(1).max(100),
  category: textField(1, 50),
  description: textField(3, 400).optional(),
  image: urlField(500).optional(),
  sortOrder: orderField(),
  isPublished: publishField(),
});

export const experienceSchema = z.object({
  title: textField(1, 100),
  company: textField(1, 100),
  description: textField(5, 1200),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().nullable(),
  location: textField(1, 120).optional(),
  employmentType: textField(1, 120).optional(),
  image: urlField(500).optional(),
  isCurrent: z.boolean().optional().default(false),
  sortOrder: orderField(),
  isPublished: publishField(),
});

export const certificateSchema = z.object({
  title: textField(1, 120),
  issuer: textField(1, 120),
  image: requiredImageUrlField('certificate image', 500),
  link: urlField(500),
  category: textField(1, 50),
  issuedAt: z.string().datetime().optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
  credentialId: textField(1, 120).optional(),
  sortOrder: orderField(),
  isPublished: publishField(),
});

export const heroSchema = z.object({
  eyebrow: textField(1, 80),
  title: textField(5, 220),
  description: textField(20, 600),
  primaryCtaLabel: textField(1, 40),
  primaryCtaHref: textField(1, 200).refine((value) => isAnchorOrSafeHttpUrl(value), {
    message: 'Must be an anchor link or an http/https URL.',
  }),
  secondaryCtaLabel: textField(1, 40),
  secondaryCtaHref: textField(1, 200).refine((value) => isAnchorOrSafeHttpUrl(value), {
    message: 'Must be an anchor link or an http/https URL.',
  }),
  image: requiredImageUrlField('hero image', 500),
});

export const aboutSchema = z.object({
  title: textField(5, 180),
  body: textField(20, 1000),
  highlights: z
    .array(
      z.object({
        label: textField(1, 60),
        value: textField(1, 2000),
      }),
    )
    .min(1)
    .max(6),
});

export const siteConfigSchema = z.object({
  logoText: optionalTextField(1, 80),
  logoImage: optionalUrlField(500),
  portfolioTheme: z.union([z.enum(PORTFOLIO_THEME_IDS), z.literal('random')]).optional().default('editorial-bento'),
  portfolioThemeRotationMinutes: z.number().int().min(0).max(60 * 24 * 30).optional(),
  portfolioThemeRandomPool: z.array(z.enum(PORTFOLIO_THEME_IDS)).min(1).optional(),
  navigation: z
    .object({
      links: z
        .array(
          z.object({
            label: textField(1, 40),
            target: textField(1, 200).refine((value) => isAnchorOrSafeHttpUrl(value), {
              message: 'Must be an anchor link or an http/https URL.',
            }),
            type: z.enum(['section', 'url']),
            isVisible: z.boolean().optional().default(true),
            sortOrder: z.number().int().min(0).max(999).optional().default(0),
          }),
        )
        .min(1)
        .max(12),
      showAdminButton: z.boolean().optional().default(true),
    })
    .optional(),
});

export const socialLinkSchema = z.object({
  label: textField(1, 60),
  url: urlField(500),
});

export const contactSchema = z.object({
  email: optionalEmailField(),
  phone: optionalTextField(3, 60),
  location: optionalTextField(1, 120),
  calendarLink: optionalUrlField(500),
  socialLinks: z.array(socialLinkSchema).max(6).optional(),
});

export const seoSchema = z.object({
  title: optionalTextField(1, 120),
  description: optionalTextField(10, 300),
  ogImage: optionalUrlField(500),
  keywords: z.array(textField(1, 30)).max(20).optional(),
});

export const integrationsSettingsSchema = z.object({
  contactRecipientEmail: optionalEmailField(),
  contactSenderName: optionalTextField(1, 120),
  contactSenderEmail: optionalEmailField(),
  cloudinaryFolder: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() || undefined : value),
    z
      .string()
      .min(1)
      .max(160)
      .regex(/^[A-Za-z0-9/_-]+$/, 'Use letters, numbers, "/", "_" or "-".')
      .optional(),
  ),
  googleDriveImportEnabled: z.boolean().optional().default(true),
  mediaScrapeEnabled: z.boolean().optional().default(false),
  unclothyEnabled: z.boolean().optional().default(false),
  unclothyWorkerEnabled: z.boolean().optional().default(false),
  unclothyGlobalConcurrentGenerationLimit: z.number().int().min(1).max(5).optional().default(5),
  blurUnclothyGenerated: z.boolean().optional().default(true),
  unclothyAlbumDefaults: z
    .record(
      z.object({
        settings: z.record(z.unknown()).optional().default({}),
        updatedAt: z.number().optional(),
      }),
    )
    .optional()
    .default({}),
  defaultGalleryView: z.enum(['cinematic', 'compact']).optional().default('cinematic'),
  galleryLastMediaFilter: z.enum(['all', 'images', 'videos', 'audio', 'nsfw']).optional().default('all'),
  galleryLastMediaSort: z.enum(['custom', 'dateDesc', 'dateAsc']).optional().default('custom'),
  galleryLastDriveFolderSort: z.enum(['recent', 'name']).optional().default('recent'),
});

export const galleryCmsPreferencesSchema = z
  .object({
    galleryLastMediaFilter: z.enum(['all', 'images', 'videos', 'audio', 'nsfw']).optional(),
    galleryLastMediaSort: z.enum(['custom', 'dateDesc', 'dateAsc']).optional(),
    galleryLastDriveFolderSort: z.enum(['recent', 'name']).optional(),
  })
  .strict();

export const securitySettingsSchema = z.object({
  sessionTtlHours: z.number().int().min(1).max(168).optional(),
  loginRateLimitMax: z.number().int().min(1).max(500).optional(),
  loginRateLimitWindowSeconds: z.number().int().min(1).max(3600).optional(),
  mutationRateLimitMax: z.number().int().min(1).max(2000).optional(),
  mutationRateLimitWindowSeconds: z.number().int().min(1).max(3600).optional(),
  contactRateLimitMax: z.number().int().min(1).max(500).optional(),
  contactRateLimitWindowSeconds: z.number().int().min(1).max(3600).optional(),
  mediaScrapeMaxItems: z.number().int().min(1).max(200).optional(),
  mediaScrapeMaxZipFiles: z.number().int().min(1).max(200).optional(),
  mediaScrapeTimeoutMs: z.number().int().min(5_000).max(120_000).optional(),
  sessionVersion: z.number().int().min(1).max(999999).optional(),
  roleModuleAccess: z
    .object(
      Object.fromEntries(
        CONFIGURABLE_ACCESS_ROLES.map((role) => [
          role,
          z
            .object(
              Object.fromEntries(
                ADMIN_MODULE_IDS.map((moduleId) => [
                  moduleId,
                  z
                    .object(Object.fromEntries(MODULE_ACCESS_ACTIONS.map((action) => [action, z.boolean().optional()])))
                    .partial()
                    .optional(),
                ]),
              ),
            )
            .partial()
            .optional(),
        ]),
      ),
    )
    .partial()
    .optional(),
});

export const portfolioSchema = z.object({
  title: textField(1, 120),
  slug: textField(1, 160),
  summary: textField(10, 600),
  descriptions: z.array(textField(1, 320)).max(12).optional().default([]),
  tech: z.array(textField(1, 40)).min(1).max(10),
  image: requiredImageUrlField('project image', 500),
  badge: textField(1, 60),
  repoUrl: urlField(500).optional(),
  demoUrl: urlField(500).optional(),
  sortOrder: orderField(),
  isFeatured: z.boolean().optional().default(false),
  isPublished: publishField(),
});

export const portfolioReorderSchema = z.object({
  featuredIds: z.array(z.number().int().positive()).default([]),
  regularIds: z.array(z.number().int().positive()).default([]),
});
