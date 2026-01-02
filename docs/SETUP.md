# Setup Guide

## Prerequisites
- Docker & Docker Compose
- Node.js 18+ (for local tooling if not using Docker)
- Python 3.11+
- AWS CLI (configured for deploys)

## Running Locally
We use Docker Compose to run the full stack locally. The goal is 1:1 parity with AWS production so local changes transfer cleanly.

### Local/Production Parity Contract
- Use the same environment variable names locally and in AWS.
- Keep service versions aligned (Postgres, Python, Node).
- Run database migrations the same way in all environments.
- Avoid local-only code paths; prefer config flags with identical defaults.
- Keep the request/response surface identical (ports differ, APIs do not).

### Quick Start (Docker)
1. **Configure env**
   - Create `services/api/.env` with your local secrets.
   - (Optional) Create `apps/web/.env.local` if you need custom web env vars.

2. **Start Services**
   ```bash
   docker-compose up --build
   ```
   This starts:
   - Postgres (5432)
   - API (8000)
   - Web (3000)

3. **Access the App**
   - Frontend: `http://localhost:3000`
   - API health: `http://localhost:8000/health`
   - API docs: `http://localhost:8000/docs`

4. **Stop Services**
   ```bash
   docker-compose down
   ```

### Environment Variables
Use a single source of truth for config keys. Create `services/api/.env` and `apps/web/.env.local` and keep the keys in sync with AWS Parameter Store/Secrets Manager.

Recommended baseline (add as needed).

API (local example for `services/api/.env`):
```bash
DATABASE_URL=postgresql://postgres:password@db:5432/menuvium
CORS_ORIGINS=http://localhost:3000
LOCAL_UPLOADS=1
AWS_REGION=us-east-1
COGNITO_USER_POOL_ID=us-east-1_XXXXXXX
COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-4o-mini
OCR_MODE=tesseract
```

Web (optional for `apps/web/.env.local`):
```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_USER_POOL_ID=us-east-1_XXXXXXX
NEXT_PUBLIC_USER_POOL_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_COGNITO_DOMAIN=your-domain.auth.us-east-1.amazoncognito.com
NEXT_PUBLIC_AUTH_REDIRECT_SIGNIN=http://localhost:3000/login
NEXT_PUBLIC_AUTH_REDIRECT_SIGNOUT=http://localhost:3000/login
```

Reference list:
- API
  - `DATABASE_URL` (local only; optional if using discrete DB_* vars)
  - `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` (prod; matches CDK)
  - `CORS_ORIGINS` (include `http://localhost:3000` locally)
  - `S3_BUCKET_NAME` (prod only)
  - `LOCAL_UPLOADS` (local only; set to `1` for filesystem uploads)
  - `AWS_REGION`
  - `COGNITO_USER_POOL_ID`
  - `COGNITO_CLIENT_ID`
- Web
  - `NEXT_PUBLIC_API_URL` (local: `http://localhost:8000`)
  - `NEXT_PUBLIC_USER_POOL_ID`
  - `NEXT_PUBLIC_USER_POOL_CLIENT_ID`
  - `NEXT_PUBLIC_COGNITO_DOMAIN`
  - `NEXT_PUBLIC_AUTH_REDIRECT_SIGNIN`
  - `NEXT_PUBLIC_AUTH_REDIRECT_SIGNOUT`

## Authentication (Cognito)
### Local + AWS
1. Create a Cognito User Pool and App Client.
2. Enable Email sign-in. For social sign-in, configure OAuth providers (Google/Apple/Facebook).
3. Create a Cognito domain (or custom domain).
4. Set redirect URLs:
   - Local: `http://localhost:3000/login`
   - Prod: `https://your-domain/login`

Set env vars:
- API (`services/api/.env`): `AWS_REGION`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`
- Web (`apps/web/.env.local`): `NEXT_PUBLIC_USER_POOL_ID`, `NEXT_PUBLIC_USER_POOL_CLIENT_ID`, `NEXT_PUBLIC_COGNITO_DOMAIN`, `NEXT_PUBLIC_AUTH_REDIRECT_SIGNIN`, `NEXT_PUBLIC_AUTH_REDIRECT_SIGNOUT`

### Database Migrations
Always run migrations the same way in local and prod.
```bash
cd services/api
alembic upgrade head
```

## Testing
### API
Run tests from the API service directory.
```bash
cd services/api
pytest
```

### Web
There is no test runner configured yet; use linting for now.
```bash
cd apps/web
npm run lint
```

## Common Issues
- **API not reachable**: check `docker ps` and `docker logs menuvium-api-1`.
- **Env not loading**: ensure `services/api/.env` is saved and not empty.
- **Image uploads fail locally**: confirm `LOCAL_UPLOADS=1` and API restarted.

## Deploy Readiness (1:1 Transfer Checklist)
- CDK stack mirrors local services (DB, API, Web) with matching versions.
- Secrets/config stored in AWS (SSM/Secrets Manager) using the same keys as local `.env` files.
- Migrations run in deploy process before API starts.
- Health checks available (`/health`) for load balancer/target groups.
- CORS settings include production web origin.

## Menu Import (OCR + OpenAI)
Local OCR uses Tesseract; AWS OCR uses Textract when `OCR_MODE=textract`.

Required environment variables:
- `OPENAI_API_KEY` (both local and prod)
- `OPENAI_MODEL` (optional, default: `gpt-4o-mini`)
- `OCR_MODE` (`tesseract` for local, `textract` for AWS)
- `S3_BUCKET_NAME` (required when `OCR_MODE=textract`)

Local setup:
- Add to `services/api/.env`:
  - `OPENAI_API_KEY=...`
  - `OPENAI_MODEL=gpt-4o-mini` (optional)
  - `OCR_MODE=tesseract`
- The API Docker image installs Tesseract automatically.

AWS setup:
- Set task env vars:
  - `OPENAI_MODEL` (optional)
  - `OCR_MODE=textract`
  - `S3_BUCKET_NAME`
- Store the OpenAI key in Secrets Manager and reference it as `MenuviumOpenAIKey` (or set `openAiSecretName` in CDK context).

## Project Structure
- `apps/web`: Next.js frontend.
- `services/api`: FastAPI backend.
- `infra/cdk`: AWS Infrastructure.
