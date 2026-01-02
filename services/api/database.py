# services/api/database.py
from sqlmodel import create_engine, SQLModel, Session
from pydantic_settings import BaseSettings
from typing import Optional
from urllib.parse import quote_plus

class Settings(BaseSettings):
    DATABASE_URL: Optional[str] = None
    DB_HOST: Optional[str] = None
    DB_PORT: Optional[int] = 5432
    DB_NAME: Optional[str] = None
    DB_USER: Optional[str] = None
    DB_PASSWORD: Optional[str] = None

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()

def build_database_url(settings: Settings) -> str:
    if settings.DATABASE_URL:
        return settings.DATABASE_URL
    missing = [key for key in ["DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD"] if not getattr(settings, key)]
    if missing:
        raise ValueError(f"Missing database configuration: {', '.join(missing)}")
    password = quote_plus(settings.DB_PASSWORD or "")
    return (
        f"postgresql://{settings.DB_USER}:{password}"
        f"@{settings.DB_HOST}:{settings.DB_PORT}/{settings.DB_NAME}"
    )

# Use echo=True for dev debugging
engine = create_engine(build_database_url(settings), echo=True)

def get_session():
    with Session(engine) as session:
        yield session
