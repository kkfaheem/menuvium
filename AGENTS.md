# Menuvium Engineering

## Coding Standards

### General
- **Monorepo**: This is a monorepo. respecting `apps/`, `services/`, and `infra/` boundaries.
- **Language**: TypeScript for Frontend & Infra. Python (3.11+) for Backend.
- **Linting**:
    - Web: ESLint + Prettier.
    - API: Ruff.

### Frontend (`apps/web`)
- **Next.js**: Use App Router (`app/` directory).
- **Styles**: TailwindCSS.
- **State**: Server Components preferred. React Query for client-side data.

### Backend (`services/api`)
- **FastAPI**: Async by default.
- **Pydantic/SQLModel**: Use type hints everywhere.
- **Testing**: Pytest.

### Infrastructure (`infra/cdk`)
- **CDK**: TypeScript.
- **Constructs**: L2 constructs preferred.

## Development Workflows

### Running Locally
```bash
docker-compose up --build
```

### Adding a Feature
1. Create DB migration if needed (alembic).
2. Update API layer.
3. Update specific CDK stack if infra is needed (e.g. new S3 bucket).
4. Update Web UI.
