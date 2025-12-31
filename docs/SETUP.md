# Setup Guide

## Prerequisites
- Docker & Docker Compose
- Node.js 18+ (for local tooling if not using Docker)
- Python 3.11+
- AWS CLI (configured)

## Running Locally
We use Docker Compose to run the full stack locally.

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

## Project Structure
- `apps/web`: Next.js frontend.
- `services/api`: FastAPI backend.
- `infra/cdk`: AWS Infrastructure.
