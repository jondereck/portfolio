import { PhotoSourceType, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { isCloudinaryHostedUrl } from '@/lib/server/object-storage';

/** Neon paid Object Storage rate (GB-month). Free plan includes 5 GB/project. */
export const NEON_OBJECT_STORAGE_USD_PER_GB_MONTH = 0.023;
export const NEON_FREE_OBJECT_STORAGE_GB = 5;
export const NEON_PAID_PUBLIC_TRANSFER_GB_INCLUDED = 500;
export const NEON_FREE_PUBLIC_TRANSFER_GB_INCLUDED = 5;
export const NEON_PUBLIC_TRANSFER_USD_PER_GB_OVERAGE = 0.1;

function bytesToGb(bytes: number) {
  return bytes / (1024 * 1024 * 1024);
}

function roundMoney(value: number) {
  return Math.round(value * 10000) / 10000;
}

export async function buildStorageCostReport() {
  const uploadPhotos = await prisma.albumPhoto.findMany({
    where: { sourceType: PhotoSourceType.upload },
    select: {
      id: true,
      imageUrl: true,
      cloudinaryPublicId: true,
      storageProvider: true,
      storageKey: true,
      fileSizeBytes: true,
      mimeType: true,
    },
  });

  let knownBytes = 0;
  let unknownSizeCount = 0;
  let cloudinaryCount = 0;
  let neonCount = 0;
  let otherCount = 0;
  let cloudinaryKnownBytes = 0;
  let neonKnownBytes = 0;

  for (const photo of uploadPhotos) {
    const size = typeof photo.fileSizeBytes === 'number' && photo.fileSizeBytes >= 0 ? photo.fileSizeBytes : null;
    if (size === null) {
      unknownSizeCount += 1;
    } else {
      knownBytes += size;
    }

    const provider = (photo.storageProvider || '').toLowerCase();
    const isNeon = provider === 'neon' || Boolean(photo.storageKey && !photo.cloudinaryPublicId && !isCloudinaryHostedUrl(photo.imageUrl));
    const isCloudinary =
      provider === 'cloudinary' ||
      Boolean(photo.cloudinaryPublicId) ||
      isCloudinaryHostedUrl(photo.imageUrl);

    if (isNeon && !isCloudinary) {
      neonCount += 1;
      if (size !== null) neonKnownBytes += size;
    } else if (isCloudinary) {
      cloudinaryCount += 1;
      if (size !== null) cloudinaryKnownBytes += size;
    } else {
      otherCount += 1;
    }
  }

  const cloudinaryGb = bytesToGb(cloudinaryKnownBytes);
  const neonGb = bytesToGb(neonKnownBytes);
  const totalKnownGb = bytesToGb(knownBytes);

  const phase2StorageGb = cloudinaryGb; // bytes that would move onto Neon
  const phase2NeonTotalGb = neonGb + phase2StorageGb;

  const paidMonthlyStorageUsd = roundMoney(phase2NeonTotalGb * NEON_OBJECT_STORAGE_USD_PER_GB_MONTH);
  const fitsFreeObjectStorage = phase2NeonTotalGb <= NEON_FREE_OBJECT_STORAGE_GB;

  return {
    generatedAt: new Date().toISOString(),
    galleryUploads: {
      totalCount: uploadPhotos.length,
      cloudinaryCount,
      neonCount,
      otherCount,
      unknownSizeCount,
      knownBytes,
      knownGb: roundMoney(totalKnownGb),
      cloudinaryKnownBytes,
      cloudinaryKnownGb: roundMoney(cloudinaryGb),
      neonKnownBytes,
      neonKnownGb: roundMoney(neonGb),
    },
    neonPricing: {
      objectStorageUsdPerGbMonth: NEON_OBJECT_STORAGE_USD_PER_GB_MONTH,
      freeObjectStorageGb: NEON_FREE_OBJECT_STORAGE_GB,
      paidPublicTransferGbIncluded: NEON_PAID_PUBLIC_TRANSFER_GB_INCLUDED,
      freePublicTransferGbIncluded: NEON_FREE_PUBLIC_TRANSFER_GB_INCLUDED,
      publicTransferUsdPerGbOverage: NEON_PUBLIC_TRANSFER_USD_PER_GB_OVERAGE,
    },
    phase2Estimate: {
      /** Legacy Cloudinary gallery bytes that would be copied (known sizes only). */
      bytesToMigrate: cloudinaryKnownBytes,
      gbToMigrate: roundMoney(cloudinaryGb),
      neonTotalGbAfterMigrate: roundMoney(phase2NeonTotalGb),
      fitsFreeObjectStorage,
      estimatedPaidMonthlyStorageUsd: paidMonthlyStorageUsd,
      notes: [
        'Estimate uses AlbumPhoto.fileSizeBytes for sourceType=upload only.',
        'Portfolio/site/certificate URLs without size metadata are not included — add headroom.',
        'Egress depends on gallery views and album ZIP downloads; put a CDN in front of public_read assets.',
        'During Phase 2, bytes exist on both Cloudinary and Neon until Cloudinary cleanup.',
        'Do not delete Cloudinary assets until every migrated URL is verified.',
      ],
    },
  };
}

export type StorageCostReport = Awaited<ReturnType<typeof buildStorageCostReport>>;

/** Narrow Prisma select helper for scripts that only need aggregates. */
export const uploadPhotoSizeSelect = {
  fileSizeBytes: true,
  storageProvider: true,
  cloudinaryPublicId: true,
  imageUrl: true,
  storageKey: true,
} satisfies Prisma.AlbumPhotoSelect;
