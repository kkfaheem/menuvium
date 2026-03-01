# Menuvium — Agent Engineering Guide

This file provides context and conventions for AI coding agents working on the Menuvium codebase.

---

## Project Overview

Menuvium is a restaurant digital menu platform. The codebase is a monorepo with three main services:
- **`apps/web`** — Next.js 16 frontend (deployed on Vercel)
- **`services/api`** — FastAPI backend (deployed on Railway with PostgreSQL)
- **`services/ar-worker-mac`** — macOS AR worker in Swift (optional, runs on a Mac)

Infrastructure-as-code lives in **`infra/cdk`** (AWS CDK, TypeScript).

---

## Coding Standards

### General
- **Monorepo boundaries**: Respect `apps/`, `services/`, and `infra/` directories. Do not cross-import between them.
- **Environment variables**: Use the same key names across local (`.env` files) and production (Railway/Vercel dashboards). Never hardcode secrets.
- **UUIDs**: All primary keys are UUIDs (v4). Use `uuid.uuid4()` in Python and `crypto.randomUUID()` in TypeScript.

### Frontend (`apps/web`)
- **Framework**: Next.js 16 with App Router (`app/` directory). Use Server Components by default.
- **Language**: TypeScript (strict mode). All files use `.ts` / `.tsx` extensions.
- **Styling**: TailwindCSS. No inline styles or CSS modules. Use the existing `globals.css` for custom utilities.
- **State management**: Server Components preferred. Use React hooks and local state for client-side interactivity. No global state library.
- **Data fetching**: Use the API client in `src/lib/api.ts` and `src/lib/apiBase.ts`. All API calls go through these helpers (handles auth tokens, base URL, error handling).
- **Auth**: AWS Amplify SDK configured in `src/components/AmplifyProvider.tsx`. JWT tokens are extracted via `src/lib/authToken.ts`.
- **Types**: Shared TypeScript types live in `src/types/index.ts`. Keep frontend types aligned with backend Pydantic schemas.
- **Components**: Reusable components go in `src/components/`. Page-specific logic stays in `src/app/` route files.
- **Themes**: Menu theme layouts are defined in `src/lib/menuThemes.ts` and rendered by `src/components/public-menu/ThemeLayout.tsx`.
- **Linting**: ESLint + Prettier. Run `npm run lint` before committing.
- **Testing**: Jest + React Testing Library. Tests live in `src/__tests__/`. Run `npm test`.
- **Icons**: Use `lucide-react` for all icons.
- **Animation**: Use `framer-motion` for animations and transitions.
- **Drag & drop**: Use `@dnd-kit` for reordering categories and items.

### Backend (`services/api`)
- **Framework**: FastAPI, async by default. Use `async def` for all route handlers.
- **Language**: Python 3.11+. Use type hints everywhere.
- **ORM**: SQLModel (SQLAlchemy + Pydantic hybrid). Models are in `models.py`.
  - Table models inherit from `SQLModel` with `table=True`.
  - Pydantic schemas (Create, Read, Update) are also `SQLModel` subclasses without `table=True`.
- **Database**: PostgreSQL 15. Connect via `DATABASE_URL` env var. Engine and session management in `database.py`.
- **Migrations**: Alembic. Migration files are in `migrations/versions/`. Always create migrations for schema changes:
  ```bash
  cd services/api
  alembic revision --autogenerate -m "description"
  alembic upgrade head
  ```
- **Auth**: Cognito JWT verification in `auth.py`. Current user dependency in `dependencies.py`. Test mode available via `MENUVIIUM_TEST_MODE=1`.
- **Permissions**: Role-based access control in `permissions.py`. Checks org membership and specific permission flags.
- **Routers**: One router per domain concern in `routers/`:
  - `organizations.py` — Org CRUD, members, permissions
  - `menus.py` — Menu CRUD, theme config, public menu endpoint
  - `categories.py` — Category CRUD within menus
  - `items.py` — Item CRUD, photo upload, sold-out toggle
  - `ar_jobs.py` — AR job queue, video upload, model delivery
  - `metadata.py` — Dietary tags & allergens (global reference data)
  - `imports.py` — AI-powered menu import (PDF/URL → structured data via OCR + OpenAI)
  - `export.py` — Menu data export
- **File uploads**: S3 in production (`LOCAL_UPLOADS=0`), local filesystem in dev (`LOCAL_UPLOADS=1`). Upload logic is in the items router.
- **Linting**: Ruff. Run `ruff check .` and `ruff format .`.
- **Testing**: Pytest. Tests are in `tests/`. Run `pytest`.

### Infrastructure (`infra/cdk`)
- **CDK**: TypeScript. Single stack in `lib/menuvium-stack.ts`.
- **Constructs**: Use L2 constructs (higher-level abstractions) preferred over L1.
- **Config**: Environment configs in `config/` directory. Deploy scripts in `infra/scripts/`.

### AR Worker (`services/ar-worker-mac`)
- **Language**: Swift. Package managed via `Package.swift`.
- **Purpose**: Polls the API for pending AR jobs, downloads video, runs Apple Object Capture, uploads USDZ + GLB results.
- **Running**: `./run-prod.sh` with `MENUVIUM_API_BASE` and `MENUVIUM_WORKER_TOKEN` env vars.

---

## Development Workflows

### Running Locally
```bash
docker-compose up --build
```
This starts PostgreSQL (5432), the API (8000), and the web frontend (3000) with hot-reload.

### Adding a New Feature
1. **Database changes**: Create Alembic migration if schema changes are needed.
2. **Backend**: Add/update models in `models.py`, create/update router in `routers/`.
3. **Frontend types**: Update `src/types/index.ts` to match new backend schemas.
4. **API client**: Add new fetch functions to `src/lib/api.ts`.
5. **UI**: Build the feature in `src/app/` (pages) or `src/components/` (reusable).
6. **Infrastructure**: Update CDK stack if new AWS resources are needed.

### Adding a New Menu Theme
1. Add theme config to `src/lib/menuThemes.ts` (colors, fonts, layout settings).
2. Update `ThemeLayout.tsx` to handle the new theme key.
3. Add the theme option to the theme selector in the Design Studio page.

### Adding a New API Router
1. Create `routers/new_router.py` with a FastAPI `APIRouter`.
2. Register in `main.py`: `app.include_router(new_router.router)`.
3. Add auth dependency from `dependencies.py` for protected routes.
4. Add permission checks from `permissions.py` as needed.

### Adding a New Database Column
1. Add the field to the appropriate model in `models.py`.
2. If it's exposed via API, update the corresponding Read/Create/Update schemas in `models.py`.
3. Generate migration: `cd services/api && alembic revision --autogenerate -m "add column_name to table"`.
4. Apply: `alembic upgrade head`.
5. Update frontend types in `src/types/index.ts` if the field is returned to the client.

---

## Architecture Decisions

- **Vercel + Railway over AWS ECS for production**: Lower cost and simpler ops. The CDK stack exists for AWS deployment but current production uses Vercel (web) + Railway (API + Postgres).
- **SQLModel over raw SQLAlchemy**: Combines ORM and Pydantic validation in one model definition, reducing boilerplate.
- **Same-origin API proxy**: The web app proxies `/api/*` to the Railway API to avoid CORS issues in the browser and simplify auth cookie handling.
- **Local/production parity**: Docker Compose mirrors production service topology. Same env var names, same migration workflow, same API surface.
- **OCR dual-stack**: Tesseract for local dev (zero AWS dependency), Textract for production (higher accuracy). Controlled by `OCR_MODE` env var.

---

## Key File Reference

| File | Purpose |
|------|---------|
| `services/api/models.py` | All SQLModel table models + Pydantic schemas |
| `services/api/main.py` | FastAPI app setup, CORS, router registration |
| `services/api/auth.py` | Cognito JWT verification |
| `services/api/dependencies.py` | FastAPI dependencies (current user extraction) |
| `services/api/permissions.py` | Role-based permission checks |
| `services/api/database.py` | DB engine and session management |
| `apps/web/src/lib/api.ts` | Frontend API client (all fetch calls) |
| `apps/web/src/lib/apiBase.ts` | Base fetch wrapper with auth headers |
| `apps/web/src/lib/menuThemes.ts` | Theme definitions and configuration |
| `apps/web/src/types/index.ts` | Shared TypeScript type definitions |
| `apps/web/src/app/layout.tsx` | Root layout (providers, fonts, metadata) |
| `apps/web/src/app/dashboard/layout.tsx` | Dashboard layout (sidebar, navigation) |
| `apps/web/src/app/r/[slug]/page.tsx` | Public menu page (guest-facing) |
| `infra/cdk/lib/menuvium-stack.ts` | Full AWS CDK infrastructure stack |
| `docker-compose.yml` | Local development service orchestration |
| `docs/SETUP.md` | Detailed local setup & configuration guide |
| `.env.example.railway-vercel` | Complete env var reference template |

---

## Common Gotchas

- **CORS**: When adding a new frontend domain, update `CORS_ORIGINS` in the API env vars. Default includes `localhost:3000` and production domains.
- **Env files are gitignored**: Only `.env.example*` files are committed. Real `.env` / `.env.local` files must be created manually.
- **Migrations must be run**: The API `start.sh` runs `alembic upgrade head` on startup if `RUN_MIGRATIONS=1`. For local dev, Docker Compose handles this automatically.
- **S3 vs local uploads**: Set `LOCAL_UPLOADS=1` for local dev. Photo URLs will differ between local (filesystem paths) and prod (S3 URLs).
- **AR worker is optional**: The API works without it. AR jobs simply stay in `pending` state until a worker picks them up.
- **Test mode**: Set `MENUVIIUM_TEST_MODE=1` to bypass Cognito auth in local development. Pytest automatically enables this.
