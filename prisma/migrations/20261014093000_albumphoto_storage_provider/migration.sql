-- Dual-provider media: Neon Object Storage keys alongside legacy Cloudinary public ids.
ALTER TABLE "AlbumPhoto" ADD COLUMN IF NOT EXISTS "storageProvider" TEXT;
ALTER TABLE "AlbumPhoto" ADD COLUMN IF NOT EXISTS "storageKey" TEXT;
