import { PhotoSourceType, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import {
  prepareMediaUpload,
  RequestValidationError,
  uploadPreparedMediaFile,
} from '@/lib/server/uploads';
import type {
  AlbumCreateInput,
  AlbumUpdateInput,
  GallerySort,
  PhotoCreateInput,
} from '@/src/modules/gallery/contracts';
import {
  GalleryRepository,
  photoSelect as albumPhotoSelect,
  type AlbumRecord,
  type AlbumPhotoRecord,
  type DuplicatePhotoRecord,
} from '@/src/modules/gallery/repositories/galleryRepository';
import { GoogleDriveAdapter } from '@/src/modules/gallery/adapters/googleDriveAdapter';
import { moderateImageUrlForNsfw } from '@/lib/server/nsfw-moderation';

type MoveAlbumPhotoResultEntry = {
  photoId: number;
  fileName: string;
  status: 'moved' | 'duplicate-skipped' | 'error';
  reason: string;
  errorCode?: string;
  duplicate?: {
    id: number;
    caption: string | null;
    imageUrl: string | null;
  } | null;
};

export class GalleryService {
  constructor(
    private readonly repo = new GalleryRepository(),
    private readonly driveAdapter = new GoogleDriveAdapter(),
  ) {}

  private describeDuplicateAlbum(existing?: DuplicatePhotoRecord | AlbumPhotoRecord | null) {
    const album = (existing as DuplicatePhotoRecord | null)?.album;
    return album?.name ? `the album “${album.name}”` : 'another album';
  }

  private duplicateMeta(existing?: DuplicatePhotoRecord | AlbumPhotoRecord | null) {
    if (!existing) {
      return undefined;
    }

    const album = (existing as DuplicatePhotoRecord).album ?? null;
    return {
      duplicate: {
        id: existing.id,
        caption: existing.caption,
        imageUrl: existing.imageUrl,
        originalFilename: existing.originalFilename,
        mimeType: existing.mimeType,
        fileSizeBytes: existing.fileSizeBytes,
        sourceId: existing.sourceId,
        album: album ? { id: album.id, name: album.name, slug: album.slug } : null,
      },
    };
  }

  private createDuplicateMediaError(existing?: DuplicatePhotoRecord | AlbumPhotoRecord | null) {
    return new RequestValidationError(
      `This media already exists in ${this.describeDuplicateAlbum(existing)}. Duplicate uploads are not allowed.`,
      409,
      undefined,
      'DUPLICATE_MEDIA',
      this.duplicateMeta(existing),
    );
  }

  private createDuplicateSourceError(existing?: DuplicatePhotoRecord | AlbumPhotoRecord | null) {
    return new RequestValidationError(
      `This Google Drive media is already imported into ${this.describeDuplicateAlbum(existing)}. Duplicate imports are not allowed.`,
      409,
      undefined,
      'DUPLICATE_SOURCE_MEDIA',
      this.duplicateMeta(existing),
    );
  }

  private resolveAlbumActivityAt(
    album: Pick<AlbumRecord, 'createdAt' | 'updatedAt'>,
    photoActivityAt: Date | null = null,
  ) {
    const candidates = [photoActivityAt, album.updatedAt, album.createdAt].filter(
      (value): value is Date => value instanceof Date,
    );
    if (candidates.length === 0) {
      return null;
    }

    return new Date(Math.max(...candidates.map((value) => value.getTime())));
  }

  private async attachAlbumActivity<T extends AlbumRecord>(albums: T[]) {
    if (albums.length === 0) {
      return [];
    }

    const latestPhotoActivity = await this.repo.getLatestPhotoActivityByAlbumIds(albums.map((album) => album.id));
    const activityMap = new Map(latestPhotoActivity.map((entry) => [entry.albumId, entry.activityAt]));

    return albums
      .map((album) => ({
        ...album,
        activityAt: this.resolveAlbumActivityAt(album, activityMap.get(album.id) ?? null),
      }))
      .sort((left, right) => {
        const leftTime = left.activityAt instanceof Date ? left.activityAt.getTime() : 0;
        const rightTime = right.activityAt instanceof Date ? right.activityAt.getTime() : 0;
        if (rightTime !== leftTime) {
          return rightTime - leftTime;
        }

        return right.id - left.id;
      });
  }

  private async attachSingleAlbumActivity<T extends AlbumRecord | null>(album: T) {
    if (!album) {
      return null;
    }

    const [activity] = await this.repo.getLatestPhotoActivityByAlbumIds([album.id]);
    return {
      ...album,
      activityAt: this.resolveAlbumActivityAt(album, activity?.activityAt ?? null),
    };
  }

  async listAlbums(profileId: number, canViewDrafts: boolean) {
    const albums = await this.repo.listAlbums(profileId, !canViewDrafts);
    return this.attachAlbumActivity(albums);
  }

  private sortPhotosByManualArrangement(photos: AlbumPhotoRecord[]) {
    return [...photos].sort((left, right) => {
      const leftOrder = Number.isFinite(left.sortOrder) ? left.sortOrder : Number.MAX_SAFE_INTEGER;
      const rightOrder = Number.isFinite(right.sortOrder) ? right.sortOrder : Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }

      const leftCreatedAt = new Date(left.uploadedAt ?? left.createdAt).getTime();
      const rightCreatedAt = new Date(right.uploadedAt ?? right.createdAt).getTime();
      if (leftCreatedAt !== rightCreatedAt) {
        return rightCreatedAt - leftCreatedAt;
      }

      return right.id - left.id;
    });
  }

  async getAlbumById(id: number, profileId: number, canViewDrafts: boolean) {
    const album = await this.repo.getAlbumById(id, profileId);
    if (!album || (!canViewDrafts && !album.isPublished)) {
      return null;
    }

    return this.attachSingleAlbumActivity(album);
  }

  async getAlbumBySlug(slug: string, profileId: number, canViewDrafts: boolean) {
    const album = await this.repo.getAlbumBySlug(slug, profileId, !canViewDrafts);
    return this.attachSingleAlbumActivity(album);
  }

  async createAlbum(profileId: number, input: AlbumCreateInput) {
    const shareLinkEnabled = input.shareLinkEnabled ?? false;
    const album = await this.repo.createAlbum({
      profileId,
      name: input.name,
      slug: input.slug,
      description: input.description,
      isPublished: input.isPublished ?? true,
      shareLinkEnabled,
      shareToken: shareLinkEnabled ? randomUUID().replace(/-/g, '') : null,
      profileLinks: input.profileLinks,
    });
    return this.attachSingleAlbumActivity(album);
  }

  async updateAlbum(albumId: number, input: AlbumUpdateInput) {
    const currentAlbum = await prisma.album.findUnique({
      where: { id: albumId },
      select: { shareToken: true },
    });

    if (input.coverPhotoId !== undefined && input.coverPhotoId !== null) {
      const photos = await this.repo.getAlbumPhotosByIds(albumId, [input.coverPhotoId]);
      if (photos.length !== 1) {
        throw new RequestValidationError('Cover photo must belong to the album.', 400, undefined, 'INVALID_COVER_PHOTO');
      }
    }

    let shareToken: string | null | undefined;
    if (input.shareLinkEnabled !== undefined) {
      if (input.shareLinkEnabled) {
        shareToken = currentAlbum?.shareToken ?? randomUUID().replace(/-/g, '');
      } else {
        shareToken = null;
      }
    }

    const updated = await this.repo.updateAlbum(albumId, {
      ...input,
      ...(shareToken !== undefined ? { shareToken } : {}),
    });
    return this.attachSingleAlbumActivity(updated);
  }

  async getAlbumByShareToken(shareToken: string) {
    const album = await this.repo.getAlbumByShareToken(shareToken);
    return this.attachSingleAlbumActivity(album);
  }

  async getAlbumByIdForShare(albumId: number, shareToken: string) {
    const album = await this.repo.getAlbumByIdAndShareToken(albumId, shareToken);
    return this.attachSingleAlbumActivity(album);
  }

  deleteAlbum(albumId: number) {
    return this.repo.deleteAlbum(albumId);
  }

  async listAlbumPhotos(albumId: number, profileId: number, sort: GallerySort, canViewDrafts: boolean) {
    const album = await this.getAlbumById(albumId, profileId, canViewDrafts);
    if (!album) {
      return null;
    }

    const basePhotos = await this.repo.listAlbumPhotos(albumId, 'custom');
    const photos =
      sort === 'custom'
        ? basePhotos
        : [...basePhotos].sort((left, right) => {
            const leftValue = new Date(left.dateTaken ?? left.uploadedAt).getTime();
            const rightValue = new Date(right.dateTaken ?? right.uploadedAt).getTime();
            return sort === 'dateAsc' ? leftValue - rightValue : rightValue - leftValue;
          });

    return { album, photos };
  }

  async listSharedAlbumPhotos(albumId: number, shareToken: string, sort: GallerySort) {
    const album = await this.getAlbumByIdForShare(albumId, shareToken);
    if (!album) {
      return null;
    }

    const basePhotos = await this.repo.listAlbumPhotos(albumId, 'custom');
    const photos =
      sort === 'custom'
        ? basePhotos
        : [...basePhotos].sort((left, right) => {
            const leftValue = new Date(left.dateTaken ?? left.uploadedAt).getTime();
            const rightValue = new Date(right.dateTaken ?? right.uploadedAt).getTime();
            return sort === 'dateAsc' ? leftValue - rightValue : rightValue - leftValue;
          });

    return { album, photos };
  }

  async getAlbumDownloadPayload(albumId: number, profileId: number, canViewDrafts: boolean) {
    const album = await this.getAlbumById(albumId, profileId, canViewDrafts);
    if (!album) {
      return null;
    }

    const albumWithPhotos = await this.repo.getAlbumWithPhotosForDownload(albumId, profileId);
    if (!albumWithPhotos) {
      return null;
    }

    const manuallySortedPhotos = this.sortPhotosByManualArrangement(albumWithPhotos.photos);
    const downloadablePhotos = manuallySortedPhotos.filter(
      (photo) => photo.sourceType === PhotoSourceType.upload || photo.sourceType === PhotoSourceType.gdrive,
    );
    const skippedPhotos = manuallySortedPhotos.filter(
      (photo) => photo.sourceType !== PhotoSourceType.upload && photo.sourceType !== PhotoSourceType.gdrive,
    );

    return {
      album: albumWithPhotos,
      downloadablePhotos,
      skippedPhotos,
    };
  }

  async getSharedAlbumDownloadPayload(albumId: number, shareToken: string) {
    const album = await this.getAlbumByIdForShare(albumId, shareToken);
    if (!album) {
      return null;
    }

    const albumWithPhotos = await this.repo.getAlbumWithPhotosForDownloadByShareToken(albumId, shareToken);
    if (!albumWithPhotos) {
      return null;
    }

    const manuallySortedPhotos = this.sortPhotosByManualArrangement(albumWithPhotos.photos);
    const downloadablePhotos = manuallySortedPhotos.filter((photo) => photo.sourceType === PhotoSourceType.upload);
    const skippedPhotos = manuallySortedPhotos.filter((photo) => photo.sourceType !== PhotoSourceType.upload);

    return {
      album: albumWithPhotos,
      downloadablePhotos,
      skippedPhotos,
    };
  }

  async getAlbumPhotoDownloadPayload(albumId: number, profileId: number, photoId: number, canViewDrafts: boolean) {
    const album = await this.getAlbumById(albumId, profileId, canViewDrafts);
    if (!album) {
      return null;
    }

    const photo = await this.repo.getAlbumPhotoById(albumId, photoId);
    if (!photo) {
      return null;
    }

    return { album, photo };
  }

  async getSharedAlbumPhotoDownloadPayload(albumId: number, shareToken: string, photoId: number) {
    const album = await this.getAlbumByIdForShare(albumId, shareToken);
    if (!album) {
      return null;
    }

    const photo = await this.repo.getAlbumPhotoById(albumId, photoId);
    if (!photo) {
      return null;
    }

    return { album, photo };
  }

  async addAlbumPhoto(
    albumId: number,
    input: PhotoCreateInput & {
      nsfwDetected?: boolean | null;
      nsfwDetectedAt?: Date;
      nsfwScores?: Prisma.InputJsonValue;
      blurOverride?: string;
    },
    options: { skipContentHashDuplicateCheck?: boolean; profileId?: number | null } = {},
  ) {
    const needsProfileLookup =
      (input.contentHash && !options.skipContentHashDuplicateCheck) ||
      (input.sourceType === 'gdrive' && input.sourceId);
    const profileId =
      options.profileId ?? (needsProfileLookup ? await this.repo.getAlbumProfileId(albumId) : null);

    if (input.contentHash && !options.skipContentHashDuplicateCheck && profileId) {
      const existing = await this.repo.findProfilePhotoByContentHash(profileId, input.contentHash);
      if (existing) {
        throw this.createDuplicateMediaError(existing);
      }
    }

    if (input.sourceType === 'gdrive' && input.sourceId && profileId) {
      const existing = await this.repo.findProfilePhotoBySourceId(profileId, PhotoSourceType.gdrive, input.sourceId);
      if (existing) {
        throw this.createDuplicateSourceError(existing);
      }
    }

    try {
      return await this.repo.createAlbumPhoto({
        albumId,
        imageUrl: input.imageUrl,
        cloudinaryPublicId: input.cloudinaryPublicId,
        contentHash: input.contentHash,
        originalFilename: input.originalFilename,
        mimeType: input.mimeType,
        fileSizeBytes: input.fileSizeBytes,
        nsfwDetected: input.nsfwDetected ?? null,
        nsfwDetectedAt: input.nsfwDetectedAt,
        nsfwScores: input.nsfwScores,
        blurOverride: input.blurOverride,
        caption: input.caption,
        dateTaken: input.dateTaken ? new Date(input.dateTaken) : undefined,
        sourceType: input.sourceType as PhotoSourceType,
        sourceId: input.sourceId,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const fallbackProfileId = profileId ?? (await this.repo.getAlbumProfileId(albumId));

        if (input.contentHash && fallbackProfileId) {
          const existing = await this.repo.findProfilePhotoByContentHash(fallbackProfileId, input.contentHash);
          throw this.createDuplicateMediaError(existing);
        }

        if (input.sourceType === 'gdrive' && input.sourceId && fallbackProfileId) {
          const existing = await this.repo.findProfilePhotoBySourceId(
            fallbackProfileId,
            PhotoSourceType.gdrive,
            input.sourceId,
          );
          throw this.createDuplicateSourceError(existing);
        }
      }

      throw error;
    }
  }

  async addUploadedAlbumPhoto(
    albumId: number,
    args: { file: File; input: Omit<PhotoCreateInput, 'imageUrl'> },
    options: { allowDuplicateContent?: boolean } = {},
  ) {
    const prepared = await prepareMediaUpload(args.file);
    const allowDuplicateContent = options.allowDuplicateContent === true;
    const profileId = allowDuplicateContent ? null : await this.repo.getAlbumProfileId(albumId);

    if (!allowDuplicateContent && profileId) {
      const existing = await this.repo.findProfilePhotoByContentHash(profileId, prepared.contentHash);
      if (existing) {
        throw this.createDuplicateMediaError(existing);
      }
    }

    const uploadedMedia = await uploadPreparedMediaFile(prepared, `portfolio/gallery/${albumId}`);

    let nsfwDetected: boolean | null | undefined;
    let nsfwDetectedAt: Date | undefined;
    let nsfwScores: Prisma.InputJsonValue | undefined;

    if (typeof prepared.mimeType === 'string' && prepared.mimeType.toLowerCase().startsWith('image/')) {
      try {
        const moderation = await moderateImageUrlForNsfw({ imageUrl: uploadedMedia.secureUrl });
        if (moderation) {
          nsfwDetected = moderation.nsfwDetected;
          nsfwDetectedAt = new Date();
          nsfwScores = moderation.nsfwScores as unknown as Prisma.InputJsonValue;
        }
      } catch (error) {
        if (process.env.NODE_ENV !== 'production') {
          // eslint-disable-next-line no-console
          console.warn('[gallery upload] NSFW moderation failed', error);
        }

        // Mark as scanned (safe) so uploads do not get stuck in a re-scan loop when
        // the underlying format is unsupported by the provider.
        nsfwDetected = false;
        nsfwDetectedAt = new Date();
        nsfwScores = {
          provider: 'openai',
          error: true,
          message: error instanceof Error ? error.message : 'Moderation failed.',
          code: typeof (error as any)?.code === 'string' ? (error as any).code : undefined,
          status: typeof (error as any)?.status === 'number' ? (error as any).status : undefined,
          requestID: typeof (error as any)?.requestID === 'string' ? (error as any).requestID : undefined,
        } as unknown as Prisma.InputJsonValue;
      }
    }

    return this.addAlbumPhoto(
      albumId,
      {
        ...args.input,
        imageUrl: uploadedMedia.playbackUrl,
        cloudinaryPublicId: uploadedMedia.publicId ?? args.input.cloudinaryPublicId,
        contentHash: allowDuplicateContent ? undefined : prepared.contentHash,
        originalFilename: prepared.originalFilename,
        mimeType: prepared.mimeType,
        fileSizeBytes: prepared.fileSizeBytes,
        sourceType: args.input.sourceType ?? 'upload',
        nsfwDetected,
        nsfwDetectedAt,
        nsfwScores,
        blurOverride: 'auto',
      },
      { skipContentHashDuplicateCheck: true, profileId },
    );
  }

  async updateAlbumPhotoBlurOverride(
    albumId: number,
    photoId: number,
    blurOverride: 'auto' | 'force_blur' | 'force_unblur',
  ) {
    return this.repo.updateAlbumPhotoBlurOverride(albumId, photoId, blurOverride);
  }

  async updateAlbumPhotosBlurOverride(
    albumId: number,
    photoIds: number[],
    blurOverride: 'auto' | 'force_blur' | 'force_unblur',
  ) {
    if (photoIds.length === 0) {
      throw new RequestValidationError('Select at least one media item first.', 400, undefined, 'EMPTY_BLUR_SELECTION');
    }

    const uniqueIds = new Set(photoIds);
    if (uniqueIds.size !== photoIds.length) {
      throw new RequestValidationError('Duplicate photo ids are not allowed.', 400, undefined, 'DUPLICATE_PHOTO_IDS');
    }

    const existing = await this.repo.getAlbumPhotosByIds(albumId, photoIds);
    if (existing.length !== photoIds.length) {
      throw new RequestValidationError('Some photos are missing or belong to another album.', 400, undefined, 'PHOTO_NOT_FOUND');
    }

    return this.repo.updateAlbumPhotosBlurOverride(albumId, photoIds, blurOverride);
  }

  async moveAlbumPhotos(sourceAlbumId: number, targetAlbumId: number, photoIds: number[]) {
    if (sourceAlbumId === targetAlbumId) {
      throw new RequestValidationError(
        'Source and destination albums must be different.',
        400,
        undefined,
        'INVALID_MOVE_TARGET',
      );
    }

    if (photoIds.length === 0) {
      throw new RequestValidationError('Select at least one media item first.', 400, undefined, 'EMPTY_MOVE_SELECTION');
    }

    const sourcePhotos = await this.repo.getAlbumPhotosByIds(sourceAlbumId, photoIds);
    if (sourcePhotos.length !== photoIds.length) {
      throw new RequestValidationError(
        'Some photos are missing or belong to another album.',
        400,
        undefined,
        'PHOTO_NOT_FOUND',
      );
    }

    const sourcePhotoById = new Map(sourcePhotos.map((photo) => [photo.id, photo]));
    const orderedSourcePhotos = photoIds
      .map((photoId) => sourcePhotoById.get(photoId))
      .filter((photo): photo is AlbumPhotoRecord => Boolean(photo));

    const results: MoveAlbumPhotoResultEntry[] = [];
    let movedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const photo of orderedSourcePhotos) {
      try {
        const result = await prisma.$transaction(async (tx) => {
          const duplicate = photo.contentHash
            ? await tx.albumPhoto.findFirst({
                where: { albumId: targetAlbumId, contentHash: photo.contentHash },
                select: albumPhotoSelect,
              })
            : photo.sourceType === PhotoSourceType.gdrive && photo.sourceId
              ? await tx.albumPhoto.findFirst({
                  where: {
                    albumId: targetAlbumId,
                    sourceType: PhotoSourceType.gdrive,
                    sourceId: photo.sourceId,
                  },
                  select: albumPhotoSelect,
                })
              : null;

          if (duplicate) {
            return {
              status: 'duplicate-skipped' as const,
              duplicate: {
                id: duplicate.id,
                caption: duplicate.caption,
                imageUrl: duplicate.imageUrl,
              },
            };
          }

          const first = await tx.albumPhoto.findFirst({
            where: { albumId: targetAlbumId },
            orderBy: [{ sortOrder: 'asc' }, { uploadedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
            select: { sortOrder: true },
          });

          const created = await tx.albumPhoto.create({
            data: {
              albumId: targetAlbumId,
              imageUrl: photo.imageUrl,
              cloudinaryPublicId: photo.cloudinaryPublicId,
              contentHash: photo.contentHash,
              originalFilename: photo.originalFilename,
              mimeType: photo.mimeType,
              fileSizeBytes: photo.fileSizeBytes,
              caption: photo.caption,
              dateTaken: photo.dateTaken,
              sourceType: photo.sourceType,
              sourceId: photo.sourceId,
              sortOrder: (first?.sortOrder ?? 0) - 1,
            },
            select: albumPhotoSelect,
          });

          if (typeof photo.mimeType === 'string' && photo.mimeType.toLowerCase().startsWith('image/')) {
            await tx.album.updateMany({
              where: { id: targetAlbumId, coverPhotoId: null },
              data: { coverPhotoId: created.id },
            });
          }

          await tx.albumPhoto.delete({
            where: { id: photo.id },
          });

          return {
            status: 'moved' as const,
            created,
          };
        });

        if (result.status === 'moved') {
          movedCount += 1;
          results.push({
            photoId: photo.id,
            fileName: photo.originalFilename || photo.caption || `Media ${photo.id}`,
            status: 'moved',
            reason: 'Moved successfully.',
          });
          continue;
        }

        skippedCount += 1;
        results.push({
          photoId: photo.id,
          fileName: photo.originalFilename || photo.caption || `Media ${photo.id}`,
          status: 'duplicate-skipped',
          reason: 'Duplicate already exists in the target album.',
          duplicate: result.duplicate,
        });
      } catch (error) {
        failedCount += 1;
        results.push({
          photoId: photo.id,
          fileName: photo.originalFilename || photo.caption || `Media ${photo.id}`,
          status: 'error',
          reason: error instanceof Error && error.message ? error.message : 'Move failed.',
          errorCode: error instanceof RequestValidationError ? error.errorCode : undefined,
        });
      }
    }

    return {
      sourceAlbumId,
      targetAlbumId,
      totalFiles: orderedSourcePhotos.length,
      movedCount,
      skippedCount,
      failedCount,
      results,
    };
  }

  async removeAlbumPhoto(albumId: number, photoId: number) {
    return this.repo.deleteAlbumPhoto(albumId, photoId);
  }

  async reorderAlbumPhotos(albumId: number, photoIds: number[]) {
    const existing = await this.repo.getAlbumPhotosByIds(albumId, photoIds);
    if (existing.length !== photoIds.length) {
      throw new RequestValidationError('Some photos are missing or belong to another album.', 400, undefined, 'PHOTO_NOT_FOUND');
    }

    const uniqueIds = new Set(photoIds);
    if (uniqueIds.size !== photoIds.length) {
      throw new RequestValidationError('Duplicate photo ids are not allowed.', 400, undefined, 'DUPLICATE_PHOTO_IDS');
    }

    return this.repo.reorderAlbumPhotos(albumId, photoIds);
  }

  async importGoogleDriveFolder(
    albumId: number,
    args: {
      accessToken: string;
      folderId: string;
      selectedFileIds?: string[];
      mediaTypeFilter?: 'all' | 'images' | 'videos';
      onProgress?: (event: {
        totalCount: number;
        checkedCount: number;
        importedCount: number;
        duplicateCount: number;
        currentFileName: string | null;
      }) => void;
    },
  ) {
    const drivePhotos = await this.driveAdapter.listFolderMedia({
      accessToken: args.accessToken,
      folderId: args.folderId,
      selectedFileIds: Array.isArray(args.selectedFileIds) ? args.selectedFileIds : [],
      mediaTypeFilter: args.mediaTypeFilter || 'all',
    });

    const profileId = await this.repo.getAlbumProfileId(albumId);

    const created = [];
    const skipped = [];
    let checkedCount = 0;
    let importedCount = 0;
    let duplicateCount = 0;

    const emitProgress = (photoCaption?: string) => {
      args.onProgress?.({
        totalCount: drivePhotos.length,
        checkedCount,
        importedCount,
        duplicateCount,
        currentFileName: photoCaption || null,
      });
    };

    const describeImportDuplicate = (existing: DuplicatePhotoRecord | null, fallback: string) => {
      const albumName = existing?.album?.name;
      return albumName ? `Already exists in the album “${albumName}”.` : fallback;
    };

    for (const photo of drivePhotos) {
      const existing = profileId
        ? await this.repo.findProfilePhotoBySourceId(profileId, PhotoSourceType.gdrive, photo.sourceId)
        : null;
      if (existing) {
        checkedCount += 1;
        duplicateCount += 1;
        skipped.push({
          sourceId: photo.sourceId,
          caption: photo.caption,
          reason: describeImportDuplicate(existing, 'Already imported into this gallery.'),
          duplicateId: existing.id,
        });
        emitProgress(photo.caption);
        continue;
      }

      const contentHash = await this.driveAdapter.getFileContentHash({
        accessToken: args.accessToken,
        fileId: photo.sourceId,
      });

      const duplicateByHash = profileId
        ? await this.repo.findProfilePhotoByContentHash(profileId, contentHash)
        : null;
      if (duplicateByHash) {
        checkedCount += 1;
        duplicateCount += 1;
        skipped.push({
          sourceId: photo.sourceId,
          caption: photo.caption,
          reason: describeImportDuplicate(duplicateByHash, 'Duplicate media already exists in this gallery.'),
          duplicateId: duplicateByHash.id,
        });
        emitProgress(photo.caption);
        continue;
      }

      const dateTaken = photo.dateTaken ? new Date(photo.dateTaken) : undefined;
      try {
        const row = await this.addAlbumPhoto(
          albumId,
          {
            imageUrl: photo.imageUrl,
            caption: photo.caption,
            dateTaken: dateTaken && !Number.isNaN(dateTaken.getTime()) ? dateTaken.toISOString() : undefined,
            mimeType: photo.mimeType,
            contentHash,
            sourceType: 'gdrive',
            sourceId: photo.sourceId,
          },
          { profileId },
        );
        created.push(row);
        checkedCount += 1;
        importedCount += 1;
        emitProgress(photo.caption);
      } catch (error) {
        type DuplicateMeta = { duplicate?: { id?: number; album?: { name?: string } | null } } | undefined;
        if (error instanceof RequestValidationError && error.errorCode === 'DUPLICATE_MEDIA') {
          const duplicate = error.meta as DuplicateMeta;
          const albumName = duplicate?.duplicate?.album?.name;
          checkedCount += 1;
          duplicateCount += 1;
          skipped.push({
            sourceId: photo.sourceId,
            caption: photo.caption,
            reason: albumName
              ? `Already exists in the album “${albumName}”.`
              : 'Duplicate media already exists in this gallery.',
            duplicateId: duplicate?.duplicate?.id,
          });
          emitProgress(photo.caption);
          continue;
        }

        if (error instanceof RequestValidationError && error.errorCode === 'DUPLICATE_SOURCE_MEDIA') {
          const duplicate = error.meta as DuplicateMeta;
          const albumName = duplicate?.duplicate?.album?.name;
          checkedCount += 1;
          duplicateCount += 1;
          skipped.push({
            sourceId: photo.sourceId,
            caption: photo.caption,
            reason: albumName
              ? `Already imported into the album “${albumName}”.`
              : 'Already imported into this gallery.',
            duplicateId: duplicate?.duplicate?.id,
          });
          emitProgress(photo.caption);
          continue;
        }

        throw error;
      }
    }

    return { created, skipped };
  }
}

export const galleryService = new GalleryService();
