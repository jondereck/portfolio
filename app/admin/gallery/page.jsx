import {
  ArrowUpDown,
  FolderOpen,
  Images,
  LayoutDashboard,
} from 'lucide-react';
import AdminOverviewCard from '@/components/admin/shared/AdminOverviewCard';
import AdminMetricCard from '@/components/admin/shared/AdminMetricCard';
import { getCurrentProfile } from '@/lib/auth/session';
import { buildGalleryRouteHref } from '@/modules/gallery/admin/workspaceConfig';
import { galleryService } from '@/src/modules/gallery/services/galleryService';

const galleryOverviewCards = [
  {
    title: 'Advanced Gallery Workspace',
    description: 'Open the integrated all-in-one gallery workspace for power workflows.',
    href: buildGalleryRouteHref('workspace'),
    icon: LayoutDashboard,
    badge: 'Workspace',
    accent: 'slate',
  },
  {
    title: 'Manage Albums',
    description: 'Open the album management page to create, select, publish, and remove albums.',
    href: buildGalleryRouteHref('albums'),
    icon: FolderOpen,
    badge: 'Library',
    accent: 'emerald',
  },
  {
    title: 'Manage Media',
    description: 'Open the media intake page to upload files and import Google Drive media into the selected album.',
    href: buildGalleryRouteHref('media'),
    icon: Images,
    badge: 'Intake',
    accent: 'sky',
  },
  {
    title: 'Arrange Media',
    description: 'Open the dedicated ordering workspace for drag-and-drop sequencing and save controls.',
    href: buildGalleryRouteHref('arrange'),
    icon: ArrowUpDown,
    badge: 'Order',
    accent: 'amber',
  },
];

function formatAlbumHint(totalAlbums) {
  if (totalAlbums === 1) {
    return '1 album in this library';
  }

  return `${totalAlbums} albums in this library`;
}

export default async function GalleryAdminPage() {
  const profile = await getCurrentProfile();
  const albums = await galleryService.listAlbums(profile?.id ?? 1, true);
  const totalAlbums = albums.length;
  const publishedAlbums = albums.filter((album) => album.isPublished).length;
  const totalMedia = albums.reduce((sum, album) => sum + (album._count?.photos ?? 0), 0);
  const draftAlbums = Math.max(totalAlbums - publishedAlbums, 0);

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-3 gap-3">
        <AdminMetricCard
          label="Albums"
          value={totalAlbums}
          hint={formatAlbumHint(totalAlbums)}
        />
        <AdminMetricCard
          label="Published"
          value={publishedAlbums}
          hint={draftAlbums > 0 ? `${draftAlbums} still in draft` : 'All albums are publish-ready'}
        />
        <AdminMetricCard
          label="Media"
          value={totalMedia}
          hint="Total items indexed across the gallery module"
        />
      </section>

      <section className="grid auto-rows-fr grid-cols-2 gap-3 xl:grid-cols-3">
        {galleryOverviewCards.map((card) => (
          <AdminOverviewCard key={card.title} className="h-full" {...card} />
        ))}
      </section>
    </div>
  );
}
