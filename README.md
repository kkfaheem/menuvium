# Menuvium

**Menuvium** is a full-stack digital menu platform for restaurants. Owners create, design, and publish beautiful interactive menus that guests access via a public link or QR code. The platform supports AI-powered menu import (PDF/URL → structured data), multiple customizable themes, drag-and-drop item ordering, dietary tags & allergens, AR 3D dish models, multi-location organizations, and role-based team collaboration.

**Live:** [menuvium.com](https://www.menuvium.com)

---

## Monorepo Structure

```
menuvium/
├── apps/
│   └── web/               # Next.js 16 frontend (Vercel)
├── services/
│   ├── api/               # FastAPI backend (Railway)
│   └── ar-worker-mac/     # macOS AR worker (Swift)
├── infra/
│   ├── cdk/               # AWS CDK stack (VPC, ECS, RDS, S3, CloudFront)
│   └── scripts/           # Deploy & secrets helper scripts
├── docs/
│   └── SETUP.md           # Detailed local setup guide
├── docker-compose.yml     # Local development orchestration
└── .env.example.railway-vercel  # Full env var reference
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 16 (App Router), React 19, TypeScript, TailwindCSS |
| **Backend** | FastAPI (async), Python 3.11, SQLModel, Pydantic |
| **Database** | PostgreSQL 15, Alembic migrations |
| **Auth** | AWS Cognito (Hosted UI, JWT), AWS Amplify (frontend SDK) |
| **Storage** | AWS S3 (prod), local filesystem (dev) |
| **AI / OCR** | OpenAI GPT-4o-mini, Tesseract (local), AWS Textract (prod) |
| **AR** | macOS worker (Swift), Object Capture → USDZ + GLB |
| **Infra** | AWS CDK (TypeScript), Docker Compose (local) |
| **Hosting** | Vercel (web), Railway (API + Postgres) |
| **UI libs** | Framer Motion, Lucide Icons, dnd-kit (drag & drop) |

---

## Features

### Menu Management
- **AI-powered import** — Upload a PDF or paste a URL; OCR + OpenAI extracts menu items, categories, descriptions, and prices automatically.
- **Manual CRUD** — Create/edit/delete menus, categories, and items with a rich dashboard UI.
- **Drag & drop** — Reorder items and categories with dnd-kit.
- **Dietary tags & allergens** — Tag items with dietary info (vegan, gluten-free, etc.) and allergens for guest filtering.
- **Item photos** — Upload multiple photos per item (S3 in prod, local fs in dev).
- **Sold-out toggle** — Mark items as sold out in real time.

### Design Studio & Themes
- **10+ built-in themes** — Noir, Elegant, Rustic, Modern, Minimalist, and more.
- **Custom branding** — Upload logo & banner, configure title layout (position, scale, spacing).
- **Toggle item images** — Show/hide photos across all themes globally.
- **Live preview** — Preview the public menu in the design studio before publishing.

### Public Menu
- **Shareable URL** — Each menu gets a public URL at `/r/{org-slug}` for guests.
- **Theme rendering** — Public pages render the selected theme with full styling.
- **Tag-based filtering** — Guests can filter items by dietary tags and allergens.
- **AR model viewer** — View 3D dish models in augmented reality (when available).

### Organizations & Teams
- **Multi-org support** — Users can own/belong to multiple organizations.
- **Role-based permissions** — Owner, manage availability, edit items, manage menus, manage users.
- **Team members** — Invite members by email with granular permission control.

### AR (Augmented Reality)
- **Video upload** — Upload a turntable video of a dish.
- **macOS worker** — A Swift-based worker picks up pending AR jobs, runs Object Capture, and produces USDZ + GLB models.
- **Job queue** — Jobs persist in Postgres (`pending` → `processing` → `ready`); no jobs are lost if the worker is offline.

### Menu Importer (Admin)
- **Admin-only page** at `/admin/menu-importer` — restricted via `ADMIN_EMAILS` allowlist.
- **Automated pipeline** — Input a restaurant name → resolves website → extracts menu → collects dish images → enhances to studio quality → generates Menuvium-compatible ZIP.
- **Background worker** — Polling worker processes jobs through a 9-step pipeline with progress tracking.
- **Image enhancement** — LOCAL_ONLY (Pillow) or AI_ENHANCE (external API) modes.

#### Menu Importer Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ADMIN_EMAILS` | Yes | Comma-separated admin email addresses |
| `GOOGLE_PLACES_API_KEY` | No | For restaurant website & photo discovery |
| `SERPAPI_KEY` | No | Fallback website discovery via web search |
| `IMAGE_ENHANCE_PROVIDER` | No | AI provider: `replicate` or `openai` |
| `REPLICATE_API_TOKEN` | No | Required if IMAGE_ENHANCE_PROVIDER=replicate |

---

## Production Architecture

```
┌──────────────┐    ┌────────────────┐    ┌───────────────┐
│  Vercel       │───▶│  Railway API   │───▶│  Railway      │
│  (Next.js)    │    │  (FastAPI)     │    │  PostgreSQL   │
└──────────────┘    └────────────────┘    └───────────────┘
       │                    │
       │                    ├──▶ AWS S3 (uploads, AR models)
       │                    ├──▶ AWS Cognito (auth)
       │                    └──▶ OpenAI API (menu import)
       │
       └──── Proxy: www.menuvium.com/api/* → api.menuvium.com
```

- **Web:** Vercel (`apps/web`) — proxies API calls via same-origin route
- **API:** Railway (`services/api`) — Dockerfile-based, auto-runs Alembic migrations on startup
- **Database:** Railway PostgreSQL
- **Auth:** AWS Cognito (Hosted UI with JWT verification)
- **Storage:** AWS S3 (menu photos, AR models, OCR uploads)
- **AR Worker:** Optional macOS machine running `services/ar-worker-mac`

---

## Local Development

### Prerequisites
- Docker & Docker Compose
- Node.js 20+ (for running web outside Docker)
- Python 3.11+

### Quick Start

1. **Configure environment files:**
   ```bash
   # API config
   cp .env.example.railway-vercel services/api/.env
   # Edit services/api/.env with your local values

   # Web config (optional)
   # Edit apps/web/.env.local with Cognito credentials
   ```

2. **Start all services:**
   ```bash
   docker-compose up --build
   ```

3. **Access the app:**
   | Service | URL |
   |---------|-----|
   | Frontend | http://localhost:3000 |
   | API health | http://localhost:8000/health |
   | API docs (Swagger) | http://localhost:8000/docs |

4. **Stop services:**
   ```bash
   docker-compose down
   ```

For the full setup guide (auth, env vars, OCR config, testing), see [`docs/SETUP.md`](docs/SETUP.md).

### Database Migrations
```bash
cd services/api
alembic upgrade head      # Apply all pending migrations
alembic revision --autogenerate -m "description"  # Create a new migration
```

### Testing
```bash
# API tests
cd services/api && pytest

# Web linting & tests
cd apps/web && npm run lint
cd apps/web && npm test
```

---

## Deploy (Vercel + Railway)

### Web (Vercel)

| Setting | Value |
|---------|-------|
| Root Directory | `apps/web` |
| Node Version | 20.x |
| Framework | Next.js |

**Required env vars:**
| Variable | Example |
|----------|---------|
| `NEXT_PUBLIC_API_URL` | `/api` |
| `API_INTERNAL_URL` | `https://api.menuvium.com` |
| `NEXT_PUBLIC_USER_POOL_ID` | `us-east-1_XXXXXXX` |
| `NEXT_PUBLIC_USER_POOL_CLIENT_ID` | `xxxxxxxxx` |
| `NEXT_PUBLIC_COGNITO_DOMAIN` | `menuvium.auth.us-east-1.amazoncognito.com` |
| `NEXT_PUBLIC_AUTH_REDIRECT_SIGNIN` | `https://www.menuvium.com/login` |
| `NEXT_PUBLIC_AUTH_REDIRECT_SIGNOUT` | `https://www.menuvium.com/login` |
| `NEXT_PUBLIC_ADMIN_EMAILS` | `admin1@example.com,admin2@example.com` |

### API (Railway)

Service root: `services/api` (Dockerfile-based).

**Required env vars:**
| Variable | Example |
|----------|---------|
| `DATABASE_URL` | `postgresql://...` (Railway auto-generates) |
| `RUN_MIGRATIONS` | `1` |
| `UVICORN_RELOAD` | `0` |
| `CORS_ORIGINS` | `https://www.menuvium.com,https://menuvium.com` |
| `AWS_REGION` | `us-east-1` |
| `COGNITO_USER_POOL_ID` | `us-east-1_XXXXXXX` |
| `COGNITO_CLIENT_ID` | `xxxxxxxxx` |

**Storage (production):**
| Variable | Value |
|----------|-------|
| `LOCAL_UPLOADS` | `0` |
| `S3_BUCKET_NAME` | `menuvium-ar-models` |
| `AWS_ACCESS_KEY_ID` | `...` |
| `AWS_SECRET_ACCESS_KEY` | `...` |

**Optional:**
| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | Required for AI menu import |
| `OPENAI_MODEL` | Default: `gpt-4o-mini` |
| `OCR_MODE` | `tesseract` (local) or `textract` (AWS) |
| `AR_WORKER_TOKEN` | Required if running AR worker |

---

## AR Worker (macOS)

Uploading a dish rotation video queues a job in Postgres (`pending` → `processing` → `ready`). If the worker is not running, jobs are **not lost**; they remain `pending`.

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

See [`services/ar-worker-mac/README.md`](services/ar-worker-mac/README.md) for more details.

---

## API Endpoints

The API is organized into the following router modules:

| Router | Prefix | Description |
|--------|--------|-------------|
| `organizations` | `/organizations` | CRUD for orgs, members, permissions |
| `menus` | `/menus` | CRUD for menus, theme/branding config |
| `categories` | `/categories` | CRUD for menu categories |
| `items` | `/items` | CRUD for items, photos, sold-out toggle |
| `ar_jobs` | `/ar` | AR job queue, video upload, model delivery |
| `metadata` | `/metadata` | Dietary tags & allergens (global lists) |
| `imports` | `/imports` | AI-powered menu import (PDF/URL) |
| `export` | `/export` | Menu data export |

Full interactive docs available at `/docs` (Swagger UI) when the API is running.

---

## Data Model

```
Organization
  ├── OrganizationMember (role-based permissions)
  └── Menu (theme, branding, logo, banner)
       └── Category (ranked)
            └── Item (price, sold-out, position, AR fields)
                 ├── ItemPhoto[]
                 ├── DietaryTag[] (many-to-many)
                 └── Allergen[] (many-to-many)
```

---

## Infrastructure (AWS CDK)

The `infra/cdk/` stack provisions a full AWS environment:

- **VPC** with public/private subnets
- **ECS Fargate** service for the API container
- **RDS PostgreSQL** instance
- **S3 bucket** for uploads and AR models
- **CloudFront** distribution
- **Cognito** User Pool integration

Deploy scripts are in `infra/scripts/`.

---

## License

Private — all rights reserved.
