# Admin skeleton loaders

## Goal
Show skeleton placeholders for the admin sidebar and page content while auth/nav and route data load after login and on admin navigation.

## Design
- Add a shared `Skeleton` UI primitive (pulse blocks).
- While `moduleAccess` is loading in `AdminShell`, render sidebar nav/account skeletons instead of empty/partial nav.
- Add `app/admin/loading.jsx` so every admin route transition shows content card skeletons (login excluded via layout).

## Out of scope
- Per-panel gallery CMS skeletons
- Replacing existing global loading overlay for logout
