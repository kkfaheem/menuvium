# services/api/main.py
from fastapi import FastAPI
from contextlib import asynccontextmanager
from sqlmodel import SQLModel
from database import engine

# Simple lifecycle to create tables on startup (for dev simplicity)
@asynccontextmanager
async def lifespan(app: FastAPI):
    # In production, use Alembic. 
    # This is just for local quickstart if needed, though we should prefer migrations.
    # SQLModel.metadata.create_all(engine)
    yield

from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
from pathlib import Path

app = FastAPI(title="Menuvium API", lifespan=lifespan)

# CORS Configuration
origins = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if os.getenv("LOCAL_UPLOADS") == "1" or os.getenv("AUTH_MODE") == "MOCK":
    upload_dir = Path(__file__).resolve().parent / "uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=str(upload_dir)), name="uploads")

from routers import organizations, menus, categories, items, metadata, imports
app.include_router(organizations.router)
app.include_router(menus.router)
app.include_router(categories.router)
app.include_router(items.router)
app.include_router(metadata.router)
app.include_router(imports.router)

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "menuvium-api"}
