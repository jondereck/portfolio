# Dev log

Session changelog for this repo. **Newest entries first.** Format: date · what · why/impact · key paths.

Only log work that actually landed (commit or verified local change). Do not invent history.

---

## 2026-10-14

- **Security Session TTL for Google/Neon** — Session TTL + Force Logout now apply to Google/email/OTP admin logins via shared `admin_session` policy cookie (minted on sign-in / OTP / Google establish grant). Admin pages/APIs require it; login redirect checks `adminAccess`. Hover `?` hints on Security settings fields. `lib/server/admin-session.ts`, `lib/auth/session.ts`, `app/api/neon/session/*`, `SecuritySettingsSection.jsx`, `AdminHint.jsx`.
- **Certificates arrange (Featured/Regular)** — Certificates Administration now mirrors Projects: drag reorder across Featured/Regular, Save order, `isFeatured` + `sortOrder` persisted via `/api/certificates/reorder`. Public classic theme shows Featured on top; all themes sort featured → sortOrder. `PortfolioCertificatesArrangeTable.jsx`, `app/api/certificates/reorder/route.ts`, `prisma/schema.prisma`, `lib/certificates.ts`, `Certificates.jsx`.
- **Neon Object Storage (dual-provider)** — New uploads prefer Neon `public-assets` when `AWS_*` is set; existing Cloudinary gallery URLs stay as-is. Added adapter, presign route, ImageUpload via `/api/upload`, schema `storageProvider`/`storageKey`, cost report + Cloudinary→Neon migrate dry-run script. Provisioned bucket on portfolio production (`aws-us-east-1`). `lib/server/object-storage.ts`, `lib/server/uploads.ts`, `neon.ts`, `docs/neon-object-storage.md`.
- **Storage decision noted** — Phase 2 Cloudinary→Neon migrate deferred: keep legacy Cloudinary media; only new uploads go to Neon. Documented in `docs/neon-object-storage.md`.
- **PWA Quick Access once/day** — Mobile install popup dismisses for the calendar day (`localStorage`); permanently hidden after install / standalone. `PwaInstallPrompt.jsx`.
- **About deck swipe-down only** — Highlight stack advances on swipe down only (no swipe up); idle nudge matches down arrow. `MinimalistEditorialPortfolio.jsx`.

## 2026-10-13

- **Gallery continue cross-device sync** — “Continue where you left off” was effectively device-local: viewer-session API only allowed album owners (`canAccessProfile`), client skipped server PUT without `viewerUserId`, and slideshow debounce cancelled pending saves. Fix: allow authenticated users with a valid share token; bootstrap `userId` from `/api/session/status`; pass `share` + `credentials`; flush pending PUT on effect cleanup / close. `viewer-session/route.ts`, `session/status/route.ts`, `app/gallery/[slug]/page.jsx`.

## 2026-10-06

- **Minimalist Editorial skills grid** — Skills cards use `lg:grid-cols-3` and show `skill.image` icons (initials fallback). `MinimalistEditorialPortfolio.jsx`.
- **Certificate category tags** — Soft pill badge (border + `neutral-100` bg) so category labels are readable on white cards. `MinimalistEditorialPortfolio.jsx`.
- **Certificate dialog a11y** — Added screen-reader `DialogTitle` + `DialogDescription` to certificate preview dialogs (clears Radix warnings). Editorial themes + `Certificates.jsx`.
- **Skills/Certificates reputation copy** — Short supporting lines under section headings. `MinimalistEditorialPortfolio.jsx`.
- **Resume download CTA** — Download Resume on Hero, Skills, and Certificates (uses hero secondary CTA or `/resume.pdf`). `MinimalistEditorialPortfolio.jsx`.
- **Section headline de-dupe** — Skills/Experience/Certificates big titles no longer repeat the eyebrow (e.g. Skills → “Craft & stack.”). `MinimalistEditorialPortfolio.jsx`.
- **Skills resume CTA removed** — Download Resume kept on Hero + Certificates only. `MinimalistEditorialPortfolio.jsx`.
- **About “More about me”** — Links to `#certificates` instead of `#contact`. `MinimalistEditorialPortfolio.jsx`.
- **Portfolio header + tech tags** — Selected Work gets “Portfolio.” + supporting line; project cards show stack pills (up to 5). `MinimalistEditorialPortfolio.jsx`.
- **Portfolio pagination** — Selected Work paginates 6 per page (Previous / page / Next), matching Certificates chrome. `MinimalistEditorialPortfolio.jsx`.
- **Mobile scroll density** — Mobile shows 3 projects/certs per page; tighter section padding, shorter media, clamped copy; hero no longer forces full viewport height on small screens. `MinimalistEditorialPortfolio.jsx`.
- **Certificates resume CTA removed** — Download Resume kept on Hero only. `MinimalistEditorialPortfolio.jsx`.
- **Certificate filters mobile** — Category chips are a single horizontal swipe row on small screens (wrap from `sm` up). `MinimalistEditorialPortfolio.jsx`.
- **Floating social dock** — Hide-on-scroll social rail restored for Minimalist Editorial (desktop left / mobile bottom), styled to match neutral editorial UI; uses contact socials + email + resume. `MinimalistEditorialPortfolio.jsx`.
- **About highlights swipe** — Who I Am / What I Do / Tech Focus cards are a snap carousel on mobile; 3-column grid from `md` up. `MinimalistEditorialPortfolio.jsx`.
- **About highlight stack deck** — Mobile About cards stack with peek + swipe left/right (dots); desktop stays 3-up grid. `MinimalistEditorialPortfolio.jsx`.
- **About deck vertical swipe** — Stack swipes up/down; subtle idle nudge + bounce “Swipe” guide; vertical dots. `MinimalistEditorialPortfolio.jsx`.
- **Project image lightbox** — Project card images open a certificate-style preview dialog. `MinimalistEditorialPortfolio.jsx`.
- **Admin gallery thumb fallback** — When Google Drive public thumbnails fail, MediaPreview falls back to the authenticated admin Drive proxy. `MediaPreview.jsx`.

## 2026-09-12

- **Secure session badge** — Smaller gallery header badge; verifies `/api/session/status` on load/focus/interval and on tap (redirects to login if expired). Green “Secure” when authenticated. `app/gallery/page.jsx`.
- **Cinematic counts + one-card swipe** — Removed Photos/Videos/Audio pills under Open Album. Deck swipe snaps one card per gesture (capped drag + no free fling) so it no longer jumps to the end. Focused deck card selects that album so BG/hero match. Deck cards show subtle shadowed media count only (no duplicate album name). Hero copy crossfades (no `mode="wait"`) + mobile stack without `content-between` so auto-next doesn’t blank the title/Open Album. Long-press hides chrome (BG only); tap/Esc restores. `app/gallery/page.jsx`, `app/gallery/CinematicAlbumDeck.jsx`.
- **Gallery hub + admin Drive traffic** — Album list API returns `mediaCount` (photos/videos/audio) in one DB pass; `/gallery` no longer fetches every album’s full photo list for stats. Admin grid thumbnails use Drive `thumbnail` URLs instead of full-file proxy; cache warm uses public `/api/gallery/.../media` (never admin Drive proxy). `galleryRepository.ts`, `galleryService.ts`, `app/gallery/page.jsx`, `MediaPreview.jsx`, `galleryPhotosCache.js`, `app/gallery/[slug]/page.jsx`.
- **Dev log file** — Changelog lives here instead of inside `AGENTS.md`, so agent rules stay separate from growing session history. `DEV_LOG.md`, `AGENTS.md`.
- **Private gallery UX + Manage accordion** — Compact uses cinematic deck cards (no “Private Collection” / cinematic blurb). Cinematic album strip is a snap deck (active larger, neighbors dimmed). Continue hidden when album empty or no resumable session. Manage albums: accordion sections, Save changes when dirty, profile-link icons auto-detect from pasted URL (no platform dropdown). Drive folder picker ignores Android back / backdrop dismiss — Close only. Mobile cinematic: fixed empty-gap/`scrollIntoView` page jump so album cover bg + hero stay visible. Desktop Quick Switch sidebar search bar. Cinematic autoplay 10s + preload next/prev covers; crossfade bg (no wait) to avoid black flash. `app/gallery/page.jsx`, `app/gallery/[slug]/page.jsx`, `GalleryAlbumsPanel.jsx`, `GalleryAlbumsSidebar.jsx`, `GalleryDriveFolderPicker.jsx`, `lib/gallery-profile-links.js`.
- **Drive import chunking (900+)** — Large folder imports no longer die with “without a final result”: client lists media IDs, imports in batches of 25 with continuous progress, prefers Drive `sha256Checksum` over full-file download, `maxDuration=300` on import. `galleryDriveImportBatch.js`, `media-ids` route, `googleDriveAdapter.ts`, `useGalleryAdminController.js`.
- **Album ZIP download progress** — Download ZIP reuses `GalleryBatchProgressModal` (beforeunload + back-block + Cancel). Live Preparing → per-media counter → Creating ZIP; AbortController stops packing. Client packs via manifest + per-item fetch + JSZip. `lib/gallery-album-zip-client.js`, `app/gallery/[slug]/page.jsx`, download routes.
- **Public gallery cache + pagination** — `/gallery/[slug]` reuses CMS `GalleryMediaGridSkeleton`, IndexedDB photo cache + Cache Storage warm (`galleryPhotosCache`), and Media-library pagination (24/48/72). `app/gallery/[slug]/page.jsx`, `galleryPhotosCache.js`.
- **Gallery Viewing Mode 1:1** — Panel matched to reference: 3 equal action columns, green Continue + outlined New Slideshow / Download ZIP, blue density slider, circular header icons. `app/gallery/[slug]/page.jsx`.
- **Subtle video badge** — Media card “Video” label moved off-center to a small bottom-right chip (NSFW also tightened top-right). `GalleryMediaCard.jsx`.
- **Smaller media select marks** — Selection circle / check on media cards reduced to 20×20 (`h-5 w-5`) so they don’t dominate thumbnails. `GalleryMediaCard.jsx`.
- **Collapsed sidebar mark size** — Collapsed sidebar uses square `/logo192.png` JN mark filling the 40×40 control (wide `/jdn_logo.png` lockup was shrinking via object-contain). `CollapsibleSidebar.jsx`.
- **Mobile arrange select vs drag** — On coarse pointers, card drag is disabled until at least one item is selected; select circle always visible on mobile. Reorder via long-press only after selection. Fixes inability to select for Move. `SortableMediaGrid.jsx`, `GalleryMediaCard.jsx`.
- **Video grid thumbnails restored** — Anti-download change left non-Cloudinary videos as empty dark tiles. Thumbnails now try Cloudinary poster → Drive thumbnail → muted first-frame `<video>` fallback. `MediaPreview.jsx`.
- **Web selection bar** — Desktop selection chrome matches compact floating bar (count badge, “media selected” / “Add to album”, album picker, icon actions, clear). **Set cover (image icon) only when exactly one image is selected** (hidden for multi-select, video, audio). Media + Arrange wired. `GallerySelectionActionsPopup.jsx`, `GalleryMediaPanel.jsx`, `GalleryArrangePanel.jsx`.
- **Admin collapsed sidebar logo** — Collapsed desktop sidebar shows `/jdn_logo.png` (click to expand) instead of hamburger; skeleton matched. `components/admin/navigation/CollapsibleSidebar.jsx`, `AdminSidebarSkeleton.jsx`.
- **Media per-page default 24** — Gallery Media “Per page” default/fallback is 24 (was 48). `modules/gallery/admin/GalleryMediaPanel.jsx`.
- **Single-media download blocked** — Only album ZIP download remains. Per-photo download API returns 403; Download buttons removed from gallery viewer + admin media viewer. Thumbnails avoid `<video src>` (poster/placeholder) to reduce IDM overlays; playback/media proxies use protect attrs + `Content-Disposition: inline`. Key: `app/api/gallery/albums/[id]/photos/[photoId]/download/route.ts`, `lib/media-protect.js`, `MediaPreview.jsx`, `app/gallery/[slug]/page.jsx`, `GalleryMediaViewer.jsx`, Drive/media proxy routes.
- **Earlier same day (Gallery CMS)** — Shared album-sidebar collapse key; Arrange ≈ Media CMS chrome; long-press arrange drag; unsaved-order leave prompt; device photo/media cache; workspace header cleanup; auto first-image album cover.
