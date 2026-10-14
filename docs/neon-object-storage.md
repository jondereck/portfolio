# Neon Object Storage (dual-provider)

## Status

- **Phase 1:** New uploads prefer Neon Object Storage when `AWS_*` env vars are set. Existing Cloudinary URLs keep working.
- **Phase 2:** Optional copy job (`npm run storage:migrate-cloudinary`) after cost go/no-go. Does not delete Cloudinary assets.

## Project

- Neon project: `porfolio` (`dark-morning-42993355`)
- Region: `aws-us-east-1` (Object Storage supported)

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

## Cost check before Phase 2

```bash
npm run storage:cost-report
# or GET /api/admin/storage/cost-report (authenticated admin)
```

## Phase 2 migrate (dry-run first)

```bash
npm run storage:migrate-cloudinary
npm run storage:migrate-cloudinary -- --apply --limit=20
```
