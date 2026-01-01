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

1. **Start Services**
   ```bash
   docker-compose up --build
   ```
   This will start:
   - Postgres (Port 5432)
   - API (Port 8000)
   - Web (Port 3000)

2. **Access the App**
   - Frontend: [http://localhost:3000](http://localhost:3000)
   - API Health: [http://localhost:8000/health](http://localhost:8000/health)
   - API Docs: [http://localhost:8000/docs](http://localhost:8000/docs)

### Environment Variables
Use a single source of truth for config keys. Create `services/api/.env` and `apps/web/.env.local` and keep the keys in sync with AWS Parameter Store/Secrets Manager.

Recommended baseline (add as needed):
- API
  - `DATABASE_URL` (local only; optional if using discrete DB_* vars)
  - `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` (prod; matches CDK)
  - `CORS_ORIGINS` (include `http://localhost:3000` locally)
  - `AUTH_MODE` (`MOCK` locally, `COGNITO` in prod)
  - `S3_BUCKET_NAME` (prod only)
  - `LOCAL_UPLOADS` (local only; set to `1` for filesystem uploads)
- Web
  - `NEXT_PUBLIC_API_URL` (local: `http://localhost:8000`)

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

## Deploy Readiness (1:1 Transfer Checklist)
- CDK stack mirrors local services (DB, API, Web) with matching versions.
- Secrets/config stored in AWS (SSM/Secrets Manager) using the same keys as local `.env` files.
- Migrations run in deploy process before API starts.
- Health checks available (`/health`) for load balancer/target groups.
- CORS settings include production web origin.

## Project Structure
- `apps/web`: Next.js frontend.
- `services/api`: FastAPI backend.
- `infra/cdk`: AWS Infrastructure.
