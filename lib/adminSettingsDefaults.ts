import { defaultRoleModuleAccess } from '@/lib/auth/module-access-config';

export const defaultAdminIntegrations = {
  contactRecipientEmail: 'jonderecknifas@gmail.com',
  contactSenderName: 'Portfolio',
  contactSenderEmail: 'onboarding@resend.dev',
  cloudinaryFolder: 'portfolio',
  googleDriveImportEnabled: true,
  mediaScrapeEnabled: false,
  unclothyEnabled: false,
  unclothyWorkerEnabled: false,
  unclothyGlobalConcurrentGenerationLimit: 5,
  blurUnclothyGenerated: true,
  unclothyAlbumDefaults: {},
  defaultGalleryView: 'cinematic',
  galleryLastMediaFilter: 'all',
  galleryLastMediaSort: 'custom',
  galleryLastDriveFolderSort: 'recent',
};

export const defaultAdminSecurity = {
  sessionTtlHours: 8,
  loginRateLimitMax: 10,
  loginRateLimitWindowSeconds: 60,
  mutationRateLimitMax: 120,
  mutationRateLimitWindowSeconds: 60,
  contactRateLimitMax: 8,
  contactRateLimitWindowSeconds: 60,
  mediaScrapeMaxItems: 50,
  mediaScrapeMaxZipFiles: 50,
  mediaScrapeTimeoutMs: 20_000,
  sessionVersion: 1,
  roleModuleAccess: defaultRoleModuleAccess,
};

export const defaultAdminSettings = {
  integrations: defaultAdminIntegrations,
  security: defaultAdminSecurity,
};
