'use client';

import { Dialog, Transition } from '@headlessui/react';
import { Fragment, useEffect, useRef, useState } from 'react';
import {
  ArrowUpDown,
  Check,
  ChevronRight,
  FileImage,
  FileVideo,
  Folder,
  Home,
  Loader2,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { FaGoogleDrive } from 'react-icons/fa';
import AdminHint from '@/components/admin/shared/AdminHint';
import { fetchJson } from './galleryAdminShared';

const emptyBrowseState = {
  loading: false,
  loadingMore: false,
  folders: [],
  files: [],
  breadcrumbs: [{ id: 'root', name: 'My Drive' }],
  currentFolder: null,
  nextPageToken: null,
  error: '',
};

const CONTENTS_PAGE_SIZE = 50;

function DriveListRow({ icon, title, subtitle, trailing, selected = false, onClick, disabled = false }) {
  const className = `group flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${
    selected
      ? 'border-blue-200 bg-blue-50 shadow-sm'
      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
  } ${disabled ? 'cursor-default' : 'cursor-pointer'} ${onClick ? '' : 'cursor-default'}`;

  const content = (
    <>
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${
          selected ? 'border-blue-200 bg-white text-blue-600' : 'border-slate-200 bg-slate-50 text-slate-500'
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-slate-950">{title}</span>
        {subtitle ? <span className="mt-1 block truncate text-xs text-slate-500">{subtitle}</span> : null}
      </span>
      {trailing}
    </>
  );

  if (!onClick) {
    return <div className={className}>{content}</div>;
  }

  return (
    <button type="button" className={className} onClick={onClick} disabled={disabled}>
      {content}
    </button>
  );
}

export default function GalleryDriveFolderPicker({
  open,
  onClose,
  onSelectFolder,
  selectedFolderId,
}) {
  const [browseState, setBrowseState] = useState(emptyBrowseState);
  const [folderSort, setFolderSort] = useState('recent');
  const [query, setQuery] = useState('');
  const [pendingFolder, setPendingFolder] = useState(null);
  const bodyScrollRef = useRef(null);
  const loadMoreSentinelRef = useRef(null);
  const folderSortRef = useRef(folderSort);
  folderSortRef.current = folderSort;
  const loadMoreRef = useRef(async () => {});

  const loadFolders = async (parentId = null, options = {}) => {
    const {
      appendFiles = false,
      pageToken = null,
      folderSortOverride = null,
      syncPending = true,
    } = options;
    const effectiveFolderSort = folderSortOverride || folderSortRef.current;

    setBrowseState((current) => ({
      ...current,
      loading: appendFiles ? current.loading : true,
      loadingMore: appendFiles,
      error: '',
    }));

    try {
      const params = new URLSearchParams();
      if (parentId) {
        params.set('parentId', parentId);
      }
      if (pageToken) {
        params.set('previewPageToken', pageToken);
      }
      params.set('previewPageSize', String(CONTENTS_PAGE_SIZE));
      params.set('folderSort', effectiveFolderSort);

      const payload = await fetchJson(
        `/api/admin/integrations/google-drive/folders${params.toString() ? `?${params.toString()}` : ''}`,
      );
      const nextFiles = Array.isArray(payload?.files) ? payload.files : [];

      setBrowseState((current) => ({
        loading: false,
        loadingMore: false,
        folders: Array.isArray(payload?.folders) ? payload.folders : [],
        files: appendFiles ? [...current.files, ...nextFiles] : nextFiles,
        breadcrumbs:
          Array.isArray(payload?.breadcrumbs) && payload.breadcrumbs.length > 0
            ? payload.breadcrumbs
            : [{ id: 'root', name: 'My Drive' }],
        currentFolder: payload?.currentFolder ?? null,
        nextPageToken: payload?.nextPreviewPageToken ?? null,
        error: '',
      }));

      if (!appendFiles && syncPending) {
        if (payload?.currentFolder) {
          setPendingFolder({
            id: payload.currentFolder.id,
            name: payload.currentFolder.name,
          });
        } else if (!parentId) {
          setPendingFolder(null);
        }
      }

      return payload;
    } catch (error) {
      setBrowseState((current) => ({
        ...current,
        loading: false,
        loadingMore: false,
        error: error instanceof Error ? error.message : 'Unable to browse Google Drive folders.',
      }));
      return null;
    }
  };

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    let cancelled = false;

    const openPicker = async () => {
      setQuery('');
      setPendingFolder(selectedFolderId ? { id: selectedFolderId, name: null } : null);

      let nextSort = folderSortRef.current;
      try {
        const settings = await fetchJson('/api/gallery/settings', { method: 'GET' });
        if (cancelled) return;
        nextSort = settings?.galleryLastDriveFolderSort === 'name' ? 'name' : 'recent';
        setFolderSort(nextSort);
      } catch {
        // Keep the in-memory sort if settings cannot load.
      }

      if (cancelled) return;
      await loadFolders(selectedFolderId || null, {
        folderSortOverride: nextSort,
      });
    };

    void openPicker();
    return () => {
      cancelled = true;
    };
  }, [open, selectedFolderId]);

  const activeFolderId = browseState.breadcrumbs[browseState.breadcrumbs.length - 1]?.id;
  const currentParentId = activeFolderId && activeFolderId !== 'root' ? activeFolderId : null;
  const pathCrumbs = browseState.breadcrumbs.filter((crumb) => crumb.id !== 'root');

  const loadMoreFiles = async () => {
    if (!browseState.nextPageToken || browseState.loadingMore || browseState.loading) {
      return;
    }

    await loadFolders(currentParentId, {
      appendFiles: true,
      pageToken: browseState.nextPageToken,
      syncPending: false,
    });
  };
  loadMoreRef.current = loadMoreFiles;

  useEffect(() => {
    if (!open) return undefined;
    if (!browseState.nextPageToken || browseState.loadingMore || browseState.loading) return undefined;

    const root = bodyScrollRef.current;
    const sentinel = loadMoreSentinelRef.current;
    if (!root || !sentinel) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMoreRef.current();
        }
      },
      { root, rootMargin: '240px 0px', threshold: 0 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [browseState.loading, browseState.loadingMore, browseState.nextPageToken, open]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredFolders = browseState.folders.filter((folder) =>
    folder.name.toLowerCase().includes(normalizedQuery),
  );
  const filteredFiles = browseState.files.filter((file) => file.name.toLowerCase().includes(normalizedQuery));

  const navigateIntoFolder = (folder) => {
    setPendingFolder({ id: folder.id, name: folder.name });
    void loadFolders(folder.id);
  };

  const persistFolderSort = (nextSort) => {
    void fetch('/api/gallery/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ galleryLastDriveFolderSort: nextSort }),
    }).catch(() => {});
  };

  const handleToggleSort = () => {
    const nextSort = folderSort === 'recent' ? 'name' : 'recent';
    setFolderSort(nextSort);
    persistFolderSort(nextSort);
    void loadFolders(currentParentId, { folderSortOverride: nextSort, syncPending: false });
  };

  const confirmFolder =
    browseState.currentFolder ||
    (pendingFolder?.id
      ? {
          id: pendingFolder.id,
          name: pendingFolder.name || pendingFolder.id,
        }
      : null);

  const selectedFolderName =
    pendingFolder?.name ||
    browseState.currentFolder?.name ||
    (pendingFolder?.id ? pendingFolder.id : null) ||
    'Select a folder';
  const statusFolderLabel = confirmFolder ? selectedFolderName : 'No folder selected';
  const mediaCount =
    typeof browseState.currentFolder?.mediaCount === 'number' ? browseState.currentFolder.mediaCount : null;

  const confirmCurrentFolder = () => {
    if (!confirmFolder) return;
    onSelectFolder({
      id: confirmFolder.id,
      name: confirmFolder.name,
      breadcrumbs: browseState.breadcrumbs,
      mediaCount,
      selectedFileIds: [],
      mediaTypeFilter: 'all',
    });
    onClose();
  };

  useEffect(() => {
    if (!open) return undefined;

    const marker = { galleryDriveFolderPicker: true };
    window.history.pushState(marker, '');
    const onPopState = () => {
      // Keep the picker open on Android/browser back; only Close dismisses it.
      window.history.pushState(marker, '');
    };
    window.addEventListener('popstate', onPopState);

    return () => {
      window.removeEventListener('popstate', onPopState);
    };
  }, [open]);

  return (
    <Transition show={open} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={() => {}}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-slate-950/55 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto p-0 sm:p-6">
          <div className="flex min-h-full items-center justify-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 scale-95 translate-y-2"
              enterTo="opacity-100 scale-100 translate-y-0"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 scale-100 translate-y-0"
              leaveTo="opacity-0 scale-95 translate-y-2"
            >
              <Dialog.Panel className="mx-auto flex h-[100dvh] w-full max-w-3xl flex-col overflow-hidden bg-white shadow-2xl sm:h-[calc(100dvh-3rem)] sm:rounded-[2rem]">
                <header className="shrink-0 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6 sm:py-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <FaGoogleDrive />
                      <div className="min-w-0">
                        <Dialog.Title className="truncate text-sm font-black text-slate-950 sm:text-base">
                          Google Drive Import
                        </Dialog.Title>
                        <p className="truncate text-xs text-slate-500 sm:text-sm">Browse and confirm a source folder</p>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        className="hidden h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 sm:inline-flex"
                        onClick={() => loadFolders(currentParentId, { syncPending: false })}
                        disabled={browseState.loading}
                      >
                        {browseState.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        {browseState.loading ? 'Refreshing...' : 'Refresh'}
                      </button>
                      <button
                        type="button"
                        aria-label="Close"
                        className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50"
                        onClick={onClose}
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    <button
                      type="button"
                      className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition ${
                        !currentParentId ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                      onClick={() => {
                        setPendingFolder(null);
                        void loadFolders(null);
                      }}
                    >
                      <Home className="h-3.5 w-3.5" />
                      Drive
                    </button>
                    {pathCrumbs.map((crumb, index) => {
                      const isCurrent = index === pathCrumbs.length - 1;

                      return (
                        <Fragment key={`${crumb.id}-${index}`}>
                          <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                          <button
                            type="button"
                            className={`h-8 max-w-[150px] shrink-0 truncate rounded-full px-3 text-xs font-semibold transition sm:max-w-[220px] ${
                              isCurrent
                                ? 'bg-slate-950 text-white'
                                : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
                            }`}
                            onClick={() => {
                              setPendingFolder({ id: crumb.id, name: crumb.name });
                              void loadFolders(crumb.id);
                            }}
                          >
                            {crumb.name}
                          </button>
                        </Fragment>
                      );
                    })}
                  </div>

                  <div className="mt-3 flex min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">Selected: {statusFolderLabel}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {mediaCount === null
                          ? 'This folder only'
                          : `${mediaCount} item${mediaCount === 1 ? '' : 's'}`}
                      </p>
                    </div>
                    <AdminHint title="Import source" label="Import mode hint" className="shrink-0">
                      Import includes media in this folder only. Files inside child folders are not imported.
                    </AdminHint>
                  </div>
                </header>

                <div ref={bodyScrollRef} className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
                  <div className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Contents</p>
                      </div>
                      <button
                        type="button"
                        className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
                        onClick={handleToggleSort}
                        disabled={browseState.loading || browseState.loadingMore}
                        title={folderSort === 'recent' ? 'Sort: recent changes' : 'Sort: name'}
                      >
                        <ArrowUpDown className="h-4 w-4" />
                        {folderSort === 'recent' ? 'Recent' : 'Name'}
                      </button>
                    </div>

                    <label className="relative mt-4 block">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search this folder..."
                        className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm font-medium outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100"
                      />
                    </label>
                  </div>

                  {browseState.error ? (
                    <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                      {browseState.error}
                    </div>
                  ) : null}

                  <div className="mt-3 space-y-2 pb-4">
                    {browseState.loading && browseState.folders.length === 0 && browseState.files.length === 0 ? (
                      <div className="grid place-items-center rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading folder...
                        </div>
                      </div>
                    ) : null}

                    {filteredFolders.map((folder) => (
                      <DriveListRow
                        key={folder.id}
                        icon={<Folder className="h-5 w-5" />}
                        title={folder.name}
                        selected={pendingFolder?.id === folder.id || selectedFolderId === folder.id}
                        trailing={<ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-slate-500" />}
                        onClick={() => navigateIntoFolder(folder)}
                      />
                    ))}

                    {filteredFiles.map((file) => {
                      const isVideo = file.kind === 'video';
                      return (
                        <DriveListRow
                          key={file.id}
                          icon={isVideo ? <FileVideo className="h-5 w-5" /> : <FileImage className="h-5 w-5" />}
                          title={file.name}
                          subtitle={isVideo ? 'Video' : 'Image'}
                        />
                      );
                    })}

                    {!browseState.loading && filteredFolders.length === 0 && filteredFiles.length === 0 ? (
                      <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center">
                        <p className="font-bold text-slate-800">This folder is empty</p>
                        <p className="mt-1 text-sm text-slate-500">
                          {normalizedQuery ? 'Try a different search term.' : 'No folders or media in this location.'}
                        </p>
                      </div>
                    ) : null}

                    <div ref={loadMoreSentinelRef} className="h-8" />

                    {browseState.loadingMore ? (
                      <div className="flex justify-center py-3">
                        <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Loading more files...
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                <footer className="shrink-0 border-t border-slate-200 bg-white/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:px-6">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1 sm:max-w-md">
                      <p className="truncate text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Selected</p>
                      <p className="truncate text-sm font-black text-slate-950">{statusFolderLabel}</p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        className="inline-flex h-11 min-w-[5.5rem] items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
                        onClick={onClose}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-11 min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700 sm:px-5"
                        onClick={confirmCurrentFolder}
                        disabled={!confirmFolder}
                      >
                        <Check className="h-4 w-4" />
                        <span>Use this folder</span>
                      </button>
                    </div>
                  </div>
                </footer>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
