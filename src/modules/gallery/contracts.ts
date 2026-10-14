import { z } from 'zod';

export const gallerySortSchema = z.enum(['custom', 'dateAsc', 'dateDesc']).default('custom');

const profileLinkPlatformSchema = z.enum([
  'instagram',
  'facebook',
  'tiktok',
  'youtube',
  'x',
  'linkedin',
  'website',
  'other',
]);

const profileLinkSchema = z.object({
  platform: profileLinkPlatformSchema,
  url: z
    .string()
    .trim()
    .url()
    .max(500)
    .refine((value) => /^https?:\/\//i.test(value), { message: 'Only http/https URLs are allowed.' }),
});

const profileLinksSchema = z.array(profileLinkSchema).max(12);

export const albumCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(160)
    .regex(/^[a-z0-9-]+$/),
  description: z.string().trim().max(1000).optional(),
  isPublished: z.boolean().optional().default(true),
  shareLinkEnabled: z.boolean().optional(),
  profileLinks: profileLinksSchema.optional(),
});

export const albumUpdateSchema = albumCreateSchema.partial().extend({
  coverPhotoId: z.number().int().positive().nullable().optional(),
});

export const photoCreateSchema = z.object({
  imageUrl: z.string().trim().url().max(1200),
  caption: z.string().trim().max(500).optional(),
  dateTaken: z.string().datetime().optional(),
  cloudinaryPublicId: z.string().trim().max(300).optional(),
  storageProvider: z.enum(['neon', 'cloudinary']).optional(),
  storageKey: z.string().trim().max(500).optional(),
  contentHash: z.string().trim().length(64).optional(),
  originalFilename: z.string().trim().max(300).optional(),
  mimeType: z.string().trim().max(120).optional(),
  fileSizeBytes: z.number().int().nonnegative().max(2_147_483_647).optional(),
  sourceType: z.enum(['upload', 'gdrive']).optional().default('upload'),
  sourceId: z.string().trim().max(300).optional(),
});

export const reorderPhotosSchema = z.object({
  photoIds: z.array(z.number().int().positive()).min(1),
});

export const movePhotosSchema = z.object({
  targetAlbumId: z.number().int().positive(),
  photoIds: z.array(z.number().int().positive()).min(1),
});

export const bulkPhotoBlurOverrideSchema = z.object({
  photoIds: z.array(z.number().int().positive()).min(1),
  blurOverride: z.enum(['auto', 'force_blur', 'force_unblur']),
});

export const driveImportSchema = z.object({
  folderId: z.string().trim().min(1),
  selectedFileIds: z.array(z.string().trim().min(1)).max(1000).optional().default([]),
  mediaTypeFilter: z.enum(['all', 'images', 'videos']).optional().default('all'),
});

export const unclothyCreateTaskSchema = z.object({
  albumId: z.number().int().positive(),
  sourcePhotoId: z.number().int().positive(),
  settings: z.record(z.unknown()).default({}),
  confirmedAdultConsent: z.literal(true),
});

export const unclothyIngestTaskSchema = z.object({
  albumId: z.number().int().positive(),
  sourcePhotoId: z.number().int().positive(),
  confirmedAdultConsent: z.literal(true),
});

export type GallerySort = z.infer<typeof gallerySortSchema>;
export type AlbumCreateInput = z.infer<typeof albumCreateSchema>;
export type AlbumUpdateInput = z.infer<typeof albumUpdateSchema>;
export type PhotoCreateInput = z.infer<typeof photoCreateSchema>;
export type ReorderPhotosInput = z.infer<typeof reorderPhotosSchema>;
export type MovePhotosInput = z.infer<typeof movePhotosSchema>;
export type BulkPhotoBlurOverrideInput = z.infer<typeof bulkPhotoBlurOverrideSchema>;
export type DriveImportInput = z.infer<typeof driveImportSchema>;
export type UnclothyCreateTaskInput = z.infer<typeof unclothyCreateTaskSchema>;
export type UnclothyIngestTaskInput = z.infer<typeof unclothyIngestTaskSchema>;
