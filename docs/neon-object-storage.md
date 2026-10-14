# Neon Object Storage (dual-provider)

## Status / decision (2026-10-14)

- **Active:** Phase 1 — **all new uploads** go to Neon Object Storage by default (`resolveActiveUploadProvider`). Missing `AWS_*` fails the upload instead of silently using Cloudinary.
- **Emergency only:** `MEDIA_STORAGE_PROVIDER=cloudinary` re-enables Cloudinary for new uploads.
- **Deferred:** Do **not** migrate or delete existing Cloudinary media for now. Legacy `res.cloudinary.com` URLs stay as-is and keep serving.
- Phase 2 copy script remains in the repo if we revisit later; it is **not** part of the current rollout.

## Project

- Neon project: `porfolio` (`dark-morning-42993355`)
- Region: `aws-us-east-1` (Object Storage supported)
- Bucket: `public-assets` (`public_read`)

## Provision bucket + credentials

```bash
npx neon link          # select project porfolio + production branch
npx neon deploy        # applies neon.ts buckets and writes AWS_* to .env.local
```

Required env (also set on Vercel):

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_ENDPOINT_URL_S3`
- `AWS_REGION` (usually `us-east-1`)
- Optional: `NEON_OBJECT_STORAGE_BUCKET=public-assets`
- Optional: `MEDIA_STORAGE_PROVIDER=neon` (force Neon; default auto-detects Neon when configured)

Keep Cloudinary env vars — still required for existing gallery/portfolio assets.

## After Vercel env is set

1. Redeploy production.
2. Smoke-test: new gallery/admin upload → Neon URL; old Cloudinary item still loads.
3. Do not run the migrate script unless the team explicitly reopens Phase 2.

## Optional later (Phase 2 — not scheduled)

Cost check and migrate tooling (dry-run first). Only use if we decide to leave Cloudinary entirely:

```bash
npm run storage:cost-report
# or GET /api/admin/storage/cost-report (authenticated admin)

npm run storage:migrate-cloudinary
npm run storage:migrate-cloudinary -- --apply --limit=20
```
