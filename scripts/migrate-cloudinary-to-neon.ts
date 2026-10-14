/**
 * Phase 2: copy Cloudinary-hosted AlbumPhoto uploads into Neon Object Storage.
 *
 * Default is dry-run. Pass --apply to write objects and update DB rows.
 * Does NOT delete Cloudinary assets.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register --project tsconfig.seed.json scripts/migrate-cloudinary-to-neon.ts
 *   npx ts-node -r tsconfig-paths/register --project tsconfig.seed.json scripts/migrate-cloudinary-to-neon.ts --apply --limit=20
 */
import 'dotenv/config';
import { PhotoSourceType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  isCloudinaryHostedUrl,
  isObjectStorageConfigured,
  STORAGE_PROVIDER_NEON,
  uploadObjectBuffer,
} from '@/lib/server/object-storage';

function parseArgs(argv: string[]) {
  const apply = argv.includes('--apply');
  const limitArg = argv.find((part) => part.startsWith('--limit='));
  const albumArg = argv.find((part) => part.startsWith('--albumId='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : undefined;
  const albumId = albumArg ? Number(albumArg.split('=')[1]) : undefined;
  return {
    apply,
    limit: Number.isFinite(limit) && (limit as number) > 0 ? Math.floor(limit as number) : undefined,
    albumId: Number.isFinite(albumId) && (albumId as number) > 0 ? Math.floor(albumId as number) : undefined,
  };
}

function extensionFromUrlOrMime(url: string, mimeType?: string | null) {
  const fromUrl = url.split('?')[0].match(/\.([a-z0-9]{2,8})$/i)?.[1];
  if (fromUrl) return fromUrl.toLowerCase();
  const mime = (mimeType || '').toLowerCase();
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/gif') return 'gif';
  if (mime.startsWith('video/')) return 'mp4';
  if (mime.startsWith('audio/')) return 'mp3';
  return 'bin';
}

async function main() {
  const { apply, limit, albumId } = parseArgs(process.argv.slice(2));

  if (!isObjectStorageConfigured()) {
    throw new Error('Neon Object Storage is not configured (AWS_* env vars).');
  }

  const candidates = await prisma.albumPhoto.findMany({
    where: {
      sourceType: PhotoSourceType.upload,
      ...(albumId ? { albumId } : {}),
      AND: [
        {
          OR: [
            { storageProvider: null },
            { storageProvider: { not: STORAGE_PROVIDER_NEON } },
          ],
        },
        {
          OR: [
            { cloudinaryPublicId: { not: null } },
            { imageUrl: { contains: 'res.cloudinary.com' } },
            { storageProvider: 'cloudinary' },
          ],
        },
      ],
    },
    orderBy: { id: 'asc' },
    take: limit,
    select: {
      id: true,
      albumId: true,
      imageUrl: true,
      cloudinaryPublicId: true,
      storageProvider: true,
      storageKey: true,
      mimeType: true,
      originalFilename: true,
      fileSizeBytes: true,
    },
  });

  const summary = {
    mode: apply ? 'apply' : 'dry-run',
    considered: candidates.length,
    migrated: 0,
    skipped: 0,
    failed: 0,
    failures: [] as Array<{ id: number; error: string }>,
  };

  // eslint-disable-next-line no-console
  console.log(`[migrate-cloudinary-to-neon] ${summary.mode}; candidates=${candidates.length}`);

  for (const photo of candidates) {
    if (photo.storageProvider === STORAGE_PROVIDER_NEON && photo.storageKey) {
      summary.skipped += 1;
      continue;
    }

    if (!isCloudinaryHostedUrl(photo.imageUrl) && !photo.cloudinaryPublicId) {
      summary.skipped += 1;
      continue;
    }

    try {
      const response = await fetch(photo.imageUrl, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Fetch failed with status ${response.status}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const contentType =
        photo.mimeType ||
        response.headers.get('content-type') ||
        'application/octet-stream';
      const filename =
        photo.originalFilename ||
        `photo-${photo.id}.${extensionFromUrlOrMime(photo.imageUrl, contentType)}`;

      if (!apply) {
        // eslint-disable-next-line no-console
        console.log(`[dry-run] would migrate photo#${photo.id} (${buffer.length} bytes) -> portfolio/gallery/${photo.albumId}`);
        summary.migrated += 1;
        continue;
      }

      const uploaded = await uploadObjectBuffer({
        body: buffer,
        folder: `portfolio/gallery/${photo.albumId}`,
        contentType,
        filename,
      });

      await prisma.albumPhoto.update({
        where: { id: photo.id },
        data: {
          imageUrl: uploaded.publicUrl,
          storageProvider: STORAGE_PROVIDER_NEON,
          storageKey: uploaded.storageKey,
          // Keep cloudinaryPublicId until Cloudinary cleanup so rollback is possible.
        },
      });

      summary.migrated += 1;
      // eslint-disable-next-line no-console
      console.log(`[migrated] photo#${photo.id} -> ${uploaded.storageKey}`);
    } catch (error) {
      summary.failed += 1;
      summary.failures.push({
        id: photo.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // eslint-disable-next-line no-console
      console.error(`[failed] photo#${photo.id}`, error);
    }
  }

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
