import { createHash } from 'node:crypto';

export type ImportedDrivePhoto = {
  sourceId: string;
  imageUrl: string;
  caption?: string;
  dateTaken?: string;
  mimeType?: string;
  /** Prefer Drive metadata sha256 when present (avoids full-file download). */
  contentHash?: string;
};

export type GoogleDriveFolderEntry = {
  id: string;
  name: string;
  parentId: string | null;
  mediaCount: number | null;
  modifiedTime: string | null;
};

export type GoogleDriveFolderContext = {
  currentFolder: GoogleDriveFolderEntry | null;
  breadcrumbs: Array<{ id: string; name: string }>;
  folders: GoogleDriveFolderEntry[];
  files: GoogleDriveMediaPreviewEntry[];
  nextPreviewPageToken: string | null;
};

export type GoogleDriveMediaPreviewEntry = {
  id: string;
  name: string;
  mimeType: string;
  previewUrl: string;
  kind: 'image' | 'video';
};

type GoogleErrorPayload = {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    errors?: Array<{
      reason?: string;
      message?: string;
    }>;
  };
};

type GoogleFileResponse = {
  id: string;
  name: string;
  mimeType: string;
  trashed?: boolean;
  parents?: string[];
  modifiedTime?: string;
  imageMediaMetadata?: {
    time?: string;
  };
  createdTime?: string;
  sha256Checksum?: string;
  md5Checksum?: string;
};

function normalizeDriveSha256Checksum(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(normalized) ? normalized : undefined;
}

function toImportedDrivePhoto(file: GoogleFileResponse): ImportedDrivePhoto {
  return {
    sourceId: file.id,
    imageUrl: `https://drive.google.com/thumbnail?id=${encodeURIComponent(file.id)}&sz=w2000`,
    caption: file.name,
    dateTaken: file.imageMediaMetadata?.time || file.createdTime,
    mimeType: file.mimeType,
    contentHash: normalizeDriveSha256Checksum(file.sha256Checksum),
  };
}

type GoogleFilesListResponse = {
  files?: GoogleFileResponse[];
  nextPageToken?: string;
};

const ALLOWED_MEDIA_MIME_PREFIXES = ['image/', 'video/'];
const PREVIEW_MIME_PREFIXES = ['image/', 'video/'];
const GOOGLE_FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

async function createGoogleDriveRequestError(response: Response) {
  const text = await response.text();
  let payload: GoogleErrorPayload | null = null;

  try {
    payload = text ? (JSON.parse(text) as GoogleErrorPayload) : null;
  } catch {
    payload = null;
  }

  const googleMessage = payload?.error?.message?.trim();
  const googleReasons = (payload?.error?.errors ?? []).map((entry) => entry.reason).filter(Boolean);

  if (
    response.status === 403 &&
    (googleReasons.includes('accessNotConfigured') ||
      payload?.error?.status === 'PERMISSION_DENIED' ||
      /Drive API has not been used|SERVICE_DISABLED/i.test(googleMessage ?? ''))
  ) {
    return new Error('Google Drive API is not enabled for this Google Cloud project. Enable the Drive API and try again in a few minutes.');
  }

  if (response.status === 404) {
    return new Error('Google Drive folder not found, or the connected Google account does not have access to it.');
  }

  if (response.status === 403) {
    return new Error('The connected Google account does not have permission to read that Google Drive folder.');
  }

  if (googleMessage) {
    return new Error(`Google Drive error: ${googleMessage}`);
  }

  return new Error('Failed to load photos from Google Drive folder.');
}

export class GoogleDriveAdapter {
  private async fetchFilesList(args: { accessToken: string; params: URLSearchParams }) {
    const response = await fetch(`https://www.googleapis.com/drive/v3/files?${args.params.toString()}`, {
      headers: {
        Authorization: `Bearer ${args.accessToken}`,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      throw await createGoogleDriveRequestError(response);
    }

    return (await response.json()) as GoogleFilesListResponse;
  }

  private async getFolderInfo(args: { accessToken: string; folderId: string }): Promise<GoogleDriveFolderEntry> {
    const params = new URLSearchParams({
      fields: 'id,name,mimeType,parents,modifiedTime',
      supportsAllDrives: 'true',
    });

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(args.folderId)}?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${args.accessToken}`,
        },
        cache: 'no-store',
      },
    );

    if (!response.ok) {
      throw await createGoogleDriveRequestError(response);
    }

    const folder = (await response.json()) as GoogleFileResponse;
    if (!folder?.id || folder.mimeType !== GOOGLE_FOLDER_MIME_TYPE) {
      throw new Error('Google Drive folder not found, or the connected Google account does not have access to it.');
    }

    return {
      id: folder.id,
      name: folder.name || 'Untitled folder',
      parentId: Array.isArray(folder.parents) && folder.parents.length > 0 ? folder.parents[0] : null,
      mediaCount: null,
      modifiedTime: typeof folder.modifiedTime === 'string' ? folder.modifiedTime : null,
    };
  }

  async listFolders(args: {
    accessToken: string;
    parentId?: string | null;
    sort?: 'recent' | 'name';
  }): Promise<GoogleDriveFolderEntry[]> {
    const parentId = args.parentId || 'root';
    const sortMode = args.sort === 'name' ? 'name' : 'recent';
    const orderBy = sortMode === 'name' ? 'name_natural' : 'modifiedTime desc,name_natural';
    const params = new URLSearchParams({
      q: `'${parentId}' in parents and trashed = false and mimeType = '${GOOGLE_FOLDER_MIME_TYPE}'`,
      pageSize: '100',
      fields: 'files(id,name,mimeType,parents,modifiedTime)',
      orderBy,
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    });

    const data = await this.fetchFilesList({ accessToken: args.accessToken, params });
    const files = Array.isArray(data.files) ? data.files : [];

    return files
      .filter((file) => file?.id && file?.mimeType === GOOGLE_FOLDER_MIME_TYPE)
      .map((file) => ({
        id: file.id,
        name: file.name || 'Untitled folder',
        parentId: Array.isArray(file.parents) && file.parents.length > 0 ? file.parents[0] : null,
        mediaCount: null,
        modifiedTime: typeof file.modifiedTime === 'string' ? file.modifiedTime : null,
      }));
  }

  async getFolderMediaCount(args: { accessToken: string; folderId: string }): Promise<number> {
    let total = 0;
    let pageToken: string | null = null;

    do {
      const params = new URLSearchParams({
        q: `'${args.folderId}' in parents and trashed = false and (mimeType contains 'image/' or mimeType contains 'video/')`,
        pageSize: '1000',
        fields: 'files(id),nextPageToken',
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true',
      });

      if (pageToken) {
        params.set('pageToken', pageToken);
      }

      const data = await this.fetchFilesList({ accessToken: args.accessToken, params });
      total += Array.isArray(data.files) ? data.files.length : 0;
      pageToken = data.nextPageToken || null;
    } while (pageToken);

    return total;
  }

  async listFolderPreviewFiles(args: {
    accessToken: string;
    parentId?: string | null;
    limit?: number;
    pageToken?: string | null;
    includeAll?: boolean;
    sort?: 'recent' | 'name';
  }): Promise<{ files: GoogleDriveMediaPreviewEntry[]; nextPageToken: string | null }> {
    const parentId = args.parentId || 'root';
    const previewLimit = Math.max(1, Math.min(100, args.limit ?? 50));
    const sortMode = args.sort === 'name' ? 'name' : 'recent';
    const orderBy = sortMode === 'name' ? 'name_natural' : 'modifiedTime desc,name_natural';
    const mapPreviewFile = (file: GoogleFileResponse): GoogleDriveMediaPreviewEntry => ({
      id: file.id,
      name: file.name || 'Untitled media',
      mimeType: file.mimeType,
      previewUrl: `/api/admin/integrations/google-drive/files/${encodeURIComponent(file.id)}`,
      kind: file.mimeType.startsWith('video/') ? 'video' : 'image',
    });

    if (args.includeAll) {
      const aggregated: GoogleDriveMediaPreviewEntry[] = [];
      let pageToken = args.pageToken ?? null;
      let safetyCounter = 0;

      do {
        const params = new URLSearchParams({
          q: `'${parentId}' in parents and trashed = false and (mimeType contains 'image/' or mimeType contains 'video/')`,
          pageSize: '1000',
          fields: 'files(id,name,mimeType),nextPageToken',
          orderBy,
          supportsAllDrives: 'true',
          includeItemsFromAllDrives: 'true',
        });

        if (pageToken) {
          params.set('pageToken', pageToken);
        }

        const data = await this.fetchFilesList({ accessToken: args.accessToken, params });
        const files = Array.isArray(data.files) ? data.files : [];
        aggregated.push(
          ...files
            .filter((file) => file?.id && typeof file?.mimeType === 'string' && PREVIEW_MIME_PREFIXES.some((prefix) => file.mimeType.startsWith(prefix)))
            .map(mapPreviewFile),
        );

        pageToken = data.nextPageToken || null;
        safetyCounter += 1;
      } while (pageToken && safetyCounter < 100);

      return {
        files: aggregated,
        nextPageToken: null,
      };
    }

    const params = new URLSearchParams({
      q: `'${parentId}' in parents and trashed = false and (mimeType contains 'image/' or mimeType contains 'video/')`,
      pageSize: String(previewLimit),
      fields: 'files(id,name,mimeType)',
      orderBy,
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    });

    if (args.pageToken) {
      params.set('pageToken', args.pageToken);
    }

    const data = await this.fetchFilesList({ accessToken: args.accessToken, params });
    const files = Array.isArray(data.files) ? data.files : [];

    return {
      files: files
        .filter((file) => file?.id && typeof file?.mimeType === 'string' && PREVIEW_MIME_PREFIXES.some((prefix) => file.mimeType.startsWith(prefix)))
        .map(mapPreviewFile),
      nextPageToken: data.nextPageToken || null,
    };
  }

  async getFolderContext(args: {
    accessToken: string;
    parentId?: string | null;
    previewPageToken?: string | null;
    previewLimit?: number;
    folderSort?: 'recent' | 'name';
    includeAllPreviews?: boolean;
  }): Promise<GoogleDriveFolderContext> {
    const breadcrumbs: Array<{ id: string; name: string }> = [{ id: 'root', name: 'My Drive' }];
    let currentFolder: GoogleDriveFolderEntry | null = null;

    if (args.parentId && args.parentId !== 'root') {
      const chain: GoogleDriveFolderEntry[] = [];
      const visited = new Set<string>();
      let cursorId: string | null = args.parentId;

      while (cursorId && cursorId !== 'root' && !visited.has(cursorId)) {
        visited.add(cursorId);
        const folder = await this.getFolderInfo({
          accessToken: args.accessToken,
          folderId: cursorId,
        });
        chain.unshift(folder);
        cursorId = folder.parentId;
      }

      currentFolder = chain[chain.length - 1] ?? null;
      breadcrumbs.push(...chain.map((folder) => ({ id: folder.id, name: folder.name })));
      if (currentFolder) {
        currentFolder = {
          ...currentFolder,
          mediaCount: await this.getFolderMediaCount({
            accessToken: args.accessToken,
            folderId: currentFolder.id,
          }),
        };
      }
    }

    const folders = await this.listFolders({
      accessToken: args.accessToken,
      parentId: args.parentId,
      sort: args.folderSort,
    });
    const preview = await this.listFolderPreviewFiles({
      accessToken: args.accessToken,
      parentId: args.parentId,
      limit: args.previewLimit,
      pageToken: args.previewPageToken,
      includeAll: args.includeAllPreviews,
      sort: args.folderSort,
    });

    return {
      currentFolder,
      breadcrumbs,
      folders,
      files: preview.files,
      nextPreviewPageToken: preview.nextPageToken,
    };
  }

  async listFolderMediaIds(args: {
    accessToken: string;
    folderId: string;
    mediaTypeFilter?: 'all' | 'images' | 'videos';
  }): Promise<string[]> {
    const mediaTypeFilter = args.mediaTypeFilter || 'all';
    const allowedMimePrefixes =
      mediaTypeFilter === 'images'
        ? ['image/']
        : mediaTypeFilter === 'videos'
          ? ['video/']
          : ALLOWED_MEDIA_MIME_PREFIXES;

    const queue: string[] = [args.folderId];
    const visited = new Set<string>();
    const fileIds: string[] = [];

    while (queue.length > 0) {
      const folderId = queue.shift();
      if (!folderId || visited.has(folderId)) {
        continue;
      }

      visited.add(folderId);

      let pageToken: string | null = null;
      do {
        const mediaQueryPart =
          mediaTypeFilter === 'images'
            ? "mimeType contains 'image/'"
            : mediaTypeFilter === 'videos'
              ? "mimeType contains 'video/'"
              : "(mimeType contains 'image/' or mimeType contains 'video/')";
        const query = `'${folderId}' in parents and trashed = false and (mimeType = '${GOOGLE_FOLDER_MIME_TYPE}' or ${mediaQueryPart})`;
        const params = new URLSearchParams({
          q: query,
          pageSize: '1000',
          fields: 'files(id,mimeType),nextPageToken',
          supportsAllDrives: 'true',
          includeItemsFromAllDrives: 'true',
        });

        if (pageToken) {
          params.set('pageToken', pageToken);
        }

        const data = await this.fetchFilesList({ accessToken: args.accessToken, params });
        const files = Array.isArray(data.files) ? data.files : [];
        for (const file of files) {
          if (!file?.id || typeof file?.mimeType !== 'string') {
            continue;
          }

          if (file.mimeType === GOOGLE_FOLDER_MIME_TYPE) {
            queue.push(file.id);
            continue;
          }

          if (!allowedMimePrefixes.some((prefix) => file.mimeType.startsWith(prefix))) {
            continue;
          }

          fileIds.push(file.id);
        }

        pageToken = data.nextPageToken || null;
      } while (pageToken);
    }

    return fileIds;
  }

  async listFolderMedia(args: {
    accessToken: string;
    folderId: string;
    selectedFileIds?: string[];
    mediaTypeFilter?: 'all' | 'images' | 'videos';
  }): Promise<ImportedDrivePhoto[]> {
    const selectedIds = Array.isArray(args.selectedFileIds)
      ? Array.from(new Set(args.selectedFileIds.filter(Boolean)))
      : [];
    const mediaTypeFilter = args.mediaTypeFilter || 'all';
    const allowedMimePrefixes =
      mediaTypeFilter === 'images'
        ? ['image/']
        : mediaTypeFilter === 'videos'
          ? ['video/']
          : ALLOWED_MEDIA_MIME_PREFIXES;

    if (selectedIds.length > 0) {
      const media: ImportedDrivePhoto[] = [];
      for (const fileId of selectedIds) {
        const params = new URLSearchParams({
          fields: 'id,name,mimeType,trashed,imageMediaMetadata(time),createdTime,sha256Checksum',
          supportsAllDrives: 'true',
        });

        const response = await fetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?${params.toString()}`,
          {
            headers: {
              Authorization: `Bearer ${args.accessToken}`,
            },
            cache: 'no-store',
          },
        );

        if (!response.ok) {
          continue;
        }

        const file = (await response.json()) as GoogleFileResponse;
        if (!file?.id || file.trashed || typeof file.mimeType !== 'string') {
          continue;
        }
        if (!allowedMimePrefixes.some((prefix) => file.mimeType.startsWith(prefix))) {
          continue;
        }

        media.push(toImportedDrivePhoto(file));
      }

      return media;
    }

    const queue: string[] = [args.folderId];
    const visited = new Set<string>();
    const media: ImportedDrivePhoto[] = [];

    while (queue.length > 0) {
      const folderId = queue.shift();
      if (!folderId || visited.has(folderId)) {
        continue;
      }

      visited.add(folderId);

      let pageToken: string | null = null;
      do {
        const mediaQueryPart =
          mediaTypeFilter === 'images'
            ? "mimeType contains 'image/'"
            : mediaTypeFilter === 'videos'
              ? "mimeType contains 'video/'"
              : "(mimeType contains 'image/' or mimeType contains 'video/')";
        const query = `'${folderId}' in parents and trashed = false and (mimeType = '${GOOGLE_FOLDER_MIME_TYPE}' or ${mediaQueryPart})`;
        const params = new URLSearchParams({
          q: query,
          pageSize: '1000',
          fields: 'files(id,name,mimeType,imageMediaMetadata(time),createdTime,sha256Checksum),nextPageToken',
          orderBy: 'createdTime desc,name_natural',
          supportsAllDrives: 'true',
          includeItemsFromAllDrives: 'true',
        });

        if (pageToken) {
          params.set('pageToken', pageToken);
        }

        const data = await this.fetchFilesList({ accessToken: args.accessToken, params });
        const files = Array.isArray(data.files) ? data.files : [];
        for (const file of files) {
          if (!file?.id || typeof file?.mimeType !== 'string') {
            continue;
          }

          if (file.mimeType === GOOGLE_FOLDER_MIME_TYPE) {
            queue.push(file.id);
            continue;
          }

          if (!allowedMimePrefixes.some((prefix) => file.mimeType.startsWith(prefix))) {
            continue;
          }

          media.push(toImportedDrivePhoto(file));
        }

        pageToken = data.nextPageToken || null;
      } while (pageToken);
    }

    return media;
  }

  async getFileContentHash(args: { accessToken: string; fileId: string }): Promise<string> {
    const metaParams = new URLSearchParams({
      fields: 'id,sha256Checksum',
      supportsAllDrives: 'true',
    });
    const metaResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(args.fileId)}?${metaParams.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${args.accessToken}`,
        },
        cache: 'no-store',
      },
    );

    if (metaResponse.ok) {
      const meta = (await metaResponse.json()) as GoogleFileResponse;
      const fromMeta = normalizeDriveSha256Checksum(meta?.sha256Checksum);
      if (fromMeta) {
        return fromMeta;
      }
    } else if (metaResponse.status !== 404) {
      // Fall through to media download for transient/partial metadata failures.
    } else {
      throw await createGoogleDriveRequestError(metaResponse);
    }

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(args.fileId)}?alt=media&supportsAllDrives=true`,
      {
        headers: {
          Authorization: `Bearer ${args.accessToken}`,
        },
        cache: 'no-store',
      },
    );

    if (!response.ok) {
      throw await createGoogleDriveRequestError(response);
    }

    if (!response.body) {
      throw new Error('Failed to load file content from Google Drive.');
    }

    const reader = response.body.getReader();
    const hash = createHash('sha256');

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        hash.update(value);
      }
    } finally {
      reader.releaseLock();
    }

    return hash.digest('hex');
  }
}
