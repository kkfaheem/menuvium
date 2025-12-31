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
import os

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

from routers import organizations, menus, categories, items, metadata
app.include_router(organizations.router)
app.include_router(menus.router)
app.include_router(categories.router)
app.include_router(items.router)
app.include_router(metadata.router)

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "menuvium-api"}
