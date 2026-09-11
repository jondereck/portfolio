'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Info as InfoLucide, Plus as PlusLucide, Save as SaveLucide, Trash2 as Trash2Lucide } from 'lucide-react';
import { toast } from 'sonner';
import ConfirmModal from '@/components/ConfirmModal';
import { fetchJson, GalleryEmptyState, GalleryPageHeader, GalleryPanelCard, buttonStyles, ghostButtonStyles, inputStyles } from './galleryAdminShared';
import {
  GalleryAlbumInspectorPanel,
  GalleryAlbumSwitchSheet,
  GalleryAlbumsSidebar,
  GalleryCmsHeader,
  GalleryCmsModal,
  GalleryCmsShell,
  GalleryMobileTabs,
} from './cms';

const mobileTabs = [
  { id: 'manage', label: 'Manage', icon: SaveLucide },
  { id: 'create', label: 'Create', icon: PlusLucide },
  { id: 'details', label: 'Details', icon: InfoLucide },
];

const createIcon = (path, viewBox = '0 0 24 24') => {
  return function Icon({ className = 'h-5 w-5' }) {
    return (
      <svg
        viewBox={viewBox}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
      >
        {path}
      </svg>
    );
  };
};

const PlusIcon = createIcon(
  <>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </>,
);
const SaveIcon = createIcon(
  <>
    <path d="M5 4h11l3 3v13H5z" />
    <path d="M8 4v5h8" />
    <rect x="8" y="14" width="8" height="5" rx="1" />
  </>,
);
const TrashIcon = createIcon(
  <>
    <path d="M4 7h16" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
    <path d="M6 7l1 12h10l1-12" />
    <path d="M9 7V4h6v3" />
  </>,
);
const LinkIcon = createIcon(
  <>
    <path d="M10.5 13.5l3-3" />
    <path d="M7.5 15.5l-1.4 1.4a3.2 3.2 0 1 1-4.5-4.5L3 11" />
    <path d="M16.5 8.5l1.4-1.4a3.2 3.2 0 0 1 4.5 4.5L21 13" />
  </>,
);
const FileTextIcon = createIcon(
  <>
    <path d="M7 3h7l5 5v13H7z" />
    <path d="M14 3v5h5" />
    <path d="M10 12h6" />
    <path d="M10 16h6" />
  </>,
);
const RefreshIcon = createIcon(
  <>
    <path d="M20 11a8 8 0 0 0-14.8-3" />
    <path d="M4 4v5h5" />
    <path d="M4 13a8 8 0 0 0 14.8 3" />
    <path d="M20 20v-5h-5" />
  </>,
);

function SectionCard({ title, subtitle, icon: Icon, children }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-4">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h3 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">{title}</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function ToggleRow({ id, title, description, checked, onChange, disabled = false }) {
  return (
    <label
      htmlFor={id}
      className={`flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 transition dark:border-slate-800 dark:bg-slate-950/40 ${
        disabled ? 'opacity-60' : 'hover:border-slate-300 dark:hover:border-slate-700'
      }`}
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-slate-900 dark:text-slate-50">{title}</span>
        <span className="mt-1 block text-sm text-slate-500 dark:text-slate-400">{description}</span>
      </span>

      <span className="relative inline-flex shrink-0 items-center">
        <input
          id={id}
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          onChange={onChange}
          disabled={disabled}
        />
        <span className="h-8 w-14 rounded-full bg-slate-300 shadow-inner transition peer-checked:bg-blue-600 dark:bg-slate-700 dark:peer-checked:bg-blue-500" />
        <span className="pointer-events-none absolute left-1 top-1 h-6 w-6 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-6 dark:bg-slate-950" />
      </span>
    </label>
  );
}

export default function GalleryAlbumsPanel({ controller, embedded = false }) {
  const sidebarCollapsedStorageKey = 'gallery:sidebarCollapsed:v1';
  const [activeTab, setActiveTab] = useState('manage');
  const [createAlbumOpen, setCreateAlbumOpen] = useState(false);
  const [albumSwitchOpen, setAlbumSwitchOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [siteOrigin, setSiteOrigin] = useState('');
  const [blurUnclothyGenerated, setBlurUnclothyGenerated] = useState(true);
  const [manualSidebarCollapsed, setManualSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(sidebarCollapsedStorageKey) === 'true';
  });

  const platformOptions = useMemo(
    () => [
      { value: 'instagram', label: 'Instagram' },
      { value: 'facebook', label: 'Facebook' },
      { value: 'tiktok', label: 'TikTok' },
      { value: 'youtube', label: 'YouTube' },
      { value: 'x', label: 'X' },
      { value: 'linkedin', label: 'LinkedIn' },
      { value: 'website', label: 'Website' },
      { value: 'other', label: 'Other' },
    ],
    [],
  );

  const {
    albums,
    selectedAlbum,
    selectedAlbumId,
    loadingAlbums,
    photos,
    albumForm,
    setAlbumForm,
    savingAlbum,
    detailsForm,
    setDetailsForm,
    detailsDirty,
    setDetailsDirty,
    savingDetails,
    createAlbum,
    deleteAlbum,
    saveAlbumDetails,
    setSelectedAlbumId,
  } = controller;

  useEffect(() => {
    setSiteOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(sidebarCollapsedStorageKey, manualSidebarCollapsed ? 'true' : 'false');
  }, [manualSidebarCollapsed, sidebarCollapsedStorageKey]);

  const loadGallerySettings = useCallback(async () => {
    try {
      const payload = await fetchJson('/api/gallery/settings', { method: 'GET' });
      setBlurUnclothyGenerated(payload?.blurUnclothyGenerated !== false);
    } catch {
      setBlurUnclothyGenerated(true);
    }
  }, []);

  useEffect(() => {
    void loadGallerySettings();
  }, [loadGallerySettings]);

  useEffect(() => {
    const onUpdated = () => {
      void loadGallerySettings();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('gallery:settings-updated', onUpdated);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('gallery:settings-updated', onUpdated);
      }
    };
  }, [loadGallerySettings]);

  const albumCountLabel = useMemo(() => {
    if (!selectedAlbum) return '';
    const count =
      typeof selectedAlbum?._count?.photos === 'number'
        ? selectedAlbum._count.photos
        : Array.isArray(photos)
          ? photos.length
          : null;
    return typeof count === 'number' ? `${count} items` : '';
  }, [photos, selectedAlbum]);

  const selectedShareLink = useMemo(
    () =>
      selectedAlbum?.shareLinkEnabled && selectedAlbum?.shareToken
        ? `${siteOrigin}/gallery/${selectedAlbum.slug}?share=${selectedAlbum.shareToken}`
        : '',
    [selectedAlbum, siteOrigin],
  );

  const profileLinks = Array.isArray(detailsForm?.profileLinks) ? detailsForm.profileLinks : [];

  const isValidHttpUrl = (value) => {
    if (typeof value !== 'string') return false;
    const trimmed = value.trim();
    if (!/^https?:\/\//i.test(trimmed)) return false;

    try {
      // eslint-disable-next-line no-new
      new URL(trimmed);
      return true;
    } catch {
      return false;
    }
  };

  return (
    <>
      <ConfirmModal
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title={`Delete ${selectedAlbum?.name || 'album'}?`}
        description="This will delete the album and all media in it. This action cannot be undone."
        confirmLabel="Delete album"
        destructive
        onConfirm={async () => {
          if (!selectedAlbum) return;
          await deleteAlbum(selectedAlbum.id, { skipConfirm: true });
          setConfirmDeleteOpen(false);
        }}
      >
        {selectedAlbum ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/40">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
              Selected album
            </p>
            <p className="mt-2 truncate text-sm font-medium text-slate-900 dark:text-slate-50">{selectedAlbum.name}</p>
            {albumCountLabel ? <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{albumCountLabel}</p> : null}
          </div>
        ) : null}
      </ConfirmModal>

      <GalleryAlbumSwitchSheet
        open={albumSwitchOpen}
        onClose={() => setAlbumSwitchOpen(false)}
        albums={albums}
        selectedAlbumId={selectedAlbumId}
        onCreateNew={() => {
          setAlbumSwitchOpen(false);
          setCreateAlbumOpen(true);
          setActiveTab('create');
        }}
        onConfirm={(albumId) => {
          setSelectedAlbumId(albumId);
          setAlbumSwitchOpen(false);
          setActiveTab('manage');
        }}
      />

      <GalleryCmsModal
        open={createAlbumOpen}
        onOpenChange={setCreateAlbumOpen}
        title="Create album"
        description="Create a new album without leaving the Gallery CMS shell."
      >
        <form id="gallery-albums-create-form" className="space-y-3" onSubmit={createAlbum}>
          <input
            className={inputStyles}
            placeholder="Album name"
            value={albumForm.name}
            onChange={(event) => setAlbumForm((previous) => ({ ...previous, name: event.target.value }))}
            required
          />
          <input
            className={inputStyles}
            placeholder="Slug (optional)"
            value={albumForm.slug}
            onChange={(event) => setAlbumForm((previous) => ({ ...previous, slug: event.target.value }))}
          />
          <textarea
            className="min-h-24 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950"
            rows={4}
            placeholder="Description"
            value={albumForm.description}
            onChange={(event) => setAlbumForm((previous) => ({ ...previous, description: event.target.value }))}
          />
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              checked={albumForm.isPublished}
              onChange={(event) => setAlbumForm((previous) => ({ ...previous, isPublished: event.target.checked }))}
            />
            Publish immediately
          </label>
          <button className={`${buttonStyles} w-full`} disabled={savingAlbum}>
            {savingAlbum ? 'Creating...' : 'Create Album'}
          </button>
        </form>
      </GalleryCmsModal>

      {!embedded ? (
        <GalleryPageHeader
          eyebrow="Album Management"
          title="Albums"
          description="Create, select, publish, and remove albums with a cleaner workspace."
        />
      ) : null}

      <GalleryCmsShell
        embedded={embedded}
        sidebarCollapsed={manualSidebarCollapsed}
        header={
          <GalleryCmsHeader
            albumName={selectedAlbum?.name || 'Albums'}
            albumCountLabel={albumCountLabel}
            searchValue=""
            onSearchChange={() => {}}
            showSearch={false}
            showUploadButton={false}
            desktopActions={
              <>
                <button
                  type="button"
                  onClick={() => setCreateAlbumOpen(true)}
                  className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-50 dark:hover:bg-slate-800"
                >
                  <PlusLucide className="h-4 w-4" />
                  New album
                </button>
                <button
                  type="submit"
                  form="gallery-albums-manage-form"
                  disabled={!selectedAlbum || !detailsDirty || savingDetails}
                  className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-50 dark:hover:bg-slate-800"
                >
                  <SaveLucide className="h-4 w-4" />
                  {savingDetails ? 'Saving...' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteOpen(true)}
                  disabled={!selectedAlbum}
                  className="inline-flex h-11 items-center gap-2 rounded-2xl bg-red-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-red-500 disabled:opacity-60"
                >
                  <Trash2Lucide className="h-4 w-4" />
                  Delete
                </button>
              </>
            }
            mobileActions={
              <button
                type="button"
                onClick={() => setActiveTab('create')}
                className="inline-flex h-10 items-center gap-2 rounded-2xl bg-slate-900 px-3 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
              >
                <PlusLucide className="h-4 w-4" />
                New
              </button>
            }
          />
        }
        sidebar={
          <GalleryAlbumsSidebar
            albums={albums}
            selectedAlbumId={selectedAlbumId}
            loadingAlbums={loadingAlbums}
            onSelectAlbum={(albumId) => {
              setSelectedAlbumId(albumId);
              setActiveTab('manage');
            }}
            onCreateAlbumClick={() => setCreateAlbumOpen(true)}
            mobileAlbumName={selectedAlbum?.name}
            mobileAlbumCountLabel={albumCountLabel}
            onMobileOpenFilter={undefined}
            onMobileOpenImport={undefined}
            onMobileFocusSearch={undefined}
            onMobileOpenSwitch={() => setAlbumSwitchOpen(true)}
            showMobileChips={false}
            blurUnclothyGenerated={blurUnclothyGenerated}
            collapsed={manualSidebarCollapsed}
            onToggleCollapsed={() => setManualSidebarCollapsed((current) => !current)}
          />
        }
        mobileTabs={<GalleryMobileTabs activeTab={activeTab} onChange={setActiveTab} tabs={mobileTabs} />}
        inspector={
          selectedAlbum ? (
            <GalleryAlbumInspectorPanel
              album={selectedAlbum}
              photosCount={Array.isArray(photos) ? photos.length : null}
              shareLink={selectedShareLink}
              siteOrigin={siteOrigin}
              blurUnclothyGenerated={blurUnclothyGenerated}
            />
          ) : null
        }
        main={
          <main className="min-w-0 bg-white dark:bg-slate-900">
            {activeTab === 'create' ? (
              <section className="space-y-4 px-4 py-4 sm:px-5 lg:hidden">
                <GalleryPanelCard title="Create album" description="Create a new album without exposing media intake or ordering tools.">
                  <form className="space-y-3" onSubmit={createAlbum}>
                    <input
                      className={inputStyles}
                      placeholder="Album name"
                      value={albumForm.name}
                      onChange={(event) => setAlbumForm((previous) => ({ ...previous, name: event.target.value }))}
                      required
                    />
                    <input
                      className={inputStyles}
                      placeholder="Slug (optional)"
                      value={albumForm.slug}
                      onChange={(event) => setAlbumForm((previous) => ({ ...previous, slug: event.target.value }))}
                    />
                    <textarea
                      className="min-h-24 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950"
                      rows={4}
                      placeholder="Description"
                      value={albumForm.description}
                      onChange={(event) => setAlbumForm((previous) => ({ ...previous, description: event.target.value }))}
                    />
                    <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                      <input
                        type="checkbox"
                        checked={albumForm.isPublished}
                        onChange={(event) =>
                          setAlbumForm((previous) => ({ ...previous, isPublished: event.target.checked }))
                        }
                      />
                      Publish immediately
                    </label>
                    <button className={`${buttonStyles} w-full`} disabled={savingAlbum}>
                      {savingAlbum ? 'Creating...' : 'Create Album'}
                    </button>
                  </form>
                </GalleryPanelCard>
              </section>
            ) : activeTab === 'details' ? (
              <section className="space-y-4 px-4 py-4 sm:px-5 lg:hidden">
                <GalleryPanelCard title="Album details" description="Quick overview of the selected album.">
                  {selectedAlbum ? (
                    <div className="space-y-3 text-sm text-slate-700 dark:text-slate-200">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500 dark:text-slate-400">Status</span>
                        <span className="font-medium text-slate-900 dark:text-slate-50">
                          {selectedAlbum.isPublished ? 'Published' : 'Draft'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500 dark:text-slate-400">Cover</span>
                        <span className="font-medium text-slate-900 dark:text-slate-50">
                          {selectedAlbum.coverPhotoId ? 'Assigned' : 'None'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500 dark:text-slate-400">Slug</span>
                        <span className="font-medium text-slate-900 dark:text-slate-50">{selectedAlbum.slug || '—'}</span>
                      </div>
                      {selectedShareLink ? (
                        <div className="space-y-2 pt-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                            Share link
                          </p>
                          <input
                            className={inputStyles}
                            readOnly
                            value={selectedShareLink}
                            onFocus={(event) => event.currentTarget.select()}
                          />
                          <button
                            type="button"
                            className={ghostButtonStyles}
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(selectedShareLink);
                                toast.success('Share link copied');
                              } catch {
                                toast.error('Unable to copy share link');
                              }
                            }}
                          >
                            Copy share link
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <GalleryEmptyState title="Select an album" description="Choose an album to see its summary." />
                  )}
                </GalleryPanelCard>
              </section>
            ) : (
              <section
                className={`space-y-4 px-3 py-3 pb-40 sm:px-4 lg:block lg:px-4 lg:py-4 lg:pb-4 ${activeTab !== 'manage' ? 'hidden lg:block' : ''}`}
              >
                <GalleryPanelCard
                  title={selectedAlbum ? `Manage ${selectedAlbum.name}` : 'Current album'}
                  description="Update the selected album name, metadata, publish state, or delete it entirely."
                >
                  {selectedAlbum ? (
                    <>
                      <form
                        id="gallery-albums-manage-form"
                        className="space-y-5"
                        onSubmit={saveAlbumDetails}
                      >
        

                        <SectionCard
                          title="Basic details"
                          subtitle="Core album information in a cleaner and more readable form."
                          icon={FileTextIcon}
                        >
                          <div className="grid gap-4 md:grid-cols-2">
                            <div>
                              <label className="mb-2 block text-sm font-medium text-slate-600 dark:text-slate-300">
                                Album name
                              </label>
                              <input
                                className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-slate-400 disabled:opacity-60 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-50 dark:focus:border-slate-600"
                                value={detailsForm.name}
                                onChange={(event) => {
                                  setDetailsForm((previous) => ({ ...previous, name: event.target.value }));
                                  setDetailsDirty(true);
                                }}
                                placeholder="Album name"
                                required
                                disabled={savingDetails}
                              />
                            </div>

                            <div>
                              <label className="mb-2 block text-sm font-medium text-slate-600 dark:text-slate-300">
                                Slug
                              </label>
                              <input
                                className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-slate-400 disabled:opacity-60 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-50 dark:focus:border-slate-600"
                                value={detailsForm.slug}
                                onChange={(event) => {
                                  setDetailsForm((previous) => ({ ...previous, slug: event.target.value }));
                                  setDetailsDirty(true);
                                }}
                                placeholder="album-slug"
                                disabled={savingDetails}
                              />
                            </div>
                          </div>

                          <div className="mt-4">
                            <label className="mb-2 block text-sm font-medium text-slate-600 dark:text-slate-300">
                              Description
                            </label>
                            <textarea
                              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 disabled:opacity-60 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-50 dark:focus:border-slate-600"
                              rows={4}
                              value={detailsForm.description}
                              onChange={(event) => {
                                setDetailsForm((previous) => ({ ...previous, description: event.target.value }));
                                setDetailsDirty(true);
                              }}
                              placeholder="Album description"
                              disabled={savingDetails}
                            />
                          </div>
                        </SectionCard>

                        <SectionCard
                          title="Publishing & sharing"
                          subtitle="Control visibility and private sharing in one place."
                          icon={LinkIcon}
                        >
                          <div className="space-y-4">
                            <ToggleRow
                              id="gallery-albums-published"
                              title="Published"
                              description="Make this album visible to your audience."
                              checked={detailsForm.isPublished}
                              onChange={(event) => {
                                setDetailsForm((previous) => ({ ...previous, isPublished: event.target.checked }));
                                setDetailsDirty(true);
                              }}
                              disabled={savingDetails}
                            />
                            <ToggleRow
                              id="gallery-albums-share-link"
                              title="Enable share link"
                              description="Allow anyone with the link to view this album."
                              checked={detailsForm.shareLinkEnabled}
                              onChange={(event) => {
                                setDetailsForm((previous) => ({ ...previous, shareLinkEnabled: event.target.checked }));
                                setDetailsDirty(true);
                              }}
                              disabled={savingDetails}
                            />
                          </div>
                        </SectionCard>

                        <SectionCard
                          title="Profile links"
                          subtitle="Add social profile links related to this album."
                          icon={LinkIcon}
                        >
                          <div className="space-y-3">
                            {profileLinks.map((entry, index) => {
                              const urlValue = entry?.url ?? '';
                              const urlValid = !urlValue || isValidHttpUrl(urlValue);

                              return (
                                <div
                                  key={`${entry.platform}-${index}`}
                                  className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-[180px_minmax(0,1fr)_44px] dark:border-slate-800 dark:bg-slate-950/40"
                                >
                                  <select
                                    className="h-12 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 disabled:opacity-60 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-50 dark:focus:border-slate-600"
                                    value={entry.platform}
                                    onChange={(event) => {
                                      const nextPlatform = event.target.value;
                                      setDetailsForm((previous) => ({
                                        ...previous,
                                        profileLinks: profileLinks.map((linkEntry, entryIndex) =>
                                          entryIndex === index ? { ...linkEntry, platform: nextPlatform } : linkEntry,
                                        ),
                                      }));
                                      setDetailsDirty(true);
                                    }}
                                    disabled={savingDetails}
                                    aria-label="Profile link platform"
                                  >
                                    {platformOptions.map((option) => (
                                      <option key={option.value} value={option.value}>
                                        {option.label}
                                      </option>
                                    ))}
                                  </select>

                                  <div className="space-y-1">
                                    <input
                                      className={`h-12 w-full rounded-xl border bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-slate-400 disabled:opacity-60 dark:bg-slate-950 dark:text-slate-50 ${
                                        urlValid
                                          ? 'border-slate-200 dark:border-slate-800 dark:focus:border-slate-600'
                                          : 'border-rose-400 focus:border-rose-500 dark:border-rose-500 dark:focus:border-rose-400'
                                      }`}
                                      value={urlValue}
                                      onChange={(event) => {
                                        const nextUrl = event.target.value;
                                        setDetailsForm((previous) => ({
                                          ...previous,
                                          profileLinks: profileLinks.map((entryItem, entryIndex) =>
                                            entryIndex === index ? { ...entryItem, url: nextUrl } : entryItem,
                                          ),
                                        }));
                                        setDetailsDirty(true);
                                      }}
                                      placeholder="https://instagram.com/..."
                                      disabled={savingDetails}
                                      aria-label="Profile link URL"
                                    />
                                    {!urlValid ? (
                                      <p className="text-[11px] font-medium text-rose-600 dark:text-rose-300">
                                        Use a valid http/https URL.
                                      </p>
                                    ) : null}
                                  </div>

                                  <button
                                    type="button"
                                    className="flex h-12 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-100 disabled:opacity-60 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900"
                                    aria-label="Delete profile link"
                                    onClick={() => {
                                      setDetailsForm((previous) => ({
                                        ...previous,
                                        profileLinks: profileLinks.filter((_, entryIndex) => entryIndex !== index),
                                      }));
                                      setDetailsDirty(true);
                                    }}
                                    disabled={savingDetails}
                                  >
                                    <TrashIcon className="h-4 w-4" />
                                  </button>
                                </div>
                              );
                            })}
                          </div>

                          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                            <button
                              type="button"
                              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-800"
                              onClick={() => {
                                setDetailsForm((previous) => {
                                  const currentLinks = Array.isArray(previous?.profileLinks) ? previous.profileLinks : [];
                                  if (currentLinks.length >= 12) {
                                    return previous;
                                  }

                                  return {
                                    ...previous,
                                    profileLinks: [...currentLinks, { platform: 'instagram', label: '', url: '' }],
                                  };
                                });
                                setDetailsDirty(true);
                              }}
                              disabled={savingDetails || profileLinks.length >= 12}
                            >
                              <PlusIcon className="h-4 w-4" />
                              {profileLinks.length === 0 ? 'Add first link' : 'Add link'}
                            </button>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{profileLinks.length}/12 links saved.</p>
                          </div>
                        </SectionCard>

                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div className="flex flex-wrap gap-3">
                            <button
                              type="submit"
                              disabled={!detailsDirty || savingDetails}
                              className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60 xl:hidden"
                            >
                              <SaveIcon className="h-4 w-4" />
                              {savingDetails ? 'Saving...' : 'Save album'}
                            </button>

                            <button
                              type="button"
                              disabled={!detailsDirty || savingDetails}
                              onClick={() => {
                                setDetailsForm(selectedAlbum);
                                setDetailsDirty(false);
                              }}
                              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                            >
                              <RefreshIcon className="h-4 w-4" />
                              Reset changes
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => setConfirmDeleteOpen(true)}
                            className="inline-flex items-center gap-2 rounded-2xl border border-red-200 bg-white px-5 py-3 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60 dark:border-red-900/40 dark:bg-slate-900 dark:text-red-300 dark:hover:bg-red-950/30 xl:hidden"
                          >
                            <TrashIcon className="h-4 w-4" />
                            Delete album
                          </button>
                        </div>
                      </form>
                    </>
                  ) : (
                    <GalleryEmptyState title="Select an album" description="Choose an album to rename it or update its metadata." />
                  )}
                </GalleryPanelCard>
              </section>
            )}
          </main>
        }
      />

      {activeTab === 'manage' ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 p-3 backdrop-blur lg:hidden dark:border-slate-800 dark:bg-slate-900/95">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">
                {selectedAlbum ? selectedAlbum.name : 'Select an album'}
              </p>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                {savingDetails ? 'Saving...' : detailsDirty ? 'Unsaved changes' : 'No changes'}
              </p>
            </div>
            <button
              type="submit"
              form="gallery-albums-manage-form"
              disabled={!selectedAlbum || !detailsDirty || savingDetails}
              className="inline-flex h-11 shrink-0 items-center gap-2 rounded-2xl bg-slate-900 px-4 text-sm font-medium text-white shadow-sm transition disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900"
            >
              <SaveLucide className="h-4 w-4" />
              {savingDetails ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
