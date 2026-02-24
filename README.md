# Menuvium

Monorepo for Menuvium:
- `apps/web`: Next.js (App Router) frontend, deployed on Vercel
- `services/api`: FastAPI backend, deployed on Railway (with Postgres)
- `services/ar-worker-mac`: macOS AR worker (video → USDZ + GLB)

## Production architecture (current)

- Web: Vercel (`apps/web`)
  - Calls the API via same-origin proxy route: `https://www.menuvium.com/api/*`
- API: Railway (`services/api`) + Railway Postgres
- Auth: AWS Cognito (Hosted UI)
- Storage: AWS S3 (required for uploads in production)
- AR generation: optional macOS worker (`services/ar-worker-mac`)

## Deploy (Vercel + Railway)

### Web (Vercel)

Project settings:
- Root Directory: `apps/web`
- Node: 20.x

Production env vars:
- `NEXT_PUBLIC_API_URL=/api`
- `API_INTERNAL_URL=https://api.menuvium.com`
- `NEXT_PUBLIC_USER_POOL_ID=...`
- `NEXT_PUBLIC_USER_POOL_CLIENT_ID=...`
- `NEXT_PUBLIC_COGNITO_DOMAIN=...` (no `https://`, e.g. `menuvium.auth.us-east-1.amazoncognito.com`)
- `NEXT_PUBLIC_AUTH_REDIRECT_SIGNIN=https://www.menuvium.com/login`
- `NEXT_PUBLIC_AUTH_REDIRECT_SIGNOUT=https://www.menuvium.com/login`

### API (Railway)

Service root directory: `services/api` (Dockerfile-based)

Required env vars:
- `DATABASE_URL=...` (Railway Postgres)
- `RUN_MIGRATIONS=1`
- `UVICORN_RELOAD=0`
- `CORS_ORIGINS=https://www.menuvium.com,https://menuvium.com`
- `AWS_REGION=...`
- `COGNITO_USER_POOL_ID=...`
- `COGNITO_CLIENT_ID=...`

Uploads (production):
- `LOCAL_UPLOADS=0`
- `S3_BUCKET_NAME=...`
- `AWS_ACCESS_KEY_ID=...`
- `AWS_SECRET_ACCESS_KEY=...`

Optional (menu import):
- `OPENAI_API_KEY=...`
- `OPENAI_MODEL=gpt-4o-mini`
- `OCR_MODE=tesseract` (or `textract` if you also configure AWS Textract + S3)

Optional (AR jobs):
- `AR_WORKER_TOKEN=...` (random secret; required if you run the worker)

## AR worker (macOS)

Uploading a dish rotation video queues a job in Postgres (`pending` → `processing` → `ready`). If the worker is not running, jobs are **not lost**; they remain `pending`.

Run on a Mac:
```bash
cd services/ar-worker-mac
export MENUVIUM_API_BASE="https://api.menuvium.com"
export MENUVIUM_WORKER_TOKEN="PASTE_RAILWAY_AR_WORKER_TOKEN"
./run-prod.sh
```

If you see turntable/background geometry in the output, try cropping:
```bash
export MENUVIUM_AR_CROP="0.85"
./run-prod.sh
```

## Local development

See `docs/SETUP.md`.

