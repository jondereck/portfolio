import { PhotoSourceType, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { GallerySort } from '@/src/modules/gallery/contracts';

function isAlbumCoverCandidate(mimeType?: string | null) {
  return typeof mimeType === 'string' && mimeType.toLowerCase().startsWith('image/');
}

export const photoSelect = {
  id: true,
  albumId: true,
  imageUrl: true,
  cloudinaryPublicId: true,
  contentHash: true,
  originalFilename: true,
  mimeType: true,
  fileSizeBytes: true,
  nsfwDetected: true,
  nsfwDetectedAt: true,
  nsfwScores: true,
  blurOverride: true,
  caption: true,
  dateTaken: true,
  uploadedAt: true,
  sortOrder: true,
  sourceType: true,
  sourceId: true,
  createdAt: true,
  updatedAt: true,
} as const;

const albumInclude = {
  coverPhoto: { select: photoSelect },
  _count: { select: { photos: true } },
} as const;

// Includes the owning album so duplicate errors can tell the user *where* the
// existing copy lives (duplicates are now blocked profile-wide, not per album).
export const duplicatePhotoSelect = {
  ...photoSelect,
  album: { select: { id: true, name: true, slug: true } },
} as const;

export type AlbumRecord = Prisma.AlbumGetPayload<{ include: typeof albumInclude }>;
export type AlbumPhotoRecord = Prisma.AlbumPhotoGetPayload<{ select: typeof photoSelect }>;
export type DuplicatePhotoRecord = Prisma.AlbumPhotoGetPayload<{ select: typeof duplicatePhotoSelect }>;
export type AlbumDownloadRecord = Prisma.AlbumGetPayload<{ include: { photos: { select: typeof photoSelect } } }>;
export type AlbumPhotoActivityRecord = {
  albumId: number;
  activityAt: Date | null;
};

const resolvePhotoOrderBy = (sort: GallerySort): Prisma.AlbumPhotoOrderByWithRelationInput[] => {
  if (sort === 'dateAsc') {
    return [{ dateTaken: 'asc' }, { uploadedAt: 'asc' }, { id: 'asc' }];
  }

  if (sort === 'dateDesc') {
    return [{ dateTaken: 'desc' }, { uploadedAt: 'desc' }, { id: 'desc' }];
  }

  return [{ sortOrder: 'asc' }, { uploadedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }];
};

export class GalleryRepository {
  async listAlbums(profileId: number, onlyPublished: boolean) {
    return prisma.album.findMany({
      where: {
        profileId,
        ...(onlyPublished ? { isPublished: true } : {}),
      },
      include: albumInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  async getLatestPhotoActivityByAlbumIds(albumIds: number[]): Promise<AlbumPhotoActivityRecord[]> {
    if (albumIds.length === 0) {
      return [];
    }

    const grouped = await prisma.albumPhoto.groupBy({
      by: ['albumId'],
      where: {
        albumId: {
          in: albumIds,
        },
      },
      _max: {
        updatedAt: true,
        createdAt: true,
        uploadedAt: true,
        dateTaken: true,
      },
    });

    return grouped.map((entry) => ({
      albumId: entry.albumId,
      activityAt: [entry._max.updatedAt, entry._max.createdAt, entry._max.uploadedAt, entry._max.dateTaken]
        .filter((value): value is Date => value instanceof Date)
        .sort((left, right) => right.getTime() - left.getTime())[0] ?? null,
    }));
  }

  async getAlbumById(id: number, profileId: number) {
    return prisma.album.findFirst({ where: { id, profileId }, include: albumInclude });
  }

  async getAlbumByIdAndShareToken(id: number, shareToken: string) {
    return prisma.album.findFirst({
      where: {
        id,
        shareToken,
        shareLinkEnabled: true,
      },
      include: albumInclude,
    });
  }

  async getAlbumBySlug(slug: string, profileId: number, onlyPublished: boolean) {
    return prisma.album.findFirst({
      where: {
        profileId,
        slug,
        ...(onlyPublished ? { isPublished: true } : {}),
      },
      include: albumInclude,
    });
  }

  async getAlbumWithPhotosForDownload(id: number, profileId: number): Promise<AlbumDownloadRecord | null> {
    return prisma.album.findFirst({
      where: { id, profileId },
      include: {
        photos: {
          select: photoSelect,
          // Keep manual arrangement first, then show newest media first for legacy/duplicate values.
          orderBy: [{ sortOrder: 'asc' }, { uploadedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        },
      },
    });
  }

  async getAlbumWithPhotosForDownloadByShareToken(id: number, shareToken: string): Promise<AlbumDownloadRecord | null> {
    return prisma.album.findFirst({
      where: {
        id,
        shareToken,
        shareLinkEnabled: true,
      },
      include: {
        photos: {
          select: photoSelect,
          // Keep manual arrangement first, then show newest media first for legacy/duplicate values.
          orderBy: [{ sortOrder: 'asc' }, { uploadedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        },
      },
    });
  }

  async createAlbum(data: {
    profileId: number;
    name: string;
    slug: string;
    description?: string;
    isPublished: boolean;
    shareLinkEnabled?: boolean;
    shareToken?: string | null;
    profileLinks?: Prisma.InputJsonValue;
  }) {
    return prisma.album.create({
      data: {
        profileId: data.profileId,
        name: data.name,
        slug: data.slug,
        description: data.description ?? null,
        isPublished: data.isPublished,
        shareLinkEnabled: data.shareLinkEnabled ?? false,
        shareToken: data.shareToken ?? null,
        ...(data.profileLinks !== undefined ? { profileLinks: data.profileLinks } : {}),
      },
      include: albumInclude,
    });
  }

  async updateAlbum(
    id: number,
    data: {
      name?: string;
      slug?: string;
      description?: string;
      isPublished?: boolean;
      coverPhotoId?: number | null;
      shareLinkEnabled?: boolean;
      shareToken?: string | null;
      profileLinks?: Prisma.InputJsonValue;
    },
  ) {
    return prisma.album.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.slug !== undefined ? { slug: data.slug } : {}),
        ...(data.description !== undefined ? { description: data.description || null } : {}),
        ...(data.isPublished !== undefined ? { isPublished: data.isPublished } : {}),
        ...(data.coverPhotoId !== undefined ? { coverPhotoId: data.coverPhotoId } : {}),
        ...(data.shareLinkEnabled !== undefined ? { shareLinkEnabled: data.shareLinkEnabled } : {}),
        ...(data.shareToken !== undefined ? { shareToken: data.shareToken } : {}),
        ...(data.profileLinks !== undefined ? { profileLinks: data.profileLinks } : {}),
      },
      include: albumInclude,
    });
  }

  async getAlbumByShareToken(shareToken: string) {
    return prisma.album.findFirst({
      where: {
        shareToken,
        shareLinkEnabled: true,
      },
      include: albumInclude,
    });
  }

  async deleteAlbum(id: number) {
    await prisma.album.delete({ where: { id } });
  }

  async listAlbumPhotos(albumId: number, sort: GallerySort) {
    return prisma.albumPhoto.findMany({
      where: { albumId },
      select: photoSelect,
      orderBy: resolvePhotoOrderBy(sort),
    });
  }

  async getAlbumPhotosByIds(albumId: number, ids: number[]) {
    return prisma.albumPhoto.findMany({
      where: {
        albumId,
        id: { in: ids },
      },
      select: photoSelect,
      orderBy: [{ id: 'asc' }],
    });
  }

  async getAlbumPhotoById(albumId: number, photoId: number): Promise<AlbumPhotoRecord | null> {
    return prisma.albumPhoto.findFirst({
      where: {
        albumId,
        id: photoId,
      },
      select: photoSelect,
    });
  }

  async findAlbumPhotoByContentHash(albumId: number, contentHash: string) {
    return prisma.albumPhoto.findFirst({
      where: { albumId, contentHash },
      select: photoSelect,
    });
  }

  async findAlbumPhotoBySourceId(albumId: number, sourceType: PhotoSourceType, sourceId: string) {
    return prisma.albumPhoto.findFirst({
      where: { albumId, sourceType, sourceId },
      select: photoSelect,
    });
  }

  async getAlbumProfileId(albumId: number) {
    const album = await prisma.album.findUnique({
      where: { id: albumId },
      select: { profileId: true },
    });
    return album?.profileId ?? null;
  }

  // Profile-wide duplicate lookups: a media item is considered a duplicate if it
  // already exists in *any* album owned by the same profile, not just this album.
  async findProfilePhotoByContentHash(profileId: number, contentHash: string) {
    return prisma.albumPhoto.findFirst({
      where: { contentHash, album: { profileId } },
      orderBy: { id: 'asc' },
      select: duplicatePhotoSelect,
    });
  }

  async findProfilePhotoBySourceId(profileId: number, sourceType: PhotoSourceType, sourceId: string) {
    return prisma.albumPhoto.findFirst({
      where: { sourceType, sourceId, album: { profileId } },
      orderBy: { id: 'asc' },
      select: duplicatePhotoSelect,
    });
  }

  async createAlbumPhoto(data: {
    albumId: number;
    imageUrl: string;
    cloudinaryPublicId?: string;
    contentHash?: string;
    originalFilename?: string;
    mimeType?: string;
    fileSizeBytes?: number;
    nsfwDetected?: boolean | null;
    nsfwDetectedAt?: Date;
    nsfwScores?: Prisma.InputJsonValue;
    blurOverride?: string;
    caption?: string;
    dateTaken?: Date;
    sourceType?: PhotoSourceType;
    sourceId?: string;
  }) {
    return prisma.$transaction(async (tx) => {
      const first = await tx.albumPhoto.findFirst({
        where: { albumId: data.albumId },
        orderBy: [{ sortOrder: 'asc' }, { uploadedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        select: { sortOrder: true },
      });

      const photo = await tx.albumPhoto.create({
        data: {
          albumId: data.albumId,
          imageUrl: data.imageUrl,
          cloudinaryPublicId: data.cloudinaryPublicId ?? null,
          contentHash: data.contentHash ?? null,
          originalFilename: data.originalFilename ?? null,
          mimeType: data.mimeType ?? null,
          fileSizeBytes: data.fileSizeBytes ?? null,
          nsfwDetected: data.nsfwDetected ?? null,
          nsfwDetectedAt: data.nsfwDetectedAt,
          nsfwScores: data.nsfwScores ?? undefined,
          blurOverride: (data.blurOverride ?? 'auto') || 'auto',
          caption: data.caption ?? null,
          dateTaken: data.dateTaken,
          sourceType: data.sourceType ?? PhotoSourceType.upload,
          sourceId: data.sourceId ?? null,
          sortOrder: (first?.sortOrder ?? 0) - 1,
        },
        select: photoSelect,
      });

      // First image into an album with no cover becomes the cover automatically
      // (upload + Google Drive import both go through this path).
      if (isAlbumCoverCandidate(data.mimeType)) {
        await tx.album.updateMany({
          where: { id: data.albumId, coverPhotoId: null },
          data: { coverPhotoId: photo.id },
        });
      }

      return photo;
    });
  }

  async deleteAlbumPhoto(albumId: number, photoId: number) {
    await prisma.albumPhoto.deleteMany({
      where: { id: photoId, albumId },
    });
  }

  async updateAlbumPhotoBlurOverride(albumId: number, photoId: number, blurOverride: string) {
    const result = await prisma.albumPhoto.updateMany({
      where: { id: photoId, albumId },
      data: { blurOverride },
    });

    if (result.count === 0) {
      return null;
    }

    return prisma.albumPhoto.findFirst({
      where: { id: photoId, albumId },
      select: photoSelect,
    });
  }

  async updateAlbumPhotosBlurOverride(albumId: number, photoIds: number[], blurOverride: string) {
    await prisma.albumPhoto.updateMany({
      where: { albumId, id: { in: photoIds } },
      data: { blurOverride },
    });

    return prisma.albumPhoto.findMany({
      where: { albumId, id: { in: photoIds } },
      select: photoSelect,
      orderBy: [{ id: 'asc' }],
    });
  }

  async reorderAlbumPhotos(albumId: number, orderedPhotoIds: number[]) {
    await prisma.$transaction(
      orderedPhotoIds.map((photoId, index) =>
        prisma.albumPhoto.updateMany({
          where: { id: photoId, albumId },
          data: { sortOrder: index },
        }),
      ),
    );

    return this.listAlbumPhotos(albumId, 'custom');
  }
}
